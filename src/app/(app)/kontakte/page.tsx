import { ctx } from '@/lib/ctx';
import ContactsView from '@/components/ContactsView';
import { applyFilter, CONTACT_FIELDS, parseFilterParam } from '@/lib/filters';
import type { ContactWithPersons, SavedFilter, Stage } from '@/lib/types';

export default async function ContactsPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; filter?: string; open?: string }> }) {
  const { q, filter, open } = await searchParams;
  const { supabase, orgId } = await ctx();

  const [{ data: contacts }, { data: saved }, { data: stages }] = await Promise.all([
    supabase
      .from('contacts')
      .select('*, persons:contact_persons(*), deals(id, status, stage_id, pipeline_id, stage:pipeline_stages(name, color), pipeline:pipelines(name))')
      .eq('org_id', orgId)
      .order('updated_at', { ascending: false })
      .limit(1000),
    supabase.from('saved_filters').select('*').eq('org_id', orgId).eq('entity', 'contacts').order('name'),
    // Alle Phasen aller Pipelines: die Phasen-Spalte laesst sich damit auch
    // in der Kontaktliste direkt umstellen. Die Zeilensicherheit begrenzt
    // das bereits auf die eigene Organisation.
    supabase.from('pipeline_stages').select('*').order('position'),
  ]);

  let rows = (contacts ?? []) as ContactWithPersons[];

  if (q?.trim()) {
    const term = q.trim().toLowerCase();
    rows = rows.filter((c) => {
      const hay = [
        c.company, c.website, c.city, c.lead_source,
        ...c.persons.flatMap((p) => [p.first_name, p.last_name, p.email, p.phone]),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(term);
    });
  }

  const def = parseFilterParam(filter);
  rows = applyFilter(rows, def, CONTACT_FIELDS);

  return (
    <div className="p-3 sm:p-7">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 sm:mb-5">
        <h1 className="text-xl font-semibold sm:text-2xl">Kontakte</h1>
        <span className="text-sm text-muted">{rows.length} Datensätze</span>
      </div>

      <ContactsView
        rows={rows}
        filter={def}
        savedFilters={(saved ?? []) as SavedFilter[]}
        stages={(stages ?? []) as Stage[]}
        initialOpen={open ?? null}
      />
    </div>
  );
}
