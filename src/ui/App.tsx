import { useEffect, useState } from 'react';
import { store, type DocMeta, type Settings } from '../core/store';
import { Library } from './Library';
import { Reader } from './Reader';
import { Science } from './Science';
import { Stats } from './Stats';

type View = 'library' | 'stats' | 'science';

export default function App() {
  const [settings, setAll] = useState<Settings>(store.settings);
  const [view, setView] = useState<View>('library');
  const [open, setOpen] = useState<{ meta: DocMeta; baseline?: boolean } | null>(null);
  const [incoming, setIncoming] = useState<{ text?: string; files?: File[] }>(readShare);
  const install = useInstallPrompt();

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

  const setSettings = (p: Partial<Settings>) =>
    setAll((s) => {
      const n = { ...s, ...p };
      store.saveSettings(n);
      return n;
    });

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'auto') root.removeAttribute('data-theme');
    else root.dataset.theme = settings.theme;
  }, [settings.theme]);

  if (open) {
    return (
      <Reader
        key={open.meta.id}
        meta={open.meta}
        settings={settings}
        setSettings={setSettings}
        startWithBaseline={open.baseline}
        onExit={() => setOpen(null)}
      />
    );
  }

  const tab = (v: View, label: string) => (
    <button aria-current={view === v ? 'page' : undefined} onClick={() => setView(v)}>{label}</button>
  );

  return (
    <div className="app">
      <header className="top">
        <button className="brand" onClick={() => setView('library')}><i />Lumen</button>
        <nav className="nav">
          {install && <button onClick={install}>Install</button>}
          {tab('library', 'Read')}
          {tab('stats', 'Progress')}
          {tab('science', 'Science')}
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
      {view === 'stats' && <Stats />}
      {view === 'science' && <Science />}
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
