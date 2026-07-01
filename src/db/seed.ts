// ===== 최초 실행 시 샘플 데이터 심기 =====
// 프로필이 하나도 없을 때만 1회 실행된다. (실데이터가 있으면 건드리지 않음)

import { db } from './database'
import { uid } from './repository'
import type { Split, Transaction } from './types'

const now = () => new Date().toISOString()

function tx(
  profileId: string,
  date: string,
  type: 'income' | 'expense',
  merchant: string,
  splits: Array<Partial<Split> & { category: string; amount: number }>,
  extra: Partial<Transaction> = {},
): Transaction {
  const fullSplits: Split[] = splits.map((s) => ({
    id: uid(),
    settled: false,
    owedBy: null,
    ...s,
  }))
  return {
    id: uid(),
    profileId,
    date,
    type,
    merchant,
    amount: fullSplits.reduce((sum, s) => sum + s.amount, 0),
    splits: fullSplits,
    createdAt: now(),
    ...extra,
  }
}

export async function seedIfEmpty() {
  const count = await db.profiles.count()
  if (count > 0) return

  // ---- 프로필 ----
  const me = uid()
  const sib = uid()
  await db.profiles.bulkPut([
    { id: me, name: '본인', order: 0 },
    { id: sib, name: '동생', order: 1 },
  ])

  // ---- 카테고리 ----
  const cats = [
    { name: '식비', kind: 'expense' as const },
    { name: '카페', kind: 'expense' as const },
    { name: '교통', kind: 'expense' as const },
    { name: '쇼핑', kind: 'expense' as const },
    { name: '구독', kind: 'expense' as const },
    { name: '의료', kind: 'expense' as const },
    { name: '문화', kind: 'expense' as const },
    { name: '여행', kind: 'expense' as const },
    { name: '급여', kind: 'income' as const },
    { name: '기타수입', kind: 'income' as const },
  ]
  await db.categories.bulkPut(
    cats.map((c, i) => ({ id: uid(), profileId: me, order: i, ...c })),
  )

  // ---- 정산 상대 (받을 사람) ----
  const dad = uid()
  const mom = uid()
  const sibPerson = uid()
  await db.people.bulkPut([
    { id: dad, profileId: me, name: '아빠', kind: 'dad' },
    { id: mom, profileId: me, name: '엄마', kind: 'mom' },
    { id: sibPerson, profileId: me, name: '동생', kind: 'sibling' },
  ])

  // ---- 매달 받을 돈 (엄마 관리비·보험) ----
  await db.recurring.bulkPut([
    { id: uid(), profileId: me, personId: mom, label: '관리비', amount: 120000, dayOfMonth: 15 },
    { id: uid(), profileId: me, personId: mom, label: '보험비', amount: 90000, dayOfMonth: 25 },
  ])

  // ---- 카드 ----
  const kb = uid()
  const shinhan = uid()
  await db.cards.bulkPut([
    {
      id: kb, profileId: me, name: '국민 이지카드',
      requiredSpend: 300000, benefitCap: 10000, rate: 0.5, area: '전 가맹점', cycle: 'prev-month',
    },
    {
      id: shinhan, profileId: me, name: '신한 딥드림',
      requiredSpend: 400000, benefitCap: 15000, rate: 5, area: '배달', cycle: 'prev-month',
    },
  ])

  // ---- 자산 ----
  await db.assets.bulkPut([
    { id: uid(), profileId: me, type: 'account', name: '국민은행 입출금', amount: 32100000, updatedAt: now() },
    { id: uid(), profileId: me, type: 'account', name: '토스뱅크 예금', amount: 32000000, updatedAt: now() },
    { id: uid(), profileId: me, type: 'stock', name: '애플(AAPL)', ticker: 'AAPL', quantity: 40, unitPrice: 355000, amount: 14200000, updatedAt: now() },
    { id: uid(), profileId: me, type: 'stock', name: '삼성전자', ticker: '005930', quantity: 200, unitPrice: 82000, amount: 16400000, updatedAt: now() },
    { id: uid(), profileId: me, type: 'stock', name: 'S&P500 ETF', quantity: 100, unitPrice: 197000, amount: 19700000, updatedAt: now() },
    { id: uid(), profileId: me, type: 'coin', name: '비트코인', ticker: 'BTC', quantity: 0.15, unitPrice: 102000000, amount: 15300000, updatedAt: now() },
    { id: uid(), profileId: me, type: 'coin', name: '이더리움', ticker: 'ETH', quantity: 2.1, unitPrice: 3619000, amount: 7600000, updatedAt: now() },
    // 동생
    { id: uid(), profileId: sib, type: 'account', name: '카카오뱅크', amount: 8400000, updatedAt: now() },
    { id: uid(), profileId: sib, type: 'stock', name: 'S&P500 ETF', quantity: 20, unitPrice: 197000, amount: 3940000, updatedAt: now() },
  ])

  // ---- 거래 ----
  await db.transactions.bulkPut([
    tx(me, '2026-07-01', 'income', '급여', [{ category: '급여', amount: 4200000 }]),
    tx(me, '2026-07-01', 'expense', '스타벅스 강남점', [{ category: '카페', amount: 6300 }], { cardId: kb, method: '국민 이지카드' }),
    tx(me, '2026-07-01', 'expense', '배달의민족', [{ category: '식비', amount: 23000 }], {
      cardId: kb, method: '국민 이지카드',
      betterCardNote: '신한 딥드림(배달 5%)로 결제했으면 1,150원 아꼈어요.',
    }),
    tx(me, '2026-07-01', 'expense', '카카오T', [{ category: '교통', amount: 11200 }], { cardId: shinhan, method: '신한 딥드림' }),
    tx(me, '2026-07-01', 'expense', '넷플릭스', [{ category: '구독', amount: 17000 }], { cardId: kb, method: '국민 이지카드', memo: '매월 반복' }),
    // N분 분할결제: 제주 여행 정산 12만 → 나·동생·엄마 4만씩
    tx(me, '2026-07-05', 'expense', '제주 여행 정산', [
      { category: '여행', amount: 40000, note: '내 몫' },
      { category: '여행', amount: 40000, owedBy: sibPerson, note: '동생 몫' },
      { category: '여행', amount: 40000, owedBy: mom, note: '엄마 몫' },
    ], { cardId: kb, method: '국민 이지카드' }),
    // 아빠 카드 정산 대상
    tx(me, '2026-06-30', 'expense', '쿠팡', [{ category: '쇼핑', amount: 48900, owedBy: dad }], { cardId: kb, method: '국민 이지카드' }),
    tx(me, '2026-06-28', 'expense', 'GS칼텍스 주유', [{ category: '교통', amount: 70000, owedBy: dad }], { cardId: kb, method: '국민 이지카드' }),
    tx(me, '2026-06-25', 'expense', 'OO병원', [{ category: '의료', amount: 704500, owedBy: dad }], { cardId: kb, method: '국민 이지카드' }),
    tx(me, '2026-06-29', 'expense', '올리브영', [{ category: '의료', amount: 32400 }], { method: '체크카드' }),
  ])

  // ---- 일정 ----
  await db.schedules.bulkPut([
    { id: uid(), profileId: me, date: '2026-07-05', title: '가족모임', source: 'manual' },
    { id: uid(), profileId: me, date: '2026-07-12', title: '카드결제일', source: 'manual' },
    { id: uid(), profileId: me, date: '2026-07-15', title: '관리비 자동이체', source: 'manual' },
    { id: uid(), profileId: me, date: '2026-07-18', title: '동생 생일', source: 'manual' },
  ])

  // ---- 목표 (스냅샷 데모: 7월부터 2억으로 상향) ----
  await db.goals.bulkPut([
    { id: uid(), profileId: me, targetAmount: 150000000, targetDate: '2026-12', effectiveFrom: '2026-01', label: '1.5억 만들기', createdAt: now() },
    { id: uid(), profileId: me, targetAmount: 200000000, targetDate: '2027-08', effectiveFrom: '2026-07', label: '2억 만들기', createdAt: now() },
  ])
}
