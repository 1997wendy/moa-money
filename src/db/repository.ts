// ===== 저장소 추상화 계층 =====
// 앱의 모든 데이터 접근은 이 repo 를 통한다.
// 현재 구현체 = 로컬(Dexie). 나중에 클라우드로 갈 때 이 파일의 구현만 교체하면
// 화면·로직 코드는 손대지 않아도 된다. (repository pattern)

import { db } from './database'
import type {
  Asset,
  Card,
  Category,
  CoachNote,
  Goal,
  ID,
  Person,
  Profile,
  RecurringReceivable,
  Schedule,
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

export const repo = {
  // ---- Profiles ----
  listProfiles: () => db.profiles.orderBy('order').toArray(),
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
      db.categories.where('profileId').equals(id).delete(),
    ])
    await db.profiles.delete(id)
  },

  // ---- Assets ----
  listAssets: (profileId: ID) =>
    db.assets.where('profileId').equals(profileId).toArray(),
  upsertAsset: (a: Asset) => db.assets.put(a),
  deleteAsset: (id: ID) => db.assets.delete(id),

  // ---- Transactions ----
  async listTransactions(profileId: ID, q: TxQuery = {}): Promise<Transaction[]> {
    let rows = await db.transactions.where('profileId').equals(profileId).toArray()
    if (q.month) rows = rows.filter((t) => t.date.startsWith(q.month!))
    if (q.type) rows = rows.filter((t) => t.type === q.type)
    return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  },
  upsertTransaction: (t: Transaction) => db.transactions.put(t),
  deleteTransaction: (id: ID) => db.transactions.delete(id),

  // ---- Schedules ----
  listSchedules: (profileId: ID) =>
    db.schedules.where('profileId').equals(profileId).toArray(),
  upsertSchedule: (s: Schedule) => db.schedules.put(s),
  deleteSchedule: (id: ID) => db.schedules.delete(id),

  // ---- Cards ----
  listCards: (profileId: ID) =>
    db.cards.where('profileId').equals(profileId).toArray(),
  upsertCard: (c: Card) => db.cards.put(c),
  deleteCard: (id: ID) => db.cards.delete(id),

  // ---- Goals (스냅샷 버전) ----
  listGoals: (profileId: ID) =>
    db.goals.where('profileId').equals(profileId).toArray(),
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
  listPeople: (profileId: ID) =>
    db.people.where('profileId').equals(profileId).toArray(),
  upsertPerson: (p: Person) => db.people.put(p),
  deletePerson: (id: ID) => db.people.delete(id),

  // ---- Recurring receivables (매달 받을 돈) ----
  listRecurring: (profileId: ID) =>
    db.recurring.where('profileId').equals(profileId).toArray(),
  upsertRecurring: (r: RecurringReceivable) => db.recurring.put(r),
  deleteRecurring: (id: ID) => db.recurring.delete(id),

  // ---- Categories ----
  listCategories: (profileId: ID) =>
    db.categories.where('profileId').equals(profileId).sortBy('order'),
  upsertCategory: (c: Category) => db.categories.put(c),
  deleteCategory: (id: ID) => db.categories.delete(id),

  // ---- Coach notes (투자 코칭 히스토리) ----
  async listCoachNotes(profileId: ID): Promise<CoachNote[]> {
    const rows = await db.coachNotes.where('profileId').equals(profileId).toArray()
    return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  },
  upsertCoachNote: (n: CoachNote) => db.coachNotes.put(n),
  deleteCoachNote: (id: ID) => db.coachNotes.delete(id),

  // ---- 백업 (전체 내보내기/불러오기) ----
  async exportAll() {
    const [profiles, assets, transactions, schedules, cards, goals, people, recurring, categories, coachNotes] =
      await Promise.all([
        db.profiles.toArray(), db.assets.toArray(), db.transactions.toArray(),
        db.schedules.toArray(), db.cards.toArray(), db.goals.toArray(),
        db.people.toArray(), db.recurring.toArray(), db.categories.toArray(), db.coachNotes.toArray(),
      ])
    return {
      app: 'money-app', version: 2, exportedAt: new Date().toISOString(),
      profiles, assets, transactions, schedules, cards, goals, people, recurring, categories, coachNotes,
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
    const [profile, assets, transactions, schedules, cards, goals, people, recurring, categories, coachNotes] =
      await Promise.all([
        db.profiles.get(profileId),
        by(db.assets), by(db.transactions), by(db.schedules), by(db.cards), by(db.goals),
        by(db.people), by(db.recurring), by(db.categories), by(db.coachNotes),
      ])
    return {
      app: 'money-app', version: 2, shared: true, profileId,
      profiles: profile ? [profile] : [],
      assets, transactions, schedules, cards, goals, people, recurring, categories, coachNotes,
    }
  },
  async importAll(data: Record<string, unknown>) {
    const arr = <T,>(key: string): T[] => (Array.isArray(data[key]) ? (data[key] as T[]) : [])
    const tables = [db.profiles, db.assets, db.transactions, db.schedules, db.cards, db.goals, db.people, db.recurring, db.categories, db.coachNotes]
    await db.transaction('rw', tables, async () => {
      await Promise.all(tables.map((t) => t.clear()))
      await db.profiles.bulkPut(arr<Profile>('profiles'))
      await db.assets.bulkPut(arr<Asset>('assets'))
      await db.transactions.bulkPut(arr<Transaction>('transactions'))
      await db.schedules.bulkPut(arr<Schedule>('schedules'))
      await db.cards.bulkPut(arr<Card>('cards'))
      await db.goals.bulkPut(arr<Goal>('goals'))
      await db.people.bulkPut(arr<Person>('people'))
      await db.recurring.bulkPut(arr<RecurringReceivable>('recurring'))
      await db.categories.bulkPut(arr<Category>('categories'))
      await db.coachNotes.bulkPut(arr<CoachNote>('coachNotes'))
    })
  },
}

export type Repo = typeof repo
