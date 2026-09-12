import Link from 'next/link';
import { ctx } from '@/lib/ctx';
import { PageHeader, Empty } from '@/components/ui';
import ContactDialog from '@/components/ContactDialog';
import { createContact } from '@/app/actions/crm';
import { contactName, dateOnly } from '@/lib/format';
import { Badge } from '@/components/Badge';
import type { Contact, Profile } from '@/lib/types';

export default async function ContactsPage({
  searchParams,
}: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { supabase, orgId } = await ctx();

  let query = supabase
    .from('contacts')
    .select('*, deals(id, status, value)')
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false })
    .limit(300);

  if (q?.trim()) {
    const like = `%${q.trim()}%`;
    query = query.or(
      `first_name.ilike.${like},last_name.ilike.${like},company.ilike.${like},email.ilike.${like},phone.ilike.${like}`,
    );
  }

  const [{ data: contacts }, { data: team }] = await Promise.all([
    query,
    supabase.from('profiles').select('*').eq('org_id', orgId).eq('active', true),
  ]);

  type Row = Contact & { deals: { id: string; status: string; value: number }[] };
  const rows = (contacts ?? []) as Row[];

  return (
    <>
      <PageHeader title="Kontakte" subtitle={`${rows.length} Einträge`}>
        <form className="flex gap-2">
          <input name="q" defaultValue={q ?? ''} className="input w-48" placeholder="Filtern …" />
          <button className="btn-ghost">Suchen</button>
        </form>
        <ContactDialog action={createContact} team={(team ?? []) as Profile[]} />
      </PageHeader>

      <div className="p-4 sm:p-6">
        {rows.length === 0 ? (
          <Empty title="Keine Kontakte gefunden"
                 hint="Lege deinen ersten Kontakt an oder passe den Filter an." />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="border-b border-line bg-surface-2/50">
                <tr>
                  <th className="th">Name</th>
                  <th className="th">Firma</th>
                  <th className="th">Telefon</th>
                  <th className="th">E-Mail</th>
                  <th className="th">Leadquelle</th>
                  <th className="th">Deals</th>
                  <th className="th">Aktualisiert</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const openDeals = c.deals?.filter((d) => d.status === 'offen').length ?? 0;
                  return (
                    <tr key={c.id} className="border-b border-line last:border-0 hover:bg-surface-2/40">
                      <td className="td">
                        <Link href={`/kontakte/${c.id}`} className="font-medium hover:text-brand">
                          {contactName(c)}
                        </Link>
                      </td>
                      <td className="td text-muted">{c.company ?? '–'}</td>
                      <td className="td">
                        {c.phone ? <a href={`tel:${c.phone}`} className="hover:text-brand">{c.phone}</a> : '–'}
                      </td>
                      <td className="td text-muted">{c.email ?? '–'}</td>
                      <td className="td">{c.lead_source ? <Badge>{c.lead_source}</Badge> : '–'}</td>
                      <td className="td tabular-nums">{openDeals}</td>
                      <td className="td text-muted">{dateOnly(c.updated_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
