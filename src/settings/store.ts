import { File, Paths } from 'expo-file-system';

/** Where the guided tutorial stands. version is TUTORIAL_VERSION when it was saved. */
export interface SavedTutorial {
  version: number;
  completed: boolean;
  /** The step to resume at when the tutorial was left before the end. */
  step?: string;
}

/** Everything Sigil remembers between launches, in one JSON file in the app's document folder. */
export interface SavedSettings {
  /** An app language picked in Sigil. Missing while Sigil follows the phone. */
  language?: string;
  tutorial?: SavedTutorial;
  voice?: {
    /** Voice requests while other apps are in front: the camera service also keeps the microphone. On unless set to false. */
    microphone?: boolean;
  };
  speech?: {
    /** The user agreed to a speech recognizer that may not run on the phone (asked to prefer offline). */
    allowOffDevice?: boolean;
  };
}

const FILE_NAME = 'sigil-settings.json';
/** The file of earlier builds, which held only the language choice. */
const LANGUAGE_FILE = 'sigil-language.json';

/** The settings of this run, so a change counts at once even where nothing can be written (the web). */
let memory: SavedSettings | null = null;

function file(name: string): File | null {
  try {
    return new File(Paths.document, name);
  } catch {
    return null;
  }
}

function parse(text: string): SavedSettings {
  const value = JSON.parse(text) as unknown;
  return typeof value === 'object' && value !== null ? (value as SavedSettings) : {};
}

function readFromDisk(): SavedSettings {
  try {
    const current = file(FILE_NAME);
    if (current?.exists) {
      return parse(current.textSync());
    }
    const legacy = file(LANGUAGE_FILE);
    if (current && legacy?.exists) {
      // Move the language choice of an earlier build into the settings file.
      const migrated = parse(legacy.textSync());
      current.writeSync(JSON.stringify(migrated));
      legacy.delete();
      return migrated;
    }
  } catch {
    // An unreadable file counts as nothing saved.
  }
  return {};
}

/** The saved settings, or an empty object when nothing was saved or storage is missing. */
export function readSettings(): SavedSettings {
  memory ??= readFromDisk();
  return memory;
}

/** Changes some settings and keeps the others. An undefined value removes its key. */
export function updateSettings(change: Partial<SavedSettings>): SavedSettings {
  const next: SavedSettings = { ...readSettings(), ...change };
  memory = next;
  try {
    file(FILE_NAME)?.writeSync(JSON.stringify(next));
  } catch {
    // Without storage the change lasts until the app closes.
  }
  return next;
}
