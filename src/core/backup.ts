/** Export / restore library (texts + positions), progress and settings as one JSON file. */
import { store, type DocMeta, type Session, type Settings } from './store';

export const BACKUP_FORMAT = 'lumen-backup';
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exported: number;
  settings: Settings;
  docs: (DocMeta & { text: string })[];
  sessions: Session[];
}

export interface RestoreResult {
  docsAdded: number;
  docsUpdated: number;
  sessionsAdded: number;
}

export async function createBackup(): Promise<Backup> {
  const docs = [];
  for (const meta of store.library()) {
    const text = await store.text(meta.id);
    if (text != null) docs.push({ ...meta, text });
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported: Date.now(),
    settings: store.settings(),
    docs,
    sessions: store.sessions(),
  };
}

export function backupFilename(date = new Date()) {
  return `lumen-backup-${date.toISOString().slice(0, 10)}.json`;
}

export function parseBackup(json: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('This is not a Lumen backup file.');
  }
  const b = data as Partial<Backup>;
  if (b?.format !== BACKUP_FORMAT || !Array.isArray(b.docs) || !Array.isArray(b.sessions)) {
    throw new Error('This is not a Lumen backup file.');
  }
  if ((b.version ?? 0) > BACKUP_VERSION) throw new Error('This backup is from a newer version of Lumen.');
  return b as Backup;
}

/**
 * Merge a backup into the current data — nothing is deleted.
 * Docs: missing ones are added; for existing ones the further reading position wins.
 * Sessions: union, de-duplicated by time + document.
 * Settings are only restored when this device has no history yet.
 */
export async function restoreBackup(b: Backup): Promise<RestoreResult> {
  const fresh = store.sessions().length === 0 && store.library().length === 0;
  const existing = new Map(store.library().map((d) => [d.id, d]));
  let docsAdded = 0;
  let docsUpdated = 0;
  for (const { text, ...meta } of b.docs) {
    if (!meta.id || typeof text !== 'string') continue;
    const cur = existing.get(meta.id);
    if (!cur) {
      await store.putDoc(meta, text);
      docsAdded++;
    } else if (meta.pos > cur.pos || meta.opened > cur.opened) {
      store.saveMeta({ ...cur, pos: Math.max(cur.pos, meta.pos), opened: Math.max(cur.opened, meta.opened) });
      docsUpdated++;
    }
  }
  const key = (s: Session) => `${s.at}|${s.docId}`;
  const seen = new Set(store.sessions().map(key));
  const added = b.sessions.filter((s) => typeof s.at === 'number' && !seen.has(key(s)));
  store.setSessions([...store.sessions(), ...added].sort((x, y) => x.at - y.at));
  if (fresh && b.settings) store.saveSettings({ ...store.settings(), ...b.settings });
  return { docsAdded, docsUpdated, sessionsAdded: added.length };
}
