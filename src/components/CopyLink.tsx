'use client';

import { useEffect, useRef, useState } from 'react';
import { Copy, Check } from 'lucide-react';

/**
 * Zeigt die oeffentliche URL des Formulars und kopiert sie in die Zwischenablage.
 * Der Origin kommt erst im Browser dazu, deshalb wird er direkt im DOM ergaenzt
 * statt ueber State (verhindert Hydration-Mismatch und Kaskaden-Render).
 */
export default function CopyLink({ path }: { path: string }) {
  const labelRef = useRef<HTMLSpanElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (labelRef.current) labelRef.current.textContent = `${window.location.origin}${path}`;
  }, [path]);

  return (
    <button
      className="mt-0.5 flex items-center gap-1.5 text-xs text-muted hover:text-brand"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(`${window.location.origin}${path}`);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch { /* Zwischenablage nicht verfuegbar */ }
      }}
    >
      {copied ? <Check size={12} className="text-win" /> : <Copy size={12} />}
      <span ref={labelRef} className="truncate">{path}</span>
    </button>
  );
}
