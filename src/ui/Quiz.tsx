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
          <span className="keys">Press 1–{q.options.length}</span>
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

export function Result({ r, onContinue, onClose, onRetry }: { r: ResultInfo; onContinue: () => void; onClose: () => void; onRetry?: () => void }) {
  const pct = Math.round(r.accuracy * 100);
  const eff = Math.round(r.wpm * r.accuracy);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (r.invalid && onRetry) onRetry();
        else onContinue();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  if (r.invalid) {
    return (
      <div className="scrim">
        <div className="sheet result" role="dialog" aria-label="Result">
          <h3>Too fast to measure</h3>
          <p className="note">That was quicker than reading is physically possible — probably skimmed. Nothing was saved.</p>
          <div className="actions">
            <button className="btn secondary" onClick={onClose}>Not now</button>
            {onRetry && <button className="btn" autoFocus onClick={onRetry}>Try again</button>}
          </div>
        </div>
      </div>
    );
  }

  const label = r.baseline ? 'Your natural reading speed' : r.skim ? 'Skimming speed' : 'Effective reading rate';
  const big = r.baseline || r.skim ? r.wpm : eff;
  const line = r.skim ? `${pct} % of topics caught` : r.baseline ? `${pct} % understood` : `${r.wpm} wpm × ${pct} % understood`;
  let note = '';
  if (r.skim) note = r.accuracy >= 0.66 ? 'You caught the main topics.' : 'Topics slipped — slow down a little or skim with a question in mind.';
  else if (r.baseline && r.nextWpm) note = `Training starts at ${r.nextWpm} wpm — just above your comfort zone.`;
  else if (r.nextWpm !== undefined) {
    const d = r.nextWpm - r.wpm;
    note = d > 0 ? `Good understanding — speeding up to ${r.nextWpm} wpm.` : d < 0 ? `Some details slipped — easing to ${r.nextWpm} wpm.` : `Holding at ${r.nextWpm} wpm.`;
  }
  return (
    <div className="scrim">
      <div className="sheet result" role="dialog" aria-label="Result">
        <p className="sub" style={{ margin: 0 }}>{label}</p>
        <div className="big">
          {big}
          <small>wpm</small>
        </div>
        <p className="line">{line}</p>
        {note && <p className="note">{note}</p>}
        <div className="actions">
          <button className="btn secondary" onClick={onClose}>Pause</button>
          <button className="btn" autoFocus onClick={onContinue}>Continue</button>
        </div>
      </div>
    </div>
  );
}
