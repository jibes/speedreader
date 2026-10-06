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
          {tab('library', 'Read')}
          {tab('stats', 'Progress')}
          {tab('science', 'Science')}
        </nav>
      </header>
      {view === 'library' && (
        <Library
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
