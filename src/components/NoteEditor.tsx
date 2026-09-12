'use client';

import { useRef, useState } from 'react';
import { Bold, Italic, Underline, Strikethrough, List, ListOrdered, Image as ImageIcon } from 'lucide-react';

export default function NoteEditor({
  onSubmit, onCancel,
}: { onSubmit: (html: string) => Promise<void>; onCancel?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [empty, setEmpty] = useState(true);

  const exec = (cmd: string, value?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, value);
  };

  const tools = [
    { icon: Bold, cmd: 'bold', label: 'Fett' },
    { icon: Italic, cmd: 'italic', label: 'Kursiv' },
    { icon: Underline, cmd: 'underline', label: 'Unterstrichen' },
    { icon: Strikethrough, cmd: 'strikeThrough', label: 'Durchgestrichen' },
  ];

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-0.5 border-b border-line bg-surface-2/50 px-2 py-1.5">
        {tools.map(({ icon: Icon, cmd, label }) => (
          <button key={cmd} type="button" onMouseDown={(e) => { e.preventDefault(); exec(cmd); }}
                  className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface hover:text-ink"
                  aria-label={label} title={label}>
            <Icon size={15} />
          </button>
        ))}
        <span className="mx-1.5 h-4 w-px bg-line" />
        <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('insertUnorderedList'); }}
                className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface hover:text-ink"
                aria-label="Aufzählung" title="Aufzählung">
          <List size={15} />
        </button>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); exec('insertOrderedList'); }}
                className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface hover:text-ink"
                aria-label="Nummerierung" title="Nummerierung">
          <ListOrdered size={15} />
        </button>
        <span className="mx-1.5 h-4 w-px bg-line" />
        <button type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  const url = window.prompt('Bild-URL (https://…)');
                  if (url && /^https?:\/\//i.test(url)) exec('insertImage', url);
                }}
                className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface hover:text-ink"
                aria-label="Bild einfügen" title="Bild einfügen">
          <ImageIcon size={15} />
        </button>
      </div>

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={() => setEmpty(!ref.current?.textContent?.trim() && !ref.current?.querySelector('img'))}
        className="min-h-[140px] px-4 py-3 text-sm outline-none [&_li]:ml-4 [&_ol]:list-decimal [&_ul]:list-disc [&_img]:max-h-48 [&_img]:rounded-md"
        data-placeholder="Notiz schreiben …"
      />

      <div className="flex items-center justify-end gap-2 border-t border-line px-3 py-2.5">
        <button type="button" className="btn-ghost !border-0" onClick={() => {
          if (ref.current) ref.current.innerHTML = '';
          setEmpty(true);
          onCancel?.();
        }}>
          Abbrechen
        </button>
        <button
          type="button"
          className="btn bg-win text-white hover:brightness-110"
          disabled={busy || empty}
          onClick={async () => {
            const html = ref.current?.innerHTML ?? '';
            setBusy(true);
            try {
              await onSubmit(html);
              if (ref.current) ref.current.innerHTML = '';
              setEmpty(true);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Speichern …' : 'Notiz erstellen'}
        </button>
      </div>
    </div>
  );
}
