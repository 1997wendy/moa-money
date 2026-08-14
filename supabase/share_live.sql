-- 모아 · 공유본 자동 갱신용 (1회만 실행)
--
-- 지금까지 이메일 공유는 '공유 버튼 누른 순간의 복사본'이라, 내용이 바뀌어도 상대에겐 옛 내용이 보였다.
-- 이제 내 데이터가 동기화될 때마다 공유본도 같이 최신으로 바꿔주는데,
-- 그러려면 "이 공유가 어느 프로필의 것인지"를 알아야 한다. 그 id를 담을 칸을 추가한다.
--
-- (비밀 링크 표 public_shares 에는 profile_id 칸이 이미 있다.)

alter table public.shared_profiles add column if not exists profile_id text;
