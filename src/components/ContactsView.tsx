'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import RecordTable from '@/components/table/RecordTable';
import { StagesProvider } from '@/components/table/StagesContext';
import { CONTACT_COLUMNS, CONTACT_DEFAULT_COLUMNS } from '@/components/table/columns';
import DetailPanel, { NewContactButton } from '@/components/DetailPanel';
import { CONTACT_FIELDS } from '@/lib/filters';
import { createContactQuick, saveFilter, deleteContacts } from '@/app/actions/records';
import type { ContactWithPersons, FilterDefinition, SavedFilter, Stage } from '@/lib/types';
import { useViewing } from '@/lib/presence';

export default function ContactsView({
  rows, filter, savedFilters, stages, initialOpen,
}: {
  rows: ContactWithPersons[];
  filter: FilterDefinition | null;
  savedFilters: SavedFilter[];
  stages: Stage[];
  initialOpen?: string | null;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(initialOpen ?? null);
  useViewing(openId);

  return (
    <>
      <StagesProvider value={stages}>
      <RecordTable
        rows={rows}
        columns={CONTACT_COLUMNS}
        defaultColumns={CONTACT_DEFAULT_COLUMNS}
        storageKey="contacts"
        fields={CONTACT_FIELDS}
        filter={filter}
        savedFilters={savedFilters}
        onSaveFilter={(name, def) => saveFilter('contacts', name, def)}
        onRowClick={(row) => setOpenId(row.id)}
        onDeleteSelected={deleteContacts}
        deleteLabel="Kontakte (inkl. Deals und Notizen)"
        activeId={openId}
        emptyText="Keine Kontakte gefunden."
        toolbarRight={
          <NewContactButton onCreate={async (fd) => {
            const id = await createContactQuick(fd);
            setOpenId(id);
            router.refresh();
            return id;
          }} />
        }
      />
      </StagesProvider>

      {openId && (
        <DetailPanel
          key={openId}
          contactId={openId}
          onClose={() => { setOpenId(null); router.refresh(); }}
          onDeleted={() => router.refresh()}
        />
      )}
    </>
  );
}
