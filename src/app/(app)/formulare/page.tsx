import { ctx } from '@/lib/ctx';
import { PageHeader, Empty } from '@/components/ui';
import { createLeadForm, updateLeadForm, deleteLeadForm } from '@/app/actions/forms';
import CopyLink from '@/components/CopyLink';
import { Trash2 } from 'lucide-react';
import type { LeadForm, Pipeline, Profile, Stage } from '@/lib/types';

export default async function FormsPage() {
  const { supabase, orgId } = await ctx();

  const [{ data: forms }, { data: pipelines }, { data: stages }, { data: team }] = await Promise.all([
    supabase.from('lead_forms').select('*').eq('org_id', orgId).order('created_at', { ascending: false }),
    supabase.from('pipelines').select('*').eq('org_id', orgId).order('position'),
    supabase.from('pipeline_stages').select('*').order('position'),
    supabase.from('profiles').select('*').eq('org_id', orgId).eq('active', true),
  ]);

  const formList = (forms ?? []) as LeadForm[];
  const pipelineList = (pipelines ?? []) as Pipeline[];
  const stageList = (stages ?? []) as Stage[];
  const teamList = (team ?? []) as Profile[];

  const stageOptions = pipelineList.flatMap((p) =>
    stageList.filter((s) => s.pipeline_id === p.id && !s.is_won && !s.is_lost)
      .map((s) => ({ id: s.id, label: `${p.name} → ${s.name}` })),
  );

  return (
    <>
      <PageHeader title="Lead-Formulare"
                  subtitle="Öffentliche Formulare legen Kontakt und Deal automatisch an" />

      <div className="max-w-4xl space-y-6 p-4 sm:p-6">
        <section className="card p-5">
          <h2 className="mb-4 text-sm font-semibold">Neues Formular</h2>
          <form action={createLeadForm} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="name">Name (intern)</label>
                <input id="name" name="name" className="input" required placeholder="z. B. Webinar-Anmeldung" />
              </div>
              <div>
                <label className="label" htmlFor="stage_id">Landet in Phase</label>
                <select id="stage_id" name="stage_id" className="input" defaultValue={stageOptions[0]?.id ?? ''}>
                  {stageOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="source">Leadquelle</label>
                <input id="source" name="source" className="input" defaultValue="Formular" />
              </div>
              <div>
                <label className="label" htmlFor="deal_value">Standard-Dealwert (€)</label>
                <input id="deal_value" name="deal_value" className="input" inputMode="decimal" defaultValue="0" />
              </div>
              <div>
                <label className="label" htmlFor="owner_id">Verantwortlich</label>
                <select id="owner_id" name="owner_id" className="input" defaultValue="">
                  <option value="">ich</option>
                  {teamList.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="label" htmlFor="headline">Überschrift auf der Seite</label>
              <input id="headline" name="headline" className="input" placeholder="Kostenloses Erstgespräch sichern" />
            </div>

            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="ask_company" defaultChecked /> Firma abfragen
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="ask_message" defaultChecked /> Nachricht abfragen
              </label>
            </div>

            <button className="btn-primary">Formular anlegen</button>
          </form>
        </section>

        {formList.length === 0 ? (
          <Empty title="Noch kein Formular"
                 hint="Lege ein Formular an und binde den Link auf deiner Website oder in Ads ein." />
        ) : (
          formList.map((f) => (
            <section key={f.id} className="card p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold">{f.name}</h2>
                  <CopyLink path={`/f/${f.slug}`} />
                </div>
                <form action={deleteLeadForm}>
                  <input type="hidden" name="id" value={f.id} />
                  <button className="btn-danger" aria-label="Formular löschen"><Trash2 size={15} /></button>
                </form>
              </div>

              <form action={updateLeadForm} className="space-y-3">
                <input type="hidden" name="id" value={f.id} />

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label">Name</label>
                    <input name="name" className="input" defaultValue={f.name} />
                  </div>
                  <div>
                    <label className="label">Landet in Phase</label>
                    <select name="stage_id" className="input" defaultValue={f.stage_id ?? ''}>
                      {stageOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label">Überschrift</label>
                    <input name="headline" className="input" defaultValue={f.headline ?? ''} />
                  </div>
                  <div>
                    <label className="label">Leadquelle</label>
                    <input name="source" className="input" defaultValue={f.source ?? ''} />
                  </div>
                </div>

                <div>
                  <label className="label">Beschreibung</label>
                  <textarea name="description" className="input min-h-20" defaultValue={f.description ?? ''} />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label">Danke-Text</label>
                    <input name="success_message" className="input" defaultValue={f.success_message ?? ''} />
                  </div>
                  <div>
                    <label className="label">Standard-Dealwert (€)</label>
                    <input name="deal_value" className="input" inputMode="decimal" defaultValue={f.deal_value} />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="ask_company" defaultChecked={f.ask_company} /> Firma
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="ask_message" defaultChecked={f.ask_message} /> Nachricht
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="active" defaultChecked={f.active} /> aktiv
                  </label>
                  <button className="btn-ghost ml-auto">Speichern</button>
                </div>
              </form>
            </section>
          ))
        )}
      </div>
    </>
  );
}
