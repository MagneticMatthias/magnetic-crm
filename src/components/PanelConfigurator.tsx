'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical, Minus, Plus, ChevronDown, ChevronUp, Info, Settings, Save, Columns3, LayoutList, Users, Coins,
} from 'lucide-react';
import { savePanelLayout } from '@/app/actions/records';
import { loadPanelLayout } from '@/app/actions/panel';
import { PANEL_CARDS, DEFAULT_PANEL_LAYOUT, type PanelCardKey } from '@/lib/panel-cards';

function CardRow({
  cardKey, onRemove,
}: { cardKey: PanelCardKey; onRemove: () => void }) {
  const def = PANEL_CARDS.find((c) => c.key === cardKey)!;
  const [open, setOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cardKey });
  const Icon = def.kind === 'deal' ? Coins : Users;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
      className="card flex items-center gap-3 px-3 py-3"
    >
      <button type="button" {...attributes} {...listeners}
              className="cursor-grab touch-none text-muted active:cursor-grabbing" aria-label="Verschieben">
        <GripVertical size={16} />
      </button>
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
        def.kind === 'deal' ? 'bg-brand-soft text-brand' : 'bg-win/15 text-win'
      }`}>
        <Icon size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{def.title}</p>
        {open && <p className="mt-0.5 text-xs text-win">{def.description}</p>}
      </div>
      <button type="button" onClick={onRemove}
              className="grid h-8 w-8 place-items-center rounded-lg border border-line text-lose hover:bg-lose/10"
              aria-label="Karte ausblenden">
        <Minus size={15} />
      </button>
      <button type="button" onClick={() => setOpen((o) => !o)}
              className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:bg-surface-2"
              aria-label="Beschreibung">
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
    </div>
  );
}

export default function PanelConfigurator({ onClose }: { onClose: () => void }) {
  const [active, setActive] = useState<PanelCardKey[]>(DEFAULT_PANEL_LAYOUT);
  const [busy, setBusy] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    let cancelled = false;
    loadPanelLayout().then((cards) => {
      if (!cancelled && cards?.length) setActive(cards as PanelCardKey[]);
    });
    return () => { cancelled = true; };
  }, []);

  const inactive = PANEL_CARDS.filter((c) => !active.includes(c.key));

  function onDragEnd(e: DragEndEvent) {
    const { active: a, over } = e;
    if (!over || a.id === over.id) return;
    setActive((list) => arrayMove(list, list.indexOf(a.id as PanelCardKey), list.indexOf(over.id as PanelCardKey)));
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="card flex max-h-[90vh] w-full max-w-4xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <aside className="w-52 shrink-0 border-r border-line bg-surface-2/40 p-3">
          <p className="mb-2 px-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Ansicht</p>
          <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted">
            <Columns3 size={15} /> Spalten
          </div>
          <div className="flex items-center gap-2.5 rounded-lg bg-surface px-2.5 py-2 text-sm font-medium shadow-sm">
            <LayoutList size={15} /> Deal-Ansicht
          </div>
          <p className="mt-3 px-2.5 text-[11px] text-muted">Spalten stellst du direkt über der Tabelle ein.</p>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto p-6">
            <p className="text-sm text-muted">Konfiguriere, welche Karten im Deal-Panel erscheinen und in welcher Reihenfolge.</p>
            <h2 className="mt-4 border-l-[3px] border-ink pl-3 text-lg font-semibold">Aktive Karten</h2>

            <div className="mt-4 flex items-center gap-3 rounded-xl bg-brand-soft px-4 py-3">
              <Info size={17} className="shrink-0 text-brand" />
              <p className="flex-1 text-sm text-brand">Felder und Karten kannst du in den Einstellungen bearbeiten.</p>
              <Link href="/einstellungen" className="btn-primary !py-1.5 text-[13px]">
                <Settings size={14} /> Einstellungen
              </Link>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={active} strategy={verticalListSortingStrategy}>
                <div className="mt-4 space-y-2.5">
                  {active.map((k) => (
                    <CardRow key={k} cardKey={k} onRemove={() => setActive((l) => l.filter((x) => x !== k))} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {inactive.length > 0 && (
              <>
                <h2 className="mt-8 border-l-[3px] border-line pl-3 text-lg font-semibold text-muted">Ausgeblendet</h2>
                <div className="mt-4 space-y-2.5">
                  {inactive.map((c) => (
                    <div key={c.key} className="card flex items-center gap-3 px-3 py-3 opacity-80">
                      <span className="w-4" />
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                        c.kind === 'deal' ? 'bg-brand-soft text-brand' : 'bg-win/15 text-win'
                      }`}>
                        {c.kind === 'deal' ? <Coins size={15} /> : <Users size={15} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{c.title}</p>
                        <p className="mt-0.5 text-xs text-muted">{c.description}</p>
                      </div>
                      <button type="button" onClick={() => setActive((l) => [...l, c.key])}
                              className="grid h-8 w-8 place-items-center rounded-lg border border-line text-win hover:bg-win/10"
                              aria-label="Karte einblenden">
                        <Plus size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
            <button type="button" className="btn-ghost !border-0" onClick={onClose}>Abbrechen</button>
            <button
              type="button"
              className="btn bg-win text-white hover:brightness-110"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try { await savePanelLayout(active); onClose(); } finally { setBusy(false); }
              }}
            >
              <Save size={15} /> {busy ? 'Speichern …' : 'Speichern'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
