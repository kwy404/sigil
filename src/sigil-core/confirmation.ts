import type { ProfileRegistry } from '../app-profiles/registry';
import { foldText } from '../app-profiles/text';
import { LANGUAGE_PACKS } from './languages';
import { loose } from './languages/helpers';
import { noticeText, type Notice } from './notices';
import { describeTarget, type PlanStep } from './steps';

const CJK = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/u;

// The policy is the same in every language: every request and every control
// label is checked against the words and patterns of all eight languages, so
// the language of the request never weakens it.

/** Words that mark a control as one that sends, posts, calls, pays, deletes or changes something. */
const SENSITIVE_WORDS = new Set(
  LANGUAGE_PACKS.flatMap((pack) => pack.sensitive)
    .filter((word) => !CJK.test(word))
    .map((word) => foldText(word).replace(/ß/g, 'ss')),
);

/** The same for Japanese and Chinese, which have no spaces between words and are matched inside the label. */
const SENSITIVE_CJK = LANGUAGE_PACKS.flatMap((pack) => pack.sensitive).filter((word) => CJK.test(word));

/** Requests that ask for repeated or mass actions. Sigil acts once, for one person, per request. */
const BULK_PATTERNS: RegExp[] = LANGUAGE_PACKS.flatMap((pack) =>
  pack.bulk.map((pattern) => new RegExp(loose(pattern.source), pattern.flags)),
);

const SEVERAL_PEOPLE: RegExp[] = LANGUAGE_PACKS.flatMap((pack) => pack.severalPeople);

export function isSensitiveLabel(label: string): boolean {
  if (SENSITIVE_CJK.some((word) => label.includes(word))) {
    return true;
  }
  return foldText(label)
    .replace(/ß/g, 'ss')
    .split(/[^a-z0-9]+/)
    .some((word) => SENSITIVE_WORDS.has(word));
}

/** True when a contact string names more than one person, in any of the eight languages. */
export function namesSeveralPeople(contact: string): boolean {
  return SEVERAL_PEOPLE.some((pattern) => pattern.test(contact.trim()));
}

export type PolicyResult =
  | { ok: true; steps: PlanStep[]; commits: number }
  | { ok: false; reason: string; notice: Notice };

export interface PolicyOptions {
  /** Most commit steps (send, post, share) a single plan may contain. */
  maxCommitsPerPlan?: number;
}

/**
 * Decides which steps need the user's explicit confirmation and refuses plans
 * that would automate in bulk. The planner applies it to every plan, and the
 * executor checks it again before running, so a plan built by hand cannot skip
 * it either.
 */
export class ConfirmationPolicy {
  readonly maxCommitsPerPlan: number;

  constructor(
    private readonly profiles: ProfileRegistry,
    options: PolicyOptions = {},
  ) {
    this.maxCommitsPerPlan = options.maxCommitsPerPlan ?? 1;
  }

  /** Returns why a request is refused, or null when it may be planned. */
  screenRequest(text: string): string | null {
    if (BULK_PATTERNS.some((pattern) => pattern.test(text))) {
      return noticeText({ code: 'bulk' });
    }
    return null;
  }

  /** True when tapping this step's target sends, posts, pays or changes something. */
  isCommit(step: PlanStep): boolean {
    if (step.kind !== 'tap') {
      return false;
    }
    if (step.commit) {
      return true;
    }
    const target = step.target;
    switch (target.by) {
      case 'selector':
        return this.profiles.selector(target.app, target.name)?.commit === true || isSensitiveLabel(target.name);
      case 'text':
      case 'description':
        return isSensitiveLabel(target.value);
      case 'focused':
        return false;
    }
  }

  /** Marks commit steps, inserts a confirmation before each one and enforces the per plan limit. */
  apply(steps: readonly PlanStep[]): PolicyResult {
    const out: PlanStep[] = [];
    let commits = 0;
    for (const step of steps) {
      if (step.kind === 'tap' && this.isCommit(step)) {
        commits++;
        const previous = out[out.length - 1];
        if (!previous || previous.kind !== 'confirm') {
          out.push({ kind: 'confirm', summary: `Tap ${describeTarget(step.target)}?`, reason: 'commit' });
        }
        out.push({ ...step, commit: true });
      } else {
        out.push(step);
      }
    }
    if (commits > this.maxCommitsPerPlan) {
      const notice: Notice = { code: 'too_many_commits', count: commits, limit: this.maxCommitsPerPlan };
      return { ok: false, reason: noticeText(notice), notice };
    }
    return { ok: true, steps: out, commits };
  }

  /** Returns a problem with a plan about to run, or null when every commit is guarded. */
  check(steps: readonly PlanStep[]): string | null {
    let commits = 0;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (step.kind === 'tap' && this.isCommit(step)) {
        commits++;
        if (i === 0 || steps[i - 1].kind !== 'confirm') {
          return `Step ${i + 1} sends or posts without a confirmation right before it.`;
        }
      }
    }
    if (commits > this.maxCommitsPerPlan) {
      return `The plan contains ${commits} sends or posts. The limit is ${this.maxCommitsPerPlan}.`;
    }
    return null;
  }
}
