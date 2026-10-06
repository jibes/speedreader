/**
 * Tokenisation + per-word timing.
 *
 * Timing model follows eye-movement research (Rayner 1998; Kliegl et al. 2004):
 * fixation time grows with word length and drops with word frequency, and readers
 * pause at clause and sentence boundaries (wrap-up effects, Just & Carpenter 1980).
 * Durations are normalised so the *average* rate equals the chosen WPM — the
 * displayed speed is honest.
 */
import { isCommon } from './words';

export interface Token {
  text: string;
  /** paragraph index */
  p: number;
  /** sentence index (global) */
  s: number;
  /** relative duration weight (mean ≈ 1 over a document) */
  w: number;
  /** punctuation class at end of token */
  end: 'none' | 'clause' | 'sentence' | 'paragraph';
}

export interface Doc {
  tokens: Token[];
  /** first token index for each sentence */
  sentenceStarts: number[];
  /** first token index for each paragraph */
  paragraphStarts: number[];
}

const SENTENCE_END = /[.!?…]["'”’»)\]]*$/;
const CLAUSE_END = /[,;:—–\-]["'”’»)\]]*$/;
const ABBREV = new Set([
  'mr.', 'mrs.', 'ms.', 'dr.', 'prof.', 'sr.', 'jr.', 'st.', 'vs.', 'etc.', 'e.g.', 'i.e.',
  'no.', 'fig.', 'al.', 'approx.', 'ca.', 'cf.', 'z.b.', 'bzw.', 'usw.', 'ggf.', 'vgl.', 'u.a.',
]);

export function normaliseText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/­/g, '') // soft hyphen
    .replace(/(\w)-\n(\w)/g, '$1$2') // de-hyphenate line breaks (PDF)
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    // single newlines inside paragraphs (hard-wrapped text) become spaces
    .replace(/([^\n])\n(?!\n)/g, '$1 ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function wordWeight(word: string): number {
  const core = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  const len = core.length;
  let w = 1;
  // length effect: ~+3.5% per char beyond 5, small boost for very short words
  if (len > 5) w += (len - 5) * 0.035;
  if (len <= 3) w -= 0.12;
  // frequency effect
  if (len > 3 && isCommon(core)) w -= 0.1;
  // numbers, acronyms, mixed symbols are slow to encode
  if (/\d/.test(core)) w += 0.35;
  else if (len > 1 && core === core.toUpperCase() && /\p{L}/u.test(core)) w += 0.2;
  return Math.min(Math.max(w, 0.7), 2.2);
}

const END_WEIGHT = { none: 0, clause: 0.6, sentence: 1.3, paragraph: 2.0 } as const;

export function buildDoc(text: string): Doc {
  const tokens: Token[] = [];
  const sentenceStarts: number[] = [];
  const paragraphStarts: number[] = [];
  const paragraphs = normaliseText(text).split(/\n\n/).filter((p) => p.trim());
  let s = 0;
  paragraphs.forEach((para, p) => {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) return;
    paragraphStarts.push(tokens.length);
    let newSentence = true;
    words.forEach((word, i) => {
      if (newSentence) {
        sentenceStarts.push(tokens.length);
        newSentence = false;
      }
      let end: Token['end'] = 'none';
      const lower = word.toLowerCase();
      if (i === words.length - 1) end = 'paragraph';
      else if (SENTENCE_END.test(word) && !ABBREV.has(lower) && !/^\p{Lu}\.$/u.test(word)) end = 'sentence';
      else if (CLAUSE_END.test(word)) end = 'clause';
      tokens.push({ text: word, p, s, w: wordWeight(word) + END_WEIGHT[end], end });
      if (end === 'sentence' || end === 'paragraph') {
        s++;
        newSentence = true;
      }
    });
  });
  // normalise weights so mean = 1 (honest WPM)
  const mean = tokens.reduce((a, t) => a + t.w, 0) / (tokens.length || 1);
  for (const t of tokens) t.w /= mean;
  return { tokens, sentenceStarts, paragraphStarts };
}

/** Optimal recognition point: slightly left of centre (O'Regan & Jacobs 1992). */
export function orpIndex(word: string): number {
  const lead = word.match(/^[^\p{L}\p{N}]*/u)?.[0].length ?? 0;
  const core = word.length - lead - (word.match(/[^\p{L}\p{N}]*$/u)?.[0].length ?? 0);
  const n = Math.max(core, 1);
  const i = n <= 1 ? 0 : n <= 5 ? 1 : n <= 9 ? 2 : n <= 13 ? 3 : 4;
  return Math.min(lead + i, word.length - 1);
}

export interface Chunk {
  start: number;
  end: number; // exclusive
  /** weight sum */
  w: number;
}

/**
 * Group tokens into meaning units of up to `size` words, never crossing
 * sentence boundaries and preferring to break at clauses. Short function
 * words attach forward ("of the" + noun) as in phrase-based chunking.
 */
export function buildChunks(doc: Doc, size: number, maxChars = 22): Chunk[] {
  const chunks: Chunk[] = [];
  const t = doc.tokens;
  let i = 0;
  while (i < t.length) {
    let j = i;
    let chars = 0;
    let w = 0;
    while (j < t.length) {
      const len = t[j].text.length;
      if (j > i && (j - i >= size || chars + len + 1 > maxChars)) break;
      chars += len + 1;
      w += t[j].w;
      j++;
      if (t[j - 1].end !== 'none') break;
    }
    // avoid ending a multi-word chunk on a dangling function word
    if (j - i > 1 && j < t.length && t[j - 1].end === 'none' && isFunctionWord(t[j - 1].text)) {
      j--;
      w -= t[j].w;
    }
    chunks.push({ start: i, end: j, w });
    i = j;
  }
  return chunks;
}

const FUNCTION_WORDS = new Set(
  'a an the of to in on at by for with from as and or but if than that this these those is are was were be been its it his her their our your my der die das den dem des ein eine einen einem einer und oder zu im am vom zum zur mit von für auf an bei aus nach als wie'.split(' '),
);
function isFunctionWord(w: string) {
  return FUNCTION_WORDS.has(w.toLowerCase());
}

export function wordCount(text: string): number {
  return (text.match(/\S+/g) || []).length;
}
