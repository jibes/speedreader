import { get, set, del, keys, createStore } from 'idb-keyval';

export interface DocMeta {
  id: string;
  title: string;
  words: number;
  /** token index of reading position */
  pos: number;
  added: number;
  opened: number;
  /** origin URL for fetched articles */
  source?: string;
}

export interface Session {
  at: number;
  docId: string;
  mode: Mode;
  wpm: number;
  words: number;
  ms: number;
  /** 0..1, undefined when no check */
  accuracy?: number;
  baseline?: boolean;
}

export type Mode = 'pacer' | 'focus';

export interface Settings {
  mode: Mode;
  wpm: number;
  chunk: number;
  training: boolean;
  segment: number;
  fontSize: number;
  serif: boolean;
  theme: 'auto' | 'light' | 'sepia' | 'dark';
  rampUp: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'pacer',
  wpm: 300,
  chunk: 1,
  training: true,
  segment: 300,
  fontSize: 22,
  serif: true,
  theme: 'auto',
  rampUp: true,
};

const texts = createStore('speedreader', 'texts');
const LS = 'speedreader:';

function lsGet<T>(k: string, d: T): T {
  try {
    const v = localStorage.getItem(LS + k);
    return v ? { ...d, ...JSON.parse(v) } : d;
  } catch {
    return d;
  }
}
function lsArr<T>(k: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(LS + k) || '[]');
  } catch {
    return [];
  }
}
function lsSet(k: string, v: unknown) {
  try {
    localStorage.setItem(LS + k, JSON.stringify(v));
  } catch {
    /* quota / private mode */
  }
}

export const store = {
  settings: () => lsGet('settings', DEFAULT_SETTINGS),
  saveSettings: (s: Settings) => lsSet('settings', s),
  library: () => lsArr<DocMeta>('library').sort((a, b) => b.opened - a.opened),
  saveMeta(m: DocMeta) {
    const lib = lsArr<DocMeta>('library').filter((d) => d.id !== m.id);
    lib.push(m);
    lsSet('library', lib);
  },
  async addDoc(title: string, text: string, words: number, source?: string): Promise<DocMeta> {
    const id = crypto.randomUUID?.() ?? String(Date.now() + Math.random());
    const now = Date.now();
    const meta: DocMeta = { id, title, words, pos: 0, added: now, opened: now, source };
    await set(id, text, texts);
    store.saveMeta(meta);
    return meta;
  },
  text: (id: string) => get<string>(id, texts),
  async removeDoc(id: string) {
    await del(id, texts);
    lsSet('library', lsArr<DocMeta>('library').filter((d) => d.id !== id));
  },
  sessions: () => lsArr<Session>('sessions'),
  addSession(s: Session) {
    const all = lsArr<Session>('sessions');
    all.push(s);
    lsSet('sessions', all.slice(-2000));
  },
  /** remove orphan texts */
  async gc() {
    const ids = new Set(lsArr<DocMeta>('library').map((d) => d.id));
    for (const k of await keys(texts)) if (!ids.has(String(k))) await del(k, texts);
  },
};
