import chrome from './profiles/chrome.json';
import general from './profiles/general.json';
import instagram from './profiles/instagram.json';
import launcher from './profiles/launcher.json';
import messages from './profiles/messages.json';
import settings from './profiles/settings.json';
import tiktok from './profiles/tiktok.json';
import whatsapp from './profiles/whatsapp.json';
import youtube from './profiles/youtube.json';

/**
 * Profiles shipped with the app, general first. To add an app, drop a JSON
 * file in profiles/ and list it here; the registry validates it at startup and
 * the tests validate it on every run.
 */
export const BUILTIN_PROFILE_SOURCES: readonly unknown[] = [
  general,
  whatsapp,
  instagram,
  youtube,
  tiktok,
  chrome,
  messages,
  settings,
  launcher,
];
