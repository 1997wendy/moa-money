// ===== 저장소 추상화 계층 =====
// 앱의 모든 데이터 접근은 이 repo 를 통한다.
// 현재 구현체 = 로컬(Dexie). 나중에 클라우드로 갈 때 이 파일의 구현만 교체하면
// 화면·로직 코드는 손대지 않아도 된다. (repository pattern)

import { db } from './database'
import type {
  Asset,
  AssetSnapshot,
  Card,
  Category,
  CoachNote,
  Goal,
  ID,
  Person,
  Profile,
  RecurringExpense,
  RecurringReceivable,
  Schedule,
  Support,
  Transaction,
} from './types'

export const uid = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

export interface TxQuery {
  month?: string // yyyy-mm
  type?: 'income' | 'expense'
}

/* ===== 공유받은 프로필 '열람 모드' =====
 *
 * 다른 사람이 나에게 공유해 준 프로필을, 내 화면과 똑같이(사이드바·메뉴 전환 그대로) 보기 위한 장치.
 *
 * ★설계 원칙: 남의 데이터를 내 IndexedDB에 절대 저장하지 않는다.★
 *   내 DB에 넣으면 동기화가 그걸 내 클라우드 백업에 올려버려서 데이터가 섞인다.
 *   대신 "데이터를 꺼내주는 창구(repo)"만 잠깐 공유 데이터 쪽으로 돌린다.
 *   화면 코드는 하나도 안 바뀌고, 열람 모드를 끄면 즉시 원래대로 돌아온다.
 */

/**
 * '쌓이기만 하는 기록' 표들.
 * 지우는 일이 거의 없는 자료라, 빈 백업이 들어와도 기존 기록을 밀어내지 않는다.
 * (다른 기기에 아직 안 쌓였다는 이유로 지난 달 자산 기록이 통째로 사라지는 걸 막기 위함)
 */
const HISTORY_TABLES = new Set(['assetSnapshots', 'monthNotes', 'coachNotes'])

/** 열람 중인 프로필의 가짜 id 앞에 붙는 표시 — 내 프로필 id와 절대 겹치지 않게 */
export const SHARED_PREFIX = 'shared::'
export const isSharedId = (id?: string | null): boolean => !!id && id.startsWith(SHARED_PREFIX)

let overlay: { profileId: string; data: Record<string, unknown> } | null = null

/** 열람 모드 켜기(공유 스냅샷 전달) / 끄기(null) */
export function setSharedOverlay(o: { profileId: string; data: Record<string, unknown> } | null) {
  overlay = o
}

/** 열람 중인 프로필이면 공유 데이터에서 꺼내고, 아니면 null(=평소대로 내 DB에서 조회) */
function ovRows<T>(profileId: string, key: string): T[] | null {
  if (!overlay || profileId !== overlay.profileId) return null
  const rows = overlay.data[key]
  return Array.isArray(rows) ? (rows as T[]) : []
}

