const ACCENTS: Record<string, string> = {
  á: 'a',
  à: 'a',
  â: 'a',
  ã: 'a',
  ä: 'a',
  é: 'e',
  è: 'e',
  ê: 'e',
  ë: 'e',
  í: 'i',
  ì: 'i',
  î: 'i',
  ï: 'i',
  ó: 'o',
  ò: 'o',
  ô: 'o',
  õ: 'o',
  ö: 'o',
  ú: 'u',
  ù: 'u',
  û: 'u',
  ü: 'u',
  ç: 'c',
  ñ: 'n',
};

/** Lowercases and removes the accents of Latin letters, for loose matching of spoken names. */
export function foldText(value: string): string {
  return value.toLowerCase().replace(/[áàâãäéèêëíìîïóòôõöúùûüçñ]/g, (c) => ACCENTS[c] ?? c);
}

/** Folds accents and case, drops punctuation and collapses spaces. */
export function normalizeName(value: string): string {
  return foldText(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
