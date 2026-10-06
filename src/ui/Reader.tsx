import { memo, type ReactElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { makeQuiz, type Question } from '../core/quiz';
import { gistQuiz, planSkim, SKIM_PACE } from '../core/skim';
import { SECTION_WORDS, SKIM_SECTION_WORDS, store, type DocMeta, type Settings } from '../core/store';
import { buildDoc, type Doc } from '../core/text';
import { clampWpm, nextWpm, startFromBaseline } from '../core/trainer';
import { Back, Close, Pause, Play, Sliders } from './icons';
import { Quiz, Result, type ResultInfo } from './Quiz';
import { SettingsSheet } from './Settings';
import { useWakeLock } from './useWakeLock';

type QuizSheet = { kind: 'quiz'; questions: Question[]; from: number; to: number; ms: number; baseline?: boolean; skim?: boolean };
type Sheet = { kind: 'settings' } | QuizSheet | { kind: 'result'; info: ResultInfo } | { kind: 'end' };

interface Baseline {
  from: number;
  to: number;
  started: number | null;
}

/** the word being shown: [start, end) */
interface Cur {
  start: number;
  end: number;
}

export function Reader({
  meta,
  settings,
  setSettings,
  onExit,
  startWithBaseline,
}: {
  meta: DocMeta;
  settings: Settings;
  setSettings: (p: Partial<Settings>) => void;
  onExit: () => void;
  startWithBaseline?: boolean;
}) {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [pos, setPos] = useState(meta.pos);
  const [playing, setPlaying] = useState(false);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [, tick] = useState(0);
  // screen stays on for the whole reading session, including quizzes and pauses
  useWakeLock(true);

  const { goal } = settings;
  const checks = goal !== 'read';

  const seg = useRef({ start: meta.pos, ms: 0 });
  const playStart = useRef(0);
  const lastSave = useRef(0);
  const baselineRef = useRef<Baseline | null>(null);
  baselineRef.current = baseline;

  useEffect(() => {
    let alive = true;
    store.text(meta.id).then((t) => {
      if (!alive) return;
      const d = buildDoc(t ?? '');
      setDoc(d);
      const p = meta.pos >= d.tokens.length ? 0 : meta.pos;
      setPos(p);
      seg.current = { start: p, ms: 0 };
    });
    return () => {
      alive = false;
    };
  }, [meta.id, meta.pos]);

  const skim = useMemo(() => (doc && goal === 'skim' ? planSkim(doc) : null), [doc, goal]);
  // skim checks need text outside the section for wrong answers: ≥ 3 sections per document
  const section = goal === 'skim' ? Math.max(200, Math.min(SKIM_SECTION_WORDS, Math.round((doc?.tokens.length ?? 0) / 3))) : SECTION_WORDS;
  const cur: Cur = useMemo(() => ({ start: pos, end: pos + 1 }), [pos]);

  // latest values for callbacks fired from timers / unmount
  const live = useRef({ pos, settings, doc, playing });
  live.current = { pos, settings, doc, playing };

  /* ── session accounting ─────────────────────────── */
  const segMs = () => seg.current.ms + (live.current.playing ? performance.now() - playStart.current : 0);

  const logUntested = useCallback((end: number) => {
    const words = end - seg.current.start;
    const ms = segMs();
    if (words >= 30 && ms > 3000) {
      const s = live.current.settings;
      // skim speed is coverage (words swept per minute); read/train use the set pace
      const wpm = s.goal === 'skim' ? Math.round(words / (ms / 60000)) : s.wpm;
      store.addSession({ at: Date.now(), docId: meta.id, goal: s.goal, wpm, words, ms });
    }
    seg.current = { start: end, ms: 0 };
  }, [meta.id]);

  const save = useCallback((p: number) => {
    store.saveMeta({ ...meta, pos: p, opened: Date.now() });
    lastSave.current = Date.now();
  }, [meta]);

  useEffect(() => {
    if (!playing || Date.now() - lastSave.current > 3000) save(pos);
  }, [pos, playing, save]);

  // flush on exit
  useEffect(
    () => () => {
      const { pos: p, doc: d } = live.current;
      if (d && !baselineRef.current) logUntested(Math.min(p, d.tokens.length));
      save(p);
    },
    [],
  );

  // switching goal starts a fresh section
  useEffect(() => {
    seg.current = { start: live.current.pos, ms: 0 };
    if (live.current.playing) playStart.current = performance.now();
  }, [goal]);

  /* ── transport ──────────────────────────────────── */
  const pause = useCallback(() => {
    if (!live.current.playing) return;
    seg.current.ms += performance.now() - playStart.current;
    setPlaying(false);
    if (live.current.settings.goal === 'read') logUntested(live.current.pos);
  }, [logUntested]);

  const play = useCallback(() => {
    const { doc: d, pos: p } = live.current;
    if (!d || live.current.playing) return;
    if (p >= d.tokens.length - 1) {
      setPos(0);
      seg.current = { start: 0, ms: 0 };
    }
    playStart.current = performance.now();
    setPlaying(true);
  }, []);

  const toggle = () => (playing ? pause() : play());

  const seek = useCallback((p: number) => {
    const d = live.current.doc;
    if (!d) return;
    const np = Math.max(0, Math.min(d.tokens.length - 1, p));
    // jumping forward past unread text invalidates the current section
    if (np > live.current.pos + 2) {
      seg.current.ms = 0;
      if (live.current.playing) playStart.current = performance.now();
      seg.current.start = np;
    }
    if (np < seg.current.start) seg.current.start = np;
    setPos(np);
  }, []);

  const sentenceJump = (dir: -1 | 1) => {
    if (!doc) return;
    const s = doc.tokens[pos].s;
    const here = doc.sentenceStarts[s];
    if (dir < 0) seek(pos - here > 1 ? here : doc.sentenceStarts[Math.max(0, s - 1)]);
    else if (s + 1 < doc.sentenceStarts.length) seek(doc.sentenceStarts[s + 1]);
  };

  /* ── checkpoint / quiz ──────────────────────────── */
  const checkpoint = useCallback((end: number) => {
    const d = live.current.doc!;
    const from = seg.current.start;
    const isSkim = live.current.settings.goal === 'skim';
    const questions = isSkim ? gistQuiz(d, planSkim(d), from, end, 3) : makeQuiz(d, from, end, 3);
    if (questions.length >= 2) {
      setSheet({ kind: 'quiz', questions, from, to: end, ms: seg.current.ms, skim: isSkim });
    } else {
      logUntested(end);
      if (end >= d.tokens.length) setSheet({ kind: 'end' });
      else {
        playStart.current = performance.now();
        setPlaying(true);
      }
    }
  }, [logUntested]);

  /* ── the clock ──────────────────────────────────── */
  useEffect(() => {
    if (!playing || !doc || sheet) return;
    const tok = doc.tokens[pos];
    const ms = (tok.w * (skim && !skim.key[pos] ? SKIM_PACE : 1) * 60000) / settings.wpm;
    const t = setTimeout(() => {
      const next = pos + 1;
      if (next >= doc.tokens.length) {
        pause();
        if (checks && next - seg.current.start >= 60) checkpoint(next);
        else {
          logUntested(next);
          setSheet({ kind: 'end' });
        }
        return;
      }
      setPos(next);
      if (checks && next - seg.current.start >= section && (tok.end === 'sentence' || tok.end === 'paragraph')) {
        seg.current.ms += performance.now() - playStart.current;
        setPlaying(false);
        checkpoint(next);
      }
    }, ms);
    return () => clearTimeout(t);
  }, [playing, doc, pos, sheet, skim, settings.wpm, checks, section, pause, checkpoint, logUntested]);

  function quizDone(q: QuizSheet, correct: number) {
    const accuracy = correct / q.questions.length;
    const words = q.to - q.from;
    if (q.baseline) {
      const wpm = Math.round(words / (q.ms / 60000));
      // > 1500 wpm on a self-paced read is skimming or a mis-click — don't record it
      const invalid = wpm > 1500;
      const next = invalid ? settings.wpm : startFromBaseline(wpm, accuracy);
      if (!invalid) store.addSession({ at: Date.now(), docId: meta.id, goal: 'train', wpm, words, ms: q.ms, accuracy, baseline: true });
      setSettings({ wpm: next });
      setBaseline(null);
      seg.current = { start: q.to, ms: 0 };
      setPos(Math.min(q.to, (doc?.tokens.length ?? 1) - 1));
      setSheet({ kind: 'result', info: { wpm, accuracy, nextWpm: invalid ? undefined : next, baseline: true, invalid } });
      return;
    }
    seg.current = { start: q.to, ms: 0 };
    if (q.skim) {
      const wpm = Math.round(words / (q.ms / 60000));
      store.addSession({ at: Date.now(), docId: meta.id, goal: 'skim', wpm, words, ms: q.ms, accuracy });
      setSheet({ kind: 'result', info: { wpm, accuracy, skim: true } });
      return;
    }
    const wpm = settings.wpm;
    store.addSession({ at: Date.now(), docId: meta.id, goal: 'train', wpm, words, ms: q.ms, accuracy });
    const next = nextWpm(wpm, accuracy);
    setSettings({ wpm: next });
    setSheet({ kind: 'result', info: { wpm, accuracy, nextWpm: next } });
  }

  /* ── baseline (speed test) ──────────────────────── */
  const startBaseline = useCallback(() => {
    const d = live.current.doc;
    if (!d) return;
    pause();
    let from = d.sentenceStarts[d.tokens[live.current.pos].s];
    if (d.tokens.length - from < 150) from = 0;
    let to = Math.min(d.tokens.length, from + 280);
    while (to < d.tokens.length && d.tokens[to - 1].end !== 'sentence' && d.tokens[to - 1].end !== 'paragraph') to++;
    if (to - from < 80) {
      alert('This text is too short for a speed test — try at least 150 words.');
      return;
    }
    setSheet(null);
    setBaseline({ from, to, started: null });
  }, [pause]);

  useEffect(() => {
    if (doc && startWithBaseline) startBaseline();
  }, [doc, startWithBaseline, startBaseline]);

  function finishBaseline() {
    if (!doc || !baseline?.started) return;
    const ms = performance.now() - baseline.started;
    const questions = makeQuiz(doc, baseline.from, baseline.to, 3);
    const q: QuizSheet = { kind: 'quiz', questions, from: baseline.from, to: baseline.to, ms, baseline: true };
    if (questions.length >= 2) setSheet(q);
    else quizDone({ ...q, questions: [{ prompt: '', options: [], answer: 0 }] }, 1);
  }

  /* ── keyboard ───────────────────────────────────── */
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (sheet || e.metaKey || e.ctrlKey || e.altKey) {
        if (e.key === 'Escape' && sheet?.kind === 'settings') setSheet(null);
        return;
      }
      if (baseline) {
        if (e.key === 'Escape') setBaseline(null);
        return;
      }
      const step = e.shiftKey ? 50 : 10;
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          toggle();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          sentenceJump(-1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          sentenceJump(1);
          break;
        case 'ArrowUp':
        case 'ArrowDown':
          e.preventDefault();
          // in training the staircase owns the speed
          if (goal !== 'train') setSettings({ wpm: clampWpm(settings.wpm + (e.key === 'ArrowUp' ? step : -step)) });
          break;
        case 'Escape':
          onExit();
          break;
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  // pause when tab hidden
  useEffect(() => {
    const vis = () => document.hidden && pause();
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, [pause]);

  // baseline timer display
  useEffect(() => {
    if (!baseline?.started) return;
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [baseline?.started]);

  if (!doc) return <div className="reader" />;

  const total = doc.tokens.length;
  const progress = total > 1 ? pos / (total - 1) : 0;
  const minsLeft = Math.max(0, Math.round(((total - pos) * (goal === 'skim' ? 0.45 : 1)) / settings.wpm));
  const font = settings.serif ? 'var(--serif)' : 'var(--sans)';

  return (
    <div className="reader">
      <div className="r-top">
        <button className="icon" aria-label="Back to library" onClick={onExit}><Close /></button>
        <div className="r-title">{meta.title}</div>
        <button className="icon" aria-label="Settings" onClick={() => { pause(); setSheet({ kind: 'settings' }); }}><Sliders /></button>
      </div>
      <div className="r-progress"><span style={{ width: `${progress * 100}%` }} /></div>

      <div className="r-stage">
        {baseline ? (
          <BaselineView doc={doc} b={baseline} font={font} size={settings.fontSize} onStart={() => setBaseline({ ...baseline, started: performance.now() })} onDone={finishBaseline} onCancel={() => setBaseline(null)} />
        ) : (
          <PacerView doc={doc} cur={cur} playing={playing} font={font} size={settings.fontSize} keyMask={skim?.key} onSeek={seek} onToggle={toggle} />
        )}
        {!playing && !baseline && !sheet && pos === meta.pos && (
          <div className="hint-play">
            <kbd>Space</kbd> play · <kbd>←</kbd> back{goal !== 'train' && <> · <kbd>↑</kbd><kbd>↓</kbd> speed</>}
          </div>
        )}
      </div>

      {!baseline && (
        <div className="dock">
          <span className="meta">{Math.round(progress * 100)} % · {minsLeft} min left</span>
          <button className="icon" aria-label="Back one sentence" onClick={() => sentenceJump(-1)}><Back /></button>
          <button className="icon play" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}>{playing ? <Pause /> : <Play />}</button>
          <div className="speed">
            {goal === 'train' ? (
              <span className="auto-speed" title="Training adjusts the speed from your answers">Adaptive</span>
            ) : (
              <input type="range" min={100} max={1200} step={10} value={settings.wpm} aria-label="Words per minute" onChange={(e) => setSettings({ wpm: +e.target.value })} />
            )}
            <output>{settings.wpm} <small>wpm</small></output>
          </div>
        </div>
      )}

      {sheet?.kind === 'settings' && <SettingsSheet s={settings} set={setSettings} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'quiz' && <Quiz key={sheet.from} questions={sheet.questions} onDone={(c) => quizDone(sheet, c)} />}
      {sheet?.kind === 'result' && (
        <Result
          r={sheet.info}
          onClose={() => setSheet(null)}
          onContinue={() => {
            setSheet(null);
            if (pos < total - 1) play();
            else setSheet({ kind: 'end' });
          }}
        />
      )}
      {sheet?.kind === 'end' && (
        <div className="scrim">
          <div className="sheet result">
            <h3>Finished</h3>
            <p className="sub">{total.toLocaleString()} words.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="btn secondary" onClick={() => { setSheet(null); seek(0); }}>Read again</button>
              <button className="btn" autoFocus onClick={onExit}>Library</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── views ────────────────────────────────────────── */

function renderParas(doc: Doc, start: number, end: number, cls: (i: number) => string, onWord?: (i: number) => void) {
  const paras: ReactElement[] = [];
  let words: ReactElement[] = [];
  let p = doc.tokens[start]?.p;
  const flush = (key: number) => {
    if (words.length) paras.push(<p key={key}>{words}</p>);
    words = [];
  };
  for (let i = start; i < end; i++) {
    const t = doc.tokens[i];
    if (t.p !== p) {
      flush(i);
      p = t.p;
    }
    words.push(
      <span key={i} data-i={i} className={cls(i)} onClick={onWord ? () => onWord(i) : undefined}>{t.text}</span>,
      <span key={'s' + i}> </span>,
    );
  }
  flush(end);
  return paras;
}

/* ── pacer: continuous scroll over a sliding window ─────────────
 * Only ~2k words around the reading position are in the DOM, cut at
 * sentence boundaries. When the window slides, the scroll offset is
 * compensated so the text on screen never moves. Auto-scroll is a short
 * eased step whenever the highlight reaches a new line, keeping the
 * reading line at a fixed height (typewriter-style).
 */
const WIN_BEFORE = 600;
const WIN_AFTER = 1500;
const READ_LINE = 0.35;

function sentenceAt(doc: Doc, i: number) {
  return doc.sentenceStarts[doc.tokens[Math.max(0, Math.min(i, doc.tokens.length - 1))].s];
}

function windowAround(doc: Doc, pos: number) {
  const n = doc.tokens.length;
  const start = sentenceAt(doc, pos - WIN_BEFORE);
  const endTok = pos + WIN_AFTER;
  const end = endTok >= n ? n : sentenceAt(doc, endTok);
  return { start, end: Math.max(end, Math.min(n, pos + 1)) };
}

const Para = memo(function Para({
  doc,
  start,
  end,
  curStart,
  curEnd,
  keyMask,
  onWord,
}: {
  doc: Doc;
  start: number;
  end: number;
  curStart: number;
  curEnd: number;
  /** skim: 1 = key word, others are dimmed */
  keyMask?: Uint8Array;
  onWord: (i: number) => void;
}) {
  const words: ReactElement[] = [];
  for (let i = start; i < end; i++) {
    let cls = i < curStart ? 'w read' : i < curEnd ? 'w cur' : 'w';
    if (keyMask) cls += keyMask[i] ? ' key' : ' dim';
    words.push(<span key={i} data-i={i} className={cls}>{doc.tokens[i].text}</span>, <span key={'s' + i}> </span>);
  }
  return <p onClick={(e) => { const i = (e.target as HTMLElement).dataset.i; if (i) onWord(+i); }}>{words}</p>;
});

function PacerView({ doc, cur, playing, font, size, keyMask, onSeek, onToggle }: { doc: Doc; cur: Cur; playing: boolean; font: string; size: number; keyMask?: Uint8Array; onSeek: (i: number) => void; onToggle: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [win, setWin] = useState(() => windowAround(doc, cur.start));
  const anchor = useRef<{ i: number; top: number; start: number } | null>(null);
  const lineTop = useRef<number | null>(null);
  const anim = useRef(0);
  // scroll events caused by our own scrolling must not grow the window
  const autoScrollUntil = useRef(0);

  // slide the window with hysteresis (setState during render is the React-sanctioned derive pattern)
  const n = doc.tokens.length;
  if (
    cur.start < win.start ||
    cur.start >= win.end ||
    (win.start > 0 && cur.start - win.start < WIN_BEFORE / 3) ||
    (win.end < n && win.end - cur.start < WIN_AFTER / 2)
  ) {
    const next = windowAround(doc, cur.start);
    if (next.start !== win.start || next.end !== win.end) setWin(next);
  }

  const scrollTo = (box: HTMLElement, to: number) => {
    cancelAnimationFrame(anim.current);
    const from = box.scrollTop;
    const target = Math.max(0, to);
    if (Math.abs(target - from) < 1) return;
    const ms = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220;
    const t0 = performance.now();
    autoScrollUntil.current = t0 + ms + 100;
    const step = (t: number) => {
      const k = ms ? Math.min(1, (t - t0) / ms) : 1;
      box.scrollTop = from + (target - from) * (1 - (1 - k) ** 3);
      if (k < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  };

  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    // 1. window slid: keep on-screen text where it was
    const a = anchor.current;
    if (a && a.start !== win.start) {
      const el = box.querySelector<HTMLElement>(`[data-i="${a.i}"]`);
      if (el) {
        const delta = el.offsetTop - a.top;
        cancelAnimationFrame(anim.current);
        autoScrollUntil.current = performance.now() + 100;
        box.scrollTop += delta;
        if (lineTop.current !== null) lineTop.current += delta;
      } else lineTop.current = null;
    }
    // 2. follow the highlight: one eased step per new line
    const el = box.querySelector<HTMLElement>('.cur');
    if (el) {
      const top = el.offsetTop;
      if (lineTop.current === null || Math.abs(top - lineTop.current) > size * 0.5) {
        lineTop.current = top;
        scrollTo(box, top - box.clientHeight * READ_LINE);
      }
      anchor.current = { i: cur.start, top, start: win.start };
    }
  }, [cur.start, win.start, win.end]);

  // re-centre after text size or typeface change
  useLayoutEffect(() => {
    lineTop.current = null;
  }, [size, font]);

  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  // paragraph slices inside the window; untouched ones are memoised
  const paras: { start: number; end: number }[] = [];
  for (let i = win.start; i < win.end; ) {
    const p = doc.tokens[i].p;
    let j = i + 1;
    while (j < win.end && doc.tokens[j].p === p) j++;
    paras.push({ start: i, end: j });
    i = j;
  }

  return (
    <div
      ref={ref}
      className={`pacer${playing ? ' playing' : ''}`}
      style={{ fontFamily: font, fontSize: size, lineHeight: 1.7 }}
      onClick={(e) => !(e.target as HTMLElement).dataset.i && onToggle()}
      onScroll={(e) => {
        // manual scrolling: grow the window so the whole text is reachable
        const box = e.currentTarget;
        if (performance.now() < autoScrollUntil.current) return;
        if (box.scrollTop < box.clientHeight && win.start > 0) {
          setWin((w) => ({ ...w, start: sentenceAt(doc, w.start - WIN_BEFORE) }));
        } else if (box.scrollHeight - box.scrollTop - box.clientHeight < box.clientHeight && win.end < n) {
          setWin((w) => ({ ...w, end: w.end + WIN_AFTER >= n ? n : sentenceAt(doc, w.end + WIN_AFTER) }));
        }
      }}
    >
      {paras.map((p) => {
        const before = cur.start >= p.end;
        const after = cur.end <= p.start;
        return (
          <Para
            key={p.start}
            doc={doc}
            start={p.start}
            end={p.end}
            curStart={before ? Infinity : after ? -1 : cur.start}
            curEnd={before ? Infinity : after ? -1 : cur.end}
            keyMask={keyMask}
            onWord={onSeek}
          />
        );
      })}
    </div>
  );
}

function BaselineView({ doc, b, font, size, onStart, onDone, onCancel }: { doc: Doc; b: Baseline; font: string; size: number; onStart: () => void; onDone: () => void; onCancel: () => void }) {
  const secs = b.started ? Math.floor((performance.now() - b.started) / 1000) : 0;
  return (
    <>
      <div className="pacer baseline-text" style={{ fontFamily: font, fontSize: size, lineHeight: 1.7, filter: b.started ? 'none' : 'blur(6px)', userSelect: b.started ? 'auto' : 'none' }}>
        {renderParas(doc, b.from, b.to, () => '')}
        {b.started && (
          <div style={{ textAlign: 'center', paddingTop: 16 }}>
            <button className="btn accent" onClick={onDone}>I'm done · {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</button>
          </div>
        )}
      </div>
      {!b.started && (
        <div className="scrim">
          <div className="sheet">
            <h3>Speed test</h3>
            <p className="sub">
              Read the next {(b.to - b.from).toLocaleString()} words at your normal pace — the way you'd read to really understand them.
              Press <b>I'm done</b> at the end, then answer three quick questions. No pacer, no pressure.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn secondary" onClick={onCancel}>Cancel</button>
              <button className="btn" autoFocus onClick={onStart}>Start reading</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
