-- 모아 · 비밀 URL 공유 (가입 없이 링크만으로 읽기 전용 열람)
-- Supabase 대시보드 → 왼쪽 "SQL Editor" → 아래 전체 붙여넣고 Run. (1회만)
--
-- [보안 설계 요약]
-- 1) 테이블 자체는 익명(로그인 안 한 사람)에게 아무 권한도 주지 않는다 → 통째로 긁어가기 불가
-- 2) 대신 아래 get_public_share() 함수만 열어둔다. 이 함수는 '토큰(추측 불가능한 uuid)'을
--    정확히 아는 경우에만 딱 1건을 돌려준다. 목록 조회는 어떤 방법으로도 안 된다.
-- 3) 만료일이 지난 링크는 함수가 아예 결과를 주지 않는다.
-- 4) 숨김 처리한 메뉴의 데이터는 애초에 앱에서 빼고 저장하므로 이 표에 담기지도 않는다.

create table if not exists public.public_shares (
  id uuid primary key default gen_random_uuid(),   -- 이 값이 곧 링크의 '비밀 토큰'
  owner_id uuid not null references auth.users(id) on delete cascade,
  label text,                                      -- 내가 알아보기 위한 메모 (예: "엄마한테 보낸 링크")
  profile_id text,                                 -- '지금 데이터로 갱신'할 때 쓰는 내 프로필 id
  profile_name text not null,
  menu_perms jsonb not null default '{}'::jsonb,
  data jsonb not null,                             -- 만든 시점의 스냅샷(보이기로 한 메뉴만)
  expires_at timestamptz,                          -- null = 무기한
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists public_shares_owner_idx on public.public_shares (owner_id);

alter table public.public_shares enable row level security;

-- 소유자만 자기 링크를 만들고/보고/갱신하고/지울 수 있다. (익명 정책은 일부러 만들지 않음)
drop policy if exists "pubshare_owner_all" on public.public_shares;
create policy "pubshare_owner_all" on public.public_shares
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- 토큰을 정확히 아는 경우에만 1건 반환하는 전용 통로.
-- security definer = 이 함수 안에서는 위의 RLS를 통과해 조회할 수 있다는 뜻.
create or replace function public.get_public_share(p_token uuid)
returns table (profile_name text, menu_perms jsonb, data jsonb, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select s.profile_name, s.menu_perms, s.data, s.updated_at
  from public.public_shares s
  where s.id = p_token
    and (s.expires_at is null or s.expires_at > now())
  limit 1;
$$;

revoke all on function public.get_public_share(uuid) from public;
grant execute on function public.get_public_share(uuid) to anon, authenticated;
