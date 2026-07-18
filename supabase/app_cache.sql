-- KIS 토큰 등 서버 캐시용 테이블.
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 1회 실행하면 됨.
-- (이 테이블이 있어야 kr-stock 함수가 토큰을 저장·재사용 → 카톡 발급알림/1분1회 제한 회피)

create table if not exists public.app_cache (
  key text primary key,
  value text not null,
  expires_at bigint not null
);

-- Edge Function(service_role)만 접근. 일반 사용자 접근은 막음.
alter table public.app_cache enable row level security;
-- (정책을 두지 않으면 service_role만 읽고 쓸 수 있음 — 의도된 동작)
