import type { Zahlen } from '@/lib/akquise';
import { pct } from '@/lib/format';

/** Eine Zahl mit Vergleich zum vorigen Zeitraum - auf dem Handy kompakt. */
function Kachel({ label, wert, vor, farbe, gross }: {
  label: string; wert: number; vor: number; farbe?: string; gross?: boolean;
}) {
  const diff = wert - vor;
  return (
    <div className={`rounded-xl border border-line bg-surface px-3 py-2.5 sm:p-3.5 ${gross ? 'col-span-2' : ''}`}>
      <div className="flex items-center gap-1.5 truncate text-[11px] font-medium text-muted sm:text-xs">
        {farbe && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: farbe }} />}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className={`font-semibold tabular-nums ${gross ? 'text-3xl sm:text-4xl' : 'text-xl sm:text-2xl'}`}>{wert}</span>
        {diff !== 0 && (
          <span className={`text-xs tabular-nums ${diff > 0 ? 'text-win' : 'text-lose'}`}>{diff > 0 ? '+' : ''}{diff}</span>
        )}
      </div>
      <div className="hidden text-xs text-muted sm:block">vorher {vor}</div>
    </div>
  );
}

export default function AkquiseKacheln({ j, v, vergleich, schnitt }: {
  j: Zahlen; v: Zahlen; vergleich: string; schnitt: number;
}) {
  const ans = (x: Zahlen) => x.inmail + x.anfrage + x.email + x.anrufe;
  const nachrichten = j.inmail + j.anfrage + j.email;
  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Angesprochen</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6">
          <Kachel gross label="Ansprachen gesamt" wert={ans(j)} vor={ans(v)} />
          <Kachel label="InMails" wert={j.inmail} vor={v.inmail} farbe="var(--kanal-linkedin)" />
          <Kachel label="Kontaktanfragen" wert={j.anfrage} vor={v.anfrage} farbe="var(--kanal-linkedin)" />
          <Kachel label="E-Mails" wert={j.email} vor={v.email} farbe="var(--kanal-mail)" />
          <Kachel label="Anrufe" wert={j.anrufe} vor={v.anrufe} farbe="var(--kanal-anruf)" />
        </div>
        <p className="mt-1.5 text-xs text-muted">
          Vergleich: {vergleich} · Ø {schnitt.toLocaleString('de-DE', { maximumFractionDigits: 1 })} pro Arbeitstag
          {j.anrufe > 0 && <> · {j.erreicht} von {j.anrufe} Anrufen erreicht</>}
        </p>
      </div>

      <div>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Ergebnis</h3>
        <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-6">
          <Kachel label="Antworten" wert={j.antworten} vor={v.antworten} />
          <Kachel label="Interesse" wert={j.interesse} vor={v.interesse} />
          <Kachel label="Nicht jetzt" wert={j.nichtJetzt} vor={v.nichtJetzt} />
          <Kachel label="Kein Interesse" wert={j.keinInteresse} vor={v.keinInteresse} />
          <Kachel label="Neue Fäden" wert={j.neueFaeden} vor={v.neueFaeden} />
          <Kachel label="Aufträge" wert={j.auftraege} vor={v.auftraege} />
        </div>
        <p className="mt-1.5 text-xs text-muted">
          {nachrichten
            ? <>Antwortquote {pct((j.antworten / nachrichten) * 100)} auf {nachrichten} Nachrichten</>
            : 'Noch keine Nachrichten in diesem Zeitraum.'}
        </p>
      </div>
    </div>
  );
}
