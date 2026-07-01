// ===== 데이터 타입 정의 =====
// 앱 전체가 이 타입들을 공유한다. 저장 위치(로컬/클라우드)와 무관하게 동일.

export type ID = string

/** 사용자 프로필 (본인 / 동생 …) */
export interface Profile {
  id: ID
  name: string
  order: number
  salary?: number // 연 총급여 (연말정산 계산용)
  hiddenMenus?: string[] // 이 프로필에서 숨길 메뉴 키
  pinHash?: string // PIN 잠금(설정 시). 가벼운 잠금 — SHA-256 해시
  targetAlloc?: Record<string, number> // 목표 자산 비중(%) — cash/stock/coin/gold
}

/** 자산 (계좌·주식·코인 등). type = 세부분류 키(assets.ts SUBTYPES) */
export interface Asset {
  id: ID
  profileId: ID
  type: string
  name: string
  amount: number // 통화 단위 금액 (외화면 외화 금액)
  currency?: string // 'KRW' | 'USD' | 'JPY' | 'VND' (기본 KRW)
  fxRate?: number // 외화 1단위 → 원화 환율
  institution?: string // 은행/증권사
  market?: 'kr' | 'us' // 주식/ETF 국내(kr)/해외(us)
  targetPrice?: number // 내가 정한 목표가 (참고)
  quantity?: number // 투자자산 보유 수량
  unitPrice?: number // 단가
  ticker?: string // 종목 코드
  updatedAt: string // ISO
}

export type TxType = 'income' | 'expense'

/** 한 거래 안의 분할 내역 (N분 결제·카테고리 쪼개기·정산) */
export interface Split {
  id: ID
  category: string
  amount: number
  owedBy?: ID | null // 정산 상대 personId (있으면 정산 목록에 노출)
  owedDir?: 'in' | 'out' // in=받을돈(기본) / out=줄돈
  settled?: boolean // 정산 완료 여부
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

export type RepeatKind = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
/** 일정 */
export interface Schedule {
  id: ID
  profileId: ID
  date: string // yyyy-mm-dd (반복이면 시작일)
  time?: string // HH:mm
  title: string
  memo?: string
  source: 'manual' | 'external'
  color?: string // 색상 키 (colors.ts)
  repeat?: RepeatKind
  repeatUntil?: string // yyyy-mm-dd (선택)
  exceptions?: string[] // 이 날짜들은 반복에서 제외 (단일 회차 수정/삭제용)
}

/** 카드 혜택 규칙 (영역별) */
export interface BenefitRule {
  id: ID
  area: string // 영역명 (편의점/배달/생활 등)
  merchants: string[] // 매칭 키워드 (GS25, CU …)
  kind: 'rate' | 'fixed' // 정률(%) / 정액(원, 건당)
  value: number
  cap?: number // 월 혜택 한도
}

/** 카드 (혜택·실적 규칙) */
export interface Card {
  id: ID
  profileId: ID
  name: string
  type?: 'credit' | 'check' // 신용/체크 (연말정산 계산용)
  requiredSpend?: number // 월 실적 조건 금액
  benefits?: BenefitRule[] // 영역별 혜택 규칙
  cycle?: 'prev-month' | 'this-month'
  // legacy(구버전 데이터 호환)
  benefitCap?: number
  rate?: number
  area?: string
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

/** 매달 반복 정산 (엄마 관리비·보험 등) */
export interface RecurringReceivable {
  id: ID
  profileId: ID
  personId: ID
  label: string
  amount: number
  dayOfMonth: number
  direction?: 'in' | 'out' // in=받을돈(기본) / out=줄돈
  paidMonths?: string[] // 정산 완료한 월 목록 (yyyy-mm)
}

/** 카테고리 (필터·합계 기준) */
export interface Category {
  id: ID
  profileId: ID
  name: string
  kind: TxType | 'both'
  order: number
}
