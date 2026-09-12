import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import PublicLeadForm from '@/components/PublicLeadForm';

export const metadata = { robots: { index: false } };

export default async function PublicFormPage({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data } = await supabase.rpc('public_lead_form', { p_slug: slug });
  const form = Array.isArray(data) ? data[0] : data;
  if (!form) notFound();

  return (
    <div className="min-h-dvh grid place-items-center px-4 py-12">
      <div className="w-full max-w-md">
        <h1 className="text-xl font-semibold">{form.headline || form.name}</h1>
        {form.description && <p className="mt-2 text-sm text-muted">{form.description}</p>}
        <div className="mt-6">
          <PublicLeadForm
            slug={slug}
            askCompany={form.ask_company}
            askMessage={form.ask_message}
            successMessage={form.success_message ?? 'Danke! Wir melden uns in Kürze.'}
          />
        </div>
      </div>
    </div>
  );
}
