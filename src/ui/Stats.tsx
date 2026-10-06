import { useMemo, useState } from 'react';
import { store, type Session } from '../core/store';

const fmtDate = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function minutes(ms: number) {
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} min` : `${(m / 60).toFixed(1)} h`;
}

export function Stats() {
  const sessions = useMemo(() => store.sessions(), []);
  const tested = sessions.filter((s) => s.accuracy !== undefined);
  const words = sessions.reduce((a, s) => a + s.words, 0);
  const ms = sessions.reduce((a, s) => a + s.ms, 0);
  const baseline = [...sessions].reverse().find((s) => s.baseline);
  const firstBase = sessions.find((s) => s.baseline);
  const recent = tested.filter((s) => !s.baseline).slice(-5);
  const recentEff = recent.length ? Math.round(recent.reduce((a, s) => a + s.wpm * s.accuracy!, 0) / recent.length) : null;
  const firstEff = firstBase ? Math.round(firstBase.wpm * firstBase.accuracy!) : null;
  const gain = recentEff && firstEff ? Math.round(((recentEff - firstEff) / firstEff) * 100) : null;

  if (!sessions.length) {
    return (
      <div className="page">
        <h1>Progress</h1>
        <p className="lede">Nothing yet. Read with training on — your effective reading rate (speed × comprehension) will be tracked here.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Progress</h1>
      <p className="lede">Effective rate = speed × comprehension. It is the only number that matters: reading fast without understanding is skimming.</p>
      <div className="tiles">
        <div className="tile"><b>{recentEff ?? '—'}</b><span>effective wpm (last 5)</span></div>
        <div className="tile"><b>{gain === null ? '—' : `${gain > 0 ? '+' : ''}${gain}%`}</b><span>vs. first speed test</span></div>
        <div className="tile"><b>{baseline ? baseline.wpm : '—'}</b><span>natural speed (latest test)</span></div>
        <div className="tile"><b>{words.toLocaleString()}</b><span>words · {minutes(ms)}</span></div>
      </div>

      {tested.length >= 2 && (
        <>
          <h2>Effective reading rate</h2>
          <Chart sessions={tested} />
        </>
      )}

      <h2>Sessions</h2>
      <table className="sessions">
        <thead>
          <tr><th>Date</th><th>Words</th><th>Speed</th><th>Compr.</th><th>Effective</th></tr>
        </thead>
        <tbody>
          {[...sessions].reverse().slice(0, 30).map((s, i) => (
            <tr key={i}>
              <td>{fmtDate(s.at)}{s.baseline ? ' · test' : s.mode === 'focus' ? ' · focus' : ''}</td>
              <td>{s.words}</td>
              <td>{s.wpm}</td>
              <td>{s.accuracy === undefined ? '—' : `${Math.round(s.accuracy * 100)}%`}</td>
              <td>{s.accuracy === undefined ? '—' : Math.round(s.wpm * s.accuracy)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Chart({ sessions }: { sessions: Session[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 220;
  const pad = { l: 36, r: 12, t: 12, b: 24 };
  const pts = sessions.map((s) => Math.round(s.wpm * s.accuracy!));
  const max = Math.max(...pts) * 1.15;
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const x = (i: number) => pad.l + (pts.length === 1 ? 0 : (i / (pts.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - v / top) * (H - pad.t - pad.b);
  const path = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const ticks = Array.from({ length: Math.floor(top / step) + 1 }, (_, k) => k * step);

  return (
    <div className="chart" onMouseLeave={() => setHover(null)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Effective reading rate per session"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (pts.length - 1));
          setHover(Math.max(0, Math.min(pts.length - 1, i)));
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
            <text className="axis" x={pad.l - 8} y={y(t) + 4} textAnchor="end">{t}</text>
          </g>
        ))}
        <text className="axis" x={pad.l} y={H - 4}>{fmtDate(sessions[0].at)}</text>
        <text className="axis" x={W - pad.r} y={H - 4} textAnchor="end">{fmtDate(sessions[sessions.length - 1].at)}</text>
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {sessions.map((s, i) =>
          s.baseline ? <circle key={i} cx={x(i)} cy={y(pts[i])} r={4} fill="var(--surface)" stroke="var(--ink-2)" strokeWidth={2} /> : null,
        )}
        {hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--ink-3)" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(pts[hover])} r={5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
          </>
        )}
      </svg>
      {hover !== null && (
        <div className="tip" style={{ left: `${Math.min(85, Math.max(15, (x(hover) / W) * 100))}%`, top: `${(y(pts[hover]) / H) * 100}%` }}>
          <b>{pts[hover]} wpm</b> · {sessions[hover].wpm} × {Math.round(sessions[hover].accuracy! * 100)}%{sessions[hover].baseline ? ' · test' : ''}
        </div>
      )}
    </div>
  );
}

function niceStep(raw: number) {
  const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
