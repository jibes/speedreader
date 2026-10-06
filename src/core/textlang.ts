/**
 * Guess the language of a text (not the UI): script for zh/ru/ja, function-word
 * counts for the Latin-script languages. Good enough to pick the AI's
 * question language; returns 'en' when unsure.
 */
const MARKERS: Record<string, string[]> = {
  en: ['the', 'and', 'of', 'to', 'is', 'that', 'with', 'for', 'this', 'are', 'was', 'you'],
  de: ['der', 'die', 'und', 'das', 'ist', 'nicht', 'mit', 'ein', 'eine', 'auf', 'sich', 'auch'],
  fr: ['le', 'les', 'des', 'est', 'et', 'une', 'dans', 'que', 'pour', 'pas', 'qui', 'sur'],
  it: ['il', 'che', 'di', 'non', 'per', 'una', 'sono', 'gli', 'della', 'anche', 'come', 'più'],
  es: ['el', 'los', 'que', 'y', 'es', 'por', 'para', 'una', 'con', 'las', 'del', 'como'],
};

export function detectTextLang(text: string): string {
  const sample = text.slice(0, 4000);
  const han = (sample.match(/\p{Script=Han}/gu) ?? []).length;
  const kana = (sample.match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? []).length;
  const cyr = (sample.match(/\p{Script=Cyrillic}/gu) ?? []).length;
  const latin = (sample.match(/\p{Script=Latin}/gu) ?? []).length;
  if (kana > 20) return 'ja';
  if (han > latin && han > cyr) return 'zh';
  if (cyr > latin) return 'ru';
  const words = sample.toLowerCase().match(/\p{L}+/gu) ?? [];
  let best = 'en';
  let bestScore = 0;
  for (const [lang, list] of Object.entries(MARKERS)) {
    const set = new Set(list);
    const score = words.reduce((a, w) => a + (set.has(w) ? 1 : 0), 0);
    if (score > bestScore) {
      best = lang;
      bestScore = score;
    }
  }
  return best;
}
