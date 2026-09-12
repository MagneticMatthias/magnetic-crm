'use client';

import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { Modal } from '@/components/ui';
import DealForm, { type DealFormValues } from '@/components/DealForm';
import type { Contact, Profile, Stage } from '@/lib/types';

export default function DealDialog({
  action, stages, contacts, team, values, mode = 'create',
}: {
  action: (fd: FormData) => Promise<void>;
  stages: Stage[];
  contacts: Contact[];
  team: Profile[];
  values?: DealFormValues;
  mode?: 'create' | 'edit';
}) {
  const [open, setOpen] = useState(false);
  const isCreate = mode === 'create';

  return (
    <>
      <button className={isCreate ? 'btn-primary' : 'btn-ghost'} onClick={() => setOpen(true)}>
        {isCreate ? <><Plus size={16} /> Deal</> : <><Pencil size={15} /> Bearbeiten</>}
      </button>

      <Modal open={open} onClose={() => setOpen(false)}
             title={isCreate ? 'Neuer Deal' : 'Deal bearbeiten'} wide>
        <DealForm
          action={action}
          stages={stages}
          contacts={contacts}
          team={team}
          values={values}
          submitLabel={isCreate ? 'Deal anlegen' : 'Speichern'}
          onDone={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}
