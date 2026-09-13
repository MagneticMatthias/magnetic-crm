'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Search, Filter as FilterIcon, ChevronUp, ChevronDown, Pencil, Plus, Trash2, GripVertical, ArrowUp, ArrowDown,
} from 'lucide-react';
import FilterBuilder from '@/components/FilterBuilder';
import ColumnPicker from './ColumnPicker';
import type { ColumnDef } from './columns';
import { countRules, type FieldDef } from '@/lib/filters';
import type { FilterDefinition, SavedFilter } from '@/lib/types';
import { usePresence } from '@/lib/presence';
import { initials } from '@/lib/format';

type Layout = { order: string[]; widths: Record<string, number>; sort: { key: string; dir: 'asc' | 'desc' } | null };

type Props<T extends { id: string }> = {
  rows: T[];
  columns: ColumnDef<T>[];
  defaultColumns: string[];
  storageKey: string;
  fields: FieldDef[];
  filter: FilterDefinition | null;
  savedFilters: SavedFilter[];
  onSaveFilter: (name: string, def: FilterDefinition) => Promise<void>;
  onRowClick: (row: T) => void;
  onDeleteSelected?: (ids: string[]) => Promise<void>;
  deleteLabel?: string;
  activeId?: string | null;
  emptyText?: string;
  toolbarRight?: React.ReactNode;
};

const MIN_W = 70;

