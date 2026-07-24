-- AJ Words cloud sync — Supabase schema.
-- This is the exact schema deployed to the project. Run once in the Supabase
-- SQL editor (Dashboard → SQL → New query → Run). Also enable Anonymous
-- sign-ins: Authentication → Sign In / Providers → "Allow anonymous sign-ins".
--
-- What this creates:
--   * public.lists            — one row per user-owned list (CONTENT only).
--   * public.device_pairings  — short-lived, single-use QR pairing codes.
--   * public.redeem_device_pairing(text) — exchange a code for a session.
--
-- Progress/learning state is intentionally NOT stored here; it stays on-device.

-- ---------------------------------------------------------------------------
-- Lists (content only). Composite PK (owner, id) so ids are unique per user.
-- ---------------------------------------------------------------------------
create table if not exists public.lists (
  id         text        not null,
  owner      uuid        not null default auth.uid() references auth.users on delete cascade,
  title      text        not null,
  language   text,
  content    jsonb       not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner, id)
);

alter table public.lists enable row level security;

drop policy if exists "lists_owner_all" on public.lists;
create policy "lists_owner_all" on public.lists
  for all
  using (owner = auth.uid())
  with check (owner = auth.uid());

-- ---------------------------------------------------------------------------
-- Device pairing. A signed-in device inserts a code + its own session tokens;
-- a new device redeems the code (via the RPC below) to adopt that session.
-- No direct SELECT policy exists, so codes/tokens are never listable — the
-- SECURITY DEFINER RPC is the only read path, and only for a known code.
-- ---------------------------------------------------------------------------
create table if not exists public.device_pairings (
  code          text        primary key,
  owner         uuid        not null default auth.uid() references auth.users on delete cascade,
  access_token  text        not null,
  refresh_token text        not null,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);

alter table public.device_pairings enable row level security;

drop policy if exists "pairings_owner_insert" on public.device_pairings;
create policy "pairings_owner_insert" on public.device_pairings
  for insert
  with check (owner = auth.uid());

drop policy if exists "pairings_owner_delete" on public.device_pairings;
create policy "pairings_owner_delete" on public.device_pairings
  for delete
  using (owner = auth.uid());

-- Exchange a code for its session tokens, then consume it (single use).
-- Granted to `public` so a not-yet-authenticated new device can redeem.
create or replace function public.redeem_device_pairing(pairing_code text)
returns table (access_token text, refresh_token text)
language plpgsql
security definer
set search_path = public
as $FUNC$
declare
  rec public.device_pairings;
begin
  select * into rec
    from public.device_pairings
    where code = pairing_code and expires_at > now();

  if not found then
    raise exception 'invalid or expired pairing code';
  end if;

  delete from public.device_pairings where code = rec.code;

  access_token := rec.access_token;
  refresh_token := rec.refresh_token;
  return next;
end;
$FUNC$;

grant execute on function public.redeem_device_pairing(text) to public;
