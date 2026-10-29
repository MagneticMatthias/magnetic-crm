'use server';

import { revalidatePath } from 'next/cache';
import { ctx } from '@/lib/ctx';
import {
  anrufeErledigt, anrufmonitorStatus, gleicheNummer, normNummer, nummernAusFeld, wartendeAnrufe,
} from '@/lib/fritz';
import { phaseNachziehen } from '@/app/actions/crm';
import { anrufeZaehlenLesen } from '@/app/actions/akquise';

export type NeuerAnruf = {
  activityId: string;
  contactId: string;
  pipelineId: string | null;
  wer: string;
  sekunden: number;
  verbunden: boolean;
  richtung: 'in' | 'out';
};

/**
 * Holt fertige Anrufe vom Fritzbox-Anrufmonitor ab und legt sie als
 * Aktivitaet an - aber nur, wenn die Nummer zu einem Ansprechpartner im
 * CRM passt. Private Anrufe werden verworfen und nirgends gespeichert.
 *  - nicht abgenommen (ausgehend): Ergebnis "Nicht erreicht", Phase zieht nach
 *  - abgenommen: Dauer steht drin, das Ergebnis traegst du nach
 */
export async function syncAnrufe(): Promise<{ neu: NeuerAnruf[] }> {
  const wartend = wartendeAnrufe();
  if (!wartend.length) return { neu: [] };

  const { supabase, orgId, profile } = await ctx();
  const { data: personen } = await supabase
    .from('contact_persons').select('contact_id, first_name, last_name, phone, contact:contacts(company)')
    .eq('org_id', orgId).not('phone', 'is', null);

  const kartei = (personen ?? []).flatMap((p) =>
    nummernAusFeld(p.phone as string).map((nr) => ({ nr, p })));

  const neu: NeuerAnruf[] = [];
  const erledigt: string[] = [];
  const zaehlen = (await anrufeZaehlenLesen()).an;

  for (const a of wartend) {
    const nr = normNummer(a.nummer);
    const treffer = kartei.find((k) => gleicheNummer(k.nr, nr));
    erledigt.push(a.id);
    if (!treffer) {
      // Ohne Kontakt im CRM: nur zaehlen, wenn "Anrufe mitzaehlen" an ist und
      // der Anruf ausgehend war. Die Nummer wird dabei nicht gespeichert.
      if (zaehlen && a.richtung === 'out') {
        const { error } = await supabase.from('activities').insert({
          org_id: orgId, user_id: profile.id, type: 'call', direction: 'out', message_id: `fritz-${a.id}`,
          outcome: a.verbunden ? 'erreicht' : 'nicht_erreicht', duration_seconds: a.sekunden || null,
          subject: 'Kaltakquise-Anruf (ohne Kontakt im CRM)', occurred_at: a.beginn,
        });
        if (error && error.code !== '23505') erledigt.pop();
      }
      continue; // sonst privat oder unbekannt: verwerfen
    }

    const p = treffer.p as unknown as {
      contact_id: string; first_name: string | null; last_name: string | null; contact: { company: string | null } | null;
    };
    const { data: deals } = await supabase.from('deals')
      .select('id, pipeline_id, updated_at').eq('contact_id', p.contact_id).eq('status', 'offen')
      .order('updated_at', { ascending: false }).limit(1);
    const deal = deals?.[0] ?? null;

    const name = [p.first_name, p.last_name].filter(Boolean).join(' ');
    const wer = [name, p.contact?.company].filter(Boolean).join(' · ') || a.nummer;
    const verpasst = !a.verbunden;
    const subject = a.richtung === 'out'
      ? (verpasst ? 'Angerufen, nicht abgenommen' : 'Telefonat (ausgehend)')
      : (verpasst ? 'Verpasster Anruf' : 'Telefonat (eingehend)');

    const { data: act, error } = await supabase.from('activities').insert({
      org_id: orgId, contact_id: p.contact_id, deal_id: deal?.id ?? null, user_id: profile.id,
      type: 'call', direction: a.richtung, message_id: `fritz-${a.id}`,
      outcome: verpasst && a.richtung === 'out' ? 'nicht_erreicht' : null,
      duration_seconds: a.sekunden || null, phone_number: a.nummer,
      subject, occurred_at: a.beginn,
    }).select('id').single();

    if (error) {
      if (error.code === '23505') continue; // schon eingetragen
      erledigt.pop(); // spaeter nochmal versuchen
      continue;
    }
    if (verpasst && a.richtung === 'out' && deal) {
      await phaseNachziehen(supabase, deal.id, ['Niemand rangegangen']);
    }
    if (a.verbunden) {
      neu.push({ activityId: act.id, contactId: p.contact_id, pipelineId: deal?.pipeline_id ?? null, wer,
        sekunden: a.sekunden, verbunden: true, richtung: a.richtung });
    }
  }

  anrufeErledigt(erledigt);
  if (erledigt.length) {
    revalidatePath('/', 'layout');
  }
  return { neu };
}

export async function anrufmonitorInfo() {
  await ctx();
  return anrufmonitorStatus();
}
