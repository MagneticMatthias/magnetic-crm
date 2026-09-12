'use client';

import { Phone } from 'lucide-react';
import { DIAL_SCHEMES, setDialScheme, useDialScheme } from '@/lib/dial';

export default function DialSettings() {
  const scheme = useDialScheme();

  return (
    <section className="card p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><Phone size={15} /> Telefon-App</h2>
      <p className="mt-1 text-xs text-muted">
        Welche App beim Klick auf eine Nummer aufgeht, legt dein Betriebssystem fest
        (Mac: FaceTime → Einstellungen → „Standard für Anrufe“). Reagiert deine App nicht auf
        <code> tel:</code>, hier das Schema wechseln. Gilt nur für diesen Browser.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {DIAL_SCHEMES.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setDialScheme(s.value)}
            className={`rounded-lg border px-3 py-2.5 text-left transition ${
              scheme === s.value ? 'border-brand bg-brand-soft' : 'border-line hover:bg-surface-2'
            }`}
          >
            <span className="block text-sm font-medium">{s.label}</span>
            <span className="block text-xs text-muted">{s.hint}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">
        Test: <a href={`${scheme}:+4930123456`} className="text-brand hover:underline">+49 30 123456 anrufen</a>
      </p>
    </section>
  );
}
