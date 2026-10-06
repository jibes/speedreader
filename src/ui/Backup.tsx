import { useRef, useState } from 'react';
import { backupFilename, createBackup, parseBackup, restoreBackup } from '../core/backup';
import { fmtDate, t } from '../i18n';

const LAST = 'speedreader:lastBackup';


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
    setStatus({ msg: t('backup.saved', { texts: t('count.texts', { n: b.docs.length }), sessions: t('count.sessions', { n: b.sessions.length }) }) });
  }

  async function restore(file: File) {
    try {
      const r = await restoreBackup(parseBackup(await file.text()));
      const parts = [
        r.docsAdded && t('backup.added', { x: t('count.texts', { n: r.docsAdded }) }),
        r.docsUpdated && t('backup.updated', { n: r.docsUpdated }),
        r.sessionsAdded && t('backup.added', { x: t('count.sessions', { n: r.sessionsAdded }) }),
      ].filter(Boolean);
      setStatus({ msg: parts.length ? t('backup.restored', { list: parts.join(', ') }) : t('backup.nothingNew') });
      onRestored();
    } catch (e) {
      setStatus({ msg: e instanceof Error ? e.message : t('backup.failed'), err: true });
    }
  }

  return (
    <>
      <h2>{t('backup.title')}</h2>
      <div className="tile backup">
        <p>{t('backup.body')}</p>
        <div className="backup-actions">
          <span className="doc-meta">{last ? t('backup.last', { date: fmtDate(last, { dateStyle: 'medium' }) }) : t('backup.none')}</span>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) restore(f); }} />
          <button className="btn secondary" onClick={() => fileRef.current?.click()}>{t('backup.restore')}</button>
          <button className="btn" onClick={exportAll}>{t('backup.export')}</button>
        </div>
        <div className={`status${status?.err ? ' err' : ''}`} role="status">{status?.msg}</div>
      </div>
    </>
  );
}
