import { useEffect, useState } from 'react';
import { aiAvailability, enableAi, lastOutcome, onOutcome, type AiOutcome, type AiState } from '../core/ai';
import * as openrouter from '../core/openrouter';
import type { Settings } from '../core/store';
import { detectLang, getLang, LANGS, t, type LangPref } from '../i18n';
import { BackupPanel } from './Backup';
import { Switch } from './controls';

/** App-wide settings page (gear icon): language, AI questions, backup. */
export function AppSettings({ s, set }: { s: Settings; set: (p: Partial<Settings>) => void }) {
  return (
    <div className="page settings-page">
      <h1>{t('nav.settings')}</h1>

      <div className="tile">
        <div className="row">
          <label htmlFor="lang">{t('lang.label')}</label>
          <select id="lang" className="select" value={s.lang} onChange={(e) => set({ lang: e.target.value as LangPref })}>
            <option value="auto">{t('lang.auto', { lang: LANGS[detectLang()] })}</option>
            {Object.entries(LANGS).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
        </div>
      </div>

      <h2>{t('ai.title')}</h2>
      <AiSettings s={s} set={set} />

      <BackupPanel onRestored={() => {}} />
    </div>
  );
}

function AiSettings({ s, set }: { s: Settings; set: (p: Partial<Settings>) => void }) {
  // availability is per language; the UI language is the best guess outside a text
  const lang = getLang();
  const [state, setState] = useState<AiState>('unavailable');
  const [progress, setProgress] = useState(0);
  const [auth, setAuth] = useState(openrouter.getAuth);
  const [left, setLeft] = useState<number | null>(null);
  const [last, setLast] = useState<AiOutcome | null>(lastOutcome);

  useEffect(() => {
    aiAvailability(lang).then(setState);
  }, [lang]);
  useEffect(() => onOutcome(setLast), []);
  useEffect(() => {
    if (!auth) return;
    openrouter.freeRequestsLeft(auth).then((n) => {
      setLeft(n);
      if (!openrouter.getAuth()) setAuth(null); // revoked
    });
  }, [auth]);

  async function enable() {
    setState('downloading');
    await enableAi(lang, setProgress);
    setState(await aiAvailability(lang));
  }

  const policy = last?.kind === 'error' && last.engine === 'openrouter' && /data policy|data_collection/i.test(last.message);

  return (
    <div className="tile">
      <div className="row">
        <label>{t('ai.use')}</label>
        <Switch on={s.ai} label={t('ai.use')} onChange={(v) => set({ ai: v })} />
      </div>
      {s.ai && (
        <>
          <div className="row">
            <label>
              {t('ai.chrome')}
              <small>{state === 'downloading' ? t('ai.downloading', { p: Math.round(progress * 100) }) : t(`ai.${state}`)}</small>
            </label>
            {state === 'downloadable' && <button className="btn secondary" onClick={enable}>{t('ai.enable')}</button>}
          </div>
          <div className="row">
            <label>
              {t('or.title')}
              <small>{auth ? [t('or.connected'), left !== null ? t('or.left', { n: left }) : ''].filter(Boolean).join(' · ') : t('or.desc')}</small>
              {policy && !s.aiTraining && <small className="warn">{t('or.policy')}</small>}
            </label>
            {auth ? (
              <button
                className="btn secondary"
                onClick={() => {
                  openrouter.disconnect();
                  setAuth(null);
                }}
              >
                {t('or.disconnect')}
              </button>
            ) : (
              <button className="btn secondary" onClick={() => openrouter.connect('settings')}>{t('or.connect')}</button>
            )}
          </div>
          {auth && (
            <div className="row">
              <label>
                {t('or.training')}
                <small>{t('or.trainingSub')}</small>
              </label>
              <Switch on={s.aiTraining} label={t('or.training')} onChange={(v) => set({ aiTraining: v })} />
            </div>
          )}
          {last && (
            <p className="ai-last">
              {t('ai.last', {
                engine: last.engine === 'chrome' ? 'Chrome' : 'OpenRouter',
                result:
                  last.kind === 'ok'
                    ? t('ai.res.ok', { n: last.used })
                    : last.kind === 'invalid'
                      ? t('ai.res.invalid', { n: last.usable })
                      : last.kind === 'timeout'
                        ? t('ai.res.timeout')
                        : t('ai.res.error', { msg: last.message.slice(0, 120) }),
              })}
            </p>
          )}
        </>
      )}
    </div>
  );
}
