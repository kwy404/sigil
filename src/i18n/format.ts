import type { AppLanguage } from './languages';

/** Formats numbers the way each language writes them (1.5 in English, 1,5 in Portuguese). */
export interface NumberFormatter {
  number(value: number, fractionDigits?: number): string;
  /** A percent from 0 to 100, such as 70 % in French. */
  percent(value: number): string;
}

export function numberFormatter(language: AppLanguage): NumberFormatter {
  const fallbackDecimal = language === 'en' || language === 'ja' || language === 'zh-CN' ? '.' : ',';
  const number = (value: number, fractionDigits?: number) => {
    try {
      return new Intl.NumberFormat(language, {
        minimumFractionDigits: fractionDigits ?? 0,
        maximumFractionDigits: fractionDigits ?? 2,
      }).format(value);
    } catch {
      const text = fractionDigits === undefined ? String(value) : value.toFixed(fractionDigits);
      return text.replace('.', fallbackDecimal);
    }
  };
  const percent = (value: number) => {
    try {
      return new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 0 }).format(value / 100);
    } catch {
      return `${Math.round(value)}%`;
    }
  };
  return { number, percent };
}