const repoImpl = {
  // ---- Profiles ----
  listProfiles: () => db.profiles.orderBy('order').toArray(),
  /** 로컬에 실데이터가 있는지 (자산·거래 기준). 빈 초기화 상태 판별용. */
  async hasUserData(): Promise<boolean> {
    const [a, t] = await Promise.all([db.assets.count(), db.transactions.count()])
    return a > 0 || t > 0
  },
  upsertProfile: (p: Profile) => db.profiles.put(p),
  deleteProfile: (id: ID) => db.profiles.delete(id),
  /** 프로필 + 그 프로필의 모든 데이터 삭제 (이 기기에서만) */
  async deleteProfileCascade(id: ID) {
    await Promise.all([
      db.assets.where('profileId').equals(id).delete(),
      db.transactions.where('profileId').equals(id).delete(),
      db.schedules.where('profileId').equals(id).delete(),
      db.cards.where('profileId').equals(id).delete(),
      db.goals.where('profileId').equals(id).delete(),
      db.people.where('profileId').equals(id).delete(),
      db.recurring.where('profileId').equals(id).delete(),
      db.recurringTx.where('profileId').equals(id).delete(),
      db.categories.where('profileId').equals(id).delete(),
      db.supports.where('profileId').equals(id).delete(),
    ])
    await db.profiles.delete(id)
  },

  // ---- Assets ----
  listAssets: async (profileId: ID): Promise<Asset[]> =>
    ovRows<Asset>(profileId, 'assets') ?? db.assets.where('profileId').equals(profileId).toArray(),
  upsertAsset: (a: Asset) => db.assets.put(a),
  deleteAsset: (id: ID) => db.assets.delete(id),

  // ---- Transactions ----
  async listTransactions(profileId: ID, q: TxQuery = {}): Promise<Transaction[]> {
    let rows = ovRows<Transaction>(profileId, 'transactions')
      ?? (await db.transactions.where('profileId').equals(profileId).toArray())
    if (q.month) rows = rows.filter((t) => t.date.startsWith(q.month!))
    if (q.type) rows = rows.filter((t) => t.type === q.type)
    // 날짜 내림차순, 같은 날짜면 입력(생성)시각 내림차순 → 방금 넣은 게 위로
    return rows.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : (a.createdAt < b.createdAt ? 1 : -1)))
  },
  upsertTransaction: (t: Transaction) => db.transactions.put(t),
  deleteTransaction: (id: ID) => db.transactions.delete(id),

  // ---- Schedules ----
  listSchedules: async (profileId: ID): Promise<Schedule[]> =>
    ovRows<Schedule>(profileId, 'schedules') ?? db.schedules.where('profileId').equals(profileId).toArray(),
  upsertSchedule: (s: Schedule) => db.schedules.put(s),
  deleteSchedule: (id: ID) => db.schedules.delete(id),

  // ---- Cards ----
  listCards: async (profileId: ID): Promise<Card[]> =>
    ovRows<Card>(profileId, 'cards') ?? db.cards.where('profileId').equals(profileId).toArray(),
  upsertCard: (c: Card) => db.cards.put(c),
  deleteCard: (id: ID) => db.cards.delete(id),

  // ---- Goals (스냅샷 버전) ----
  listGoals: async (profileId: ID): Promise<Goal[]> =>
    ovRows<Goal>(profileId, 'goals') ?? db.goals.where('profileId').equals(profileId).toArray(),
  upsertGoal: (g: Goal) => db.goals.put(g),
  deleteGoal: (id: ID) => db.goals.delete(id),
  /** 특정 월(yyyy-mm)에 적용되는 목표 = effectiveFrom 이 그 월 이하인 것 중 가장 최근 */
  async goalForMonth(profileId: ID, month: string): Promise<Goal | undefined> {
    const goals = await this.listGoals(profileId)
    return goals
      .filter((g) => g.effectiveFrom <= month)
      .sort((a, b) =>
        a.effectiveFrom !== b.effectiveFrom
          ? a.effectiveFrom < b.effectiveFrom ? 1 : -1
          : a.createdAt < b.createdAt ? 1 : -1,
      )[0]
  },

  // ---- People (정산 상대) ----
  listPeople: async (profileId: ID): Promise<Person[]> =>
    ovRows<Person>(profileId, 'people') ?? db.people.where('profileId').equals(profileId).toArray(),
  upsertPerson: (p: Person) => db.people.put(p),
  deletePerson: (id: ID) => db.people.delete(id),

  // ---- Recurring receivables (매달 받을 돈) ----
  listRecurring: async (profileId: ID): Promise<RecurringReceivable[]> =>
    ovRows<RecurringReceivable>(profileId, 'recurring') ?? db.recurring.where('profileId').equals(profileId).toArray(),
  upsertRecurring: (r: RecurringReceivable) => db.recurring.put(r),
  deleteRecurring: (id: ID) => db.recurring.delete(id),

  // ---- Recurring expenses (매달 자동 입력되는 정기 지출) ----
  listRecurringExpenses: async (profileId: ID): Promise<RecurringExpense[]> =>
    ovRows<RecurringExpense>(profileId, 'recurringTx') ?? db.recurringTx.where('profileId').equals(profileId).toArray(),
  upsertRecurringExpense: (r: RecurringExpense) => db.recurringTx.put(r),
  deleteRecurringExpense: (id: ID) => db.recurringTx.delete(id),

  // ---- Supports (가족에게 받은 돈) ----
  async listSupports(profileId: ID): Promise<Support[]> {
    const rows = ovRows<Support>(profileId, 'supports')
      ?? (await db.supports.where('profileId').equals(profileId).toArray())
    return [...rows].sort((a, b) => a.order - b.order)
  },
  upsertSupport: (s: Support) => db.supports.put(s),
  deleteSupport: (id: ID) => db.supports.delete(id),

  // ---- Categories ----
  listCategories: async (profileId: ID): Promise<Category[]> => {
    const ov = ovRows<Category>(profileId, 'categories')
    return ov ? [...ov].sort((a, b) => a.order - b.order) : db.categories.where('profileId').equals(profileId).sortBy('order')
  },
  upsertCategory: (c: Category) => db.categories.put(c),
  deleteCategory: (id: ID) => db.categories.delete(id),

  // ---- Coach notes (투자 코칭 히스토리) ----
  async listCoachNotes(profileId: ID): Promise<CoachNote[]> {
    const rows = ovRows<CoachNote>(profileId, 'coachNotes')
      ?? (await db.coachNotes.where('profileId').equals(profileId).toArray())
    return [...rows].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  },
  upsertCoachNote: (n: CoachNote) => db.coachNotes.put(n),
  deleteCoachNote: (id: ID) => db.coachNotes.delete(id),

  // ---- Asset snapshots (월별 자산 상세 스냅샷) ----
  async listAssetSnapshots(profileId: ID): Promise<AssetSnapshot[]> {
    const rows = ovRows<AssetSnapshot>(profileId, 'assetSnapshots')
      ?? (await db.assetSnapshots.where('profileId').equals(profileId).toArray())
    return [...rows].sort((a, b) => (a.month < b.month ? 1 : -1)) // 최신 월 먼저
  },
  getAssetSnapshot: (profileId: ID, month: string) => db.assetSnapshots.get(`${profileId}::${month}`),
  upsertAssetSnapshot: (s: AssetSnapshot) => db.assetSnapshots.put(s),
  deleteAssetSnapshot: (id: ID) => db.assetSnapshots.delete(id),

  // ---- Month notes (월별 회고) ----
  getMonthNote: (profileId: ID, month: string) => db.monthNotes.get(`${profileId}::${month}`),
  upsertMonthNote: (profileId: ID, month: string, content: string) =>
    content.trim()
      ? db.monthNotes.put({ id: `${profileId}::${month}`, profileId, month, content, updatedAt: new Date().toISOString() })
      : db.monthNotes.delete(`${profileId}::${month}`),

  // ---- 백업 (전체 내보내기/불러오기) ----
  async exportAll() {
    const [profiles, assets, transactions, schedules, cards, goals, people, recurring, categories, coachNotes, monthNotes, recurringTx, supports, assetSnapshots] =
      await Promise.all([
        db.profiles.toArray(), db.assets.toArray(), db.transactions.toArray(),
        db.schedules.toArray(), db.cards.toArray(), db.goals.toArray(),
        db.people.toArray(), db.recurring.toArray(), db.categories.toArray(), db.coachNotes.toArray(), db.monthNotes.toArray(),
        db.recurringTx.toArray(), db.supports.toArray(), db.assetSnapshots.toArray(),
      ])
    return {
      app: 'money-app', version: 6, exportedAt: new Date().toISOString(),
      profiles, assets, transactions, schedules, cards, goals, people, recurring, categories, coachNotes, monthNotes, recurringTx, supports, assetSnapshots,
    }
  },
  /** 로컬 전체 비우기 (계정 로그아웃/전환 시). 동기화 훅 억제. */
  async wipeLocal() {
    const w = window as unknown as { __moaSuppressDirty?: boolean }
    w.__moaSuppressDirty = true
    try {
      await db.transaction('rw', db.tables, async () => {
        await Promise.all(db.tables.map((t) => t.clear()))
      })
    } finally {
      w.__moaSuppressDirty = false
    }
  },

  /** 한 프로필의 데이터만 뽑아서 내보내기 (공유용) */
  async exportProfile(profileId: ID) {
    const by = (t: { where: (k: string) => { equals: (v: string) => { toArray: () => Promise<unknown[]> } } }) =>
      t.where('profileId').equals(profileId).toArray()
    const [profile, assets, transactions, schedules, cards, goals, people, recurring, categories, coachNotes, supports] =
      await Promise.all([
        db.profiles.get(profileId),
        by(db.assets), by(db.transactions), by(db.schedules), by(db.cards), by(db.goals),
        by(db.people), by(db.recurring), by(db.categories), by(db.coachNotes), by(db.supports),
      ])
    return {
      app: 'money-app', version: 2, shared: true, profileId,
      profiles: profile ? [profile] : [],
      assets, transactions, schedules, cards, goals, people, recurring, categories, coachNotes, supports,
    }
  },
  /**
   * 백업(클라우드/파일) → 로컬 반영.
   *
   * ⚠️ 중요한 규칙: **백업에 아예 없는 항목은 건드리지 않는다.**
   *   예전에는 14개 표를 전부 비운 뒤 백업에 든 것만 다시 채웠다. 그래서 옛 버전 코드가 올린
   *   백업(= 나중에 추가된 표를 아예 모르는 백업)을 받으면, 그 표의 데이터가 통째로 사라졌다.
   *   (2026-08 자산 스냅샷 소실 사고의 원인)
   *   → 이제는 "키가 없음 = 그 기기가 모르는 항목"으로 보고 기존 데이터를 그대로 둔다.
   *     빈 배열([])이 명시적으로 들어있으면 '진짜 0개'라는 뜻이므로 그때만 비운다.
   */
  async importAll(data: Record<string, unknown>) {
    const tables = [db.profiles, db.assets, db.transactions, db.schedules, db.cards, db.goals, db.people, db.recurring, db.categories, db.coachNotes, db.monthNotes, db.recurringTx, db.supports, db.assetSnapshots]
    // [백업 안의 키, 대응하는 표]
    const map: [string, { clear: () => Promise<void>; bulkPut: (rows: never[]) => Promise<unknown>; count: () => Promise<number> }][] = [
      ['profiles', db.profiles as never], ['assets', db.assets as never], ['transactions', db.transactions as never],
      ['schedules', db.schedules as never], ['cards', db.cards as never], ['goals', db.goals as never],
      ['people', db.people as never], ['recurring', db.recurring as never], ['categories', db.categories as never],
      ['coachNotes', db.coachNotes as never], ['monthNotes', db.monthNotes as never], ['recurringTx', db.recurringTx as never],
      ['supports', db.supports as never], ['assetSnapshots', db.assetSnapshots as never],
    ]
    const missing = repo.missingTablesOf(data)
    if (missing.length) {
      // 옛 버전 기기가 올린 백업일 가능성 → 지우지 않고 유지했음을 남겨둔다 (문제 추적용)
      console.warn('[모아] 백업에 없는 항목은 그대로 유지했어요:', missing.join(', '))
    }
    await db.transaction('rw', tables, async () => {
      for (const [key, table] of map) {
        const rows = data[key]
        if (!Array.isArray(rows)) continue // 키 자체가 없음 → 기존 데이터 유지 (지우지 않음)
        // 지난 기록(월별 스냅샷·회고 메모·코칭 기록)은 쌓이기만 하는 자료다.
        // 빈 목록이 왔다는 건 '그 기기엔 아직 안 쌓였다'는 뜻일 가능성이 커서, 있는 기록을 지우지 않는다.
        if (rows.length === 0 && HISTORY_TABLES.has(key) && (await table.count()) > 0) continue
        await table.clear()
        await table.bulkPut(rows as never[])
      }
    })
  },
  /** 백업에 빠져 있어서 '그대로 유지된' 표 이름들 (사용자 안내·로그용) */
  missingTablesOf(data: Record<string, unknown>): string[] {
    const KNOWN: [string, string][] = [
      ['assets', '자산'], ['transactions', '거래'], ['schedules', '일정'], ['cards', '카드'],
      ['goals', '목표'], ['people', '사람'], ['categories', '카테고리'], ['monthNotes', '월별 메모'],
      ['recurringTx', '정기지출'], ['supports', '가족에게 받은 돈'], ['assetSnapshots', '자산 월별 스냅샷'],
    ]
    return KNOWN.filter(([k]) => !Array.isArray(data[k])).map(([, label]) => label)
  },
}

/**
 * 실제로 앱이 쓰는 창구.
 * 열람 모드(공유받은 프로필을 보는 중)일 때는 **저장·삭제 계열 호출을 전부 무시한다.**
 * 남의 프로필을 보다가 실수로 뭔가 눌러도 내 데이터가 바뀌지 않고,
 * 남의 데이터가 내 기기·내 클라우드 백업에 들어가지도 않는다.
 */
const WRITE_METHOD = /^(upsert|delete)/
export const repo: typeof repoImpl = new Proxy(repoImpl, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver)
    if (overlay && typeof value === 'function' && WRITE_METHOD.test(String(prop))) {
      return async () => {
        console.warn('[모아] 공유받은 프로필을 보는 중이라 저장·삭제는 하지 않았어요:', String(prop))
        return undefined
      }
    }
    return value
  },
})

export type Repo = typeof repo
