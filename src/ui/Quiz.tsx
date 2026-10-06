import { useEffect, useState } from 'react';
import type { Question } from '../core/quiz';

export function Quiz({ questions, onDone }: { questions: Question[]; onDone: (correct: number) => void }) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const q = questions[i];

  function choose(k: number) {
    if (picked !== null) return;
    setPicked(k);
    const right = k === q.answer;
    const total = correct + (right ? 1 : 0);
    setCorrect(total);
    setTimeout(() => {
      if (i + 1 >= questions.length) onDone(total);
      else {
        setI(i + 1);
        setPicked(null);
      }
    }, right ? 550 : 1200);
  }

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= q.options.length) choose(n - 1);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const gist = q.kind === 'gist';
  const [before, after] = q.prompt.split('_____');
  return (
    <div className="scrim">
      <div className="sheet" role="dialog" aria-label="Comprehension check">
        <h3>Quick check</h3>
        <p className="sub">{gist ? 'Only one of these topics was in that section.' : 'Which word completes the sentence you just read?'}</p>
        <p className="q-prompt">
          {gist ? (
            q.prompt
          ) : (
            <>
              {before}
              <b>_____</b>
              {after}
            </>
          )}
        </p>
        <div className="opts">
          {q.options.map((o, k) => (
            <button
              key={o + k}
              className={`opt${picked !== null && k === q.answer ? ' right' : ''}${picked === k && k !== q.answer ? ' wrong' : ''}`}
              disabled={picked !== null}
              onClick={() => choose(k)}
            >
              {o}
            </button>
          ))}
        </div>
        <div className="q-foot">
          <span>Press 1–{q.options.length}</span>
          <span className="dots">{questions.map((_, k) => <i key={k} className={k <= i ? 'on' : ''} />)}</span>
        </div>
      </div>
    </div>
  );
}

export interface ResultInfo {
  wpm: number;
  accuracy: number;
  nextWpm?: number;
  baseline?: boolean;
  invalid?: boolean;
  /** skim: wpm is coverage speed, accuracy is gist */
  skim?: boolean;
}

export function Result({ r, onContinue, onClose }: { r: ResultInfo; onContinue: () => void; onClose?: () => void }) {
  const eff = Math.round(r.wpm * r.accuracy);
  const diff = r.nextWpm !== undefined ? r.nextWpm - r.wpm : 0;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onContinue();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  return (
    <div className="scrim">
      <div className="sheet result" role="dialog" aria-label="Result">
        <p className="sub" style={{ margin: 0 }}>{r.baseline ? 'Your natural reading speed' : r.skim ? 'Skimming speed' : 'Effective reading rate'}</p>
        <div className="big">
          {r.baseline || r.skim ? r.wpm : eff}
          <small>wpm</small>
        </div>
        {r.skim ? (
          <div className="kv kv-2">
            <div><b>{r.wpm}</b><span>words covered / min</span></div>
            <div><b>{Math.round(r.accuracy * 100)}%</b><span>gist</span></div>
          </div>
        ) : (
          <div className="kv">
            <div><b>{r.wpm}</b><span>speed</span></div>
            <div><b>{Math.round(r.accuracy * 100)}%</b><span>comprehension</span></div>
            <div><b>{eff}</b><span>effective</span></div>
          </div>
        )}
        {r.skim && (
          <p className="sub">
            {r.accuracy >= 0.67 ? 'You caught the main topics.' : 'Topics slipped — slow the pace a little or skim with a question in mind.'}
          </p>
        )}
        {r.invalid && <p className="sub">That's faster than reading is physically possible — probably skimmed. Not saved; try the test again.</p>}
        {r.nextWpm !== undefined && (
          <p className="sub">
            {r.baseline ? (
              <>Training starts at <b>{r.nextWpm} wpm</b> — just above your comfort zone.</>
            ) : diff > 0 ? (
              <>Good understanding — pace goes up to <b className="delta-up">{r.nextWpm} wpm</b>.</>
            ) : diff < 0 ? (
              <>Some details slipped — easing to <b className="delta-down">{r.nextWpm} wpm</b>.</>
            ) : (
              <>Holding at <b>{r.nextWpm} wpm</b>.</>
            )}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          {onClose && <button className="btn secondary" onClick={onClose}>Done</button>}
          <button className="btn" autoFocus onClick={onContinue}>Continue reading</button>
        </div>
      </div>
    </div>
  );
}
