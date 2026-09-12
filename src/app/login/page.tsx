'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/client';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const supabase = createClient();

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setError(error.message); setBusy(false); return; }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email, password, options: { data: { full_name: name } },
      });
      if (error) { setError(error.message); setBusy(false); return; }
      if (!data.session) {
        setInfo('Bitte bestätige die E-Mail in deinem Postfach und melde dich danach an.');
        setBusy(false);
        return;
      }
    }
    router.push(params.get('weiter') || '/dashboard');
    router.refresh();
  }

  return (
    <div className="min-h-dvh grid place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-brand text-white font-bold">M</div>
          <h1 className="text-xl font-semibold">Magnetic_CRM</h1>
          <p className="text-sm text-muted mt-1">CRM nach dem Setter-Closer-Prinzip</p>
        </div>

        <form onSubmit={onSubmit} className="card p-6 space-y-4">
          {mode === 'register' && (
            <div>
              <label className="label" htmlFor="name">Name</label>
              <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)}
                     autoComplete="name" required />
            </div>
          )}
          <div>
            <label className="label" htmlFor="email">E-Mail</label>
            <input id="email" type="email" className="input" value={email}
                   onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </div>
          <div>
            <label className="label" htmlFor="password">Passwort</label>
            <input id="password" type="password" className="input" value={password}
                   onChange={(e) => setPassword(e.target.value)} minLength={6}
                   autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
          </div>

          {error && <p className="text-sm text-lose">{error}</p>}
          {info && <p className="text-sm text-win">{info}</p>}

          <button className="btn-primary w-full" disabled={busy}>
            {busy ? 'Moment …' : mode === 'login' ? 'Anmelden' : 'Konto erstellen'}
          </button>

          <button type="button" className="w-full text-sm text-muted hover:text-ink transition"
                  onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); setInfo(null); }}>
            {mode === 'login' ? 'Noch kein Konto? Registrieren' : 'Schon registriert? Anmelden'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
