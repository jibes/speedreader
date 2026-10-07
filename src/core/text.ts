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
  /** followed by a space when rendered (false inside CJK runs) */
  gap: boolean;
}

export interface Doc {
  tokens: Token[];
  /** first token index for each sentence */
  sentenceStarts: number[];
  /** first token index for each paragraph */
  paragraphStarts: number[];
}

const SENTENCE_END = /[.!?…。！？]["'”’»)\]」』）]*$/;
const CLAUSE_END = /[,;:—–\-，、；：]["'”’»)\]」』）]*$/;
/** scripts written without spaces between words */
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const ABBREV = new Set([
  'mr.', 'mrs.', 'ms.', 'dr.', 'prof.', 'sr.', 'jr.', 'st.', 'vs.', 'etc.', 'e.g.', 'i.e.',
  'no.', 'fig.', 'al.', 'approx.', 'ca.', 'cf.', 'z.b.', 'bzw.', 'usw.', 'ggf.', 'vgl.', 'u.a.',
]);

export function normaliseText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/­/g, '') // soft hyphen
    .replace(/(\p{Ll})-\n+(\p{Ll})/gu, '$1$2') // de-hyphenate line breaks (PDF)
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    // hard-wrapped CJK lines join without a space
    .replace(/([\p{Script=Han}，。、；：！？])\n(?=[\p{Script=Han}])/gu, '$1')
    // single newlines inside paragraphs (hard-wrapped text) become spaces
    .replace(/([^\n])\n(?!\n)/g, '$1 ')
    .replace(/\n{3,}/g, '\n\n')
    // a "paragraph" that stops mid-sentence and continues in lowercase is a broken line
    // (PDF/copy-paste artefact), not a real paragraph: join it
    .replace(/([^\s.!?…:;"”’»)\]])\n\n(?=[„“"‘'(]?\p{Ll})/gu, '$1 ')
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

interface Word {
  text: string;
  gap: boolean;
}

let segmenter: Intl.Segmenter | null | undefined;

/** Split a paragraph into words: whitespace for most scripts, Intl.Segmenter for CJK. */
export function splitWords(para: string): Word[] {
  if (CJK.test(para)) {
    segmenter ??= typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('zh', { granularity: 'word' }) : null;
    if (segmenter) {
      const out: Word[] = [];
      for (const seg of segmenter.segment(para)) {
        if (/^\s+$/.test(seg.segment)) {
          if (out.length) out[out.length - 1].gap = true;
        } else if (seg.isWordLike || !out.length || out[out.length - 1].gap) {
          // opening punctuation glues to the next word
          if (out.length && !out[out.length - 1].gap && /^[“‘「『（(《]+$/.test(out[out.length - 1].text)) out[out.length - 1].text += seg.segment;
          else out.push({ text: seg.segment, gap: false });
        } else {
          out[out.length - 1].text += seg.segment; // trailing punctuation sticks to its word
        }
      }
      return out;
    }
  }
  return para.split(/\s+/).filter(Boolean).map((text) => ({ text, gap: true }));
}

export function buildDoc(text: string): Doc {
  const tokens: Token[] = [];
  const sentenceStarts: number[] = [];
  const paragraphStarts: number[] = [];
  const paragraphs = normaliseText(text).split(/\n\n/).filter((p) => p.trim());
  let s = 0;
  paragraphs.forEach((para, p) => {
    const words = splitWords(para);
    if (!words.length) return;
    paragraphStarts.push(tokens.length);
    let newSentence = true;
    words.forEach(({ text: word, gap }, i) => {
      if (newSentence) {
        sentenceStarts.push(tokens.length);
        newSentence = false;
      }
      let end: Token['end'] = 'none';
      const lower = word.toLowerCase();
      if (i === words.length - 1) end = 'paragraph';
      else if (SENTENCE_END.test(word) && !ABBREV.has(lower) && !/^\p{Lu}\.$/u.test(word)) end = 'sentence';
      else if (CLAUSE_END.test(word)) end = 'clause';
      tokens.push({ text: word, p, s, w: wordWeight(word) + END_WEIGHT[end], end, gap });
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

export function wordCount(text: string): number {
  if (CJK.test(text)) return text.split(/\n+/).reduce((a, p) => a + splitWords(p).length, 0);
  return (text.match(/\S+/g) || []).length;
}
