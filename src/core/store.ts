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
  /** what the session was for; legacy sessions only carry `mode` */
  goal?: Goal;
  /** legacy: 'focus' sessions came from the removed RSVP mode */
  mode?: 'pacer' | 'focus';
  wpm: number;
  words: number;
  ms: number;
  /** 0..1, undefined when no check */
  accuracy?: number;
  baseline?: boolean;
}

/** read: plain pacing · train: adaptive speed with comprehension checks · skim: gist sampling */
export type Goal = 'read' | 'train' | 'skim';

export interface Settings {
  goal: Goal;
  wpm: number;
  fontSize: number;
  serif: boolean;
  theme: 'auto' | 'light' | 'sepia' | 'dark';
}

export const DEFAULT_SETTINGS: Settings = {
  goal: 'train',
  wpm: 300,
  fontSize: 22,
  serif: true,
  theme: 'auto',
};

/** training section length in words */
export const SECTION_WORDS = 300;
/** skim section length in words (more text per check — gist needs breadth) */
export const SKIM_SECTION_WORDS = 600;

const texts = createStore('speedreader', 'texts');
const LS = 'speedreader:';

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
  settings(): Settings {
    let stored: Partial<Settings> & { training?: boolean } = {};
    try {
      stored = JSON.parse(localStorage.getItem(LS + 'settings') || '{}');
    } catch {
      /* default */
    }
    // migrate pre-goal settings (training on/off)
    const goal = stored.goal ?? (stored.training === false ? 'read' : 'train');
    const s = { ...DEFAULT_SETTINGS, ...stored, goal };
    return { goal: s.goal, wpm: s.wpm, fontSize: s.fontSize, serif: s.serif, theme: s.theme };
  },
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
  /** insert a document with a known id (restore) */
  async putDoc(meta: DocMeta, text: string) {
    await set(meta.id, text, texts);
    store.saveMeta(meta);
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
  setSessions(all: Session[]) {
    lsSet('sessions', all.slice(-2000));
  },
  /** remove orphan texts */
  async gc() {
    const ids = new Set(lsArr<DocMeta>('library').map((d) => d.id));
    for (const k of await keys(texts)) if (!ids.has(String(k))) await del(k, texts);
  },
};
