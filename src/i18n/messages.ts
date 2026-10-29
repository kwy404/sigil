import type { AppLanguage } from './languages';
import { de } from './locales/de';
import { en, type Messages as CoreMessages } from './locales/en';
import { es } from './locales/es';
import { fr } from './locales/fr';
import { it } from './locales/it';
import { ja } from './locales/ja';
import { ptBR } from './locales/pt-BR';
import { zhCN } from './locales/zh-CN';
import { uiDe } from './ui/de';
import { uiEn, type UiMessages } from './ui/en';
import { uiEs } from './ui/es';
import { uiFr } from './ui/fr';
import { uiIt } from './ui/it';
import { uiJa } from './ui/ja';
import { uiPtBR } from './ui/pt-BR';
import { uiZhCN } from './ui/zh-CN';

export type { UiMessages } from './ui/en';

/** The messages of one language: the core texts plus the words of the app screens (ui). */
export type Messages = CoreMessages & { ui: UiMessages };

export const MESSAGES: Record<AppLanguage, Messages> = {
  en: { ...en, ui: uiEn },
  'pt-BR': { ...ptBR, ui: uiPtBR },
  es: { ...es, ui: uiEs },
  fr: { ...fr, ui: uiFr },
  de: { ...de, ui: uiDe },
  it: { ...it, ui: uiIt },
  ja: { ...ja, ui: uiJa },
  'zh-CN': { ...zhCN, ui: uiZhCN },
};
