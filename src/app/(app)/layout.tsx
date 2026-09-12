import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import Sidebar from '@/components/Sidebar';
import UserMenu from '@/components/UserMenu';
import { signOut } from '@/app/actions/auth';
import GlobalSearch from '@/components/GlobalSearch';
import RealtimeSync from '@/components/RealtimeSync';
import type { Pipeline } from '@/lib/types';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireProfile();
  const supabase = await createClient();
  const [{ data: org }, { data: pipelines }] = await Promise.all([
    supabase.from('organizations').select('name').eq('id', profile.org_id!).maybeSingle(),
    supabase.from('pipelines').select('*').eq('org_id', profile.org_id!).eq('archived', false).order('position'),
  ]);

  return (
    <div className="flex min-h-dvh">
      <Sidebar
        orgName={org?.name ?? 'Organisation'}
        userName={profile.full_name || profile.email || 'Nutzer'}
        pipelines={(pipelines ?? []) as Pipeline[]}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-surface/80 py-2.5 pl-14 pr-3 backdrop-blur sm:gap-3 md:px-4">
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-3">
            <RealtimeSync userId={profile.id} name={profile.full_name || profile.email || 'Kollege'} />
            <UserMenu
              name={profile.full_name || profile.email || 'Nutzer'}
              role={profile.role}
              signOutAction={signOut}
            />
          </div>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
