/** Platzhalter waehrend Daten laden - der Wechsel fuehlt sich sofort an. */
export default function Loading() {
  return (
    <div className="animate-pulse p-5 sm:p-7">
      <div className="mb-6 h-7 w-48 rounded-lg bg-surface-2" />
      <div className="card p-3">
        <div className="mb-3 flex gap-2">
          <div className="h-10 w-56 rounded-lg bg-surface-2" />
          <div className="h-10 w-24 rounded-lg bg-surface-2" />
          <div className="h-10 w-28 rounded-lg bg-surface-2" />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-4 border-t border-line py-3.5">
            <div className="h-4 w-4 rounded bg-surface-2" />
            <div className="h-4 w-24 rounded bg-surface-2" />
            <div className="h-4 w-28 rounded bg-surface-2" />
            <div className="h-4 w-40 rounded bg-surface-2" />
            <div className="h-4 w-32 rounded bg-surface-2" />
            <div className="h-4 w-36 rounded bg-surface-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
