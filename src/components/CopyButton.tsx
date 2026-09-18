'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

/** Kopiert einen Text in die Zwischenablage und zeigt kurz einen Haken. */
export default function CopyButton({ text, label = 'Kopieren', small }: { text: string; label?: string; small?: boolean }) {
  const [ok, setOk] = useState(false);

  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Ohne Clipboard-API (z. B. unsichere Verbindung): Auswahl-Trick
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setOk(true);
    setTimeout(() => setOk(false), 1500);
  };

  return (
    <button type="button" onClick={kopieren} title={ok ? 'Kopiert' : label} aria-label={label}
            className={`grid shrink-0 place-items-center rounded-md transition ${small ? 'h-6 w-6' : 'h-7 w-7'} ${
              ok ? 'text-win' : `${small ? 'text-muted/60' : 'text-muted'} hover:bg-surface-2 hover:text-ink`
            }`}>
      {ok ? <Check size={small ? 13 : 15} /> : <Copy size={small ? 13 : 15} />}
    </button>
  );
}
