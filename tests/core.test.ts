import { describe, expect, it } from 'vitest';
import { buildDoc, normaliseText } from '../src/core/text';
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

import { pdfPageText } from '../src/core/extract';

describe('PDF text', () => {
  const item = (str: string, x: number, y: number, width = str.length * 5) => ({ str, transform: [1, 0, 0, 1, x, y], width, height: 10 });

  it('keeps wrapped lines in one paragraph and splits on larger gaps', () => {
    const text = pdfPageText([
      item('Artificial intelligence (AI) is the capability', 50, 700),
      item('of computational systems to perform tasks', 50, 686),
      item('typically associated with human intelligence.', 50, 672),
      item('A second paragraph starts after a bigger gap', 50, 644),
      item('and continues here.', 50, 630),
    ]);
    expect(text.split('\n\n')).toHaveLength(2);
    expect(normaliseText(text)).toBe(
      'Artificial intelligence (AI) is the capability of computational systems to perform tasks typically associated with human intelligence.\n\nA second paragraph starts after a bigger gap and continues here.',
    );
  });

  it('joins items on one baseline, adding a space only where the PDF leaves a gap', () => {
    expect(pdfPageText([item('Hello', 50, 700, 25), item('world', 80, 700), item('!', 105, 700)])).toBe('Hello world!');
  });
});

describe('broken paragraphs', () => {
  it('joins a "paragraph" that stops mid-sentence and continues in lowercase', () => {
    expect(normaliseText('perform tasks typically\n\nassociated with humans.\n\nNext paragraph.')).toBe('perform tasks typically associated with humans.\n\nNext paragraph.');
  });
  it('keeps headings and real paragraphs', () => {
    expect(normaliseText('Artificial intelligence\n\nArtificial intelligence (AI) is a field.\n\nit continues? no: lowercase after a full stop stays separate.')).toBe(
      'Artificial intelligence\n\nArtificial intelligence (AI) is a field.\n\nit continues? no: lowercase after a full stop stays separate.',
    );
  });
});
