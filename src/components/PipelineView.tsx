'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, LayoutList } from 'lucide-react';
import RecordTable from '@/components/table/RecordTable';
import { DEAL_COLUMNS, DEAL_DEFAULT_COLUMNS } from '@/components/table/columns';
import DetailPanel from '@/components/DetailPanel';
import PanelConfigurator from '@/components/PanelConfigurator';
import { Modal } from '@/components/ui';
import DealForm from '@/components/DealForm';
import { DEAL_FIELDS } from '@/lib/filters';
import { saveFilter, deleteDeals } from '@/app/actions/records';
import { useViewing } from '@/lib/presence';
import { createDeal } from '@/app/actions/crm';
import type {
  ContactWithPersons, DealWithContact, FilterDefinition, Pipeline, Profile, SavedFilter, Stage,
} from '@/lib/types';

export default function PipelineView({
  pipeline, stages, stageId, counts, rows, filter, savedFilters, contacts, team, initialOpen,
}: {
  pipeline: Pipeline;
  stages: Stage[];
  stageId: string | null;
  counts: Record<string, number>;
  rows: DealWithContact[];
  filter: FilterDefinition | null;
  savedFilters: SavedFilter[];
  contacts: ContactWithPersons[];
  team: Profile[];
  initialOpen?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<{ contactId: string; dealId: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const initialContact = initialOpen ?? null;
  useViewing(open?.dealId ?? null);

  const tabHref = (id: string | null) => `/pipelines?p=${pipeline.id}${id ? `&s=${id}` : ''}`;

  return (
    <>
      <div className="mb-3 flex gap-1 overflow-x-auto pb-1">
        <Link
          href={tabHref(null)}
          className={`shrink-0 rounded-lg border px-3.5 py-2 text-[13px] transition ${
            !stageId ? 'border-line bg-surface font-medium shadow-sm' : 'border-transparent text-muted hover:bg-surface-2'
          }`}
        >
          Alle <span className="ml-1 rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">{rows.length}</span>
        </Link>
        {stages.map((s) => {
          const active = s.id === stageId;
          return (
            <Link
              key={s.id}
              href={tabHref(s.id)}
              className={`flex shrink-0 items-center gap-2 rounded-lg border px-3.5 py-2 text-[13px] transition ${
                active ? 'border-line bg-surface font-medium shadow-sm' : 'border-transparent text-muted hover:bg-surface-2'
              }`}
            >
              {s.name}
              <span className="rounded-full px-1.5 py-0.5 text-[11px] font-medium"
                    style={{ background: `${s.color}22`, color: s.color }}>
                {counts[s.id] ?? 0}
              </span>
            </Link>
          );
        })}
      </div>

      <RecordTable
        rows={stageId ? rows.filter((d) => d.stage_id === stageId) : rows}
        columns={DEAL_COLUMNS}
        defaultColumns={DEAL_DEFAULT_COLUMNS}
        storageKey={`deals:${pipeline.id}`}
        fields={DEAL_FIELDS}
        filter={filter}
        savedFilters={savedFilters}
        onSaveFilter={(name, def) => saveFilter('deals', name, def)}
        onRowClick={(row) => row.contact_id && setOpen({ contactId: row.contact_id, dealId: row.id })}
        onDeleteSelected={deleteDeals}
        deleteLabel="Deals"
        activeId={null}
        emptyText="Keine Deals in dieser Phase."
        toolbarRight={
          <>
            <button type="button" className="btn-ghost" onClick={() => setConfiguring(true)}>
              <LayoutList size={15} /> Deal-Ansicht
            </button>
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> Deal hinzufügen
            </button>
          </>
        }
      />

      <Modal open={creating} onClose={() => setCreating(false)} title="Neuer Deal" wide>
        <DealForm
          action={async (fd) => { await createDeal(fd); router.refresh(); }}
          stages={stages}
          contacts={contacts}
          team={team}
          values={{ stage_id: stageId ?? stages[0]?.id }}
          submitLabel="Deal anlegen"
          onDone={() => setCreating(false)}
        />
      </Modal>

      {configuring && <PanelConfigurator onClose={() => setConfiguring(false)} />}

      {(open || initialContact) && (
        <DetailPanel
          key={open?.dealId ?? initialContact}
          contactId={open?.contactId ?? initialContact!}
          dealId={open?.dealId ?? null}
          onClose={() => { setOpen(null); router.replace(`/pipelines?p=${pipeline.id}${stageId ? `&s=${stageId}` : ''}`); router.refresh(); }}
          onDeleted={() => router.refresh()}
        />
      )}
    </>
  );
}
