import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { restoreSession } from './lib/supabase'

// 데이터 로딩은 AuthGate가 계정 로그인 시 처리한다.
function render() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

// 앱을 그리기 전에 로그인 상태를 되살린다.
// (모바일에서 기본 저장소만 정리된 경우 IndexedDB 백업본으로 복구 — supabase.ts 참고)
// 네트워크가 느려도 화면이 멈추지 않도록 최대 1.5초만 기다리고,
// 늦게 복구되더라도 AuthGate가 로그인 신호를 받아 자동으로 앱에 진입한다.
Promise.race([restoreSession(), new Promise((r) => setTimeout(r, 1500))]).finally(render)
