'use client';

import { useState } from 'react';
import type { Profile } from '@/lib/types';

export default function TaskComposer({
  action, dealId, contactId, team,
}: {
  action: (fd: FormData) => Promise<void>;
  dealId?: string;
  contactId?: string;
  team?: Profile[];
}) {
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(0);

  return (
    <form
      key={key}
      action={async (fd) => {
        setBusy(true);
        try { await action(fd); setKey((k) => k + 1); } finally { setBusy(false); }
      }}
      className="card space-y-3 p-4"
    >
      {dealId && <input type="hidden" name="deal_id" value={dealId} />}
      {contactId && <input type="hidden" name="contact_id" value={contactId} />}

      <div>
        <label className="label" htmlFor="task-title">Neue Aufgabe</label>
        <input id="task-title" name="title" className="input" required placeholder="z. B. Angebot nachfassen" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="due_at">Fällig am</label>
          <input id="due_at" name="due_at" type="datetime-local" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="priority">Priorität</label>
          <select id="priority" name="priority" className="input" defaultValue="2">
            <option value="1">Hoch</option>
            <option value="2">Mittel</option>
            <option value="3">Niedrig</option>
          </select>
        </div>
        {team && (
          <div>
            <label className="label" htmlFor="assignee_id">Zuständig</label>
            <select id="assignee_id" name="assignee_id" className="input" defaultValue="">
              <option value="">ich</option>
              {team.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
            </select>
          </div>
        )}
      </div>

      <button className="btn-ghost" disabled={busy}>{busy ? 'Anlegen …' : 'Aufgabe anlegen'}</button>
    </form>
  );
}
