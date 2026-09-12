'use server';

import { revalidatePath } from 'next/cache';
import { ctx, str } from '@/lib/ctx';
import { sendMail, smtpConfigured, renderTemplate } from '@/lib/mailer';

export async function sendDealEmail(formData: FormData) {
  const { supabase, orgId, profile } = await ctx();

  const to = str(formData, 'to');
  const subject = str(formData, 'subject');
  const body = str(formData, 'body');
  const dealId = str(formData, 'deal_id');
  const contactId = str(formData, 'contact_id');

  if (!to || !subject || !body) throw new Error('Empfänger, Betreff und Text sind erforderlich.');

  const { data: settings } = await supabase
    .from('email_settings').select('*').eq('org_id', orgId).maybeSingle();

  const chosen = str(formData, 'from');
  const allowed = [settings?.from_email, process.env.SMTP_USER, profile.email].filter(Boolean) as string[];
  const fromEmail = chosen && allowed.includes(chosen) ? chosen : (settings?.from_email || process.env.SMTP_USER);
  if (!fromEmail) throw new Error('Kein Absender hinterlegt – bitte in den Einstellungen setzen.');

  const fromName = settings?.from_name || profile.full_name || 'Vertrieb';
  const text = settings?.signature ? `${body}\n\n--\n${settings.signature}` : body;

  if (!smtpConfigured()) {
    throw new Error('SMTP ist nicht konfiguriert (SMTP_HOST, SMTP_USER, SMTP_PASS).');
  }

  await sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    text,
    replyTo: profile.email ?? undefined,
    cc: str(formData, 'cc') ?? undefined,
    bcc: str(formData, 'bcc') ?? undefined,
  });

  await supabase.from('activities').insert({
    org_id: orgId,
    deal_id: dealId,
    contact_id: contactId,
    user_id: profile.id,
    type: 'email',
    subject,
    body: `An ${to}${str(formData, 'cc') ? `\nCc ${str(formData, 'cc')}` : ''}\n\n${body}`,
  });

  if (dealId) revalidatePath(`/deals/${dealId}`);
  if (contactId) revalidatePath(`/kontakte/${contactId}`);
  revalidatePath('/aktivitaeten');
}

export async function saveEmailSettings(formData: FormData) {
  const { supabase, orgId } = await ctx();
  await supabase.from('email_settings').upsert({
    org_id: orgId,
    from_name: str(formData, 'from_name'),
    from_email: str(formData, 'from_email'),
    signature: str(formData, 'signature'),
    updated_at: new Date().toISOString(),
  });
  revalidatePath('/einstellungen');
}

export async function createEmailTemplate(formData: FormData) {
  const { supabase, orgId } = await ctx();
  await supabase.from('email_templates').insert({
    org_id: orgId,
    name: str(formData, 'name') ?? 'Vorlage',
    subject: str(formData, 'subject') ?? '',
    body: str(formData, 'body') ?? '',
  });
  revalidatePath('/einstellungen');
}

export async function deleteEmailTemplate(formData: FormData) {
  const { supabase } = await ctx();
  await supabase.from('email_templates').delete().eq('id', String(formData.get('id')));
  revalidatePath('/einstellungen');
}

/** Moegliche Absenderadressen fuer den Composer. */
export async function senderOptions(): Promise<string[]> {
  const { supabase, orgId, profile } = await ctx();
  const { data } = await supabase.from('email_settings').select('from_email').eq('org_id', orgId).maybeSingle();
  return [...new Set([data?.from_email, process.env.SMTP_USER, profile.email].filter(Boolean) as string[])];
}

/** Vorlage mit Kontaktdaten fuellen - fuer die Vorschau im Composer. */
export async function fillTemplate(templateId: string, contact: {
  first_name?: string | null; last_name?: string | null; company?: string | null;
}) {
  const { supabase, profile } = await ctx();
  const { data } = await supabase
    .from('email_templates').select('subject, body').eq('id', templateId).maybeSingle();
  if (!data) return null;

  const vars = {
    vorname: contact.first_name ?? '',
    nachname: contact.last_name ?? '',
    firma: contact.company ?? '',
    absender: profile.full_name ?? '',
  };

  return {
    subject: renderTemplate(data.subject, vars),
    body: renderTemplate(data.body, vars),
  };
}
