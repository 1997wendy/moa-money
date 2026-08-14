-- 청약 알림 설정 저장소
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run 을 누르면 됩니다. (1회만)

create table if not exists public.apply_watch (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,        -- 알림 전체 on/off
  regions text[] not null default '{}',         -- 관심지역 (분양 주소에 포함될 단어)
  email text,                                   -- 알림 받을 메일 주소
  email_on boolean not null default true,
  special_on boolean not null default false,    -- 특별공급 알림 (자격 확인 전이라 기본 꺼짐)
  notified jsonb not null default '{}'::jsonb,  -- 이미 보낸 알림 기록 → 같은 공고를 매일 다시 보내지 않도록
  updated_at timestamptz not null default now()
);

-- 본인 것만 읽고 쓸 수 있게 잠금
alter table public.apply_watch enable row level security;

drop policy if exists "apply_watch own select" on public.apply_watch;
drop policy if exists "apply_watch own insert" on public.apply_watch;
drop policy if exists "apply_watch own update" on public.apply_watch;

create policy "apply_watch own select" on public.apply_watch for select using (auth.uid() = user_id);
create policy "apply_watch own insert" on public.apply_watch for insert with check (auth.uid() = user_id);
create policy "apply_watch own update" on public.apply_watch for update using (auth.uid() = user_id);
