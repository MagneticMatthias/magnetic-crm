import { Phone, StickyNote, Mail, CalendarDays, MessageCircle, CheckSquare } from 'lucide-react';
import { ACTIVITY_TYPE_LABEL, CALL_KIND_LABEL, CALL_OUTCOME_LABEL } from '@/lib/labels';
import { dateTime, duration } from '@/lib/format';
import { Badge } from '@/components/Badge';
import type { Activity, ActivityType } from '@/lib/types';

const ICON: Record<ActivityType, typeof Phone> = {
  call: Phone, note: StickyNote, email: Mail,
  meeting: CalendarDays, whatsapp: MessageCircle, task: CheckSquare,
};

const POSITIVE = ['termin_vereinbart', 'abgeschlossen', 'erreicht'];
const NEGATIVE = ['kein_interesse', 'verloren', 'falsche_nummer', 'no_show'];

type Row = Activity & { user?: { full_name: string | null; email: string | null } | null };

export default function Timeline({ activities }: { activities: Row[] }) {
  if (!activities.length) {
    return <p className="px-1 py-6 text-sm text-muted">Noch keine Aktivitäten erfasst.</p>;
  }

  return (
    <ol className="space-y-3">
      {activities.map((a) => {
        const Icon = ICON[a.type] ?? StickyNote;
        const tone = a.outcome
          ? POSITIVE.includes(a.outcome) ? 'win' : NEGATIVE.includes(a.outcome) ? 'lose' : 'muted'
          : 'muted';

        return (
          <li key={a.id} className="card flex gap-3 p-3.5">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted">
              <Icon size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">
                  {a.type === 'call' && a.call_kind ? CALL_KIND_LABEL[a.call_kind] : ACTIVITY_TYPE_LABEL[a.type]}
                </span>
                {a.outcome && <Badge tone={tone as 'win' | 'lose' | 'muted'}>{CALL_OUTCOME_LABEL[a.outcome]}</Badge>}
                {a.duration_seconds ? <span className="text-xs text-muted">{duration(a.duration_seconds)}</span> : null}
                {a.answered_by && <Badge>{a.answered_by === 'gatekeeper' ? 'Gatekeeper' : 'Entscheider'}</Badge>}
                <span className="ml-auto text-xs text-muted">{dateTime(a.occurred_at)}</span>
              </div>
              {a.subject && <p className="mt-1 text-sm">{a.subject}</p>}
              {a.body && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{a.body}</p>}
              {a.user && (
                <p className="mt-1.5 text-xs text-muted">
                  {a.user.full_name || a.user.email}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
