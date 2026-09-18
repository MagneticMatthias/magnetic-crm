'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, LayoutList } from 'lucide-react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import RecordTable from '@/components/table/RecordTable';
import { StagesProvider } from '@/components/table/StagesContext';
import { DEAL_COLUMNS, DEAL_DEFAULT_COLUMNS } from '@/components/table/columns';
import DetailPanel from '@/components/DetailPanel';
import PanelConfigurator from '@/components/PanelConfigurator';
import { Modal } from '@/components/ui';
import DealForm from '@/components/DealForm';
import { DEAL_FIELDS } from '@/lib/filters';
import { saveFilter, deleteDeals } from '@/app/actions/records';
import { useViewing } from '@/lib/presence';
import { createDeal, reorderStages } from '@/app/actions/crm';
import type {
  ContactWithPersons, DealWithContact, FilterDefinition, Pipeline, Profile, SavedFilter, Stage,
} from '@/lib/types';

/** Ein Phasen-Reiter, per Ziehen verschiebbar; ein normaler Klick oeffnet ihn. */
function SortableTab({
  stage, active, count, href, onOpen,
}: { stage: Stage; active: boolean; count: number; href: string; onOpen: (href: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id });
  return (
    <button
      ref={setNodeRef} type="button" {...attributes} {...listeners}
      onClick={() => onOpen(href)}
      style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
      title="Klicken zum Öffnen, ziehen zum Umsortieren"
      className={`flex shrink-0 cursor-grab touch-none items-center gap-2 rounded-lg border px-3.5 py-2 text-[13px] transition active:cursor-grabbing ${
        active ? 'border-line bg-surface font-medium shadow-sm' : 'border-transparent text-muted hover:bg-surface-2'
      }`}
    >
      {stage.name}
      <span className="rounded-full px-1.5 py-0.5 text-[11px] font-medium"
            style={{ background: `${stage.color}22`, color: stage.color }}>
        {count}
      </span>
    </button>
  );
}

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

  // Reihenfolge der Reiter: sofort lokal, dann gespeichert. Ein Klick nach
  // einem Ziehen darf nicht navigieren, deshalb das Merkzeichen.
  const [order, setOrder] = useState(stages.map((s) => s.id));
  const [seen, setSeen] = useState(stages);
  if (seen !== stages) { setSeen(stages); setOrder(stages.map((s) => s.id)); }
  const gezogen = useRef(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const byId = new Map(stages.map((s) => [s.id, s]));
  const onDragEnd = (e: DragEndEvent) => {
    gezogen.current = true;
    setTimeout(() => { gezogen.current = false; }, 0);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = order.indexOf(String(active.id)), to = order.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const neu = arrayMove(order, from, to);
    setOrder(neu);
    void reorderStages(pipeline.id, neu);
  };
  const openTab = (href: string) => { if (!gezogen.current) router.push(href); };

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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order} strategy={horizontalListSortingStrategy}>
            {order.map((id) => {
              const s = byId.get(id);
              if (!s) return null;
              return (
                <SortableTab key={s.id} stage={s} active={s.id === stageId} count={counts[s.id] ?? 0}
                             href={tabHref(s.id)} onOpen={openTab} />
              );
            })}
          </SortableContext>
        </DndContext>
      </div>

      <StagesProvider value={stages}>
      <RecordTable
        rows={stageId ? rows.filter((d) => d.stage_id === stageId) : rows}
        columns={DEAL_COLUMNS}
        defaultColumns={DEAL_DEFAULT_COLUMNS}
        storageKey={`deals2:${pipeline.id}`}
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
      </StagesProvider>

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
