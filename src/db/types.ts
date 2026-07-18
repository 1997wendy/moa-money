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
  investContext?: string // 투자 성향/메모 (적립식 등) — 코칭 반영
  netWorthHistory?: Record<string, number> // 월별(yyyy-mm) 순자산 스냅샷 — 실제 추이용
  calSubs?: CalSub[] // 구독 캘린더(.ics) — 구글·카카오 등 외부 일정 읽기
}

/** 외부 캘린더 구독 (.ics URL) */
export interface CalSub {
  id: ID
  name: string // 표시 이름 (예: 구글, 카카오)
  url: string // .ics 주소
  color: string // 색상 키 (colors.ts)

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
  avgPrice?: number // 평단가 (수익률 계산용)
  quantity?: number // 투자자산 보유 수량
  unitPrice?: number // 단가
  ticker?: string // 종목 코드
  principal?: number // 투자 원금 (투자자산: 원금 대비 수익 계산)
  holdings?: Holding[] // 계좌형(IRP·연금저축펀드 등) 개별 보유 종목. amount=Σ평가액+cash
  cash?: number // 계좌형 예수금(현금). 총 평가액에 포함, 수익 계산엔 제외
  rate?: number // 예적금·입출금(통장) 금리 (연 %)
  taxType?: 'normal' | 'preferential' | 'taxfree' // 일반과세(15.4%)/세금우대(1.4%)/비과세(0%)
  startDate?: string // 예적금 가입일 yyyy-mm-dd (있으면 만기까지 총 이자 계산)
  maturity?: string // 예적금 만기일 yyyy-mm-dd (없으면 무제한)
  savingKind?: 'deposit' | 'installment' // 예금 / 적금
  subLabel?: string // 세부 종류 (연금: 연금보험/IRP/…, 입출금: 현금)
  archived?: boolean // 보관(목록에서 숨김) — 상폐·해지된 자산 등
  updatedAt: string // ISO
}

/** 계좌형 자산의 개별 보유 종목 (IRP·연금저축펀드 안의 주식/펀드 각각) */
export interface Holding {
  id: ID
  name: string // 종목/펀드 이름
  principal: number // 원금 (투자한 금액) = 수량×평단가 (검색종목) 또는 직접입력
  value: number // 현재 평가금액 = 수량×현재가 (검색종목) 또는 직접입력
  // 종목 검색 연동(선택): 있으면 수량×현재가로 자동 계산·시세 동기화
  ticker?: string // 종목코드(국내) / 코인 id
  live?: 'stock' | 'coin' // 시세 소스 (국내주식·ETF / 코인)
  quantity?: number // 보유 수량
  avgPrice?: number // 평단가 (원)
  unitPrice?: number // 현재가 (원)
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
  date: string // yyyy-mm-dd (반복이면 시작일 · 기간이면 시작일)
  endDate?: string // yyyy-mm-dd (기간 일정 종료일 · 여러 날 · 반복 없을 때만)
  time?: string // HH:mm (없으면 종일). 기간이면 시작 시간
  endTime?: string // HH:mm (기간 일정 종료 시간)
  title: string
  memo?: string
  source: 'manual' | 'external'
  color?: string // 색상 키 (colors.ts)
  repeat?: RepeatKind
  repeatUntil?: string // yyyy-mm-dd (선택)
  weekdays?: number[] // 매주 반복 시 요일(0=일~6=토). 없으면 시작일 요일
  exceptions?: string[] // 이 날짜들은 반복에서 제외 (단일 회차 수정/삭제용)
  createdAt?: string // 등록 시각 (같은 시간 일정 정렬용)
}

/** 혜택 한 줄(구간): 조건(건당/전월/당월) → 혜택(value) → 한도(횟수/금액) */
export interface BenefitTier {
  minSpend?: number // 조건: 건당 최소 결제금액
  minPrev?: number // 조건: 전월 실적 최소
  minThisMonth?: number // 조건: 당월 실적 최소
  value: number // 혜택: 적립률(%) 또는 정액(원)
  maxCount?: number // 한도: 월 적용 횟수
  cap?: number // 한도: 월 최대 금액
  min?: number // (legacy) 예전 전월 실적 문턱 = minPrev
}

/** 카드 혜택 규칙 (영역별) — 조건행(tiers) 여러 줄로 구성 */
export interface BenefitRule {
  id: ID
  area: string // 영역명 (편의점/배달/생활 등)
  merchants: string[] // 매칭 키워드 (GS25, CU …)
  kind: 'rate' | 'fixed' // 정률(%) / 정액(원, 건당)
  tiers?: BenefitTier[] // 조건/혜택/한도 구간 목록
  // legacy(구버전 데이터 호환)
  value?: number
  minSpend?: number
  maxCount?: number
  cap?: number
}

/** 카드 (혜택·실적 규칙) */
export interface Card {
  id: ID
  profileId: ID
  name: string
  type?: 'credit' | 'check' // 신용/체크 (연말정산 계산용)
  requiredSpend?: number // 전월 실적 조건 금액 (미달 시 혜택 미적용)
  specialCapTiers?: { minPrev?: number; cap: number }[] // 특별적립 통합 월 한도 (전월실적별). 기본적립엔 미적용
  pointCap?: number // (legacy) 단일 통합 한도
  baseBenefit?: BenefitRule // 기본 적립 (모든 가맹점 대상, 보통 한도 없음)
  benefits?: BenefitRule[] // 특별 적립 (특정 가맹점, 기본적립과 중복 불가)
  excludeMerchants?: string[] // 혜택 제외 가맹점 (적립·할인 안 됨 + 실적에서도 제외)
  excludeFromSpend?: string[] // 실적 제외 가맹점 (혜택은 받지만 실적에는 안 잡힘)
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

/** 정기 지출 (구독·월세 등 매달 자동 입력) */
export interface RecurringExpense {
  id: ID
  profileId: ID
  merchant: string // 가맹점/이름 (예: 넷플릭스)
  amount: number
  category: string // 지출 카테고리
  cardId?: ID | null // 결제 카드 (없으면 현금/기타)
  day: number // 매달 며칠에 (1~31)
  memo?: string
  active: boolean // 자동 입력 on/off
  lastRun?: string // 마지막으로 생성한 달 (yyyy-mm)
  createdAt: string
}

/** 월별 회고 메모 (이번 달 뭘 잘/못했나) */
export interface MonthNote {
  id: ID // `${profileId}::${month}`
  profileId: ID
  month: string // yyyy-mm
  content: string
  updatedAt: string
}

/** 투자 코칭 기록 (날짜별 히스토리) */
export interface CoachNote {
  id: ID
  profileId: ID
  date: string // yyyy-mm-dd
  createdAt: string
  content: string
  source: 'rule' | 'ai' // 규칙기반 / AI(클라우드+AI 단계)
}

/** 카테고리 (필터·합계 기준) */
export interface Category {
  id: ID
  profileId: ID
  name: string
  kind: TxType | 'both'
  order: number
}
