-- 모아 · 클라우드 1단계 스키마
-- Supabase 대시보드 → 왼쪽 "SQL Editor" → 아래 전체 붙여넣고 Run.
-- (로그인한 본인만 자기 데이터에 접근하도록 RLS 적용)

create table if not exists public.backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.backups enable row level security;

drop policy if exists "own_select" on public.backups;
drop policy if exists "own_insert" on public.backups;
drop policy if exists "own_update" on public.backups;

create policy "own_select" on public.backups
  for select using (auth.uid() = user_id);
create policy "own_insert" on public.backups
  for insert with check (auth.uid() = user_id);
create policy "own_update" on public.backups
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ===== 2단계: 프로필 공유 (마스터 → 상대) =====
create table if not exists public.shared_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  owner_email text,
  target_email text not null,
  profile_name text not null,
  permission text not null default 'read',
  hidden_menus text[] not null default '{}',
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.shared_profiles enable row level security;
drop policy if exists "share_owner_all" on public.shared_profiles;
drop policy if exists "share_target_select" on public.shared_profiles;
drop policy if exists "share_target_update" on public.shared_profiles;
create policy "share_owner_all" on public.shared_profiles
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "share_target_select" on public.shared_profiles
  for select using ((auth.jwt() ->> 'email') = target_email);
create policy "share_target_update" on public.shared_profiles
  for update using ((auth.jwt() ->> 'email') = target_email and permission = 'edit')
  with check ((auth.jwt() ->> 'email') = target_email and permission = 'edit');
