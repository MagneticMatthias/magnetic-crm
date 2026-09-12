import { redirect } from 'next/navigation';
import { getProfileOrNull } from '@/lib/auth';
import { createOrganization } from '@/app/actions/org';

export default async function OnboardingPage() {
  const profile = await getProfileOrNull();
  if (!profile) redirect('/login');
  if (profile.org_id) redirect('/dashboard');

  return (
    <div className="min-h-dvh grid place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <h1 className="text-xl font-semibold mb-1">Organisation anlegen</h1>
        <p className="text-sm text-muted mb-6">
          Wir erstellen die Standard-Pipelines Setting, Closing, Upsell und Reaktivierung.
          Alle Phasen kannst du danach frei anpassen.
        </p>

        <form action={createOrganization} className="card p-6 space-y-4">
          <div>
            <label className="label" htmlFor="name">Name der Organisation</label>
            <input id="name" name="name" className="input" placeholder="z. B. Magnetic Medien" required />
          </div>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" name="demo" className="mt-0.5" defaultChecked />
            <span>Beispieldaten anlegen (Kontakte, Deals, Calls, Aufgaben) – jederzeit löschbar</span>
          </label>
          <button className="btn-primary w-full">Loslegen</button>
        </form>
      </div>
    </div>
  );
}
