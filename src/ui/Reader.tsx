import { memo, type ReactElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { makeQuiz, type Question } from '../core/quiz';
import { store, type DocMeta, type Settings } from '../core/store';
import { buildChunks, buildDoc, orpIndex, type Chunk, type Doc } from '../core/text';
import { clampWpm, nextWpm, startFromBaseline } from '../core/trainer';
import { Back, Close, Fwd, Gauge, Pause, Play, Sliders } from './icons';
import { Quiz, Result, type ResultInfo } from './Quiz';
import { SettingsSheet } from './Settings';
import { useWakeLock } from './useWakeLock';

type Sheet =
  | { kind: 'settings' }
  | { kind: 'quiz'; questions: Question[]; from: number; to: number; ms: number; baseline?: boolean }
  | { kind: 'result'; info: ResultInfo; after?: number }
  | { kind: 'end' };

interface Baseline {
  from: number;
  to: number;
  started: number | null;
}

const RAMP = 6;

function findChunk(chunks: Chunk[], pos: number) {
  let lo = 0;
  let hi = chunks.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (chunks[mid].start <= pos) lo = mid;
    else hi = mid - 1;
  }
  return lo;
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

  const seg = useRef({ start: meta.pos, ms: 0 });
  const playStart = useRef(0);
  const ramp = useRef(RAMP);
  const pausedAt = useRef(0);
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

  const chunks = useMemo(() => (doc ? buildChunks(doc, settings.chunk) : []), [doc, settings.chunk]);
  const ci = useMemo(() => (chunks.length ? findChunk(chunks, pos) : 0), [chunks, pos]);
  const cur = chunks[ci];

  // latest values for callbacks fired from timers / unmount
  const live = useRef({ pos, settings, doc, playing });
  live.current = { pos, settings, doc, playing };

  /* ── session accounting ─────────────────────────── */
  const segMs = () => seg.current.ms + (live.current.playing ? performance.now() - playStart.current : 0);

  const logUntested = useCallback((end: number) => {
    const words = end - seg.current.start;
    const ms = segMs();
    if (words >= 30 && ms > 3000) {
      store.addSession({ at: Date.now(), docId: meta.id, mode: live.current.settings.mode, wpm: live.current.settings.wpm, words, ms });
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

  /* ── transport ──────────────────────────────────── */
  const pause = useCallback(() => {
    if (!live.current.playing) return;
    seg.current.ms += performance.now() - playStart.current;
    pausedAt.current = performance.now();
    setPlaying(false);
    if (!live.current.settings.training) logUntested(live.current.pos);
  }, [logUntested]);

  const play = useCallback(() => {
    const { doc: d, settings: s, pos: p } = live.current;
    if (!d || live.current.playing) return;
    if (p >= d.tokens.length - 1) {
      setPos(0);
      seg.current = { start: 0, ms: 0 };
    } else if (s.mode === 'focus' && pausedAt.current && performance.now() - pausedAt.current > 2000) {
      // RSVP removes the option to look back: re-enter at the sentence start
      const ss = d.sentenceStarts[d.tokens[p].s];
      if (ss < p) setPos(ss);
    }
    ramp.current = s.rampUp ? 0 : RAMP;
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
      if (live.current.playing) {
        seg.current.ms = 0;
        playStart.current = performance.now();
      } else seg.current.ms = 0;
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
    const questions = makeQuiz(d, seg.current.start, end, 3);
    if (questions.length >= 2) {
      setSheet({ kind: 'quiz', questions, from: seg.current.start, to: end, ms: seg.current.ms });
    } else {
      logUntested(end);
      playStart.current = performance.now();
      setPlaying(true);
    }
  }, [logUntested]);

  /* ── the clock ──────────────────────────────────── */
  useEffect(() => {
    if (!playing || !doc || !cur || sheet) return;
    let ms = (cur.w * 60000) / settings.wpm;
    if (ramp.current < RAMP) {
      ms *= 1 + 0.6 * (1 - ramp.current / RAMP);
      ramp.current++;
    }
    const t = setTimeout(() => {
      const next = chunks[ci + 1];
      const last = doc.tokens[cur.end - 1];
      if (!next) {
        pause();
        if (settings.training && cur.end - seg.current.start >= 60) checkpoint(cur.end);
        else {
          logUntested(cur.end);
          setSheet({ kind: 'end' });
        }
        setPos(doc.tokens.length - 1);
        return;
      }
      setPos(next.start);
      if (
        settings.training &&
        cur.end - seg.current.start >= settings.segment &&
        (last.end === 'sentence' || last.end === 'paragraph')
      ) {
        seg.current.ms += performance.now() - playStart.current;
        setPlaying(false);
        checkpoint(cur.end);
      }
    }, ms);
    return () => clearTimeout(t);
  }, [playing, doc, cur, ci, chunks, sheet, settings.wpm, settings.training, settings.segment, pause, checkpoint, logUntested]);

  function quizDone(q: Extract<Sheet, { kind: 'quiz' }>, correct: number) {
    const accuracy = correct / q.questions.length;
    const words = q.to - q.from;
    if (q.baseline) {
      const wpm = Math.round(words / (q.ms / 60000));
      // > 1500 wpm on a self-paced read is skimming or a mis-click — don't record it
      const invalid = wpm > 1500;
      const next = invalid ? settings.wpm : startFromBaseline(wpm, accuracy);
      if (!invalid) store.addSession({ at: Date.now(), docId: meta.id, mode: 'pacer', wpm, words, ms: q.ms, accuracy, baseline: true });
      setSettings({ wpm: next });
      setBaseline(null);
      seg.current = { start: q.to, ms: 0 };
      setPos(Math.min(q.to, (doc?.tokens.length ?? 1) - 1));
      setSheet({ kind: 'result', info: { wpm, accuracy, nextWpm: invalid ? undefined : next, baseline: true, invalid } });
      return;
    }
    const wpm = settings.wpm;
    store.addSession({ at: Date.now(), docId: meta.id, mode: settings.mode, wpm, words, ms: q.ms, accuracy });
    const next = nextWpm(wpm, accuracy);
    setSettings({ wpm: next });
    seg.current = { start: q.to, ms: 0 };
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
    const q = { kind: 'quiz' as const, questions, from: baseline.from, to: baseline.to, ms, baseline: true };
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
          e.preventDefault();
          setSettings({ wpm: clampWpm(settings.wpm + step) });
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSettings({ wpm: clampWpm(settings.wpm - step) });
          break;
        case 'm':
          setSettings({ mode: settings.mode === 'pacer' ? 'focus' : 'pacer' });
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
  const minsLeft = Math.max(0, Math.round((total - pos) / settings.wpm));
  const font = settings.serif ? 'var(--serif)' : 'var(--sans)';

  return (
    <div className="reader">
      <div className="r-top">
        <button className="icon" aria-label="Back to library" onClick={onExit}><Close /></button>
        <div className="r-title">{meta.title}</div>
        <button className="icon" aria-label="Speed test" title="Speed test" onClick={startBaseline}><Gauge /></button>
        <button className="icon" aria-label="Settings" onClick={() => { pause(); setSheet({ kind: 'settings' }); }}><Sliders /></button>
      </div>
      <div className="r-progress"><span style={{ width: `${progress * 100}%` }} /></div>

      <div className="r-stage">
        {baseline ? (
          <BaselineView doc={doc} b={baseline} font={font} size={settings.fontSize} onStart={() => setBaseline({ ...baseline, started: performance.now() })} onDone={finishBaseline} onCancel={() => setBaseline(null)} />
        ) : settings.mode === 'pacer' ? (
          <PacerView doc={doc} cur={cur} playing={playing} font={font} size={settings.fontSize} onSeek={seek} onToggle={toggle} />
        ) : (
          <FocusView doc={doc} cur={cur} playing={playing} font={font} size={settings.fontSize} onToggle={toggle} />
        )}
        {!playing && !baseline && !sheet && pos === meta.pos && (
          <div className="hint-play"><kbd>Space</kbd> play · <kbd>←</kbd><kbd>→</kbd> sentence · <kbd>↑</kbd><kbd>↓</kbd> speed</div>
        )}
      </div>

      {!baseline && (
        <div className="dock">
          <span className="meta">{Math.round(progress * 100)} % · {minsLeft} min left</span>
          <button className="icon" aria-label="Previous sentence" onClick={() => sentenceJump(-1)}><Back /></button>
          <button className="icon play" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}>{playing ? <Pause /> : <Play />}</button>
          <button className="icon" aria-label="Next sentence" onClick={() => sentenceJump(1)}><Fwd /></button>
          <div className="speed">
            <input type="range" min={100} max={1200} step={10} value={settings.wpm} aria-label="Words per minute" onChange={(e) => setSettings({ wpm: +e.target.value })} />
            <output>{settings.wpm} <small>wpm</small></output>
          </div>
        </div>
      )}

      {sheet?.kind === 'settings' && <SettingsSheet s={settings} set={setSettings} onClose={() => setSheet(null)} onBaseline={startBaseline} />}
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
            <p className="sub">{total.toLocaleString()} words read.</p>
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
  onWord,
}: {
  doc: Doc;
  start: number;
  end: number;
  curStart: number;
  curEnd: number;
  onWord: (i: number) => void;
}) {
  const words: ReactElement[] = [];
  for (let i = start; i < end; i++) {
    const cls = i < curStart ? 'w read' : i < curEnd ? 'w cur' : 'w';
    words.push(<span key={i} data-i={i} className={cls}>{doc.tokens[i].text}</span>, <span key={'s' + i}> </span>);
  }
  return <p onClick={(e) => { const i = (e.target as HTMLElement).dataset.i; if (i) onWord(+i); }}>{words}</p>;
});

function PacerView({ doc, cur, playing, font, size, onSeek, onToggle }: { doc: Doc; cur: Chunk; playing: boolean; font: string; size: number; onSeek: (i: number) => void; onToggle: () => void }) {
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
            onWord={onSeek}
          />
        );
      })}
    </div>
  );
}

