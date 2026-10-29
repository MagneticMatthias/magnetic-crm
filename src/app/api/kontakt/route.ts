import { NextResponse, type NextRequest } from 'next/server';
import { loadContactDetail } from '@/app/actions/records';

// Deal-Ansicht laden ueber eine eigene Route: wartet nicht hinter
// gerade laufenden Server-Aktionen (Speichern im Hintergrund, Abgleiche).
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json(null, { status: 400 });
  const deal = req.nextUrl.searchParams.get('deal');
  return NextResponse.json(await loadContactDetail(id, deal));
}
