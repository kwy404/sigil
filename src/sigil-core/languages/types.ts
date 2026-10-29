import type { ToolName } from '../tools';

/** Languages the rule based parser understands. */
export const RULE_LANGUAGES = ['en', 'pt', 'es', 'fr', 'de', 'it', 'ja', 'zh'] as const;

export type RuleLanguage = (typeof RULE_LANGUAGES)[number];

export type Groups = Record<string, string | undefined>;

export type RuleArgs = Record<string, string | number>;

export interface Rule {
  id: string;
  tool: ToolName;
  /**
   * Regular expression source, or several tried in order, matched against the
   * whole cleaned request, ignoring case. Accented letters also match their
   * plain form (ç matches c, ü matches u and ue). Upper case tokens are
   * replaced before compiling: APPS with the known app names, and the tokens
   * of the language's vocab.
   */
  source: string | readonly string[];
  /** Returns the tool arguments, or null when the match is not a usable request. */
  build: (g: Groups) => RuleArgs | null;
}

/**
 * Everything Sigil knows about one language: how requests are phrased, which
 * words confirm or cancel a pending step, and which words and patterns the
 * confirmation policy watches. The policy is the same in every language: the
 * planner and the executor check the words of all languages on every request.
 */
export interface LanguagePack {
  id: RuleLanguage;
  /** BCP 47 primary language subtag, as in pt-BR or zh-CN. */
  code: string;
  rules: Rule[];
  /** Upper case tokens used in the rule sources, for example NUM or PCT. */
  vocab: Record<string, string>;
  /** Wake words and polite openings removed before matching. */
  prefixes: RegExp[];
  /** Polite endings removed before matching, such as please. */
  suffixes: RegExp[];
  /** Whole answers that confirm a pending send or post. */
  yes: string[];
  /** Words that cancel it. They win over any yes in the same answer. */
  no: string[];
  /** Words in a control label that mark a send, post, call, payment or deletion. */
  sensitive: string[];
  /** Requests for repeated or mass actions, which Sigil refuses. */
  bulk: RegExp[];
  /** True when a contact string names more than one person. */
  severalPeople: RegExp[];
  /** The question asked when a message names no text. */
  askMessageText: (contact: string) => string;
}
