import type { AiOutcome, AiState } from '../core/ai';
import type { Settings } from '../core/store';
import { t } from '../i18n';

type Props = {
  s: Settings;
  set: (p: Partial<Settings>) => void;
  onClose: () => void;
  ai?: {
    state: AiState;
    progress: number;
    enable: () => void;
    last: AiOutcome | null;
    openrouter: { connected: boolean; left: number | null; policyError: boolean; connect: () => void; disconnect: () => void };
  };
};

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button className="switch" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

export function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button key={String(v)} aria-pressed={v === value} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}

export function SettingsSheet({ s, set, onClose, ai }: Props) {
  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-label={t('reader.textSettings')}>
        <h3>{t('text.title')}</h3>
        <div className="row">
          <label>{t('text.size')}</label>
          <input type="range" min={16} max={34} value={s.fontSize} style={{ maxWidth: 180 }} aria-label={t('text.size')} onChange={(e) => set({ fontSize: +e.target.value })} />
        </div>
        <div className="row">
          <label>{t('text.typeface')}</label>
          <Seg value={s.serif ? 'serif' : 'sans'} options={[['serif', t('text.serif')], ['sans', t('text.sans')]]} onChange={(v) => set({ serif: v === 'serif' })} />
        </div>
        <div className="row">
          <label>{t('text.theme')}</label>
          <Seg value={s.theme} options={[['auto', t('theme.auto')], ['light', t('theme.light')], ['sepia', t('theme.sepia')], ['dark', t('theme.dark')]]} onChange={(theme) => set({ theme })} />
        </div>
        {ai && (
          <>
            <h3 className="sheet-h">{t('ai.title')}</h3>
            <div className="row">
              <label>{t('ai.use')}</label>
              <Switch on={s.ai} label={t('ai.use')} onChange={(v) => set({ ai: v })} />
            </div>
            {s.ai && (
              <>
                <div className="row">
                  <label>
                    {t('ai.chrome')}
                    <small>{ai.state === 'downloading' ? t('ai.downloading', { p: Math.round(ai.progress * 100) }) : t(`ai.${ai.state}`)}</small>
                  </label>
                  {ai.state === 'downloadable' && <button className="btn secondary" onClick={ai.enable}>{t('ai.enable')}</button>}
                </div>
                <div className="row">
                  <label>
                    {t('or.title')}
                    <small>
                      {ai.openrouter.connected
                        ? [t('or.connected'), ai.openrouter.left !== null ? t('or.left', { n: ai.openrouter.left }) : ''].filter(Boolean).join(' · ')
                        : t('or.desc')}
                    </small>
                    {ai.openrouter.policyError && !s.aiTraining && <small className="warn">{t('or.policy')}</small>}
                  </label>
                  {ai.openrouter.connected ? (
                    <button className="btn secondary" onClick={ai.openrouter.disconnect}>{t('or.disconnect')}</button>
                  ) : (
                    <button className="btn secondary" onClick={ai.openrouter.connect}>{t('or.connect')}</button>
                  )}
                </div>
                {ai.last && (
                  <p className="ai-last">
                    {t('ai.last', {
                      engine: ai.last.engine === 'chrome' ? 'Chrome' : 'OpenRouter',
                      result:
                        ai.last.kind === 'ok'
                          ? t('ai.res.ok', { n: ai.last.used })
                          : ai.last.kind === 'invalid'
                            ? t('ai.res.invalid', { n: ai.last.usable })
                            : ai.last.kind === 'timeout'
                              ? t('ai.res.timeout')
                              : t('ai.res.error', { msg: ai.last.message.slice(0, 120) }),
                    })}
                  </p>
                )}
                {ai.openrouter.connected && (
                  <div className="row">
                    <label>
                      {t('or.training')}
                      <small>{t('or.trainingSub')}</small>
                    </label>
                    <Switch on={s.aiTraining} label={t('or.training')} onChange={(v) => set({ aiTraining: v })} />
                  </div>
                )}
              </>
            )}
          </>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn" onClick={onClose}>{t('common.done')}</button>
        </div>
      </div>
    </div>
  );
}
