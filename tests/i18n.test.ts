import { afterEach, describe, expect, it } from 'vitest';
import de from '../src/i18n/de';
import en from '../src/i18n/en';
import es from '../src/i18n/es';
import fr from '../src/i18n/fr';
import it_ from '../src/i18n/it';
import ru from '../src/i18n/ru';
import zh from '../src/i18n/zh';
import { detectLang, setLang, t, type Dict } from '../src/i18n';
import { makeQuiz } from '../src/core/quiz';
import { sampleFor } from '../src/core/sample';
import { gistQuiz, planSkim } from '../src/core/skim';
import { buildDoc, splitWords, wordCount } from '../src/core/text';

const dicts: Record<string, Dict> = { de, fr, it: it_, es, zh, ru };
const vars = (s: unknown) => [...JSON.stringify(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

afterEach(() => setLang('en'));

describe('dictionaries', () => {
  for (const [code, d] of Object.entries(dicts)) {
    it(`${code} has every key with the same placeholders`, () => {
      expect(Object.keys(d).sort()).toEqual(Object.keys(en).sort());
      for (const k of Object.keys(en) as (keyof typeof en)[]) {
        // plural entries may omit {n} in a form, but must not invent variables
        const src = new Set(vars(en[k]).split(','));
        for (const v of vars(d[k]).split(',').filter(Boolean)) expect(src.has(v), `${code} ${k} {${v}}`).toBe(true);
        if (typeof en[k] === 'string') expect(vars(d[k]), `${code} ${k}`).toBe(vars(en[k]));
      }
    });
  }
});

describe('t()', () => {
  it('interpolates and pluralises per language', () => {
    expect(t('home.words', { n: 1 })).toBe('1 word');
    expect(t('home.words', { n: 1200 })).toBe('1,200 words');
    setLang('ru');
    expect(t('home.words', { n: 1 })).toBe('1 слово');
    expect(t('home.words', { n: 3 })).toBe('3 слова');
    expect(t('home.words', { n: 5 })).toBe('5 слов');
    setLang('de');
    expect(t('home.words', { n: 1200 })).toBe('1.200 Wörter');
  });

  it('detects language from browser preferences', () => {
    expect(detectLang(['fr-CH', 'en'])).toBe('fr');
    expect(detectLang(['zh-Hans-CN'])).toBe('zh');
    expect(detectLang(['pt-BR', 'es-419'])).toBe('es');
    expect(detectLang(['ja'])).toBe('en');
  });
});

describe('Chinese text', () => {
  it('segments words without spaces and keeps punctuation attached', () => {
    const w = splitWords('你好，世界。我们读书。');
    expect(w.map((x) => x.text).join('')).toBe('你好，世界。我们读书。');
    expect(w.every((x) => !x.gap)).toBe(true);
    expect(w.length).toBeGreaterThan(3);
    expect(w.some((x) => /^[，。]/.test(x.text))).toBe(false);
  });

  it('sample builds sentences, quizzes and skim checks', () => {
    const { text } = sampleFor('zh');
    const doc = buildDoc(text);
    expect(doc.sentenceStarts.length).toBeGreaterThan(20);
    expect(wordCount(text)).toBeGreaterThan(300);
    expect(makeQuiz(doc, 0, 300, 3).length).toBeGreaterThanOrEqual(2);
    const plan = planSkim(doc);
    expect(gistQuiz(doc, plan, doc.paragraphStarts[2], doc.paragraphStarts[5]).length).toBeGreaterThanOrEqual(2);
  });
});

describe('samples', () => {
  for (const code of ['de', 'fr', 'it', 'es', 'ru'] as const) {
    it(`${code} sample supports speed test and checks`, () => {
      const doc = buildDoc(sampleFor(code).text);
      expect(doc.tokens.length).toBeGreaterThan(500);
      expect(makeQuiz(doc, 0, 300, 3)).toHaveLength(3);
    });
  }
});
