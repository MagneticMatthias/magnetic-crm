import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Trash2, Phone, Mail } from 'lucide-react';
import { ctx } from '@/lib/ctx';
import { PageHeader } from '@/components/ui';
import { Badge } from '@/components/Badge';
import DealDialog from '@/components/DealDialog';
import EmailComposer from '@/components/EmailComposer';
import StageSwitcher from '@/components/StageSwitcher';
import ActivityComposer from '@/components/ActivityComposer';
import Timeline from '@/components/Timeline';
import TaskList from '@/components/TaskList';
import TaskComposer from '@/components/TaskComposer';
import { updateDeal, deleteDeal, logActivity, createTask, moveDeal } from '@/app/actions/crm';
import { sendDealEmail, fillTemplate } from '@/app/actions/email';
import { smtpConfigured } from '@/lib/mailer';
import { contactName, eur, dateOnly, dateTime } from '@/lib/format';
import { DEAL_STATUS_LABEL } from '@/lib/labels';
import type { Contact, Deal, EmailTemplate, Profile, Stage } from '@/lib/types';

export default async function DealDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, orgId } = await ctx();

  const { data: deal } = await supabase
    .from('deals')
    .select('*, contact:contacts(*), pipeline:pipelines(id, name)')
    .eq('id', id)
    .maybeSingle();
  if (!deal) notFound();

  const d = deal as Deal & { contact: Contact | null; pipeline: { id: string; name: string } | null };

  const [{ data: stages }, { data: activities }, { data: tasks }, { data: contacts }, { data: team }, { data: history }, { data: templates }] =
    await Promise.all([
      supabase.from('pipeline_stages').select('*').eq('pipeline_id', d.pipeline_id).order('position'),
      supabase.from('activities').select('*, user:profiles(full_name, email)')
        .eq('deal_id', id).order('occurred_at', { ascending: false }).limit(100),
      supabase.from('tasks').select('*').eq('deal_id', id).order('done').order('due_at').limit(50),
      supabase.from('contacts').select('*').eq('org_id', orgId).order('last_name').limit(500),
      supabase.from('profiles').select('*').eq('org_id', orgId).eq('active', true),
      supabase.from('deal_stage_history')
        .select('changed_at, to_stage:pipeline_stages!deal_stage_history_to_stage_id_fkey(name)')
        .eq('deal_id', id).order('changed_at', { ascending: false }).limit(10),
      supabase.from('email_templates').select('*').eq('org_id', orgId).order('name'),
    ]);

  const stageList = (stages ?? []) as Stage[];
  const stage = stageList.find((s) => s.id === d.stage_id);
  const teamList = (team ?? []) as Profile[];
  const nameOf = (uid: string | null) => teamList.find((p) => p.id === uid)?.full_name ?? '–';

  return (
    <>
      <PageHeader
        title={d.title}
        subtitle={`${d.pipeline?.name ?? 'Pipeline'} · ${eur(d.value)} · ${DEAL_STATUS_LABEL[d.status]}`}
      >
        <DealDialog
          action={updateDeal}
          stages={stageList}
          contacts={(contacts ?? []) as Contact[]}
          team={teamList}
          mode="edit"
          values={{
            id: d.id, title: d.title, value: d.value, stage_id: d.stage_id,
            contact_id: d.contact_id, source: d.source, owner_id: d.owner_id,
            setter_id: d.setter_id, closer_id: d.closer_id,
            expected_close_date: d.expected_close_date, next_step: d.next_step,
          }}
        />
        <EmailComposer
          sendAction={sendDealEmail}
          fillAction={fillTemplate}
          contact={d.contact}
          dealId={d.id}
          templates={(templates ?? []) as EmailTemplate[]}
          smtpReady={smtpConfigured()}
        />
        <form action={deleteDeal}>
          <input type="hidden" name="id" value={d.id} />
          <button className="btn-danger"><Trash2 size={15} /> Löschen</button>
        </form>
      </PageHeader>

      <div className="border-b border-line px-4 py-3 sm:px-6">
        <StageSwitcher dealId={d.id} stages={stageList} currentStageId={d.stage_id} moveDeal={moveDeal} />
      </div>

      <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <div className="card space-y-3 p-4">
            <h2 className="text-sm font-semibold">Deal</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Wert</dt><dd className="tabular-nums">{eur(d.value)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Phase</dt>
                <dd>{stage ? <Badge color={stage.color}>{stage.name}</Badge> : '–'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Wahrscheinlichkeit</dt><dd>{stage?.probability ?? 0} %</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Setter</dt><dd>{nameOf(d.setter_id)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Closer</dt><dd>{nameOf(d.closer_id)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Leadquelle</dt><dd>{d.source ?? '–'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Erw. Abschluss</dt><dd>{dateOnly(d.expected_close_date)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Angelegt</dt><dd>{dateOnly(d.created_at)}</dd>
              </div>
            </dl>
            {d.next_step && (
              <p className="border-t border-line pt-3 text-sm">
                <span className="text-muted">Nächster Schritt: </span>{d.next_step}
              </p>
            )}
          </div>

          {d.contact && (
            <div className="card space-y-2.5 p-4">
              <h2 className="text-sm font-semibold">Kontakt</h2>
              <Link href={`/kontakte/${d.contact.id}`} className="block text-sm font-medium hover:text-brand">
                {contactName(d.contact)}
              </Link>
              {d.contact.company && <p className="text-sm text-muted">{d.contact.company}</p>}
              {d.contact.phone && (
                <a href={`tel:${d.contact.phone}`} className="flex items-center gap-2 text-sm hover:text-brand">
                  <Phone size={14} /> {d.contact.phone}
                </a>
              )}
              {d.contact.email && (
                <a href={`mailto:${d.contact.email}`} className="flex items-center gap-2 truncate text-sm hover:text-brand">
                  <Mail size={14} /> {d.contact.email}
                </a>
              )}
            </div>
          )}

          {history && history.length > 0 && (
            <div className="card p-4">
              <h2 className="mb-2.5 text-sm font-semibold">Phasen-Historie</h2>
              <ul className="space-y-1.5 text-xs text-muted">
                {(history as unknown as { changed_at: string; to_stage: { name: string } | null }[]).map((h, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span>{h.to_stage?.name ?? '–'}</span>
                    <span>{dateTime(h.changed_at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <ActivityComposer
            action={logActivity}
            dealId={d.id}
            contactId={d.contact_id ?? undefined}
            stages={stageList}
            phone={d.contact?.phone}
          />

          <section>
            <h2 className="mb-3 text-sm font-semibold">Aufgaben</h2>
            <TaskComposer action={createTask} dealId={d.id} contactId={d.contact_id ?? undefined} team={teamList} />
            <div className="mt-3"><TaskList tasks={tasks ?? []} /></div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold">Verlauf</h2>
            <Timeline activities={activities ?? []} />
          </section>
        </div>
      </div>
    </>
  );
}
