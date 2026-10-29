import { NextResponse } from 'next/server';
import { syncAnrufe } from '@/app/actions/anrufe';

// Eigene Route statt Server-Aktion, damit der Abgleich alle 15 Sekunden
// keine Klicks in der Oberflaeche aufhaelt.
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    return NextResponse.json(await syncAnrufe());
  } catch {
    return NextResponse.json({ neu: [] });
  }
}
