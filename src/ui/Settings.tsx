import type { Settings } from '../core/store';

type Props = {
  s: Settings;
  set: (p: Partial<Settings>) => void;
  onClose: () => void;
  onBaseline: () => void;
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

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button className="switch" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

export function SettingsSheet({ s, set, onClose, onBaseline }: Props) {
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-label="Reading settings">
        <h3>Reading</h3>
        <p className="sub">Changes apply instantly.</p>

        <div className="row">
          <label>Mode<small>{s.mode === 'pacer' ? 'Highlight moves through the page. Best comprehension.' : 'Words flash in place (RSVP). Fastest, harder to look back.'}</small></label>
          <Seg value={s.mode} options={[['pacer', 'Pacer'], ['focus', 'Focus']]} onChange={(mode) => set({ mode })} />
        </div>
        <div className="row">
          <label>Words per step<small>Phrase chunks reduce fixations.</small></label>
          <Seg value={s.chunk} options={[[1, '1'], [2, '2'], [3, '3']]} onChange={(chunk) => set({ chunk })} />
        </div>
        <div className="row">
          <label>Training<small>Quick questions after each section; pace adapts to your comprehension.</small></label>
          <Switch on={s.training} label="Training" onChange={(training) => set({ training })} />
        </div>
        {s.training && (
          <div className="row">
            <label>Section length</label>
            <Seg value={s.segment} options={[[150, '150'], [300, '300'], [600, '600 words']]} onChange={(segment) => set({ segment })} />
          </div>
        )}
        <div className="row">
          <label>Gentle start<small>Ramps up over the first few words after pausing.</small></label>
          <Switch on={s.rampUp} label="Gentle start" onChange={(rampUp) => set({ rampUp })} />
        </div>
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
        <div className="row">
          <label>Speed test<small>Measure your natural speed on the next passage.</small></label>
          <button className="btn secondary" onClick={onBaseline}>Start</button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
