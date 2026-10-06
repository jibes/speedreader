import type { Goal, Settings } from '../core/store';

type Props = {
  s: Settings;
  set: (p: Partial<Settings>) => void;
  onClose: () => void;
};

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button key={String(v)} aria-pressed={v === value} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}

export const GOAL_INFO: Record<Goal, string> = {
  read: 'Steady pacer at the speed you set. No checks.',
  train: 'Quick questions after each section; speed adapts to keep comprehension around 75 %.',
  skim: 'Key sentences and terms at your pace, the rest swept past. Checks ask which topics came up.',
};

export function SettingsSheet({ s, set, onClose }: Props) {
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-label="Settings">
        <h3>Goal</h3>
        <div className="row goal-row">
          <Seg value={s.goal} options={[['read', 'Read'], ['train', 'Train'], ['skim', 'Skim']]} onChange={(goal) => set({ goal })} />
          <small>{GOAL_INFO[s.goal]}</small>
        </div>

        <h3 className="sheet-h">Appearance</h3>
        <div className="row">
          <label>Text size</label>
          <input type="range" min={16} max={34} value={s.fontSize} style={{ maxWidth: 160 }} aria-label="Text size" onChange={(e) => set({ fontSize: +e.target.value })} />
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