/** Spaltenkopf: sortierbar per Klick, verschiebbar am Griff, Breite am rechten Rand ziehbar. */
function HeaderCell<T>({
  col, width, sort, onSort, onResize,
}: {
  col: ColumnDef<T>;
  width: number;
  sort: Layout['sort'];
  onSort: () => void;
  onResize: (w: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.key });
  const active = sort?.key === col.key;

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = width;
    const move = (ev: PointerEvent) => onResize(Math.max(MIN_W, startW + ev.clientX - startX));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <th
      ref={setNodeRef}
      style={{ width, minWidth: width, maxWidth: width, transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="group relative select-none px-0 py-0 text-left"
    >
      <div className="flex items-center gap-1 pr-2">
        <button type="button" {...attributes} {...listeners}
                className="cursor-grab touch-none px-1 py-3 text-muted/40 hover:text-muted active:cursor-grabbing"
                aria-label="Spalte verschieben" title="Ziehen zum Verschieben">
          <GripVertical size={13} />
        </button>
        <button type="button" onClick={onSort}
                className={`flex min-w-0 flex-1 items-center gap-1 py-3 text-left text-[13px] font-medium hover:text-brand ${active ? 'text-brand' : 'text-ink/80'}`}
                title="Klicken zum Sortieren">
          <span className="truncate">{col.label}</span>
          {active && (sort!.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
        </button>
      </div>
      <div onPointerDown={startResize}
           className="absolute right-0 top-0 h-full w-2 cursor-col-resize border-r border-transparent hover:border-brand"
           title="Breite ändern" />
    </th>
  );
}

export default function RecordTable<T extends { id: string }>({
  rows, columns, defaultColumns, storageKey, fields, filter, savedFilters,
  onSaveFilter, onRowClick, onDeleteSelected, deleteLabel = 'Datensätze', activeId,
  emptyText = 'Keine Datensätze.', toolbarRight,
}: Props<T>) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [deleting, setDeleting] = useState(false);
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [filterOpen, setFilterOpen] = useState<'closed' | 'menu' | 'builder'>('closed');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [layout, setLayout] = useState<Layout>({ order: defaultColumns, widths: {}, sort: null });
  const loaded = useRef(false);
  const others = usePresence();
  const viewerOf = (id: string) => others.find((o) => o.viewing === id) ?? null;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Layout je Tabelle im Browser merken
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`layout:${storageKey}`);
      if (raw) {
        const parsed = JSON.parse(raw) as Layout;
        if (Array.isArray(parsed.order) && parsed.order.length) queueMicrotask(() => setLayout(parsed));
      }
    } catch { /* localStorage nicht verfuegbar */ }
    loaded.current = true;
  }, [storageKey]);

  const update = (patch: Partial<Layout>) =>
    setLayout((l) => {
      const next = { ...l, ...patch };
      try { localStorage.setItem(`layout:${storageKey}`, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.push(`${pathname}?${next.toString()}`);
  };

  useEffect(() => {
    const t = setTimeout(() => { if ((params.get('q') ?? '') !== query) setParam('q', query || null); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const byKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);
  const shown = useMemo(() => layout.order.map((k) => byKey.get(k)).filter(Boolean) as ColumnDef<T>[], [layout.order, byKey]);
  const widthOf = (c: ColumnDef<T>) => layout.widths[c.key] ?? c.width ?? 160;

  const sorted = useMemo(() => {
    const s = layout.sort;
    if (!s) return rows;
    const col = byKey.get(s.key);
    if (!col?.sortValue) return rows;
    const dir = s.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = col.sortValue!(a), vb = col.sortValue!(b);
      const ea = va === null || va === undefined || va === '', eb = vb === null || vb === undefined || vb === '';
      if (ea && eb) return 0;
      if (ea) return 1;          // Leere immer ans Ende
      if (eb) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), 'de', { numeric: true, sensitivity: 'base' }) * dir;
    });
  }, [rows, layout.sort, byKey]);

  const toggleSort = (key: string) =>
    update({ sort: layout.sort?.key === key ? (layout.sort.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' } });

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = layout.order.indexOf(String(active.id)), to = layout.order.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    update({ order: arrayMove(layout.order, from, to) });
  };

  const activeRules = countRules(filter);
  const allSelected = sorted.length > 0 && sorted.every((r) => selected.has(r.id));
  const totalWidth = 44 + shown.reduce((a, c) => a + widthOf(c), 0);

  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <div className="relative w-full sm:w-56">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Suche" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        <div className="relative">
          <button type="button" className={`btn-ghost ${activeRules ? '!border-brand !text-brand' : ''}`}
                  onClick={() => setFilterOpen((s) => (s === 'closed' ? 'menu' : 'closed'))}>
            <FilterIcon size={15} /> Filter
            {activeRules > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] text-white">{activeRules}</span>}
            {filterOpen === 'closed' ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>

          {filterOpen === 'menu' && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setFilterOpen('closed')} />
              <div className="card absolute left-0 z-20 mt-1.5 w-64 p-1.5 shadow-xl">
                {savedFilters.map((f) => (
                  <button key={f.id} type="button"
                          onClick={() => { setParam('filter', encodeURIComponent(JSON.stringify(f.definition))); setFilterOpen('closed'); }}
                          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-2">
                    <FilterIcon size={13} className="text-muted" />
                    <span className="flex-1 truncate">{f.name}</span>
                    <Pencil size={12} className="text-muted" />
                  </button>
                ))}
                {activeRules > 0 && (
                  <button type="button" onClick={() => { setParam('filter', null); setFilterOpen('closed'); }}
                          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-lose hover:bg-lose/10">
                    Filter aufheben
                  </button>
                )}
                <button type="button" onClick={() => setFilterOpen('builder')}
                        className="mt-1 flex w-full items-center gap-2 rounded-md border-t border-line px-2.5 py-2 text-left text-[13px] hover:bg-surface-2">
                  <Plus size={13} /> Neuer Filter
                </button>
              </div>
            </>
          )}

          {filterOpen === 'builder' && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setFilterOpen('closed')} />
              <div className="fixed inset-x-4 top-20 z-20 sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-1.5">
                <FilterBuilder fields={fields} value={filter} savedFilters={savedFilters}
                               onApply={(def) => setParam('filter', encodeURIComponent(JSON.stringify(def)))}
                               onReset={() => setParam('filter', null)} onSave={onSaveFilter}
                               onClose={() => setFilterOpen('closed')} />
              </div>
            </>
          )}
        </div>

        <ColumnPicker columns={columns} visible={layout.order}
                      onChange={(keys) => update({ order: keys })} />

        {layout.sort && (
          <button type="button" className="chip bg-brand-soft text-brand" onClick={() => update({ sort: null })}
                  title="Sortierung aufheben">
            Sortiert: {byKey.get(layout.sort.key)?.label} {layout.sort.dir === 'asc' ? '↑' : '↓'} ×
          </button>
        )}

        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-muted">{selected.size} ausgewählt</span>
            {onDeleteSelected && (
              <button type="button" className="btn-danger !py-1.5 text-[13px]" disabled={deleting}
                      onClick={async () => {
                        if (!window.confirm(`${selected.size} ${deleteLabel} endgültig löschen?`)) return;
                        setDeleting(true);
                        try { await onDeleteSelected([...selected]); setSelected(new Set()); router.refresh(); }
                        finally { setDeleting(false); }
                      }}>
                <Trash2 size={14} /> {deleting ? 'Löschen …' : 'Löschen'}
              </button>
            )}
          </div>
        )}

        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">{toolbarRight}</div>
      </div>

      <div className="overflow-x-auto">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <table className="table-fixed border-collapse" style={{ width: totalWidth, minWidth: '100%' }}>
            <thead className="bg-surface-2/60">
              <tr>
                <th className="w-11 px-3 py-2.5" style={{ width: 44 }}>
                  <input type="checkbox" checked={allSelected} aria-label="Alle auswählen"
                         onChange={() => setSelected(allSelected ? new Set() : new Set(sorted.map((r) => r.id)))} />
                </th>
                <SortableContext items={layout.order} strategy={horizontalListSortingStrategy}>
                  {shown.map((c) => (
                    <HeaderCell key={c.key} col={c} width={widthOf(c)} sort={layout.sort}
                                onSort={() => toggleSort(c.key)}
                                onResize={(w) => update({ widths: { ...layout.widths, [c.key]: w } })} />
                  ))}
                </SortableContext>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={shown.length + 1} className="px-4 py-14 text-center text-sm text-muted">{emptyText}</td></tr>
              )}
              {sorted.map((row) => {
                const viewer = viewerOf(row.id);
                return (
                  <tr key={row.id} onClick={() => onRowClick(row)}
                      title={viewer ? `${viewer.name} hat diesen Datensatz gerade geöffnet` : undefined}
                      style={viewer ? { background: `${viewer.color}14` } : undefined}
                      className={`cursor-pointer border-t border-line transition hover:bg-surface-2/50 ${activeId === row.id ? 'bg-brand-soft/40' : ''}`}>
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      {viewer ? (
                        <span className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-semibold text-white"
                              style={{ background: viewer.color }}>{initials(viewer.name)}</span>
                      ) : (
                        <input type="checkbox" checked={selected.has(row.id)} aria-label="Zeile auswählen"
                               onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(row.id)) n.delete(row.id); else n.add(row.id); return n; })} />
                      )}
                    </td>
                    {shown.map((c) => (
                      <td key={c.key} className="td overflow-hidden text-ellipsis whitespace-nowrap text-[13px]"
                          style={{ width: widthOf(c), maxWidth: widthOf(c) }}>
                        {c.render(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </DndContext>
      </div>
    </div>
  );
}
