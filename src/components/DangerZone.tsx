'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, AlertTriangle } from 'lucide-react';
import { deleteAllData } from '@/app/actions/import';

export default function DangerZone() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <section className="card border-lose/40 p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-lose">
        <AlertTriangle size={16} /> Gefahrenzone
      </h2>
      <p className="mt-1 text-xs text-muted">
        Löscht alle Kontakte, Deals, Aktivitäten, Notizen und Aufgaben – z. B. um die Beispieldaten
        loszuwerden. Pipelines, Team und Einstellungen bleiben. Nicht rückgängig zu machen.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <label className="label" htmlFor="dz-confirm">Zur Bestätigung <code>ALLES LÖSCHEN</code> eintippen</label>
          <input id="dz-confirm" className="input" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <button
          type="button"
          className="btn-danger"
          disabled={busy || text !== 'ALLES LÖSCHEN'}
          onClick={async () => {
            setBusy(true);
            const r = await deleteAllData(text);
            setMsg(r.message);
            setBusy(false);
            if (r.ok) { setText(''); router.refresh(); }
          }}
        >
          <Trash2 size={15} /> {busy ? 'Löschen …' : 'Alle Daten löschen'}
        </button>
      </div>
      {msg && <p className="mt-3 text-sm">{msg}</p>}
    </section>
  );
}
