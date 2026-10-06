import { useEffect, useRef, useState } from 'react';
import { fetchArticle, isUrl, linkFromShare } from '../core/article';
import { BACKUP_FORMAT, parseBackup, restoreBackup } from '../core/backup';
import { extractText, titleFrom } from '../core/extract';
import { sampleFor } from '../core/sample';
import { store, type DocMeta } from '../core/store';
import { normaliseText, wordCount } from '../core/text';
import { getLang, t } from '../i18n';
import { Clip } from './icons';

const ACCEPT = '.txt,.md,.markdown,.pdf,.docx,.epub,.odt,.rtf,.html,.htm,.xhtml,.srt,.vtt,.csv,.json,.xml,image/*,text/*';

export function Library({
  onOpen,
  incoming,
}: {
  onOpen: (d: DocMeta, opts?: { baseline?: boolean }) => void;
  /** text shared into the app or files opened with it (PWA share target / file handler) */
  incoming?: { text?: string; files?: File[] };
}) {
  const [docs, setDocs] = useState<DocMeta[]>(() => store.library());
  const [text, setText] = useState('');
  const [status, setStatus] = useState<{ msg: string; err?: boolean } | null>(null);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const hasSessions = store.sessions().length > 0;
  const isLink = isUrl(text);

  useEffect(() => {
    store.gc();
  }, []);

  useEffect(() => {
    if (incoming?.text) {
      const link = linkFromShare(incoming.text);
      if (link) handleUrl(link);
      else setText(incoming.text);
    }
    if (incoming?.files?.length) handleFiles(incoming.files);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming]);

  async function add(title: string, raw: string, opts?: { baseline?: boolean; source?: string }) {
    const clean = normaliseText(raw);
    const n = wordCount(clean);
    if (n < 5) {
      setStatus({ msg: t('home.tooShort'), err: true });
      return;
    }
    const meta = await store.addDoc(title, clean, n, opts?.source);
    setDocs(store.library());
    setStatus(null);
    onOpen(meta, opts);
  }

  async function handleUrl(url: string) {
    setStatus({ msg: t('home.fetching') });
    try {
      const a = await fetchArticle(url, (msg) => setStatus({ msg }));
      await add(a.title, a.text, { source: a.url });
      setText('');
    } catch (e) {
      setText(url);
      setStatus({ msg: e instanceof Error ? e.message : t('home.fetchFailed'), err: true });
    }
  }

  async function handleFiles(files: FileList | File[]) {
    const file = files[0];
    if (!file) return;
    setStatus({ msg: t('home.opening', { name: file.name }) });
    try {
      // a dropped Lumen backup restores instead of opening as text
      if (/\.json$/i.test(file.name)) {
        const raw = await file.text();
        if (raw.includes(BACKUP_FORMAT)) {
          const r = await restoreBackup(parseBackup(raw));
          setDocs(store.library());
          setStatus({ msg: t('home.backupRestored', { texts: t('count.texts', { n: r.docsAdded }), sessions: t('count.sessions', { n: r.sessionsAdded }) }) });
          return;
        }
      }
      const raw = await extractText(file, (msg) => setStatus({ msg }));
      await add(file.name.replace(/\.[^.]+$/, ''), raw);
    } catch (e) {
      setStatus({ msg: e instanceof Error ? e.message : t('home.fileFailed'), err: true });
    }
  }

  // drop anywhere + paste files
  useEffect(() => {
    const prevent = (e: DragEvent) => {
      e.preventDefault();
      setOver(e.type === 'dragover');
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setOver(false);
      if (e.dataTransfer?.files.length) handleFiles(e.dataTransfer.files);
    };
    const paste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (files?.length) {
        e.preventDefault();
        handleFiles(files);
      }
    };
    window.addEventListener('dragover', prevent);
    window.addEventListener('dragleave', prevent);
    window.addEventListener('drop', drop);
    window.addEventListener('paste', paste);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('dragleave', prevent);
      window.removeEventListener('drop', drop);
      window.removeEventListener('paste', paste);
    };
  });

  return (
    <div className="page">
      <h1>{t('home.title1')}<br />{t('home.title2')}</h1>
      <p className="lede">
        {t('home.lede')}
      </p>

      <div className={`drop${over ? ' over' : ''}`}>
        <textarea
          aria-label={t('home.textLabel')}
          placeholder={t('home.placeholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="drop-bar">
          <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={(e) => e.target.files && handleFiles(e.target.files)} />
          <button className="ghost attach" onClick={() => fileRef.current?.click()} title={t('home.fileTypes')}>
            <Clip /> {t('home.openFile')}
          </button>
          <span className="hint">{isLink ? t('home.link') : text ? t('home.words', { n: wordCount(text) }) : ''}</span>
          <button
            className="btn"
            disabled={!text.trim()}
            onClick={() => (isLink ? handleUrl(text.trim()) : add(titleFrom(text), text).then(() => setText('')))}
          >
            {isLink ? t('home.fetch') : t('home.read')}
          </button>
        </div>
      </div>
      <div className={`status${status?.err ? ' err' : ''}`} role="status">{status?.msg}</div>

      {!hasSessions && (
        <>
          <button className="callout" onClick={() => { const s = sampleFor(getLang()); add(s.title, s.text, { baseline: true }); }}>
            <div>
              <b>{t('home.newTitle')}</b>
              <span>{t('home.newSub')}</span>
            </div>
            <span aria-hidden>→</span>
          </button>
        </>
      )}

      <h2>{t('home.library')}</h2>
      {docs.length === 0 ? (
        <div className="empty">{t('home.empty')}</div>
      ) : (
        <ul className="docs">
          {docs.map((d) => (
            <li key={d.id}>
              <div className="doc" role="button" tabIndex={0} onClick={() => onOpen(d)} onKeyDown={(e) => e.key === 'Enter' && onOpen(d)}>
                <div style={{ minWidth: 0 }}>
                  <div className="doc-title">{d.title}</div>
                  <div className="doc-meta">
                    {d.source && <span>{hostname(d.source)}</span>}
                    <span>{t('home.words', { n: d.words })}</span>
                    <span className="bar"><span style={{ width: `${Math.min(100, (d.pos / Math.max(1, d.words)) * 100)}%` }} /></span>
                    <span>{Math.round((d.pos / Math.max(1, d.words)) * 100)} %</span>
                  </div>
                </div>
                <button
                  className="doc-del"
                  aria-label={t('home.deleteLabel', { title: d.title })}
                  onClick={async (e) => {
                    e.stopPropagation();
                    await store.removeDoc(d.id);
                    setDocs(store.library());
                  }}
                >
                  {t('home.delete')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
