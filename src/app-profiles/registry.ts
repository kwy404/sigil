import { GESTURE_KEYS, type GestureKey } from '../gesture-engine/gestures';
import { BUILTIN_PROFILE_SOURCES } from './builtin';
import { AppProfileSchema, type AppProfile, type ProfileAction, type ProfileLinks, type Selector } from './schema';
import { normalizeName } from './text';

export const GENERAL_PROFILE_ID = 'general';

const ANDROID_PACKAGE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

export interface ProfileIssue {
  profileId: string | null;
  /** Dotted path inside the profile JSON, empty for whole profile issues. */
  path: string;
  message: string;
}

export type ValidationResult = { ok: true; profile: AppProfile } | { ok: false; issues: ProfileIssue[] };

export interface ResolvedBinding {
  key: GestureKey;
  action: ProfileAction;
  /** Profile that defines the binding. */
  profileId: string;
  /** True when the binding comes from a parent profile. */
  inherited: boolean;
}

export function formatIssues(issues: readonly ProfileIssue[]): string {
  return issues
    .map((i) => `${i.profileId ?? 'profile'}${i.path ? `.${i.path}` : ''}: ${i.message}`)
    .join('\n');
}

/** Checks a profile on its own: the schema plus rules that need no other profile. */
export function validateProfile(raw: unknown): ValidationResult {
  const parsed = AppProfileSchema.safeParse(raw);
  const rawId =
    typeof raw === 'object' && raw !== null && typeof (raw as { id?: unknown }).id === 'string'
      ? (raw as { id: string }).id
      : null;
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        profileId: rawId,
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    };
  }
  const profile = parsed.data;
  const issues: ProfileIssue[] = [];
  const add = (path: string, message: string) => issues.push({ profileId: profile.id, path, message });

  if (profile.id === GENERAL_PROFILE_ID) {
    if (profile.packages.length > 0) add('packages', 'The general profile applies to every app and lists no packages.');
    if (profile.extends !== undefined) add('extends', 'The general profile cannot extend another profile.');
  } else if (profile.packages.length === 0) {
    add('packages', 'List at least one Android package.');
  }

  for (const key of GESTURE_KEYS) {
    const action = profile.bindings[key];
    if (action?.type === 'drag' && key !== 'pinch_hold') {
      add(`bindings.${key}`, 'drag needs a gesture with a start and an end, so it only works on pinch_hold.');
    }
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, profile };
}

/** Holds the gesture profiles and answers which action a gesture means in an app. */
export class ProfileRegistry {
  private readonly profiles = new Map<string, AppProfile>();
  private readonly packageIndex = new Map<string, string>();

  /** A registry with the built in profiles. Throws if any of them is invalid. */
  static withBuiltins(): ProfileRegistry {
    const registry = new ProfileRegistry();
    for (const source of BUILTIN_PROFILE_SOURCES) {
      const result = registry.register(source);
      if (!result.ok) {
        throw new Error(`Invalid built in profile:\n${formatIssues(result.issues)}`);
      }
    }
    return registry;
  }

  /** Validates and adds a profile. Use replace to update a profile with the same id. */
  register(raw: unknown, options: { replace?: boolean } = {}): ValidationResult {
    const validation = validateProfile(raw);
    if (!validation.ok) {
      return validation;
    }
    const profile = validation.profile;
    const issues: ProfileIssue[] = [];
    const add = (path: string, message: string) => issues.push({ profileId: profile.id, path, message });

    if (this.profiles.has(profile.id) && !options.replace) {
      add('id', `A profile with id "${profile.id}" is already registered.`);
    }
    profile.packages.forEach((pkg, i) => {
      const owner = this.packageIndex.get(pkg);
      if (owner !== undefined && owner !== profile.id) {
        add(`packages.${i}`, `Package ${pkg} already belongs to the ${owner} profile.`);
      }
    });

    if (profile.id !== GENERAL_PROFILE_ID) {
      const parentId = profile.extends ?? GENERAL_PROFILE_ID;
      if (!this.profiles.has(parentId)) {
        add('extends', `Unknown parent profile "${parentId}". Register it first.`);
      } else if (this.chainIds(parentId).includes(profile.id)) {
        add('extends', 'Profiles cannot extend each other in a cycle.');
      }
    }

    for (const key of GESTURE_KEYS) {
      const action = profile.bindings[key];
      if (action?.type === 'open_app' && !this.profiles.has(action.app) && action.app !== profile.id && !ANDROID_PACKAGE.test(action.app)) {
        add(`bindings.${key}.app`, `"${action.app}" is neither a profile id nor a package name.`);
      }
    }

    if (issues.length === 0) {
      const reachesSphere = GESTURE_KEYS.some((key) => {
        const action = this.resolveWith(profile, key)?.action;
        return action?.type === 'sphere' && action.action !== 'close';
      });
      if (!reachesSphere) {
        add('bindings', 'Keep at least one gesture that opens the Control Sphere, so the user can always reach it.');
      }
    }

    if (issues.length > 0) {
      return { ok: false, issues };
    }

    const previous = this.profiles.get(profile.id);
    previous?.packages.forEach((pkg) => this.packageIndex.delete(pkg));
    this.profiles.set(profile.id, profile);
    profile.packages.forEach((pkg) => this.packageIndex.set(pkg, profile.id));
    return { ok: true, profile };
  }

