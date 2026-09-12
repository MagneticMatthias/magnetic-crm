'use client';

import { useMemo, useState } from 'react';
import {
  Filter as FilterIcon, Save, X, RotateCcw, Check, Search, CopyPlus,
  Type, List, Mail, Phone, Calendar, Link2, Hash, Euro,
} from 'lucide-react';
import {
  OPERATOR_LABEL, OPERATORS_BY_TYPE, NO_VALUE_OPERATORS, EMPTY_FILTER,
  type FieldDef,
} from '@/lib/filters';
import type { FilterDefinition, FilterOperator, FilterRule, SavedFilter } from '@/lib/types';

const ICONS = {
  text: Type, list: List, mail: Mail, phone: Phone,
  date: Calendar, link: Link2, number: Hash, money: Euro,
} as const;

function FieldIcon({ name }: { name: FieldDef['icon'] }) {
  const Icon = ICONS[name] ?? Type;
  return <Icon size={13} className="shrink-0 text-brand" />;
}

function PropertyPicker({
  fields, onPick,
}: { fields: FieldDef[]; onPick: (field: FieldDef) => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q ? fields.filter((f) => f.label.toLowerCase().includes(q)) : fields;
    const map = new Map<string, FieldDef[]>();
    matched.forEach((f) => map.set(f.group, [...(map.get(f.group) ?? []), f]));
    return [...map.entries()];
  }, [fields, query]);

  return (
    <div className="relative grid grid-cols-[minmax(0,240px)_1fr_auto] items-center gap-2">
      <div className="relative">
        <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          className="input !py-1.5 pl-8 text-[13px]"
          placeholder="Eigenschaft suchen"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
      </div>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="input !py-1.5 text-left text-[13px] text-muted"
      >
        Wähle eine Eigenschaft zum Filtern
      </button>

      <span className="w-7" />

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="card absolute left-0 top-full z-20 mt-1 max-h-72 w-[340px] overflow-y-auto p-1.5 shadow-xl">
            {groups.length === 0 && <p className="px-2.5 py-3 text-xs text-muted">Keine Eigenschaft gefunden.</p>}
            {groups.map(([group, list]) => (
              <div key={group} className="mb-1 last:mb-0">
                <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  {group}
                </p>
                {list.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => { onPick(f); setQuery(''); setOpen(false); }}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-2"
                  >
                    <FieldIcon name={f.icon} />
                    {f.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RuleRow({
  rule, fields, onChange, onRemove,
}: {
  rule: FilterRule;
  fields: FieldDef[];
  onChange: (next: FilterRule) => void;
  onRemove: () => void;
}) {
  const field = fields.find((f) => f.key === rule.field);
  if (!field) return null;

  const operators = OPERATORS_BY_TYPE[field.type];
  const needsValue = !NO_VALUE_OPERATORS.includes(rule.operator);
  const isDateSpan = rule.operator === 'before_days' || rule.operator === 'after_days';

  return (
    <div className="grid grid-cols-[minmax(0,240px)_1fr_auto] items-center gap-2">
      <div className="input flex !cursor-default items-center gap-2 !py-1.5 text-[13px]">
        <FieldIcon name={field.icon} />
        <select
          className="w-full bg-transparent outline-none"
          value={rule.field}
          onChange={(e) => {
            const next = fields.find((f) => f.key === e.target.value)!;
            onChange({ field: next.key, operator: OPERATORS_BY_TYPE[next.type][0], value: '' });
          }}
        >
          {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
      </div>

      <div className={`grid gap-2 ${isDateSpan ? 'grid-cols-[1fr_auto_88px]' : needsValue ? 'grid-cols-[150px_1fr]' : 'grid-cols-1'}`}>
        <select
          className="input !py-1.5 text-[13px]"
          value={rule.operator}
          onChange={(e) => onChange({ ...rule, operator: e.target.value as FilterOperator })}
        >
          {operators.map((op) => <option key={op} value={op}>{OPERATOR_LABEL[op]}</option>)}
        </select>

        {isDateSpan && (
          <span className="input grid !w-auto !cursor-default place-items-center !py-1.5 px-3 text-[13px] text-muted">
            X Tage
          </span>
        )}

        {needsValue && (
          field.type === 'select' && field.options ? (
            <select className="input !py-1.5 text-[13px]" value={rule.value}
                    onChange={(e) => onChange({ ...rule, value: e.target.value })}>
              <option value="">–</option>
              {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input
              className="input !py-1.5 text-[13px]"
              inputMode={field.type === 'number' || isDateSpan ? 'numeric' : 'text'}
              value={rule.value}
              onChange={(e) => onChange({ ...rule, value: e.target.value })}
              placeholder={isDateSpan ? '10' : 'Wert'}
            />
          )
        )}
      </div>

      <button type="button" onClick={onRemove}
              className="grid h-7 w-7 place-items-center rounded-md text-lose hover:bg-lose/10"
              aria-label="Bedingung entfernen">
        <X size={15} />
      </button>
    </div>
  );
}

export default function FilterBuilder({
  fields, value, savedFilters, onApply, onReset, onSave, onClose,
}: {
  fields: FieldDef[];
  value: FilterDefinition | null;
  savedFilters: SavedFilter[];
  onApply: (def: FilterDefinition) => void;
  onReset: () => void;
  onSave: (name: string, def: FilterDefinition) => Promise<void>;
  onClose: () => void;
}) {
  const [def, setDef] = useState<FilterDefinition>(
    value && value.groups.length ? value : EMPTY_FILTER,
  );
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');

  const update = (groupIndex: number, rules: FilterRule[]) =>
    setDef((d) => ({ groups: d.groups.map((g, i) => (i === groupIndex ? rules : g)) }));

  return (
    <div className="card w-[min(760px,calc(100vw-2rem))] p-5 shadow-2xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <FilterIcon size={17} className="text-brand" /> Filter
        </h2>
        <button type="button" className="btn-ghost !py-1.5 text-[13px]" onClick={() => setSaving((s) => !s)}>
          <Save size={14} /> Filter speichern
        </button>
      </div>

      {saving && (
        <div className="mb-4 flex gap-2 rounded-lg bg-surface-2 p-2.5">
          <input className="input !py-1.5 text-[13px]" placeholder="Name des Filters"
                 value={name} onChange={(e) => setName(e.target.value)} />
          <button
            type="button"
            className="btn-primary !py-1.5 text-[13px]"
            disabled={!name.trim()}
            onClick={async () => {
              await onSave(name.trim(), def);
              setName('');
              setSaving(false);
            }}
          >
            Speichern
          </button>
        </div>
      )}

      {savedFilters.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {savedFilters.map((f) => (
            <button key={f.id} type="button"
                    className="chip bg-surface-2 text-ink hover:bg-brand-soft hover:text-brand"
                    onClick={() => setDef(f.definition)}>
              {f.name}
            </button>
          ))}
        </div>
      )}

      <div className="mb-2 grid grid-cols-[minmax(0,240px)_1fr_auto] gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
        <span>Feld</span>
        <span>Bedingung</span>
        <span className="w-7" />
      </div>

      <div className="space-y-4">
        {def.groups.map((rules, gi) => (
          <div key={gi}>
            {gi > 0 && (
              <div className="mb-3 flex items-center gap-3">
                <span className="h-px flex-1 bg-line" />
                <span className="chip bg-surface-2 text-muted">ODER</span>
                <span className="h-px flex-1 bg-line" />
              </div>
            )}

            <div className="space-y-2">
              {rules.map((rule, ri) => (
                <RuleRow
                  key={`${gi}-${ri}`}
                  rule={rule}
                  fields={fields}
                  onChange={(next) => update(gi, rules.map((r, i) => (i === ri ? next : r)))}
                  onRemove={() => update(gi, rules.filter((_, i) => i !== ri))}
                />
              ))}

              <PropertyPicker
                fields={fields}
                onPick={(f) =>
                  update(gi, [...rules, { field: f.key, operator: OPERATORS_BY_TYPE[f.type][0], value: '' }])
                }
              />
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setDef((d) => ({ groups: [...d.groups, []] }))}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line py-2.5 text-[13px] text-muted transition hover:border-brand hover:text-brand"
      >
        <CopyPlus size={14} /> ODER-Filtergruppe hinzufügen
      </button>

      <div className="mt-5 flex items-center justify-between gap-3">
        <button
          type="button"
          className="btn inline-flex border border-lose/40 text-lose hover:bg-lose/10"
          onClick={() => { setDef(EMPTY_FILTER); onReset(); }}
        >
          <RotateCcw size={15} /> Zurücksetzen
        </button>

        <button
          type="button"
          className="btn bg-win text-white hover:brightness-110"
          onClick={() => { onApply(def); onClose(); }}
        >
          <Check size={16} /> Filter anwenden
        </button>
      </div>
    </div>
  );
}
