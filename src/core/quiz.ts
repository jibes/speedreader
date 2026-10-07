/**
 * Comprehension checks via cloze items (Taylor 1953) — a validated proxy for
 * reading comprehension that can be generated from any text. Targets are
 * content words; distractors are drawn from the same passage with similar
 * shape (length, capitalisation, number-ness) so guessing from form fails.
 */
import type { Doc } from './text';
import { isCommon } from './words';

export interface Question {
  /** cloze: fill the blank in a sentence; gist: which topic came up (skimming); ai: on-device generated */
  kind?: 'cloze' | 'gist' | 'ai';
  /** ai: which engine wrote it */
  engine?: 'chrome' | 'openrouter';
  /** cloze: sentence with the target replaced by _____ */
  prompt: string;
  options: string[];
  answer: number;
}

const strip = (w: string) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

/** content word: 4+ letters, or 2+ Han characters (CJK words are short) */
export function isContent(w: string) {
  const min = /\p{Script=Han}/u.test(w) ? 2 : 4;
  return w.length >= min && !isCommon(w) && /\p{L}/u.test(w);
}

function shapeScore(a: string, b: string) {
  let s = -Math.abs(a.length - b.length);
  if (/^\p{Lu}/u.test(a) === /^\p{Lu}/u.test(b)) s += 3;
  if (/\d/.test(a) === /\d/.test(b)) s += 3;
  if (a.slice(-2) === b.slice(-2)) s += 2;
  return s;
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Build up to `n` cloze questions from tokens [from, to). */
export function makeQuiz(doc: Doc, from: number, to: number, n = 3, rnd: () => number = Math.random): Question[] {
  const toks = doc.tokens.slice(from, to);
  const pool = [...new Set(toks.map((t) => strip(t.text)).filter(isContent))];
  if (pool.length < 4) return [];

  // group by sentence, keep sentences with 6+ words
  const sentences = new Map<number, number[]>();
  toks.forEach((t, i) => {
    const arr = sentences.get(t.s) ?? [];
    arr.push(from + i);
    sentences.set(t.s, arr);
  });
  // only complete sentences: a "sentence" cut off by a PDF page break makes an unfair question
  const complete = (idxs: number[]) => /[.!?…。！？]["'”’»)\]」』）]*$/.test(doc.tokens[idxs[idxs.length - 1]].text);
  const candidates = shuffle([...sentences.values()].filter((s) => s.length >= 6 && complete(s)), rnd);
  // spread questions across the passage: sort chosen by position afterwards
  const picked: Question[] = [];
  const used = new Set<string>();
  for (const idxs of candidates) {
    if (picked.length >= n) break;
    const content = idxs.filter((i) => {
      const w = strip(doc.tokens[i].text);
      return isContent(w) && !used.has(w.toLowerCase());
    });
    if (!content.length) continue;
    // prefer rarer/longer words, avoid the first word of the sentence
    content.sort((a, b) => strip(doc.tokens[b].text).length - strip(doc.tokens[a].text).length);
    const target = content.find((i) => i !== idxs[0]) ?? content[0];
    const word = strip(doc.tokens[target].text);
    const distractors = pool
      .filter((w) => w.toLowerCase() !== word.toLowerCase())
      .map((w) => ({ w, s: shapeScore(word, w) + rnd() * 2 }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 3)
      .map((d) => d.w);
    if (distractors.length < 3) continue;
    used.add(word.toLowerCase());
    const prompt = idxs
      .map((i) => (i === target ? doc.tokens[i].text.replace(word, '_____') : doc.tokens[i].text) + (doc.tokens[i].gap ? ' ' : ''))
      .join('')
      .trim();
    const options = shuffle([word, ...distractors], rnd);
    picked.push({ prompt, options, answer: options.indexOf(word) });
  }
  return picked;
}
