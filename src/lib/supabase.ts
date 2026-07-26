// Supabase 클라이언트 + 로그인 상태 유지(세션 보관) 처리
// 아래 두 값은 '공개용(anon)' 이라 코드에 있어도 안전해요. (비밀키·DB비번은 절대 여기 넣지 않음)
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://grfljmlaqqxnlikiepfz.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdyZmxqbWxhcXF4bmxpa2llcGZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MzMwNTUsImV4cCI6MjA5ODQwOTA1NX0.FMQNf8o1mC2KVP_FIwZQpPVuN7cmFm6NOXiMzTDHMxs'

/* ────────────────────────────────────────────────────────────
   1) "로그인 상태 유지" 켬/끔 상태
   - 켬(기본): 브라우저를 껐다 켜도 로그인 유지
   - 끔: 탭을 닫으면 로그아웃 (공용 PC용)
   ──────────────────────────────────────────────────────────── */
const KEEP_KEY = 'moa.keepLogin'

export function getKeepLogin(): boolean {
  try {
    return localStorage.getItem(KEEP_KEY) !== '0' // 값이 없으면 기본 '유지'
  } catch {
    return true
  }
}

export function setKeepLogin(on: boolean): void {
  try {
    localStorage.setItem(KEEP_KEY, on ? '1' : '0')
  } catch {
    /* 저장 불가 환경이면 그냥 무시 */
  }
}

/* ────────────────────────────────────────────────────────────
   2) 로그인 증표(세션)를 IndexedDB에도 백업
   - 모바일(안드로이드 홈화면 앱)에서 브라우저 기본 저장소(localStorage)만
     정리되는 경우가 있어, 잘 지워지지 않는 IndexedDB에 사본을 둔다.
   - 가계부 데이터가 들어있는 DB와는 완전히 별개인 전용 DB('moa-auth')를 쓴다.
   ──────────────────────────────────────────────────────────── */
const IDB_NAME = 'moa-auth'
const IDB_STORE = 'kv'

function openAuthDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function idbSet(key: string, value: string): Promise<void> {
  const db = await openAuthDb()
  if (!db) return
  try {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(value, key)
  } catch {
    /* 백업 실패는 무시 — 본체(localStorage)는 이미 저장됨 */
  }
}

async function idbDelete(key: string): Promise<void> {
  const db = await openAuthDb()
  if (!db) return
  try {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).delete(key)
  } catch {
    /* 무시 */
  }
}

// 백업해 둔 모든 값을 꺼낸다 (복구 시도용)
function idbGetAll(): Promise<string[]> {
  return openAuthDb().then(
    (db) =>
      new Promise<string[]>((resolve) => {
        if (!db) return resolve([])
        try {
          const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).getAll()
          req.onsuccess = () => resolve((req.result as string[]) ?? [])
          req.onerror = () => resolve([])
        } catch {
          resolve([])
        }
      }),
  )
}

/* ────────────────────────────────────────────────────────────
   3) 세션 보관함 — "유지" 여부에 따라 저장 위치를 고른다
   ──────────────────────────────────────────────────────────── */
const memoryFallback = new Map<string, string>() // 저장소를 아예 못 쓰는 환경 대비

const sessionStore = {
  getItem(key: string): string | null {
    try {
      // 어느 쪽에 있든 찾아서 돌려준다(유지 설정을 바꾼 직후에도 끊기지 않게)
      return localStorage.getItem(key) ?? sessionStorage.getItem(key) ?? memoryFallback.get(key) ?? null
    } catch {
      return memoryFallback.get(key) ?? null
    }
  },
  setItem(key: string, value: string): void {
    memoryFallback.set(key, value)
    const keep = getKeepLogin()
    try {
      if (keep) {
        localStorage.setItem(key, value) // 껐다 켜도 남는 곳
        sessionStorage.removeItem(key)
      } else {
        sessionStorage.setItem(key, value) // 탭 닫으면 사라지는 곳
        localStorage.removeItem(key)
      }
    } catch {
      /* 저장 불가 환경 — 메모리에만 유지 */
    }
    if (keep) void idbSet(key, value)
    else void idbDelete(key)
  },
  removeItem(key: string): void {
    memoryFallback.delete(key)
    try {
      localStorage.removeItem(key)
      sessionStorage.removeItem(key)
    } catch {
      /* 무시 */
    }
    void idbDelete(key) // 로그아웃하면 백업도 함께 삭제
  },
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: sessionStore,
  },
})

/* ────────────────────────────────────────────────────────────
   4) 앱 시작 시 세션 복구
   - 기본 저장소의 로그인 증표가 사라졌더라도, IndexedDB 백업본으로 되살린다.
   - 앱을 그리기 전에 1회만 실행한다(main.tsx).
   ──────────────────────────────────────────────────────────── */
export async function restoreSession(): Promise<void> {
  if (!getKeepLogin()) return // '유지 안 함'을 고른 사용자는 복구하지 않는다
  try {
    const { data } = await supabase.auth.getSession()
    if (data.session) return // 이미 로그인되어 있으면 할 일 없음

    for (const raw of await idbGetAll()) {
      try {
        const saved = JSON.parse(raw)
        const access_token = saved?.access_token
        const refresh_token = saved?.refresh_token
        if (!access_token || !refresh_token) continue
        // 만료된 증표라도 갱신용 토큰이 살아있으면 서버가 새 세션을 내어준다
        const { error } = await supabase.auth.setSession({ access_token, refresh_token })
        if (!error) return
      } catch {
        /* 이 백업본은 못 쓰는 형식 — 다음 것 시도 */
      }
    }
  } catch {
    /* 복구 실패해도 앱은 정상 진입(로그인 화면) */
  }
}
