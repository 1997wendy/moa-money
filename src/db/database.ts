// ===== 로컬 저장소 (IndexedDB via Dexie) =====
// ⚠️ UI/로직은 이 파일을 직접 쓰지 않는다. 반드시 repository.ts 를 통해 접근한다.
//    → 나중에 클라우드로 바꿀 때 repository.ts 만 교체하면 됨.

import Dexie, { type Table } from 'dexie'
import type {
  Asset,
  Card,
  Category,
  CoachNote,
  Goal,
  Person,
  Profile,
  RecurringReceivable,
  Schedule,
  Transaction,
} from './types'

export class MoneyDB extends Dexie {
  profiles!: Table<Profile, string>
  assets!: Table<Asset, string>
  transactions!: Table<Transaction, string>
  schedules!: Table<Schedule, string>
  cards!: Table<Card, string>
  goals!: Table<Goal, string>
  people!: Table<Person, string>
  recurring!: Table<RecurringReceivable, string>
  categories!: Table<Category, string>
  coachNotes!: Table<CoachNote, string>

  constructor() {
    super('money-app')
    this.version(1).stores({
      profiles: 'id, order',
      assets: 'id, profileId, type',
      transactions: 'id, profileId, date, type',
      schedules: 'id, profileId, date',
      cards: 'id, profileId',
      goals: 'id, profileId, effectiveFrom',
      people: 'id, profileId',
      recurring: 'id, profileId, personId',
      categories: 'id, profileId, order',
    })
    this.version(2).stores({
      coachNotes: 'id, profileId, date',
    })
  }
}

export const db = new MoneyDB()
