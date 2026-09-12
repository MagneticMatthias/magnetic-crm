'use client';

import { useState } from 'react';
import { Columns3, Check } from 'lucide-react';
import type { ColumnDef } from './columns';

export default function ColumnPicker<T>({
  columns, visible, onChange,
}: { columns: ColumnDef<T>[]; visible: string[]; onChange: (keys: string[]) => void }) {
  const [open, setOpen] = useState(false);

  const toggle = (key: string) =>
    onChange(visible.includes(key)
      ? visible.filter((k) => k !== key)
      : columns.filter((c) => c.key === key || visible.includes(c.key)).map((c) => c.key));

  return (
    <div className="relative">
      <button type="button" className="btn-ghost" onClick={() => setOpen((o) => !o)}>
        <Columns3 size={15} /> Spalten
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="card absolute right-0 z-20 mt-1.5 w-60 p-1.5 shadow-xl">
            {columns.map((c) => {
              const on = visible.includes(c.key);
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => toggle(c.key)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-surface-2"
                >
                  <span className={`grid h-4 w-4 place-items-center rounded border ${
                    on ? 'border-brand bg-brand text-white' : 'border-line'
                  }`}>
                    {on && <Check size={11} />}
                  </span>
                  {c.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
