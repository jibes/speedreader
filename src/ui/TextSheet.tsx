import type { Settings } from '../core/store';
import { t } from '../i18n';
import { Seg } from './controls';

type Props = {
  s: Settings;
  set: (p: Partial<Settings>) => void;
  onClose: () => void;
};

/** Reader display settings behind the Aa button: how the text looks, nothing else. */
export function TextSheet({ s, set, onClose }: Props) {
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn" onClick={onClose}>{t('common.done')}</button>
        </div>
      </div>
    </div>
  );
}
