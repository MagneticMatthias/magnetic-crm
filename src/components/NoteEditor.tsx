'use client';

import { useRef, useState } from 'react';
import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered, Image as ImageIcon, Paperclip, X, FileText,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { PendingAttachment } from '@/app/actions/records';

type Pending = PendingAttachment & { preview?: string; uploading?: boolean };

const safeName = (n: string) => n.normalize('NFKD').replace(/[^\w.\-]+/g, '_').slice(0, 80);
const fmtSize = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

export default function NoteEditor({
  orgId, onSubmit, onCancel,
}: {
  orgId: string;
  onSubmit: (html: string, attachments: PendingAttachment[]) => Promise<void>;
  onCancel?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [empty, setEmpty] = useState(true);
  const [files, setFiles] = useState<Pending[]>([]);
  const [error, setError] = useState<string | null>(null);

  const exec = (cmd: string) => { ref.current?.focus(); document.execCommand(cmd, false); };

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    const supabase = createClient();
    for (const file of Array.from(list)) {
      if (file.size > 25 * 1024 * 1024) { setError(`${file.name}: größer als 25 MB`); continue; }
      const path = `${orgId}/${crypto.randomUUID()}-${safeName(file.name)}`;
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
      setFiles((f) => [...f, { path, name: file.name, size: file.size, mime: file.type || null, preview, uploading: true }]);
      const { error } = await supabase.storage.from('attachments').upload(path, file, { contentType: file.type || undefined });
      if (error) {
        setFiles((f) => f.filter((x) => x.path !== path));
        setError(`${file.name}: ${error.message}`);
      } else {
        setFiles((f) => f.map((x) => (x.path === path ? { ...x, uploading: false } : x)));
      }
    }
  }

  async function removeFile(p: Pending) {
    setFiles((f) => f.filter((x) => x.path !== p.path));
    await createClient().storage.from('attachments').remove([p.path]);
  }

  const canSubmit = (!empty || files.length > 0) && !files.some((f) => f.uploading) && !busy;

  const tool = (Icon: typeof Bold, cmd: string, label: string) => (
    <button key={cmd} type="button" onMouseDown={(e) => { e.preventDefault(); exec(cmd); }}
            className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface hover:text-ink"
            aria-label={label} title={label}>
      <Icon size={15} />
    </button>
  );

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-0.5 border-b border-line bg-surface-2/50 px-2 py-1.5">
        {tool(Bold, 'bold', 'Fett')}
        {tool(Italic, 'italic', 'Kursiv')}
        {tool(Underline, 'underline', 'Unterstrichen')}
        {tool(Strikethrough, 'strikeThrough', 'Durchgestrichen')}
        <span className="mx-1.5 h-4 w-px bg-line" />
        {tool(List, 'insertUnorderedList', 'Aufzählung')}
        {tool(ListOrdered, 'insertOrderedList', 'Nummerierung')}
        <span className="mx-1.5 h-4 w-px bg-line" />
        <button type="button" onClick={() => { if (fileInput.current) { fileInput.current.accept = 'image/*'; fileInput.current.click(); } }}
                className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface hover:text-ink"
                aria-label="Bild anhängen" title="Bild anhängen">
          <ImageIcon size={15} />
        </button>
        <button type="button" onClick={() => { if (fileInput.current) { fileInput.current.accept = ''; fileInput.current.click(); } }}
                className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface hover:text-ink"
                aria-label="Datei anhängen" title="Datei anhängen">
          <Paperclip size={15} />
        </button>
        <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      </div>

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={() => setEmpty(!ref.current?.textContent?.trim())}
        onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); addFiles(e.clipboardData.files); } }}
        onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } }}
        onDragOver={(e) => e.preventDefault()}
        className="min-h-[140px] px-4 py-3 text-sm outline-none [&_li]:ml-4 [&_ol]:list-decimal [&_ul]:list-disc"
      />

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-line px-3 py-2.5">
          {files.map((f) => (
            <div key={f.path} className={`relative flex items-center gap-2 rounded-lg border border-line bg-surface-2/60 p-1.5 pr-7 ${f.uploading ? 'opacity-60' : ''}`}>
              {f.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.preview} alt="" className="h-12 w-12 rounded object-cover" />
              ) : (
                <span className="grid h-12 w-12 place-items-center rounded bg-surface text-muted"><FileText size={18} /></span>
              )}
              <span className="max-w-[140px]">
                <span className="block truncate text-xs font-medium">{f.name}</span>
                <span className="block text-[11px] text-muted">{f.uploading ? 'Lädt hoch …' : fmtSize(f.size)}</span>
              </span>
              <button type="button" onClick={() => removeFile(f)} aria-label="Entfernen"
                      className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-surface text-muted hover:text-lose">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="border-t border-line px-4 py-2 text-xs text-lose">{error}</p>}

      <div className="flex items-center justify-end gap-2 border-t border-line px-3 py-2.5">
        <button type="button" className="btn-ghost !border-0" onClick={async () => {
          if (ref.current) ref.current.innerHTML = '';
          for (const f of files) await removeFile(f);
          setEmpty(true); setFiles([]);
          onCancel?.();
        }}>
          Abbrechen
        </button>
        <button
          type="button"
          className="btn bg-win text-white hover:brightness-110"
          disabled={!canSubmit}
          onClick={async () => {
            setBusy(true);
            try {
              await onSubmit(ref.current?.innerHTML ?? '', files.map(({ path, name, size, mime }) => ({ path, name, size, mime })));
              if (ref.current) ref.current.innerHTML = '';
              setEmpty(true); setFiles([]);
            } finally { setBusy(false); }
          }}
        >
          {busy ? 'Speichern …' : 'Notiz erstellen'}
        </button>
      </div>
    </div>
  );
}
