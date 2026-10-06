/**
 * Skimming for gist (Duggan & Payne 2009; Rayner et al. 2016): sample the
 * information-dense parts — first sentence of each paragraph and its key
 * terms — and sweep past the rest. The check asks about topics, not words.
 */
import { isContent, type Question } from './quiz';
import type { Doc } from './text';

/** non-key words get this share of normal reading time */
export const SKIM_PACE = 0.25;
/** long paragraphs (e.g. PDFs without breaks) are split into blocks of this size */
const MAX_BLOCK = 120;
const TERMS_PER_BLOCK = 2;

export interface Block {
  start: number;
  end: number;
  terms: string[];
}

export interface SkimPlan {
  /** 1 = read at normal pace (key sentence or key term) */
  key: Uint8Array;
  blocks: Block[];
}

export const termOf = (w: string) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').toLowerCase();
const isTerm = isContent;

function buildBlocks(doc: Doc): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  const ps = [...doc.paragraphStarts, doc.tokens.length];
  for (let k = 0; k < ps.length - 1; k++) {
    let start = ps[k];
    const end = ps[k + 1];
    // split long paragraphs at sentence starts
    for (const ss of doc.sentenceStarts) {
      if (ss <= start || ss >= end) continue;
      if (ss - start >= MAX_BLOCK) {
        out.push({ start, end: ss });
        start = ss;
      }
    }
    out.push({ start, end });
  }
  return out;
}

export function planSkim(doc: Doc): SkimPlan {
  const ranges = buildBlocks(doc);
  // tf-idf over blocks: terms frequent here but rare elsewhere carry the topic
  const df = new Map<string, number>();
  const tfs = ranges.map(({ start, end }) => {
    const tf = new Map<string, number>();
    for (let i = start; i < end; i++) {
      const t = termOf(doc.tokens[i].text);
      if (isTerm(t)) tf.set(t, (tf.get(t) ?? 0) + 1);
    }
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    return tf;
  });
  const n = ranges.length;
  const key = new Uint8Array(doc.tokens.length);
  const blocks = ranges.map((r, k) => {
    const terms = [...tfs[k]]
      // words spread across much of the text describe the whole, not this block
      .filter(([t]) => n < 5 || df.get(t)! <= n * 0.4)
      .map(([t, c]) => ({ t, s: c * Math.log(1 + n / df.get(t)!) * (1 + Math.min(t.length, 12) / 12) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, TERMS_PER_BLOCK)
      .map((x) => x.t);
    const firstEnd = doc.sentenceStarts.find((ss) => ss > r.start) ?? r.end;
    for (let i = r.start; i < r.end; i++) {
      if (i < Math.min(firstEnd, r.end) || terms.includes(termOf(doc.tokens[i].text))) key[i] = 1;
    }
    return { ...r, terms };
  });
  return { key, blocks };
}

function shuffle<T>(a: T[], rnd: () => number): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/**
 * "Which of these came up?" — the answer is a key term of a block in
 * [from, to); distractors are key terms from elsewhere in the document that
 * never occur in the skimmed range.
 */
export function gistQuiz(doc: Doc, plan: SkimPlan, from: number, to: number, n = 3, rnd: () => number = Math.random): Question[] {
  const inRange = new Set<string>();
  for (let i = from; i < to; i++) inRange.add(termOf(doc.tokens[i].text));
  const answers = shuffle(
    [...new Set(plan.blocks.filter((b) => b.start < to && b.end > from).flatMap((b) => b.terms))],
    rnd,
  );
  const foreign = shuffle(
    [...new Set(plan.blocks.filter((b) => b.end <= from || b.start >= to).flatMap((b) => b.terms))].filter((t) => !inRange.has(t)),
    rnd,
  );
  const qs: Question[] = [];
  for (const ans of answers) {
    if (qs.length >= n || foreign.length < 3) break;
    const distractors = foreign.splice(0, 3);
    const options = shuffle([ans, ...distractors], rnd);
    qs.push({ kind: 'gist', prompt: '', options, answer: options.indexOf(ans) });
  }
  return qs;
}
