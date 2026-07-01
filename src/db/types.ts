// ===== 데이터 타입 정의 =====
// 앱 전체가 이 타입들을 공유한다. 저장 위치(로컬/클라우드)와 무관하게 동일.

export type ID = string

/** 사용자 프로필 (본인 / 동생 …) */
export interface Profile {
  id: ID
  name: string
  order: number
}

export type AssetType = 'cash' | 'account' | 'stock' | 'coin' | 'etc'
/** 자산 (계좌·주식·코인 등) */
export interface Asset {
  id: ID
  profileId: ID
  type: AssetType
  name: string
  amount: number // 평가금액 (KRW)
  quantity?: number // 투자자산 보유 수량
  unitPrice?: number // 단가
  ticker?: string // 종목 코드
  updatedAt: string // ISO
}

export type TxType = 'income' | 'expense'

/** 한 거래 안의 분할 내역 (N분 결제·카테고리 쪼개기·받을돈) */
export interface Split {
  id: ID
  category: string
  amount: number
  owedBy?: ID | null // 받을돈 대상 personId (있으면 정산 목록에 노출)
  settled?: boolean // 수령 완료 여부
  settledAt?: string | null
  note?: string
}

/** 거래 (수입/지출). 총액은 splits 합과 같다. */
export interface Transaction {
  id: ID
  profileId: ID
  date: string // yyyy-mm-dd
  type: TxType
  merchant: string
  amount: number // 총액
  cardId?: ID | null // 결제 카드
  method?: string // 결제수단 표기(카드 없을 때)
  memo?: string
  splits: Split[]
  betterCardNote?: string // "다음엔 이 카드로" 회고 메모
  createdAt: string
}

/** 일정 */
export interface Schedule {
  id: ID
  profileId: ID
  date: string // yyyy-mm-dd
  time?: string // HH:mm
  title: string
  memo?: string
  source: 'manual' | 'external'
  color?: string
}

/** 카드 (혜택·실적 규칙) */
export interface Card {
  id: ID
  profileId: ID
  name: string
  requiredSpend?: number // 실적 조건 금액
  benefitCap?: number // 월 혜택 한도
  rate?: number // 적립/할인율 %
  area?: string // 혜택 영역 (배달/카페 등)
  cycle?: 'prev-month' | 'this-month' // 실적 기준
}

/** 목표 (스냅샷 버전: effectiveFrom 월부터 적용) */
export interface Goal {
  id: ID
  profileId: ID
  targetAmount: number
  targetDate?: string // yyyy-mm
  effectiveFrom: string // yyyy-mm (이 월부터 이 목표 적용)
  label?: string
  createdAt: string
}

export type PersonKind = 'dad' | 'mom' | 'sibling' | 'other'
/** 정산 상대 (돈 받을 사람: 아빠·엄마·동생 …) */
export interface Person {
  id: ID
  profileId: ID
  name: string
  kind: PersonKind
}

/** 매달 반복해서 받을 돈 (엄마 관리비·보험 등) */
export interface RecurringReceivable {
  id: ID
  profileId: ID
  personId: ID
  label: string
  amount: number
  dayOfMonth: number
}

/** 카테고리 (필터·합계 기준) */
export interface Category {
  id: ID
  profileId: ID
  name: string
  kind: TxType | 'both'
  order: number
}
