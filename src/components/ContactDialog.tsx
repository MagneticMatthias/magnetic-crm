'use client';

import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { Modal } from '@/components/ui';
import ContactForm from '@/components/ContactForm';
import type { Contact, Profile } from '@/lib/types';

export default function ContactDialog({
  action, team, values, mode = 'create',
}: {
  action: (fd: FormData) => Promise<void>;
  team: Profile[];
  values?: Partial<Contact>;
  mode?: 'create' | 'edit';
}) {
  const [open, setOpen] = useState(false);
  const isCreate = mode === 'create';

  return (
    <>
      <button className={isCreate ? 'btn-primary' : 'btn-ghost'} onClick={() => setOpen(true)}>
        {isCreate ? <><Plus size={16} /> Kontakt</> : <><Pencil size={15} /> Bearbeiten</>}
      </button>

      <Modal open={open} onClose={() => setOpen(false)}
             title={isCreate ? 'Neuer Kontakt' : 'Kontakt bearbeiten'} wide>
        <ContactForm
          action={action}
          team={team}
          values={values}
          submitLabel={isCreate ? 'Kontakt anlegen' : 'Speichern'}
          redirectToDetail={isCreate}
          onDone={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}
