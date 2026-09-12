'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import RecordTable from '@/components/table/RecordTable';
import { CONTACT_COLUMNS, CONTACT_DEFAULT_COLUMNS } from '@/components/table/columns';
import DetailPanel, { NewContactButton } from '@/components/DetailPanel';
import { CONTACT_FIELDS } from '@/lib/filters';
import { createContactQuick, saveFilter } from '@/app/actions/records';
import type { ContactWithPersons, FilterDefinition, SavedFilter } from '@/lib/types';
import { useViewing } from '@/lib/presence';

export default function ContactsView({
  rows, filter, savedFilters, initialOpen,
}: {
  rows: ContactWithPersons[];
  filter: FilterDefinition | null;
  savedFilters: SavedFilter[];
  initialOpen?: string | null;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(initialOpen ?? null);
  useViewing(openId);

  return (
    <>
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
