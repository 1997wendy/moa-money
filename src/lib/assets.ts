// 자산 분류 체계 · 기관 목록 · 통화/환산 · 이자 헬퍼
import type { Asset } from '../db/types'
import { todayISO } from './format'

export type AssetGroupKey = 'cash' | 'saving' | 'invest' | 'pension' | 'etc'

export interface SubType {
  key: string
  label: string
  group: AssetGroupKey
  inst?: 'bank' | 'securities' | 'both' // 기관 선택 종류
  live?: 'stock' | 'coin' // 실시간 시세(검색) 소스
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
  { key: 'coin', label: '코인', group: 'invest', qty: true, live: 'coin' },
  { key: 'gold', label: '금', group: 'invest', qty: true },
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

export const BANKS = ['국민은행', '신한은행', '우리은행', '하나은행', '농협은행', 'IBK기업은행', 'SC제일은행', '카카오뱅크', '토스뱅크', '케이뱅크', '새마을금고', '우체국']
export const SECURITIES = ['키움증권', '미래에셋증권', '삼성증권', 'NH투자증권', '한국투자증권', 'KB증권', '신한투자증권', '토스증권', '대신증권']
export const PENSION_KINDS = ['연금보험', 'IRP', '연금저축펀드', '연금저축보험', '퇴직연금', '기타']

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

/** 투자자산 원금·수익 (평단가 있을 때). 자산 통화 기준. */
export function investPnl(a: Asset): { principal: number; profit: number; pct: number } | null {
  if (!a.quantity || !a.avgPrice) return null
  const principal = a.quantity * a.avgPrice
  if (principal <= 0) return null
  const profit = a.amount - principal
  return { principal, profit, pct: (profit / principal) * 100 }
}

// 이자소득세 15.4% (이자소득세 14% + 지방소득세 1.4%)
export const INTEREST_TAX = 0.154

/**
 * 예적금 예상이자 (단순 근사). 원화 기준.
 * annual=연 이자(세전), annualNet=세후. 만기 있으면 toMaturity(세전)/toMaturityNet(세후).
 * ※ 적금은 잔액이 매월 늘어 실제론 더 적음 → 대략치.
 */
export function expectedInterest(a: Asset): { annual: number; annualNet: number; toMaturity?: number; toMaturityNet?: number; monthsLeft?: number } | null {
  if (!a.rate || a.rate <= 0) return null
  const bal = krwValue(a)
  if (bal <= 0) return null
  const net = (v: number) => Math.round(v * (1 - INTEREST_TAX))
  const annual = Math.round((bal * a.rate) / 100)
  if (!a.maturity) return { annual, annualNet: net(annual) }
  const today = todayISO()
  const [ny, nm] = today.split('-').map(Number)
  const [my, mm] = a.maturity.split('-').map(Number)
  const monthsLeft = Math.max(0, (my - ny) * 12 + (mm - nm))
  const toMaturity = Math.round((annual * monthsLeft) / 12)
  return { annual, annualNet: net(annual), monthsLeft, toMaturity, toMaturityNet: net(toMaturity) }
}
