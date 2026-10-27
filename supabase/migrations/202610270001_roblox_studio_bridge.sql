-- Private queue for pairing Nexus with a Roblox Studio plugin.
-- Only the Supabase service role can access these tables.

create table if not exists public.nexus_studio_sessions (
  id uuid primary key default gen_random_uuid(),
  pair_code text unique,
  session_token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'paired', 'revoked')),
  expires_at timestamptz not null,
  paired_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.nexus_studio_tasks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.nexus_studio_sessions(id) on delete cascade,
  task text not null check (char_length(task) between 1 and 3000),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  result text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz
);

create index if not exists nexus_studio_tasks_queue_idx on public.nexus_studio_tasks (session_id, status, created_at);
alter table public.nexus_studio_sessions enable row level security;
alter table public.nexus_studio_tasks enable row level security;
revoke all on public.nexus_studio_sessions from anon, authenticated;
revoke all on public.nexus_studio_tasks from anon, authenticated;
grant all on public.nexus_studio_sessions to service_role;
grant all on public.nexus_studio_tasks to service_role;
