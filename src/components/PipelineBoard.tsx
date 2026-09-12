'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  DndContext, DragOverlay, PointerSensor, closestCorners,
  useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Phone, Building2 } from 'lucide-react';
import { eur, contactName, dateOnly } from '@/lib/format';
import { Modal } from '@/components/ui';
import DealForm from '@/components/DealForm';
import type { Contact, DealWithContact, Profile, Stage } from '@/lib/types';

type Props = {
  stages: Stage[];
  deals: DealWithContact[];
  contacts: Contact[];
  team: Profile[];
  moveDeal: (dealId: string, stageId: string, position: number) => Promise<void>;
  createDeal: (fd: FormData) => Promise<void>;
};

function DealCard({ deal, dragging }: { deal: DealWithContact; dragging?: boolean }) {
  return (
    <div className={`card p-3 ${dragging ? 'shadow-xl rotate-2' : 'hover:border-brand/50'} transition`}>
      <div className="flex items-start justify-between gap-2">
        <Link href={`/deals/${deal.id}`} className="text-sm font-medium leading-snug hover:text-brand"
              onClick={(e) => e.stopPropagation()}>
          {deal.title}
        </Link>
        <span className="shrink-0 text-sm font-semibold tabular-nums">{eur(deal.value)}</span>
      </div>

      <div className="mt-2 space-y-1 text-xs text-muted">
        {deal.contact && (
          <div className="flex items-center gap-1.5 truncate">
            <Building2 size={12} className="shrink-0" />
            <span className="truncate">{contactName(deal.contact)}</span>
          </div>
        )}
        {deal.contact?.phone && (
          <div className="flex items-center gap-1.5">
            <Phone size={12} className="shrink-0" />
            <a href={`tel:${deal.contact.phone}`} className="hover:text-brand"
               onClick={(e) => e.stopPropagation()}>{deal.contact.phone}</a>
          </div>
        )}
        {deal.expected_close_date && <div>Abschluss: {dateOnly(deal.expected_close_date)}</div>}
        {deal.next_step && <div className="truncate italic">→ {deal.next_step}</div>}
      </div>
    </div>
  );
}

function SortableDeal({ deal }: { deal: DealWithContact }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: deal.id, data: { stageId: deal.stage_id } });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      {...listeners}
      className="touch-none cursor-grab active:cursor-grabbing"
    >
      <DealCard deal={deal} />
    </div>
  );
}

function Column({
  stage, deals, onAdd,
}: { stage: Stage; deals: DealWithContact[]; onAdd: (stageId: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, data: { stageId: stage.id } });
  const sum = deals.reduce((acc, d) => acc + Number(d.value || 0), 0);

  return (
    <div className="flex w-[300px] shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: stage.color }} />
        <span className="truncate text-sm font-medium">{stage.name}</span>
        <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">{deals.length}</span>
        <span className="ml-auto text-xs tabular-nums text-muted">{eur(sum)}</span>
      </div>

      <div
        ref={setNodeRef}
        className={`flex min-h-[140px] flex-1 flex-col gap-2 rounded-xl border border-dashed p-2 transition
                    ${isOver ? 'border-brand bg-brand-soft/50' : 'border-line bg-surface-2/40'}`}
      >
        <SortableContext items={deals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
          {deals.map((d) => <SortableDeal key={d.id} deal={d} />)}
        </SortableContext>

        <button
          onClick={() => onAdd(stage.id)}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-line py-2 text-xs text-muted hover:border-brand hover:text-brand"
        >
          <Plus size={13} /> Deal
        </button>
      </div>
    </div>
  );
}

export default function PipelineBoard({
  stages, deals, contacts, team, moveDeal, createDeal,
}: Props) {
  const [items, setItems] = useState(deals);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addStage, setAddStage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Nach einem Server-Revalidate die frischen Daten uebernehmen
  const serverKey = deals.map((d) => `${d.id}:${d.stage_id}:${d.position}`).join('|');
  const lastServerKey = useRef(serverKey);
  useEffect(() => {
    if (lastServerKey.current !== serverKey) {
      lastServerKey.current = serverKey;
      setItems(deals);
    }
  }, [serverKey, deals]);

  const byStage = useMemo(() => {
    const map = new Map<string, DealWithContact[]>();
    stages.forEach((s) => map.set(s.id, []));
    items.forEach((d) => map.get(d.stage_id)?.push(d));
    map.forEach((list) => list.sort((a, b) => a.position - b.position));
    return map;
  }, [items, stages]);

  const active = items.find((d) => d.id === activeId) ?? null;

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;

    const dealId = String(active.id);
    const overId = String(over.id);
    const targetStage = stages.find((s) => s.id === overId)?.id
      ?? items.find((d) => d.id === overId)?.stage_id;
    if (!targetStage) return;

    const current = items.find((d) => d.id === dealId);
    if (!current) return;

    const targetList = (byStage.get(targetStage) ?? []).filter((d) => d.id !== dealId);
    const overIndex = targetList.findIndex((d) => d.id === overId);
    const position = overIndex >= 0 ? overIndex : targetList.length;

    if (current.stage_id === targetStage && current.position === position) return;

    setItems((prev) =>
      prev.map((d) => (d.id === dealId ? { ...d, stage_id: targetStage, position } : d)),
    );
    startTransition(async () => { await moveDeal(dealId, targetStage, position); });
  }

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCorners}
                  onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto px-4 pb-6 pt-4 sm:px-6">
          {stages.map((s) => (
            <Column key={s.id} stage={s} deals={byStage.get(s.id) ?? []} onAdd={setAddStage} />
          ))}
        </div>

        <DragOverlay>{active ? <DealCard deal={active} dragging /> : null}</DragOverlay>
      </DndContext>

      <Modal open={!!addStage} onClose={() => setAddStage(null)} title="Neuer Deal">
        {addStage && (
          <DealForm
            action={createDeal}
            stages={stages}
            contacts={contacts}
            team={team}
            values={{ stage_id: addStage }}
            submitLabel="Deal anlegen"
            onDone={() => setAddStage(null)}
          />
        )}
      </Modal>
    </>
  );
}
