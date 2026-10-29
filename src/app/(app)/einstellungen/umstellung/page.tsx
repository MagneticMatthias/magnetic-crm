import { PageHeader } from '@/components/ui';
import Umstellung from '@/components/Umstellung';
import { umstellungVorschau } from '@/app/actions/umstellung';
import { KALT_PHASEN } from '@/lib/umstellung';

export const dynamic = 'force-dynamic';

export default async function UmstellungPage() {
  const v = await umstellungVorschau();
  return (
    <>
      <PageHeader title="Umstellung Kaltakquise und Fäden" subtitle="Einmalig: Backup, Vorschau, Umstellung" />
      <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
        {'fehler' in v
          ? <p className="text-sm text-lose">{v.fehler}</p>
          : <Umstellung zeilen={v.zeilen} fertig={v.fertig} ziele={KALT_PHASEN.map((k) => k.name)} />}
      </div>
    </>
  );
}