function FocusView({ doc, cur, playing, font, size, onToggle }: { doc: Doc; cur: Chunk; playing: boolean; font: string; size: number; onToggle: () => void }) {
  const text = doc.tokens.slice(cur.start, cur.end).map((t) => t.text).join(' ');
  const single = cur.end - cur.start === 1;
  const pivot = single ? orpIndex(text) : Math.floor(text.length * 0.4);
  const s = doc.tokens[cur.start].s;
  const sStart = doc.sentenceStarts[s];
  const sEnd = doc.sentenceStarts[s + 1] ?? doc.tokens.length;
  return (
    <div className="focus" style={{ fontFamily: font }}>
      <button className="tap" aria-label={playing ? 'Pause' : 'Play'} onClick={onToggle} />
      <div className="rsvp" style={{ fontSize: Math.round(size * 1.6) }} aria-live="off">
        <span className="rsvp-word" style={{ marginLeft: '-0.28em' }}>
          <span className="l">{text.slice(0, pivot)}</span>
          <span className={single ? 'o' : ''}>{text[pivot]}</span>
          <span className="pv">{text.slice(pivot + 1)}</span>
        </span>
      </div>
      <div className="context" style={{ visibility: playing ? 'hidden' : 'visible' }}>
        {doc.tokens.slice(sStart, sEnd).map((t, k) => {
          const i = sStart + k;
          return <span key={i} className={i >= cur.start && i < cur.end ? 'cur' : ''}>{t.text} </span>;
        })}
      </div>
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
