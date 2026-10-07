import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiAvailability, aiQuiz, chromeEngine, grounded, validate } from '../src/core/ai';
import { detectTextLang } from '../src/core/textlang';
import { sampleFor } from '../src/core/sample';

const passage =
  'Your eyes move in rapid jumps called saccades. Almost everything you take in arrives during fixations, which last about a quarter of a second. Regressions repair misunderstandings.';

const q = (over: Partial<Record<string, unknown>> = {}) => ({
  kind: 'detail',
  question: 'When do you take in information?',
  options: ['During fixations', 'During saccades', 'While blinking', 'Never'],
  answer: 0,
  evidence: 'everything you take in arrives during fixations',
  ...over,
});

/** fake Prompt API: first session generates, second checks */
function mockModel(gen: unknown, check: unknown, state = 'available') {
  const prompts: string[] = [];
  let n = 0;
  const destroyed = vi.fn();
  vi.stubGlobal('LanguageModel', {
    availability: vi.fn(async () => state),
    create: vi.fn(async () => {
      const mine = n++;
      return {
        prompt: vi.fn(async (input: string) => {
          prompts.push(input);
          return JSON.stringify(mine === 0 ? gen : typeof check === 'function' ? check(input) : check);
        }),
        destroy: destroyed,
      };
    }),
  });
  return { prompts, destroyed };
}

afterEach(() => vi.unstubAllGlobals());

describe('validation', () => {
  it('requires grounded evidence', () => {
    expect(grounded('arrives during fixations', passage)).toBe(true);
    expect(grounded('the moon is made of cheese entirely', passage)).toBe(false);
  });

  it('drops malformed questions', () => {
    const raw = {
      questions: [
        q(),
        q({ options: ['A', 'A', 'B', 'C'] }),
        q({ answer: 7 }),
        q({ evidence: 'completely invented quote about rockets and planets' }),
        q({ options: ['only', 'three', 'options'] }),
      ],
    };
    expect(validate(raw, passage)).toHaveLength(1);
    expect(validate(null, passage)).toEqual([]);
  });
});

describe('aiQuiz', () => {
  it('returns [] without the Prompt API', async () => {
    expect(await aiAvailability('en')).toBe('unavailable');
    expect(await aiQuiz(passage, 'en', chromeEngine('en'))).toEqual([]);
  });

  it('keeps only questions the independent check answers the same way, shuffled but still correct', async () => {
    const gen = { questions: [q(), q({ question: 'What do regressions do?', options: ['Repair misunderstandings', 'Waste time', 'Cause blindness', 'Nothing'], evidence: 'Regressions repair misunderstandings' }), q({ question: 'How long is a fixation?', options: ['A quarter second', 'One second', 'Ten seconds', 'A minute'], evidence: 'which last about a quarter of a second' })] };
    // the checker finds the true option by its text, except for question 3 where it disagrees
    const check = (input: string) => {
      const blocks = input.split(/\n(?=\d+\. )/).slice(1);
      return {
        answers: blocks.map((b, i) => {
          const lines = b.split('\n').slice(1);
          const k = lines.findIndex((l) => /fixations|Repair|quarter/.test(l));
          return i === 2 ? (k + 1) % 4 : k;
        }),
      };
    };
    const { destroyed } = mockModel(gen, check);
    const out = await aiQuiz(passage, 'en', chromeEngine('en'), { rnd: () => 0.3 });
    expect(out).toHaveLength(2);
    expect(out[0].kind).toBe('ai');
    expect(out[0].options[out[0].answer]).toBe('During fixations');
    expect(out[1].options[out[1].answer]).toBe('Repair misunderstandings');
    expect(destroyed).toHaveBeenCalledTimes(2);
  });

  it('falls back (empty) when fewer than 2 questions survive', async () => {
    mockModel({ questions: [q(), q({ evidence: 'not in the passage at all whatsoever ok' })] }, { answers: [0] });
    expect(await aiQuiz(passage, 'en', chromeEngine('en'))).toEqual([]);
  });

  it('survives model errors and invalid JSON', async () => {
    vi.stubGlobal('LanguageModel', { availability: async () => 'available', create: async () => ({ prompt: async () => 'not json', destroy() {} }) });
    expect(await aiQuiz(passage, 'en', chromeEngine('en'))).toEqual([]);
    vi.stubGlobal('LanguageModel', { availability: async () => { throw new Error('x'); }, create: async () => { throw new Error('boom'); } });
    expect(await aiAvailability('en')).toBe('unavailable');
    expect(await aiQuiz(passage, 'en', chromeEngine('en'))).toEqual([]);
  });
});

describe('text language detection', () => {
  it.each(['en', 'de', 'fr', 'it', 'es', 'zh', 'ru'] as const)('detects %s sample', (lang) => {
    expect(detectTextLang(sampleFor(lang).text)).toBe(lang);
  });
});
