create table if not exists public.nexus_build_activity (
  id bigint generated always as identity primary key,
  run_id text not null check (run_id ~ '^[a-f0-9]{32}$'),
  stage text not null check (length(stage) <= 80),
  message text not null check (length(message) <= 500),
  provider text,
  level text not null default 'info' check (level in ('info','success','warning','error')),
  created_at timestamptz not null default now()
);
create index if not exists nexus_build_activity_run_created_idx
  on public.nexus_build_activity (run_id, created_at asc, id asc);
alter table public.nexus_build_activity enable row level security;
revoke all on table public.nexus_build_activity from anon, authenticated;
grant select, insert, update, delete on table public.nexus_build_activity to service_role;
grant usage, select on sequence public.nexus_build_activity_id_seq to service_role;