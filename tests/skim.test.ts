import { describe, expect, it } from 'vitest';
import { gistQuiz, planSkim, termOf } from '../src/core/skim';
import { buildDoc } from '../src/core/text';
import { SAMPLE } from '../src/core/sample';

const seeded = (s = 1) => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;

describe('skim plan', () => {
  const doc = buildDoc(SAMPLE);
  const plan = planSkim(doc);

  it('keeps the first sentence of every paragraph', () => {
    for (const ps of doc.paragraphStarts) expect(plan.key[ps]).toBe(1);
    const firstEnd = doc.sentenceStarts[1];
    for (let i = 0; i < firstEnd; i++) expect(plan.key[i]).toBe(1);
  });

  it('marks topical key terms, not function words, and dims most text', () => {
    const terms = plan.blocks.flatMap((b) => b.terms);
    expect(terms).toEqual(expect.arrayContaining(['fixations', 'regressions']));
    expect(terms).not.toContain('the');
    const share = plan.key.reduce((a, k) => a + k, 0) / plan.key.length;
    expect(share).toBeGreaterThan(0.15);
    expect(share).toBeLessThan(0.5);
  });

  it('splits giant paragraphs into blocks', () => {
    const big = buildDoc(Array.from({ length: 60 }, (_, k) => `Sentence ${k} mentions topic${k % 7} and more filler words here.`).join(' '));
    expect(planSkim(big).blocks.length).toBeGreaterThan(3);
  });
});

describe('gist quiz', () => {
  const doc = buildDoc(SAMPLE);
  const plan = planSkim(doc);
  const from = doc.paragraphStarts[2];
  const to = doc.paragraphStarts[5];

  it('asks about topics from the skimmed range, distractors from elsewhere', () => {
    const qs = gistQuiz(doc, plan, from, to, 3, seeded(3));
    expect(qs.length).toBeGreaterThanOrEqual(2);
    const inRange = new Set(doc.tokens.slice(from, to).map((t) => termOf(t.text)));
    for (const q of qs) {
      expect(q.kind).toBe('gist');
      expect(q.options).toHaveLength(4);
      q.options.forEach((o, k) => expect(inRange.has(o)).toBe(k === q.answer));
    }
  });

  it('returns nothing when the whole text was skimmed (no outside distractors)', () => {
    expect(gistQuiz(doc, plan, 0, doc.tokens.length)).toEqual([]);
  });
});
