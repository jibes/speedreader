import { useEffect, useRef, useState } from 'react';
import { extractText, titleFrom } from '../core/extract';
import { SAMPLE, SAMPLE_TITLE } from '../core/sample';
import { store, type DocMeta } from '../core/store';
import { normaliseText, wordCount } from '../core/text';

const ACCEPT = '.txt,.md,.markdown,.pdf,.docx,.epub,.odt,.rtf,.html,.htm,.xhtml,.srt,.vtt,.csv,.json,.xml,image/*,text/*';

export function Library({ onOpen }: { onOpen: (d: DocMeta, opts?: { baseline?: boolean }) => void }) {
  const [docs, setDocs] = useState<DocMeta[]>(() => store.library());
  const [text, setText] = useState('');
  const [status, setStatus] = useState<{ msg: string; err?: boolean } | null>(null);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const hasSessions = store.sessions().length > 0;

  useEffect(() => {
    store.gc();
  }, []);

  async function add(title: string, raw: string, opts?: { baseline?: boolean }) {
    const clean = normaliseText(raw);
    const n = wordCount(clean);
    if (n < 5) {
      setStatus({ msg: 'Not enough text to read.', err: true });
      return;
    }
    const meta = await store.addDoc(title, clean, n);
    setDocs(store.library());
    setStatus(null);
    onOpen(meta, opts);
  }

  async function handleFiles(files: FileList | File[]) {
    const file = files[0];
    if (!file) return;
    setStatus({ msg: `Opening ${file.name}…` });
    try {
      const raw = await extractText(file, (msg) => setStatus({ msg }));
      await add(file.name.replace(/\.[^.]+$/, ''), raw);
    } catch (e) {
      setStatus({ msg: e instanceof Error ? e.message : 'Could not read this file.', err: true });
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
      <h1>Read faster.<br />Understand more.</h1>
      <p className="lede">
        Paste text or drop any file — PDF, Word, EPUB, web page, even a photo of a page. Lumen paces you just above your
        comfortable speed and checks understanding, so you get faster without losing the point.
      </p>

      <div className={`drop${over ? ' over' : ''}`}>
        <textarea
          aria-label="Text to read"
          placeholder="Paste text here, or drop a file anywhere…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="drop-bar">
          <span className="hint">{text ? `${wordCount(text).toLocaleString()} words` : 'PDF · DOCX · EPUB · ODT · RTF · HTML · TXT · MD · images'}</span>
          <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={(e) => e.target.files && handleFiles(e.target.files)} />
          <button className="btn secondary" onClick={() => fileRef.current?.click()}>Open file</button>
          <button className="btn" disabled={!text.trim()} onClick={() => add(titleFrom(text), text).then(() => setText(''))}>
            Read
          </button>
        </div>
      </div>
      <div className={`status${status?.err ? ' err' : ''}`} role="status">{status?.msg}</div>

      {!hasSessions && (
        <>
          <h2>New here?</h2>
          <button className="doc" onClick={() => add(SAMPLE_TITLE, SAMPLE, { baseline: true })}>
            <div>
              <div className="doc-title">Take the 2-minute speed test</div>
              <div className="doc-meta">Measures your natural speed and comprehension, then sets your training pace.</div>
            </div>
            <span className="doc-meta">→</span>
          </button>
        </>
      )}

      <h2>Library</h2>
      {docs.length === 0 ? (
        <div className="empty">Your texts will appear here.</div>
      ) : (
        <ul className="docs">
          {docs.map((d) => (
            <li key={d.id}>
              <div className="doc" role="button" tabIndex={0} onClick={() => onOpen(d)} onKeyDown={(e) => e.key === 'Enter' && onOpen(d)}>
                <div style={{ minWidth: 0 }}>
                  <div className="doc-title">{d.title}</div>
                  <div className="doc-meta">
                    <span>{d.words.toLocaleString()} words</span>
                    <span className="bar"><span style={{ width: `${Math.min(100, (d.pos / Math.max(1, d.words)) * 100)}%` }} /></span>
                    <span>{Math.round((d.pos / Math.max(1, d.words)) * 100)} %</span>
                  </div>
                </div>
                <button
                  className="doc-del"
                  aria-label={`Delete ${d.title}`}
                  onClick={async (e) => {
                    e.stopPropagation();
                    await store.removeDoc(d.id);
                    setDocs(store.library());
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
