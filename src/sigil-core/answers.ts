import { foldText } from '../app-profiles/text';
import { LANGUAGE_PACKS } from './languages';

export type Answer = 'yes' | 'no';

const CJK = /[぀-ヿ㐀-鿿豈-﫿]/u;

/** Polite words that may come with a yes without changing it. */
const POLITE = ['please', 'por favor', "s'il te plait", "s'il vous plait", 'bitte', 'per favore', '谢谢', 'thanks'];

function normalize(text: string): string {
  return foldText(text.toLowerCase())
    .replace(/[‘’`]/g, "'")
    .replace(/[.!?¡¿。！？…"«»「」『』]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NO = LANGUAGE_PACKS.flatMap((pack) => pack.no).map(normalize);
const YES = new Set(LANGUAGE_PACKS.flatMap((pack) => pack.yes).map(normalize));
const NEUTRAL = new Set(POLITE.map(normalize));

function mentions(answer: string, word: string): boolean {
  return CJK.test(word) ? answer.includes(word) : ` ${answer} `.includes(` ${word} `);
}

/**
 * Reads the spoken answer to a confirmation, with the same rule in every
 * language: a cancel word anywhere cancels, even next to a yes ("yes, no
 * wait"); a yes counts only when the whole answer is made of yes words and
 * polite words ("yes please", "sim, pode", "はい、送って"); anything else is
 * not a yes, and the step is not run. Words of all eight languages are
 * accepted, so the answer does not have to match the request's language.
 */
export function parseAnswer(text: string): Answer | null {
  const answer = normalize(text);
  if (!answer) {
    return null;
  }
  const words = answer.replace(/[,，、;:]/g, ' ').replace(/\s+/g, ' ').trim();
  if (NO.some((word) => mentions(words, word))) {
    return 'no';
  }
  const parts = answer
    .split(/[,，、;:]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const meaningful = parts.filter((part) => !NEUTRAL.has(part));
  if (meaningful.length > 0 && meaningful.every((part) => YES.has(part))) {
    return 'yes';
  }
  return null;
}
