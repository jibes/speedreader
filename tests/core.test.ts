import { describe, expect, it } from 'vitest';
import { buildChunks, buildDoc, normaliseText, orpIndex } from '../src/core/text';
import { makeQuiz } from '../src/core/quiz';
import { nextWpm, startFromBaseline } from '../src/core/trainer';
import { rtf } from '../src/core/extract';
import { SAMPLE } from '../src/core/sample';

const seeded = (s = 1) => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;

describe('text', () => {
  it('normalises hard-wrapped and hyphenated text', () => {
    expect(normaliseText('A line\nwrapped here.\n\n\nNew para-\ngraph.')).toBe('A line wrapped here.\n\nNew paragraph.');
  });

  it('splits sentences but not on abbreviations', () => {
    const d = buildDoc('Dr. Smith arrived. He sat, then left!\n\nNext paragraph here.');
    expect(d.sentenceStarts).toEqual([0, 3, 7]);
    expect(d.paragraphStarts).toEqual([0, 7]);
    expect(d.tokens[4].end).toBe('clause');
    expect(d.tokens[9].end).toBe('paragraph');
  });

  it('normalises weights to mean 1 so WPM is honest', () => {
    const d = buildDoc(SAMPLE);
    const mean = d.tokens.reduce((a, t) => a + t.w, 0) / d.tokens.length;
    expect(mean).toBeCloseTo(1, 6);
    const long = d.tokens.find((t) => t.text === 'comprehension')!;
    const short = d.tokens.find((t) => t.text === 'the')!;
    expect(long.w).toBeGreaterThan(short.w);
  });

  it('places ORP left of centre', () => {
    expect(orpIndex('a')).toBe(0);
    expect(orpIndex('read')).toBe(1);
    expect(orpIndex('reading')).toBe(2);
    expect(orpIndex('"Hello,')).toBe(2);
  });

  it('chunks never cross sentences and cover every token', () => {
    const d = buildDoc(SAMPLE);
    const chunks = buildChunks(d, 3);
    let next = 0;
    for (const c of chunks) {
      expect(c.start).toBe(next);
      expect(c.end - c.start).toBeLessThanOrEqual(3);
      expect(new Set(d.tokens.slice(c.start, c.end).map((t) => t.s)).size).toBe(1);
      next = c.end;
    }
    expect(next).toBe(d.tokens.length);
  });
});

describe('quiz', () => {
  it('builds valid cloze questions from the read range', () => {
    const d = buildDoc(SAMPLE);
    const qs = makeQuiz(d, 0, 300, 3, seeded(7));
    expect(qs).toHaveLength(3);
    for (const q of qs) {
      expect(q.prompt).toContain('_____');
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options.map((o) => o.toLowerCase())).size).toBe(4);
      expect(q.answer).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns nothing for tiny passages', () => {
    expect(makeQuiz(buildDoc('Too short.'), 0, 2)).toEqual([]);
  });
});

describe('trainer', () => {
  it('moves speed with comprehension', () => {
    expect(nextWpm(300, 1)).toBe(330);
    expect(nextWpm(300, 0.8)).toBe(315);
    expect(nextWpm(300, 0.67)).toBe(285);
    expect(nextWpm(300, 0.33)).toBe(265);
    expect(nextWpm(100, 0)).toBe(100);
    expect(startFromBaseline(240, 1)).toBe(275);
    expect(startFromBaseline(240, 0.33)).toBe(145);
    expect(startFromBaseline(5000, 1)).toBe(700);
  });
});

describe('extract', () => {
  it('strips rtf', () => {
    expect(rtf('{\\rtf1\\ansi {\\b Hello} world\\par Caf\\\'e9}').trim()).toBe('Hello world\nCafé');
  });
});
