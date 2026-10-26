-- Nexus private integration storage. Apply in the Supabase SQL editor.
-- The backend accesses this table only with the server-side service role key.
create table if not exists public.github_connections (
  github_id bigint primary key,
  login text not null,
  token_ciphertext text not null,
  scopes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.github_connections enable row level security;
revoke all on table public.github_connections from anon, authenticated;
grant select, insert, update, delete on table public.github_connections to service_role;

-- No anon/authenticated policies are intentionally created. The service role
-- bypasses RLS and must never be sent to the browser.
