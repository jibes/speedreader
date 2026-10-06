import type { Goal, Settings } from '../core/store';

type Props = {
  s: Settings;
  set: (p: Partial<Settings>) => void;
  onClose: () => void;
};

export function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button key={String(v)} aria-pressed={v === value} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}

export const GOAL_INFO: Record<Goal, string> = {
  read: 'Steady pacer at your speed',
  train: 'Speed adapts to your answers',
  skim: 'Key sentences only, topic checks',
};

export function SettingsSheet({ s, set, onClose }: Props) {
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-label="Text settings">
        <h3>Text</h3>
        <div className="row">
          <label>Size</label>
          <input type="range" min={16} max={34} value={s.fontSize} style={{ maxWidth: 180 }} aria-label="Text size" onChange={(e) => set({ fontSize: +e.target.value })} />
        </div>
        <div className="row">
          <label>Typeface</label>
          <Seg value={s.serif ? 'serif' : 'sans'} options={[['serif', 'Serif'], ['sans', 'Sans']]} onChange={(v) => set({ serif: v === 'serif' })} />
        </div>
        <div className="row">
          <label>Theme</label>
          <Seg value={s.theme} options={[['auto', 'Auto'], ['light', 'Light'], ['sepia', 'Sepia'], ['dark', 'Dark']]} onChange={(theme) => set({ theme })} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
