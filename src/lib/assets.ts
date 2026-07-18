// 자산 분류 체계 · 기관 목록 · 통화/환산 · 이자 헬퍼
import type { Asset } from '../db/types'

export type AssetGroupKey = 'cash' | 'saving' | 'invest' | 'pension' | 'etc'

export interface SubType {
  key: string
  label: string
  group: AssetGroupKey
  inst?: 'bank' | 'securities' | 'both' | 'exchange' // 기관 선택 종류(은행/증권사/거래소)
  live?: 'stock' | 'coin' | 'gold' // 실시간 시세 소스 (gold=검색 없이 KRX 금값 자동)
  qty?: boolean // 수량 기반 투자자산
  rate?: boolean // 금리/만기/이자 (예적금)
  pension?: boolean // 연금 종류
  foreignOk?: boolean // 외화 입력 가능
}

export const SUBTYPES: SubType[] = [
  { key: 'checking', label: '입출금·현금', group: 'cash', inst: 'both', foreignOk: true },
  { key: 'savings', label: '예적금', group: 'saving', inst: 'bank', rate: true },
  { key: 'stock', label: '주식', group: 'invest', inst: 'securities', qty: true, live: 'stock' },
  { key: 'etf', label: 'ETF', group: 'invest', inst: 'securities', qty: true, live: 'stock' },
  { key: 'coin', label: '코인', group: 'invest', inst: 'exchange', qty: true, live: 'coin' },
  { key: 'gold', label: '금', group: 'invest', inst: 'securities', qty: true, live: 'gold' },
  { key: 'pension', label: '연금', group: 'pension', pension: true },
  { key: 'point', label: '포인트', group: 'etc' },
  { key: 'etc', label: '기타', group: 'etc' },
]

// 구버전 데이터 키 → 새 분류 매핑 (기존 자산이 자연스럽게 새 그룹으로 보이도록)
const ALIAS: Record<string, string> = {
  deposit: 'savings', brokerage_cash: 'checking', fx_account: 'checking', cash: 'checking', insurance: 'pension',
}

export const GROUPS: { key: AssetGroupKey; label: string; emoji: string; color: string }[] = [
  { key: 'cash', label: '입출금·현금', emoji: '💵', color: '#12b8a6' },
  { key: 'saving', label: '예적금', emoji: '🏦', color: '#3fc7b8' },
  { key: 'invest', label: '투자', emoji: '📈', color: '#5b8def' },
  { key: 'pension', label: '연금', emoji: '🛡️', color: '#9b8afb' },
  { key: 'etc', label: '기타·포인트', emoji: '📦', color: '#f5a524' },
]

export const subOf = (key: string) =>
  SUBTYPES.find((s) => s.key === (ALIAS[key] ?? key)) ?? SUBTYPES[SUBTYPES.length - 1]
export const groupOf = (key: string) => subOf(key).group

export const BANKS = [
  // 시중·특수은행
  '국민은행', '신한은행', '우리은행', '하나은행', '농협은행', '수협은행', 'IBK기업은행', 'SC제일은행', '한국씨티은행', 'KDB산업은행',
  // 인터넷은행
  '카카오뱅크', '토스뱅크', '케이뱅크',
  // 지방은행
  '부산은행', '경남은행', '대구은행(iM뱅크)', '광주은행', '전북은행', '제주은행',
  // 상호금융·기타
  '새마을금고', '신협', '우체국', '산림조합',
  // 저축은행
  'SBI저축은행', 'OK저축은행', '웰컴저축은행', '페퍼저축은행', '다올저축은행', '한국투자저축은행', '상상인저축은행', '애큐온저축은행', 'JT친애저축은행', '하나저축은행', '신한저축은행', 'KB저축은행', '모아저축은행', '저축은행(기타)',
]
export const SECURITIES = ['키움증권', '미래에셋증권', '삼성증권', 'NH투자증권', '한국투자증권', 'KB증권', '신한투자증권', '토스증권', '카카오페이증권', '하나증권', '대신증권', '메리츠증권', '유안타증권', '한화투자증권', '신영증권', 'DB금융투자', '교보증권', 'IBK투자증권', '현대차증권', '하이투자증권', '유진투자증권', 'SK증권', '다올투자증권', 'BNK투자증권', '상상인증권']
export const PENSION_KINDS = ['연금보험', 'IRP', '연금저축펀드', '연금저축보험', '퇴직연금', '기타']
export const EXCHANGES = ['업비트', '빗썸', '코인원', '코빗', '바이낸스', '바이비트', 'OKX', '게이트아이오', '기타']

