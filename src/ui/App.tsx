import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { completeLogin } from '../core/openrouter';
import { sampleFor } from '../core/sample';
import { store, type DocMeta, type Settings } from '../core/store';
import { wordCount } from '../core/text';
import { getLang, resolveLang, setLang, t } from '../i18n';
import { AppSettings } from './AppSettings';
import { Gear } from './icons';
import { Library } from './Library';
import { Reader } from './Reader';
import { Science } from './Science';
import { Stats } from './Stats';

type View = 'library' | 'stats' | 'science' | 'settings';

export default function App() {
  const [settings, setAll] = useState<Settings>(store.settings);
  const [view, setView] = useState<View>('library');
  const [open, setOpen] = useState<{ meta: DocMeta; baseline?: boolean } | null>(null);
  const [incoming, setIncoming] = useState<{ text?: string; files?: File[] }>(readShare);
  const install = useInstallPrompt();
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const [update, setUpdate] = useState<null | (() => void)>(null);

  // offer a reload when a new version is deployed; check hourly and when the app comes back
  useEffect(() => {
    const updateSW = registerSW({
      onNeedRefresh: () =>
        setUpdate(() => () => {
          // activate the waiting version, then load it (reload explicitly; don't depend on the library event)
          navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
          updateSW(true);
          setTimeout(() => location.reload(), 2500);
        }),
      onRegisteredSW(_url, reg) {
        if (!reg) return;
        setInterval(() => reg.update(), 60 * 60 * 1000);
        document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update());
      },
    });
  }, []);

  // returning from "Sign in with OpenRouter": exchange the code, reopen the text
  useEffect(() => {
    completeLogin().then((r) => {
      if (!r) return;
      setToast(r.ok ? { msg: t('or.ok') } : { msg: t('or.failed'), err: true });
      setTimeout(() => setToast(null), 4000);
      if (r.returnTo === 'settings') setView('settings');
      const meta = r.returnTo && store.library().find((d) => d.id === r.returnTo);
      if (meta) setOpen({ meta });
    });
  }, []);

  // "Open with Lumen" from the OS (installed app, Chromium)
  useEffect(() => {
    window.launchQueue?.setConsumer(async (params) => {
      const files = await Promise.all((params.files ?? []).map((h) => h.getFile()));
      if (files.length) {
        setOpen(null);
        setView('library');
        setIncoming({ files });
      }
    });
  }, []);

  // language is module state read by t(); set it before children render
  setLang(resolveLang(settings.lang));

  const setSettings = (p: Partial<Settings>) =>
    setAll((s) => {
      const n = { ...s, ...p };
      store.saveSettings(n);
      return n;
    });

  useEffect(() => {
    document.title = `Lumen — ${t('home.title1')} ${t('home.title2')}`;
  }, [settings.lang]);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'auto') root.removeAttribute('data-theme');
    else root.dataset.theme = settings.theme;
  }, [settings.theme]);

  const toastEl = update ? (
    <div className="toast" role="status">
      {t('update.ready')}
      <button className="toast-btn" onClick={update}>{t('update.reload')}</button>
    </div>
  ) : (
    toast && (
      <div className={`toast${toast.err ? ' err' : ''}`} role="status">
        {toast.msg}
      </div>
    )
  );

  if (open) {
    return (
      <>
      {toastEl}
      <Reader
        key={open.meta.id}
        meta={open.meta}
        settings={settings}
        setSettings={setSettings}
        startWithBaseline={open.baseline}
        onExit={() => setOpen(null)}
      />
      </>
    );
  }

  // speed test on fresh text: next unread passage of the latest document, else the sample
  async function retest() {
    const doc = store.library().find((d) => d.words - d.pos >= 150);
    const sample = sampleFor(getLang());
    const meta = doc ?? (await store.addDoc(sample.title, sample.text, wordCount(sample.text)));
    setOpen({ meta, baseline: true });
  }

  const tab = (v: View, label: string) => (
    <button aria-current={view === v ? 'page' : undefined} onClick={() => setView(v)}>{label}</button>
  );

  return (
    <div className="app">
      {toastEl}
      <header className="top">
        <button className="brand" aria-label="Lumen" onClick={() => setView('library')}><i /><span>Lumen</span></button>
        <nav className="nav">
          {install && <button onClick={install}>{t('nav.install')}</button>}
          {tab('library', t('nav.read'))}
          {tab('stats', t('nav.progress'))}
          {tab('science', t('nav.science'))}
          <button className="gear" aria-label={t('nav.settings')} title={t('nav.settings')} aria-current={view === 'settings' ? 'page' : undefined} onClick={() => setView('settings')}>
            <Gear />
          </button>
        </nav>
      </header>
      {view === 'library' && (
        <Library
          incoming={incoming}
          onOpen={(meta, o) => {
            // re-read meta so position is current
            const fresh = store.library().find((d) => d.id === meta.id) ?? meta;
            setOpen({ meta: fresh, baseline: o?.baseline });
          }}
        />
      )}
      {view === 'stats' && <Stats onRetest={retest} />}
      {view === 'science' && <Science />}
      {view === 'settings' && <AppSettings s={settings} set={setSettings} />}
    </div>
  );
}

/** Read text shared via the Web Share Target (?title=&text=&url=) and clean the URL. */
function readShare(): { text?: string } {
  const q = new URLSearchParams(location.search);
  const parts = [q.get('title'), q.get('text'), q.get('url')].filter((v): v is string => !!v?.trim());
  if (!parts.length) return {};
  history.replaceState(null, '', location.pathname);
  // titles are often repeated inside the shared text
  const text = parts.filter((p, i) => !parts.some((o, j) => j !== i && o.length > p.length && o.includes(p))).join('\n\n');
  return { text };
}

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Returns a function that shows the browser's install dialog, when available. */
function useInstallPrompt() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as InstallEvent);
    };
    const onInstalled = () => setEvt(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  if (!evt) return null;
  return async () => {
    await evt.prompt();
    await evt.userChoice;
    setEvt(null);
  };
}

declare global {
  interface Window {
    launchQueue?: { setConsumer: (cb: (p: { files?: FileSystemFileHandle[] }) => void) => void };
  }
}
