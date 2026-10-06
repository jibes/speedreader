import type { Lang } from '../i18n';
import de from './samples/de';
import en from './samples/en';
import es from './samples/es';
import fr from './samples/fr';
import it from './samples/it';
import ru from './samples/ru';
import zh from './samples/zh';

/** Speed-test / demo text in each UI language (same content, translated). */
const SAMPLES: Record<Lang, { title: string; text: string }> = { en, de, fr, it, es, ru, zh };

export const sampleFor = (lang: Lang) => SAMPLES[lang];

export const SAMPLE_TITLE = en.title;
export const SAMPLE = en.text;
