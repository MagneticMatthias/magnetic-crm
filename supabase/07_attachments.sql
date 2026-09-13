-- ============================================================
-- Anhaenge an Notizen (Bilder, Dateien) in Supabase Storage.
-- Nach 06_grants.sql ausfuehren.
-- ============================================================

create table if not exists note_attachments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  note_id uuid not null references notes(id) on delete cascade,
  path text not null,            -- Pfad im Bucket: <org_id>/<uuid>-<dateiname>
  name text not null,
  size int not null default 0,
  mime text,
  created_at timestamptz not null default now()
);
create index if not exists idx_note_attachments_note on note_attachments(note_id);

alter table note_attachments enable row level security;
drop policy if exists note_attachments_all on note_attachments;
create policy note_attachments_all on note_attachments for all
  using (org_id = current_org()) with check (org_id = current_org());

grant all on note_attachments to anon, authenticated, service_role;

-- Privater Bucket; Zugriff nur auf den eigenen Organisations-Ordner
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 26214400)   -- 25 MB je Datei
on conflict (id) do nothing;

drop policy if exists attachments_read on storage.objects;
create policy attachments_read on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = current_org()::text);

drop policy if exists attachments_insert on storage.objects;
create policy attachments_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = current_org()::text);

drop policy if exists attachments_delete on storage.objects;
create policy attachments_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = current_org()::text);
