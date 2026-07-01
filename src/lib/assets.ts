// 자산 분류 체계 · 기관 목록 · 통화/환산 헬퍼
import type { Asset } from '../db/types'

export type AssetGroupKey = 'bank' | 'cash' | 'invest' | 'insurance' | 'etc'

export interface SubType {
  key: string
  label: string
  group: AssetGroupKey
  inst?: 'bank' | 'securities' // 기관 선택 종류
  qty?: boolean // 수량/시세 입력
  tickerRequired?: boolean
}

export const SUBTYPES: SubType[] = [
  { key: 'checking', label: '입출금', group: 'bank', inst: 'bank' },
  { key: 'savings', label: '적금', group: 'bank', inst: 'bank' },
  { key: 'deposit', label: '예금', group: 'bank', inst: 'bank' },
  { key: 'brokerage_cash', label: '증권 입출금(예수금)', group: 'bank', inst: 'securities' },
  { key: 'fx_account', label: '외화통장', group: 'bank', inst: 'bank' },
  { key: 'cash', label: '현금', group: 'cash' },
  { key: 'stock', label: '주식', group: 'invest', inst: 'securities', qty: true },
  { key: 'etf', label: 'ETF', group: 'invest', inst: 'securities', qty: true },
  { key: 'coin', label: '코인', group: 'invest', qty: true, tickerRequired: true },
  { key: 'gold', label: '금', group: 'invest', qty: true },
  { key: 'insurance', label: '보험', group: 'insurance' },
  { key: 'etc', label: '기타', group: 'etc' },
]

export const GROUPS: { key: AssetGroupKey; label: string; emoji: string; color: string }[] = [
  { key: 'bank', label: '은행', emoji: '🏦', color: '#12b8a6' },
  { key: 'cash', label: '현금', emoji: '💵', color: '#3fc7b8' },
  { key: 'invest', label: '투자', emoji: '📈', color: '#5b8def' },
  { key: 'insurance', label: '보험', emoji: '🛡️', color: '#9b8afb' },
  { key: 'etc', label: '기타', emoji: '📦', color: '#f5a524' },
]

export const subOf = (key: string) => SUBTYPES.find((s) => s.key === key) ?? SUBTYPES[SUBTYPES.length - 1]
export const groupOf = (key: string) => subOf(key).group

export const BANKS = ['국민은행', '신한은행', '우리은행', '하나은행', '농협은행', 'IBK기업은행', 'SC제일은행', '카카오뱅크', '토스뱅크', '케이뱅크', '새마을금고', '우체국']
export const SECURITIES = ['키움증권', '미래에셋증권', '삼성증권', 'NH투자증권', '한국투자증권', 'KB증권', '신한투자증권', '토스증권', '대신증권']

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
