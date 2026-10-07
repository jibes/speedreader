/**
 * Comprehension questions from an AI engine: Chrome's built-in model (Gemini
 * Nano via the Prompt API, on-device) or OpenRouter (see openrouter.ts).
 *
 * Small models make mistakes, so every set is checked before use:
 *  1. structure: 4 distinct options, one keyed answer
 *  2. grounding: the quoted evidence must actually occur in the passage
 *  3. self-consistency: a fresh session answers the questions from the
 *     passage alone; questions it answers differently are dropped
 * Fewer than 2 surviving questions → caller falls back to cloze.
 */
import type { Question } from './quiz';

export type AiState = 'unavailable' | 'downloadable' | 'downloading' | 'available';

const LANG_NAMES: Record<string, string> = {
  en: 'English', de: 'German', fr: 'French', it: 'Italian', es: 'Spanish', zh: 'Simplified Chinese', ru: 'Russian', ja: 'Japanese',
};

const hasApi = () => typeof globalThis !== 'undefined' && 'LanguageModel' in globalThis;

const expect = (lang: string) => ({
  expectedInputs: [{ type: 'text' as const, languages: [lang] }],
  expectedOutputs: [{ type: 'text' as const, languages: [lang] }],
});

export async function aiAvailability(lang: string): Promise<AiState> {
  if (!hasApi()) return 'unavailable';
  try {
    return await LanguageModel.availability(expect(lang));
  } catch {
    return 'unavailable';
  }
}

/** Must be called from a user gesture when state is 'downloadable'. */
export async function enableAi(lang: string, onProgress: (fraction: number) => void): Promise<boolean> {
  if (!hasApi()) return false;
  try {
    const s = await LanguageModel.create({
      ...expect(lang),
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => onProgress(e.loaded));
      },
    });
    s.destroy();
    return true;
  } catch {
    return false;
  }
}

const GEN_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['main', 'inference', 'detail'] },
          question: { type: 'string' },
          options: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'string' } },
          answer: { type: 'integer', minimum: 0, maximum: 3 },
          evidence: { type: 'string' },
        },
        required: ['kind', 'question', 'options', 'answer', 'evidence'],
      },
    },
  },
  required: ['questions'],
};

const CHECK_SCHEMA = {
  type: 'object',
  properties: { answers: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 3 } } },
  required: ['answers'],
};

const genSystem = (langName: string) =>
  `You write reading-comprehension questions for a speed-reading trainer. Use only the passage the user gives you.
Write exactly 3 multiple-choice questions in ${langName}:
1. kind "main": the main point of the passage.
2. kind "inference": something the passage implies, which needs two sentences combined.
3. kind "detail": one important fact.
Rules: 4 short options each. Exactly one option is correct according to the passage. Wrong options must be plausible but contradicted by or absent from the passage. Do not copy a sentence verbatim as the correct option. Never ask about trivia such as numbers of words or the title.
"answer" is the index (0-3) of the correct option. "evidence" is an exact quote of 5-15 words from the passage that supports the answer.`;

const CHECK_SYSTEM = 'Answer multiple-choice questions using only the passage. Reply with the index (0-3) of the best option for each question, in order.';

interface RawQ {
  kind: string;
  question: string;
  options: string[];
  answer: number;
  evidence: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** evidence counts as grounded when ≥ 80 % of its words occur in the passage, in CJK by characters */
export function grounded(evidence: string, passage: string): boolean {
  const e = norm(evidence);
  if (!e) return false;
  const p = norm(passage);
  if (p.includes(e)) return true;
  const cjk = /\p{Script=Han}/u.test(e);
  const units = cjk ? [...e.replace(/\s/g, '')] : e.split(' ');
  const pool = new Set(cjk ? [...p.replace(/\s/g, '')] : p.split(' '));
  return units.filter((u) => pool.has(u)).length / units.length >= 0.8;
}

export function validate(raw: unknown, passage: string): RawQ[] {
  const qs = (raw as { questions?: RawQ[] })?.questions;
  if (!Array.isArray(qs)) return [];
  return qs.filter((q) => {
    if (!q || typeof q.question !== 'string' || !Array.isArray(q.options) || q.options.length !== 4) return false;
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) return false;
    const opts = q.options.map((o) => norm(String(o)));
    if (opts.some((o) => !o) || new Set(opts).size !== 4) return false;
    return grounded(String(q.evidence ?? ''), passage);
  });
}

function shuffled(q: RawQ, rnd: () => number): Question {
  const order = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { kind: 'ai', prompt: q.question.trim(), options: order.map((k) => String(q.options[k]).trim()), answer: order.indexOf(q.answer) };
}

const parse = (s: string): unknown => {
  try {
    // some hosted models wrap JSON in prose or code fences
    const m = s.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? m[0] : s);
  } catch {
    return null;
  }
};

/** A question-writing backend: one stateless call with a system prompt, user text and JSON schema. */
export interface Engine {
  name: 'chrome' | 'openrouter';
  ask(system: string, user: string, schema: Record<string, unknown>, signal?: AbortSignal): Promise<string>;
}

/** Chrome built-in model: a fresh session per call so generation and check stay independent. */
export const chromeEngine = (lang: string): Engine => ({
  name: 'chrome',
  async ask(system, user, schema, signal) {
    const s = await LanguageModel.create({ ...expect(lang), signal, initialPrompts: [{ role: 'system', content: system }] });
    try {
      return await s.prompt(user, { responseConstraint: schema, signal });
    } finally {
      s.destroy();
    }
  },
});

/** Generate, ground-check and self-verify questions. Returns [] on any failure. */
export async function aiQuiz(
  passage: string,
  lang: string,
  engine: Engine,
  { signal, rnd = Math.random, onError }: { signal?: AbortSignal; rnd?: () => number; onError?: (e: unknown) => void } = {},
): Promise<Question[]> {
  const langName = LANG_NAMES[lang] ?? 'English';
  try {
    const out = await engine.ask(genSystem(langName), `Passage:\n"""\n${passage}\n"""`, GEN_SCHEMA, signal);
    const candidates = validate(parse(out), passage).map((q) => ({ ...shuffled(q, rnd), engine: engine.name }));
    if (candidates.length < 2) return [];

    // independent check: a fresh call sees only the passage and the questions
    const listing = candidates
      .map((q, i) => `${i + 1}. ${q.prompt}\n${q.options.map((o, k) => `   ${k}) ${o}`).join('\n')}`)
      .join('\n');
    const verdict = parse(await engine.ask(CHECK_SYSTEM, `Passage:\n"""\n${passage}\n"""\n\nQuestions:\n${listing}`, CHECK_SCHEMA, signal)) as { answers?: number[] } | null;
    const answers = verdict?.answers ?? [];
    return candidates.filter((q, i) => answers[i] === q.answer);
  } catch (e) {
    if (!signal?.aborted) onError?.(e);
    return [];
  }
}
