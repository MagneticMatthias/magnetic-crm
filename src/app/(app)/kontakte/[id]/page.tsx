import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Mail, Phone, Building2, Trash2 } from 'lucide-react';
import { ctx } from '@/lib/ctx';
import { PageHeader } from '@/components/ui';
import { Badge } from '@/components/Badge';
import ContactDialog from '@/components/ContactDialog';
import EmailComposer from '@/components/EmailComposer';
import ActivityComposer from '@/components/ActivityComposer';
import Timeline from '@/components/Timeline';
import TaskList from '@/components/TaskList';
import TaskComposer from '@/components/TaskComposer';
import { updateContact, deleteContact, logActivity, createTask } from '@/app/actions/crm';
import { sendDealEmail, fillTemplate } from '@/app/actions/email';
import { smtpConfigured } from '@/lib/mailer';
import { contactName, eur, dateOnly } from '@/lib/format';
import { DEAL_STATUS_LABEL } from '@/lib/labels';
import type { Contact, EmailTemplate, Profile } from '@/lib/types';

export default async function ContactDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, orgId } = await ctx();

  const { data: contact } = await supabase.from('contacts').select('*').eq('id', id).maybeSingle();
  if (!contact) notFound();

  const [{ data: deals }, { data: activities }, { data: tasks }, { data: team }, { data: templates }] = await Promise.all([
    supabase.from('deals').select('*, pipeline:pipelines(name), stage:pipeline_stages(name, color)')
      .eq('contact_id', id).order('created_at', { ascending: false }),
    supabase.from('activities').select('*, user:profiles(full_name, email)')
      .eq('contact_id', id).order('occurred_at', { ascending: false }).limit(100),
    supabase.from('tasks').select('*').eq('contact_id', id).order('done').order('due_at').limit(50),
    supabase.from('profiles').select('*').eq('org_id', orgId).eq('active', true),
    supabase.from('email_templates').select('*').eq('org_id', orgId).order('name'),
  ]);

  const c = contact as Contact;

  return (
    <>
      <PageHeader title={contactName(c)} subtitle={c.company ?? undefined}>
        <ContactDialog action={updateContact} team={(team ?? []) as Profile[]} values={c} mode="edit" />
        <EmailComposer
          sendAction={sendDealEmail}
          fillAction={fillTemplate}
          contact={c}
          templates={(templates ?? []) as EmailTemplate[]}
          smtpReady={smtpConfigured()}
        />
        <form action={deleteContact}>
          <input type="hidden" name="id" value={c.id} />
          <button className="btn-danger"><Trash2 size={15} /> Löschen</button>
        </form>
      </PageHeader>

      <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <div className="card space-y-3 p-4">
            <h2 className="text-sm font-semibold">Stammdaten</h2>
            <dl className="space-y-2.5 text-sm">
              {c.phone && (
                <div className="flex items-center gap-2">
                  <Phone size={14} className="text-muted" />
                  <a href={`tel:${c.phone}`} className="hover:text-brand">{c.phone}</a>
                </div>
              )}
              {c.email && (
                <div className="flex items-center gap-2">
                  <Mail size={14} className="text-muted" />
                  <a href={`mailto:${c.email}`} className="truncate hover:text-brand">{c.email}</a>
                </div>
              )}
              {c.company && (
                <div className="flex items-center gap-2">
                  <Building2 size={14} className="text-muted" />
                  <span>{c.company}{c.job_title ? ` · ${c.job_title}` : ''}</span>
                </div>
              )}
            </dl>
            {c.lead_source && (
              <div className="pt-1"><Badge>{c.lead_source}</Badge></div>
            )}
            {c.notes && <p className="whitespace-pre-wrap border-t border-line pt-3 text-sm text-muted">{c.notes}</p>}
            <p className="text-xs text-muted">Angelegt {dateOnly(c.created_at)}</p>
          </div>

          <div className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">Deals</h2>
            {deals?.length ? (
              <ul className="space-y-2">
                {deals.map((d: { id: string; title: string; value: number; status: string; stage: { name: string; color: string } | null }) => (
                  <li key={d.id}>
                    <Link href={`/deals/${d.id}`}
                          className="flex items-center justify-between gap-2 rounded-lg border border-line p-2.5 hover:border-brand">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{d.title}</span>
                        <span className="text-xs text-muted">
                          {d.stage?.name} · {DEAL_STATUS_LABEL[d.status as keyof typeof DEAL_STATUS_LABEL]}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm tabular-nums">{eur(d.value)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Noch kein Deal verknüpft.</p>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <ActivityComposer action={logActivity} contactId={c.id} phone={c.phone} />

          <section>
            <h2 className="mb-3 text-sm font-semibold">Aufgaben</h2>
            <TaskComposer action={createTask} contactId={c.id} team={(team ?? []) as Profile[]} />
            <div className="mt-3">
              <TaskList tasks={tasks ?? []} />
            </div>
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
