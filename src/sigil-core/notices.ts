import type { AppPlace } from '../app-profiles/schema';

/** An app the user can pick when a name matched several. app is what to plan with, usually the package. */
export interface AppChoice {
  label: string;
  app: string;
}

/** Features that need Android, because iOS gives apps no way to do them. */
export type AndroidOnlyFeature = 'close' | 'timer' | 'alarm' | 'flashlight' | 'chat' | 'open';

/**
 * Why the planner did not produce a plan, as data. The core keeps an English
 * text for logs and tests; the screens translate the notice itself (see
 * src/i18n). appId is set when the app has a profile, so its name can be
 * translated too.
 */
export type Notice =
  | { code: 'nothing_heard' }
  | { code: 'not_understood' }
  | { code: 'bulk' }
  | { code: 'several_people' }
  | { code: 'too_many_commits'; count: number; limit: number }
  | { code: 'unknown_app'; app: string }
  | { code: 'cannot_send'; app: string; appId: string }
  | { code: 'cannot_find_contacts'; app: string; appId: string }
  | { code: 'cannot_search'; app: string; appId: string }
  | { code: 'cannot_post'; app: string; appId: string }
  | { code: 'cannot_like'; app: string; appId: string }
  | { code: 'like_needs_app' }
  | { code: 'which_app'; options: AppChoice[] }
  | { code: 'not_installed'; app: string }
  | { code: 'android_only'; feature: AndroidOnlyFeature }
  | { code: 'no_app_in_front' }
  | { code: 'cannot_open_place'; app: string; appId: string; place: AppPlace }
  | { code: 'question'; question: string };

export type NoticeCode = Notice['code'];

/** English text of a notice. */
export function noticeText(notice: Notice): string {
  switch (notice.code) {
    case 'nothing_heard':
      return 'Nothing was heard.';
    case 'not_understood':
      return 'Sigil did not understand that. Try "open YouTube" or "send I am on my way to Ana on WhatsApp".';
    case 'bulk':
      return 'Sigil acts once per request, for one person, while you watch. It does not repeat actions, message many people or follow and like in bulk.';
    case 'several_people':
      return 'Sigil sends a message to one person at a time. Ask again for each person.';
    case 'too_many_commits':
      return `This plan would send or post ${notice.count} times. Sigil does at most ${notice.limit} per request.`;
    case 'unknown_app':
      return `Sigil does not know an app called "${notice.app}" yet.`;
    case 'cannot_send':
      return `Sigil cannot send messages in ${notice.app} yet.`;
    case 'cannot_find_contacts':
      return `Sigil cannot find contacts in ${notice.app} yet.`;
    case 'cannot_search':
      return `Sigil cannot search in ${notice.app} yet.`;
    case 'cannot_post':
      return `Sigil cannot post on ${notice.app} yet.`;
    case 'cannot_like':
      return `Sigil cannot like in ${notice.app} yet.`;
    case 'like_needs_app':
      return 'Open the post or video first, or say which app it is in.';
    case 'which_app':
      return `Which one: ${notice.options.map((option) => option.label).join(', ')}?`;
    case 'not_installed':
      return `${notice.app} is not installed on this phone.`;
    case 'android_only':
      return notice.feature === 'close'
        ? 'iOS does not let apps close other apps. Swipe it away in the app switcher.'
        : notice.feature === 'chat'
          ? 'On iOS, Sigil can open the app but cannot find a chat inside it.'
          : notice.feature === 'open'
            ? 'On iOS, Sigil can only open apps that have a public link.'
            : 'iOS does not let Sigil do that for other apps.';
    case 'no_app_in_front':
      return 'Sigil does not know which app is on screen.';
    case 'cannot_open_place':
      return `Sigil cannot open that place in ${notice.app} yet.`;
    case 'question':
      return notice.question;
  }
}
