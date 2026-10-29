import { NextResponse } from 'next/server';
import { pingMailSync } from '@/app/actions/mail';

// Eigene Route statt Server-Aktion: Server-Aktionen laufen im Browser
// nacheinander, ein laengerer Postfach-Abgleich haette sonst jeden Klick
// (Deal oeffnen, Aktivitaet speichern) ausgebremst.
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    return NextResponse.json(await pingMailSync());
  } catch {
    return NextResponse.json({ imported: 0 });
  }
}