export interface Currency { code: string; label: string; symbol: string }
export const CURRENCIES: Currency[] = [
  { code: 'KRW', label: '원 (KRW)', symbol: '₩' },
  { code: 'USD', label: '달러 (USD)', symbol: '$' },
  { code: 'JPY', label: '엔 (JPY)', symbol: '¥' },
  { code: 'VND', label: '동 (VND)', symbol: '₫' },
]

/** 자산의 원화 환산 금액 */
export function krwValue(a: Asset): number {
  if (!a.currency || a.currency === 'KRW') return a.amount
  return a.fxRate ? Math.round(a.amount * a.fxRate) : 0
}

/** 투자자산 원금·수익. 자산 통화 기준. (계좌형은 예수금 제외한 종목 합산으로) */
export function investPnl(a: Asset): { principal: number; profit: number; pct: number } | null {
  if (a.holdings && a.holdings.length) {
    const principal = a.holdings.reduce((s, h) => s + (h.principal || 0), 0)
    const value = a.holdings.reduce((s, h) => s + (h.value || 0), 0)
    if (principal <= 0) return null
    const profit = value - principal
    return { principal, profit, pct: (profit / principal) * 100 }
  }
  const principal = a.principal ?? (a.quantity && a.avgPrice ? a.quantity * a.avgPrice : undefined)
  if (!principal || principal <= 0) return null
  const profit = a.amount - principal
  return { principal, profit, pct: (profit / principal) * 100 }
}

// 이자소득세 15.4% (이자소득세 14% + 지방소득세 1.4%)
export const INTEREST_TAX = 0.154

// 과세 유형별 세율 — 일반과세 15.4% / 세금우대(상호금융 조합예탁금) 농특세 1.4% / 비과세 0%
export const TAX_RATES: Record<string, number> = { normal: 0.154, preferential: 0.014, taxfree: 0 }
export const TAX_LABELS: Record<string, string> = { normal: '일반과세', preferential: '세금우대', taxfree: '비과세' }

/**
 * 예적금·통장 예상이자 (단순 근사). 원화 기준.
 * annual=연 이자(세전), annualNet=세후.
 * 만기까지 총 이자는 "가입일(startDate)"이 있어야 계산 — 가입일~만기 기간 기준.
 *   (가입일이 없으면 기간을 알 수 없어 연 이자만 돌려준다.)
 * ※ 적금은 잔액이 매월 늘어 실제론 더 적음 → 대략치.
 */
export function expectedInterest(a: Asset): { annual: number; annualNet: number; toMaturity?: number; toMaturityNet?: number; months?: number } | null {
  if (!a.rate || a.rate <= 0) return null
  const bal = krwValue(a)
  if (bal <= 0) return null
  const taxRate = TAX_RATES[a.taxType ?? 'normal'] ?? INTEREST_TAX
  const net = (v: number) => Math.round(v * (1 - taxRate))
  const annual = Math.round((bal * a.rate) / 100)
  const base = { annual, annualNet: net(annual) }
  if (!a.maturity || !a.startDate) return base
  const [sy, sm] = a.startDate.split('-').map(Number)
  const [my, mm] = a.maturity.split('-').map(Number)
  const months = Math.max(0, (my - sy) * 12 + (mm - sm))
  if (months <= 0) return base
  const toMaturity = Math.round((annual * months) / 12)
  return { ...base, months, toMaturity, toMaturityNet: net(toMaturity) }
}
