// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createBackup, parseBackup, restoreBackup } from '../src/core/backup';
import { store } from '../src/core/store';

async function wipe() {
  for (const d of store.library()) await store.removeDoc(d.id);
  localStorage.clear();
}

describe('backup', () => {
  beforeEach(wipe);

  it('round-trips library, texts, positions, sessions and settings', async () => {
    const d = await store.addDoc('Doc A', 'Alpha beta gamma.', 3, 'https://ex.com/a');
    store.saveMeta({ ...d, pos: 2 });
    store.addSession({ at: 1, docId: d.id, mode: 'pacer', wpm: 320, words: 300, ms: 56000, accuracy: 1 });
    store.saveSettings({ ...store.settings(), wpm: 410, theme: 'dark' });
    const json = JSON.stringify(await createBackup());

    await wipe();
    expect(store.library()).toHaveLength(0);

    const r = await restoreBackup(parseBackup(json));
    expect(r).toEqual({ docsAdded: 1, docsUpdated: 0, sessionsAdded: 1 });
    const [meta] = store.library();
    expect(meta).toMatchObject({ id: d.id, title: 'Doc A', pos: 2, source: 'https://ex.com/a' });
    expect(await store.text(d.id)).toBe('Alpha beta gamma.');
    expect(store.sessions()).toHaveLength(1);
    expect(store.settings()).toMatchObject({ wpm: 410, theme: 'dark' });
  });

  it('merges without duplicates or data loss', async () => {
    const d = await store.addDoc('Doc', 'One two three four.', 4);
    store.addSession({ at: 1, docId: d.id, mode: 'pacer', wpm: 300, words: 100, ms: 20000 });
    const backup = await createBackup();
    backup.docs[0].pos = 3; // read further on the other device
    backup.sessions.push({ at: 2, docId: d.id, mode: 'focus', wpm: 350, words: 100, ms: 17000, accuracy: 0.67 });
    store.saveSettings({ ...store.settings(), wpm: 500 });
    backup.settings.wpm = 200;

    expect(await restoreBackup(backup)).toEqual({ docsAdded: 0, docsUpdated: 1, sessionsAdded: 1 });
    expect(await restoreBackup(backup)).toEqual({ docsAdded: 0, docsUpdated: 0, sessionsAdded: 0 });
    expect(store.library()[0].pos).toBe(3);
    expect(store.sessions().map((s) => s.at)).toEqual([1, 2]);
    expect(store.settings().wpm).toBe(500); // existing device keeps its settings
  });

  it('rejects foreign files', () => {
    expect(() => parseBackup('{"hello":1}')).toThrow('not a Lumen backup');
    expect(() => parseBackup('nope')).toThrow('not a Lumen backup');
    expect(() => parseBackup(JSON.stringify({ format: 'lumen-backup', version: 99, docs: [], sessions: [] }))).toThrow('newer version');
  });
});

describe('settings migration', () => {
  it('maps the old training toggle to a goal and drops removed settings', () => {
    localStorage.setItem('speedreader:settings', JSON.stringify({ mode: 'focus', chunk: 3, training: false, rampUp: true, wpm: 420, theme: 'sepia' }));
    expect(store.settings()).toEqual({ goal: 'read', wpm: 420, fontSize: 22, serif: true, theme: 'sepia', lang: 'auto' });
    localStorage.setItem('speedreader:settings', JSON.stringify({ training: true }));
    expect(store.settings().goal).toBe('train');
  });
});
