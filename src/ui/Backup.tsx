import { useRef, useState } from 'react';
import { backupFilename, createBackup, parseBackup, restoreBackup } from '../core/backup';

const LAST = 'speedreader:lastBackup';

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function lastBackup(): number | null {
  try {
    return Number(localStorage.getItem(LAST)) || null;
  } catch {
    return null;
  }
}

export function BackupPanel({ onRestored }: { onRestored: () => void }) {
  const [status, setStatus] = useState<{ msg: string; err?: boolean } | null>(null);
  const [last, setLast] = useState(lastBackup);
  const fileRef = useRef<HTMLInputElement>(null);

  async function exportAll() {
    const b = await createBackup();
    const blob = new Blob([JSON.stringify(b)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = backupFilename();
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    try {
      localStorage.setItem(LAST, String(Date.now()));
    } catch {
      /* ignore */
    }
    setLast(Date.now());
    setStatus({ msg: `Saved ${plural(b.docs.length, 'text')} and ${plural(b.sessions.length, 'session')}.` });
  }

  async function restore(file: File) {
    try {
      const r = await restoreBackup(parseBackup(await file.text()));
      const parts = [
        r.docsAdded && `${plural(r.docsAdded, 'text')} added`,
        r.docsUpdated && `${r.docsUpdated} updated`,
        r.sessionsAdded && `${plural(r.sessionsAdded, 'session')} added`,
      ].filter(Boolean);
      setStatus({ msg: parts.length ? `Restored: ${parts.join(', ')}.` : 'Everything in this backup is already here.' });
      onRestored();
    } catch (e) {
      setStatus({ msg: e instanceof Error ? e.message : 'Could not restore this file.', err: true });
    }
  }

  return (
    <>
      <h2>Backup</h2>
      <div className="tile backup">
        <p>
          Your texts and progress live only in this browser. Save a backup file to keep them safe or move them to another device.
          Restoring merges — nothing is deleted.
        </p>
        <div className="backup-actions">
          <span className="doc-meta">{last ? `Last backup ${new Date(last).toLocaleDateString()}` : 'No backup yet'}</span>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) restore(f); }} />
          <button className="btn secondary" onClick={() => fileRef.current?.click()}>Restore</button>
          <button className="btn" onClick={exportAll}>Export</button>
        </div>
        <div className={`status${status?.err ? ' err' : ''}`} role="status">{status?.msg}</div>
      </div>
    </>
  );
}
