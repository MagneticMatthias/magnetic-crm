'use client';

import { useTransition, useState } from 'react';
import type { Stage } from '@/lib/types';

export default function StageSwitcher({
  dealId, stages, currentStageId, moveDeal,
}: {
  dealId: string;
  stages: Stage[];
  currentStageId: string;
  moveDeal: (dealId: string, stageId: string, position: number) => Promise<void>;
}) {
  const [current, setCurrent] = useState(currentStageId);
  const [pending, startTransition] = useTransition();
  const activeIndex = stages.findIndex((s) => s.id === current);

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Deal-Phase">
      {stages.map((s, i) => {
        const isCurrent = s.id === current;
        const passed = i < activeIndex && !s.is_lost;
        return (
          <button
            key={s.id}
            disabled={pending}
            onClick={() => {
              setCurrent(s.id);
              startTransition(async () => { await moveDeal(dealId, s.id, 0); });
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-60 ${
              isCurrent ? 'text-white' : passed ? 'bg-surface-2 text-ink' : 'bg-surface-2 text-muted hover:text-ink'
            }`}
            style={isCurrent ? { background: s.color } : undefined}
          >
            {s.name}
          </button>
        );
      })}
    </div>
  );
}
