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
    case 'question':
      return notice.question;
  }
}
