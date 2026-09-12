'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Search, Filter as FilterIcon, ChevronUp, ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react';
import FilterBuilder from '@/components/FilterBuilder';
import ColumnPicker from './ColumnPicker';
import type { ColumnDef } from './columns';
import { countRules, type FieldDef } from '@/lib/filters';
import type { FilterDefinition, SavedFilter } from '@/lib/types';
import { usePresence } from '@/lib/presence';
import { initials } from '@/lib/format';

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

export default function RecordTable<T extends { id: string }>({
  rows, columns, defaultColumns, storageKey, fields, filter, savedFilters,
  onSaveFilter, onRowClick, onDeleteSelected, deleteLabel = 'Datensätze', activeId,
  emptyText = 'Keine Datensätze.', toolbarRight,
}: Props<T>) {
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [query, setQuery] = useState(params.get('q') ?? '');
  const [filterOpen, setFilterOpen] = useState<'closed' | 'menu' | 'builder'>('closed');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [visible, setVisible] = useState<string[]>(defaultColumns);
  const others = usePresence();
  const viewerOf = (id: string) => others.find((o) => o.viewing === id) ?? null;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`cols:${storageKey}`);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed) && parsed.length) queueMicrotask(() => setVisible(parsed));
      }
    } catch { /* localStorage nicht verfuegbar */ }
  }, [storageKey]);

  const changeColumns = (keys: string[]) => {
    setVisible(keys);
    try { localStorage.setItem(`cols:${storageKey}`, JSON.stringify(keys)); } catch { /* ignore */ }
  };

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.push(`${pathname}?${next.toString()}`);
  };

  // Suche verzögert in die URL schreiben, damit der Server filtert
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get('q') ?? '') !== query) setParam('q', query || null);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const shownColumns = useMemo(
    () => columns.filter((c) => visible.includes(c.key)),
    [columns, visible],
  );

  const activeRules = countRules(filter);
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <div className="relative w-56">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Suche" value={query}
                 onChange={(e) => setQuery(e.target.value)} />
        </div>

        <div className="relative">
          <button
            type="button"
            className={`btn-ghost ${activeRules ? '!border-brand !text-brand' : ''}`}
            onClick={() => setFilterOpen((s) => (s === 'closed' ? 'menu' : 'closed'))}
          >
            <FilterIcon size={15} /> Filter
            {activeRules > 0 && (
              <span className="grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] text-white">
                {activeRules}
              </span>
            )}
            {filterOpen === 'closed' ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>

          {filterOpen === 'menu' && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setFilterOpen('closed')} />
              <div className="card absolute left-0 z-20 mt-1.5 w-60 p-1.5 shadow-xl">
                <div className="relative mb-1.5">
                  <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input className="input !py-1.5 pl-8 text-[13px]" placeholder="Suche" />
                </div>
                {savedFilters.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => { setParam('filter', encodeURIComponent(JSON.stringify(f.definition))); setFilterOpen('closed'); }}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-2"
                  >
                    <FilterIcon size={13} className="text-muted" />
                    <span className="flex-1 truncate">{f.name}</span>
                    <Pencil size={12} className="text-muted" />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setFilterOpen('builder')}
                  className="mt-1 flex w-full items-center gap-2 rounded-md border-t border-line px-2.5 py-2 text-left text-[13px] text-ink hover:bg-surface-2"
                >
                  <Plus size={13} /> Neuer Filter
                </button>
              </div>
            </>
          )}

          {filterOpen === 'builder' && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setFilterOpen('closed')} />
              <div className="absolute left-0 z-20 mt-1.5">
                <FilterBuilder
                  fields={fields}
                  value={filter}
                  savedFilters={savedFilters}
                  onApply={(def) => setParam('filter', encodeURIComponent(JSON.stringify(def)))}
                  onReset={() => setParam('filter', null)}
                  onSave={onSaveFilter}
                  onClose={() => setFilterOpen('closed')}
                />
              </div>
            </>
          )}
        </div>

        <ColumnPicker columns={columns} visible={visible} onChange={changeColumns} />

        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-muted">{selected.size} ausgewählt</span>
            {onDeleteSelected && (
              <button
                type="button"
                className="btn-danger !py-1.5 text-[13px]"
                disabled={deleting}
                onClick={async () => {
                  if (!window.confirm(`${selected.size} ${deleteLabel} endgültig löschen?`)) return;
                  setDeleting(true);
                  try {
                    await onDeleteSelected([...selected]);
                    setSelected(new Set());
                    router.refresh();
                  } finally { setDeleting(false); }
                }}
              >
                <Trash2 size={14} /> {deleting ? 'Löschen …' : 'Löschen'}
              </button>
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">{toolbarRight}</div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead className="bg-surface-2/60">
            <tr>
              <th className="w-10 px-4 py-2.5">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                  aria-label="Alle auswählen"
                />
              </th>
              {shownColumns.map((c) => (
                <th key={c.key} className="th !py-3 text-[13px] font-medium text-ink/80">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={shownColumns.length + 1} className="px-4 py-14 text-center text-sm text-muted">
                  {emptyText}
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const viewer = viewerOf(row.id);
              return (
              <tr
                key={row.id}
                onClick={() => onRowClick(row)}
                title={viewer ? `${viewer.name} hat diesen Datensatz gerade geöffnet` : undefined}
                style={viewer ? { background: `${viewer.color}14` } : undefined}
                className={`cursor-pointer border-t border-line transition hover:bg-surface-2/50 ${
                  activeId === row.id ? 'bg-brand-soft/40' : ''
                }`}
              >
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  {viewer ? (
                    <span className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-semibold text-white ring-2 ring-offset-1"
                          style={{ background: viewer.color, ['--tw-ring-color' as string]: viewer.color }}>
                      {initials(viewer.name)}
                    </span>
                  ) : (
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => setSelected((s) => {
                        const n = new Set(s);
                        if (n.has(row.id)) n.delete(row.id); else n.add(row.id);
                        return n;
                      })}
                      aria-label="Zeile auswählen"
                    />
                  )}
                </td>
                {shownColumns.map((c) => (
                  <td key={c.key} className="td whitespace-nowrap text-[13px]">{c.render(row)}</td>
                ))}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
