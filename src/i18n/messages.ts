import type { AppLanguage } from './languages';
import { de } from './locales/de';
import { en, type Messages } from './locales/en';
import { es } from './locales/es';
import { fr } from './locales/fr';
import { it } from './locales/it';
import { ja } from './locales/ja';
import { ptBR } from './locales/pt-BR';
import { zhCN } from './locales/zh-CN';

export type { Messages } from './locales/en';

export const MESSAGES: Record<AppLanguage, Messages> = {
  en,
  'pt-BR': ptBR,
  es,
  fr,
  de,
  it,
  ja,
  'zh-CN': zhCN,
};