  /** Removes a profile. The general profile and profiles other profiles extend stay. */
  unregister(id: string): boolean {
    if (id === GENERAL_PROFILE_ID || !this.profiles.has(id)) {
      return false;
    }
    for (const other of this.profiles.values()) {
      if (other.extends === id) {
        return false;
      }
    }
    this.profiles.get(id)?.packages.forEach((pkg) => this.packageIndex.delete(pkg));
    return this.profiles.delete(id);
  }

  /** The general profile first, then the others by name. */
  list(): AppProfile[] {
    return [...this.profiles.values()].sort((a, b) => {
      if (a.id === GENERAL_PROFILE_ID) return -1;
      if (b.id === GENERAL_PROFILE_ID) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  get(id: string): AppProfile | undefined {
    return this.profiles.get(id);
  }

  /** The profile for an Android package, or the general profile. */
  forPackage(packageName: string | null | undefined): AppProfile {
    const id = packageName ? this.packageIndex.get(packageName) : undefined;
    return this.profiles.get(id ?? GENERAL_PROFILE_ID) ?? this.requireGeneral();
  }

  /**
   * What a gesture does in the app with the given package. Returns null when
   * nothing is bound or the binding is explicitly none.
   */
  resolve(packageName: string | null | undefined, key: GestureKey): ResolvedBinding | null {
    return this.resolveWith(this.forPackage(packageName), key);
  }

  /** Effective bindings of a profile, inherited ones included, in vocabulary order. */
  bindings(profileId: string): ResolvedBinding[] {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      return [];
    }
    const out: ResolvedBinding[] = [];
    for (const key of GESTURE_KEYS) {
      const binding = this.resolveWith(profile, key);
      if (binding) {
        out.push(binding);
      }
    }
    return out;
  }

  /** A named selector of a profile or of one of its parents. */
  selector(profileId: string, name: string): Selector | undefined {
    for (const id of this.chainIds(profileId)) {
      const selector = this.profiles.get(id)?.selectors?.[name];
      if (selector) {
        return selector;
      }
    }
    return undefined;
  }

  links(profileId: string): ProfileLinks | undefined {
    return this.profiles.get(profileId)?.links;
  }

  /**
   * Finds an app by id, name or alias, ignoring case, accents, a leading
   * article ("the", "o", "la", "die"...) and a trailing word for app ("app",
   * "アプリ", "应用").
   */
  findApp(spoken: string): AppProfile | undefined {
    const wanted = normalizeName(spoken)
      .replace(/(?:\s+app|\s*アプリ|\s*应用)$/u, '')
      .replace(/^(?:the|o|a|el|la|los|las|le|les|l|il|lo|gli|die|der|das|den)\s+/u, '')
      .trim();
    if (!wanted) {
      return undefined;
    }
    for (const profile of this.profiles.values()) {
      if (profile.id === GENERAL_PROFILE_ID) {
        continue;
      }
      const names = [profile.id, profile.name, ...(profile.aliases ?? [])].map(normalizeName);
      if (names.includes(wanted) || profile.packages.includes(spoken.trim())) {
        return profile;
      }
    }
    return undefined;
  }

  private requireGeneral(): AppProfile {
    const general = this.profiles.get(GENERAL_PROFILE_ID);
    if (!general) {
      throw new Error('The general profile is not registered.');
    }
    return general;
  }

  /** Ids from the profile up to the general profile. Stops on cycles. */
  private chainIds(profileId: string): string[] {
    const ids: string[] = [];
    let current: string | undefined = profileId;
    while (current !== undefined && !ids.includes(current)) {
      ids.push(current);
      const profile = this.profiles.get(current);
      if (!profile || current === GENERAL_PROFILE_ID) {
        break;
      }
      current = profile.extends ?? GENERAL_PROFILE_ID;
    }
    return ids;
  }

  private resolveWith(profile: AppProfile, key: GestureKey): ResolvedBinding | null {
    const own = profile.bindings[key];
    if (own) {
      return own.type === 'none' ? null : { key, action: own, profileId: profile.id, inherited: false };
    }
    if (profile.id === GENERAL_PROFILE_ID) {
      return null;
    }
    for (const id of this.chainIds(profile.extends ?? GENERAL_PROFILE_ID)) {
      const action = this.profiles.get(id)?.bindings[key];
      if (action) {
        return action.type === 'none' ? null : { key, action, profileId: id, inherited: true };
      }
    }
    return null;
  }
}
