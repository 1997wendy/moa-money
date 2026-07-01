// ===== 저장소 추상화 계층 =====
// 앱의 모든 데이터 접근은 이 repo 를 통한다.
// 현재 구현체 = 로컬(Dexie). 나중에 클라우드로 갈 때 이 파일의 구현만 교체하면
// 화면·로직 코드는 손대지 않아도 된다. (repository pattern)

import { db } from './database'
import type {
  Asset,
  Card,
  Category,
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
      .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0]
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
}

export type Repo = typeof repo
