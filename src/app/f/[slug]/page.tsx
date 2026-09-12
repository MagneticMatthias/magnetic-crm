import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import PublicLeadForm from '@/components/PublicLeadForm';

export const metadata = { robots: { index: false } };

export default async function PublicFormPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc('public_lead_form', { p_slug: slug });
  const form = Array.isArray(data) ? data[0] : data;
  if (!form) notFound();

  return (
    <div className="min-h-dvh bg-brand-soft/40 px-4 py-12">
      <div className="mx-auto w-full max-w-xl">
        <PublicLeadForm
          slug={slug}
          headline={form.headline || form.name || 'Lass uns in Kontakt treten!'}
          description={form.description ?? null}
          askCompany={form.ask_company}
          askMessage={form.ask_message}
          askEmail={form.ask_email ?? true}
          askPhone={form.ask_phone ?? true}
          askLastName={form.ask_last_name ?? true}
          successMessage={form.success_message ?? 'Danke! Wir melden uns in Kürze.'}
        />
        <p className="mt-6 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Formular erstellt von</p>
        <p className="mt-1 text-center text-sm font-bold text-muted">Magnetic_CRM</p>
      </div>
    </div>
  );
}
