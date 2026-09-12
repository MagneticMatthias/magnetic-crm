import { ctx } from '@/lib/ctx';
import { PageHeader } from '@/components/ui';
import { Badge } from '@/components/Badge';
import {
  createPipeline, renamePipeline, deletePipeline,
  createStage, updateStage, deleteStage,
  updateTeamMember, joinOrganization,
} from '@/app/actions/crm';
import { saveEmailSettings, createEmailTemplate, deleteEmailTemplate } from '@/app/actions/email';
import { smtpConfigured } from '@/lib/mailer';
import { PIPELINE_KIND_LABEL, ROLE_LABEL } from '@/lib/labels';
import { canManage } from '@/lib/auth';
import type { EmailTemplate, Pipeline, PipelineKind, Profile, Stage, UserRole } from '@/lib/types';
import { Trash2 } from 'lucide-react';
import DangerZone from '@/components/DangerZone';
import DialSettings from '@/components/DialSettings';

export default async function SettingsPage() {
  const { supabase, orgId, profile } = await ctx();
  const manager = canManage(profile);

  const [{ data: org }, { data: pipelines }, { data: stages }, { data: team },
         { data: emailSettings }, { data: templates }] = await Promise.all([
    supabase.from('organizations').select('*').eq('id', orgId).maybeSingle(),
    supabase.from('pipelines').select('*').eq('org_id', orgId).order('position'),
    supabase.from('pipeline_stages').select('*').order('position'),
    supabase.from('profiles').select('*').eq('org_id', orgId).order('full_name'),
    supabase.from('email_settings').select('*').eq('org_id', orgId).maybeSingle(),
    supabase.from('email_templates').select('*').eq('org_id', orgId).order('name'),
  ]);

  const pipelineList = (pipelines ?? []) as Pipeline[];
  const stageList = (stages ?? []) as Stage[];
  const teamList = (team ?? []) as Profile[];

  return (
    <>
      <PageHeader title="Einstellungen" subtitle={org?.name ?? undefined} />

      <div className="max-w-4xl space-y-8 p-4 sm:p-6">
        {/* Profil */}
        <section className="card p-5">
          <h2 className="mb-4 text-sm font-semibold">Mein Profil</h2>
          <form action={joinOrganization} className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="full_name">Name</label>
              <input id="full_name" name="full_name" className="input" defaultValue={profile.full_name ?? ''} />
            </div>
            <div>
              <label className="label" htmlFor="phone">Telefon</label>
              <input id="phone" name="phone" className="input" defaultValue={profile.phone ?? ''} />
            </div>
            <div className="flex items-end">
              <button className="btn-primary w-full">Speichern</button>
            </div>
          </form>
          <p className="mt-3 text-xs text-muted">
            Angemeldet als {profile.email} · Rolle {ROLE_LABEL[profile.role]}
          </p>
        </section>

        <DialSettings />

        {/* Pipelines */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Pipelines &amp; Phasen</h2>
            <form action={createPipeline} className="flex flex-wrap gap-2">
              <input name="name" className="input w-44" placeholder="Name der Pipeline" required />
              <select name="kind" className="input w-40" defaultValue="sonstige">
                {(Object.keys(PIPELINE_KIND_LABEL) as PipelineKind[]).map((k) => (
                  <option key={k} value={k}>{PIPELINE_KIND_LABEL[k]}</option>
                ))}
              </select>
              <button className="btn-primary">Anlegen</button>
            </form>
          </div>

          {pipelineList.map((p) => (
            <div key={p.id} className="card p-5">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <form action={renamePipeline} className="flex flex-1 gap-2">
                  <input type="hidden" name="id" value={p.id} />
                  <input name="name" className="input max-w-xs" defaultValue={p.name} />
                  <button className="btn-ghost">Umbenennen</button>
                </form>
                <Badge>{PIPELINE_KIND_LABEL[p.kind]}</Badge>
                <form action={deletePipeline}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="btn-danger" aria-label="Pipeline löschen"><Trash2 size={15} /></button>
                </form>
              </div>

              <div className="space-y-2">
                {stageList.filter((s) => s.pipeline_id === p.id).map((s) => (
                  <form key={s.id} action={updateStage}
                        className="flex flex-wrap items-end gap-2 rounded-lg border border-line p-2.5">
                    <input type="hidden" name="id" value={s.id} />
                    <div className="min-w-[140px] flex-1">
                      <label className="label">Phase</label>
                      <input name="name" className="input" defaultValue={s.name} />
                    </div>
                    <div className="w-24">
                      <label className="label">Wahrsch. %</label>
                      <input name="probability" className="input" inputMode="numeric" defaultValue={s.probability} />
                    </div>
                    <div className="w-20">
                      <label className="label">Farbe</label>
                      <input name="color" type="color" className="input h-[38px] p-1" defaultValue={s.color} />
                    </div>
                    <label className="flex items-center gap-1.5 pb-2.5 text-xs">
                      <input type="checkbox" name="is_won" defaultChecked={s.is_won} /> Gewonnen
                    </label>
                    <label className="flex items-center gap-1.5 pb-2.5 text-xs">
                      <input type="checkbox" name="is_lost" defaultChecked={s.is_lost} /> Verloren
                    </label>
                    <button className="btn-ghost">Speichern</button>
                    <button formAction={deleteStage} className="btn-danger" aria-label="Phase löschen">
                      <Trash2 size={15} />
                    </button>
                  </form>
                ))}

                <form action={createStage} className="flex flex-wrap items-end gap-2 pt-1">
                  <input type="hidden" name="pipeline_id" value={p.id} />
                  <div className="min-w-[160px] flex-1">
                    <input name="name" className="input" placeholder="Neue Phase" required />
                  </div>
                  <input name="probability" className="input w-24" placeholder="%" inputMode="numeric" />
                  <input name="color" type="color" className="input h-[38px] w-20 p-1" defaultValue="#64748b" />
                  <button className="btn-ghost">Phase hinzufügen</button>
                </form>
              </div>
            </div>
          ))}
        </section>


        {/* E-Mail */}
        <section className="card p-5">
          <h2 className="mb-1 text-sm font-semibold">E-Mail-Versand</h2>
          <p className="mb-4 text-xs text-muted">
            {smtpConfigured()
              ? 'SMTP ist konfiguriert – du kannst direkt aus Kontakten und Deals senden.'
              : 'Noch kein SMTP konfiguriert. Setze SMTP_HOST, SMTP_PORT, SMTP_USER und SMTP_PASS in der Server-Umgebung (Gmail-App-Passwort, Microsoft 365 oder jedes SMTP-Postfach).'}
          </p>

          <form action={saveEmailSettings} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="from_name">Absendername</label>
                <input id="from_name" name="from_name" className="input"
                       defaultValue={emailSettings?.from_name ?? ''} placeholder="Vertrieb Magnetic" />
              </div>
              <div>
                <label className="label" htmlFor="from_email">Absenderadresse</label>
                <input id="from_email" name="from_email" type="email" className="input"
                       defaultValue={emailSettings?.from_email ?? ''} placeholder="vertrieb@deine-domain.de" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="signature">Signatur</label>
              <textarea id="signature" name="signature" className="input min-h-24"
                        defaultValue={emailSettings?.signature ?? ''} />
            </div>
            <button className="btn-primary">Speichern</button>
          </form>

          <div className="mt-6 border-t border-line pt-5">
            <h3 className="mb-1 text-sm font-semibold">Vorlagen</h3>
            <p className="mb-3 text-xs text-muted">
              Platzhalter: {'{{vorname}}'}, {'{{nachname}}'}, {'{{firma}}'}, {'{{absender}}'}
            </p>

            <div className="mb-4 space-y-2">
              {((templates ?? []) as EmailTemplate[]).map((t) => (
                <div key={t.id} className="flex items-start gap-3 rounded-lg border border-line p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="truncate text-xs text-muted">{t.subject}</p>
                  </div>
                  <form action={deleteEmailTemplate}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className="text-muted hover:text-lose" aria-label="Vorlage löschen">
                      <Trash2 size={15} />
                    </button>
                  </form>
                </div>
              ))}
            </div>

            <form action={createEmailTemplate} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <input name="name" className="input" placeholder="Name der Vorlage" required />
                <input name="subject" className="input" placeholder="Betreff" required />
              </div>
              <textarea name="body" className="input min-h-24" required
                        placeholder="Hallo {{vorname}}, …" />
              <button className="btn-ghost">Vorlage anlegen</button>
            </form>
          </div>
        </section>

        {/* Team */}
        <section className="card p-5">
          <h2 className="mb-1 text-sm font-semibold">Team</h2>
          <p className="mb-4 text-xs text-muted">
            Neue Mitglieder registrieren sich selbst und werden dann hier einer Rolle zugeordnet.
          </p>

          <div className="space-y-2">
            {teamList.map((m) => (
              <form key={m.id} action={updateTeamMember}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-2.5">
                <input type="hidden" name="id" value={m.id} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{m.full_name || m.email}</div>
                  <div className="text-xs text-muted">{m.email}</div>
                </div>
                <select name="role" className="input w-40" defaultValue={m.role} disabled={!manager}>
                  {(Object.keys(ROLE_LABEL) as UserRole[]).map((r) => (
                    <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" name="active" defaultChecked={m.active} disabled={!manager} /> aktiv
                </label>
                <button className="btn-ghost" disabled={!manager}>Speichern</button>
              </form>
            ))}
          </div>
        </section>
        {profile.role === 'admin' && <DangerZone />}
      </div>
    </>
  );
}
