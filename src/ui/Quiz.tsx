import { useEffect, useState } from 'react';
import type { Question } from '../core/quiz';
import { t } from '../i18n';

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
        <h3>{t('quiz.title')}</h3>
        <p className="sub">{gist ? t('quiz.gistSub') : t('quiz.cloze')}</p>
        <p className="q-prompt">
          {gist ? (
            t('quiz.gistPrompt')
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
          <span className="keys">{t('quiz.keys', { n: q.options.length })}</span>
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
          <h3>{t('result.tooFast')}</h3>
          <p className="note">{t('result.tooFastBody')}</p>
          <div className="actions">
            <button className="btn secondary" onClick={onClose}>{t('result.notNow')}</button>
            {onRetry && <button className="btn" autoFocus onClick={onRetry}>{t('result.retry')}</button>}
          </div>
        </div>
      </div>
    );
  }

  const label = r.baseline ? t('result.natural') : r.skim ? t('result.skim') : t('result.effective');
  const big = r.baseline || r.skim ? r.wpm : eff;
  const line = r.skim ? t('result.topics', { p: pct }) : r.baseline ? t('result.understood', { p: pct }) : t('result.speedTimes', { wpm: r.wpm, p: pct });
  let note = '';
  if (r.skim) note = r.accuracy >= 0.66 ? t('result.skimGood') : t('result.skimBad');
  else if (r.baseline && r.nextWpm) note = t('result.trainStart', { wpm: r.nextWpm });
  else if (r.nextWpm !== undefined) {
    const d = r.nextWpm - r.wpm;
    note = t(d > 0 ? 'result.up' : d < 0 ? 'result.down' : 'result.hold', { wpm: r.nextWpm });
  }
  return (
    <div className="scrim">
      <div className="sheet result" role="dialog" aria-label="Result">
        <p className="sub" style={{ margin: 0 }}>{label}</p>
        <div className="big">
          {big}
          <small>{t('wpm')}</small>
        </div>
        <p className="line">{line}</p>
        {note && <p className="note">{note}</p>}
        <div className="actions">
          <button className="btn secondary" onClick={onClose}>{t('result.pause')}</button>
          <button className="btn" autoFocus onClick={onContinue}>{t('result.continue')}</button>
        </div>
      </div>
    </div>
  );
}
