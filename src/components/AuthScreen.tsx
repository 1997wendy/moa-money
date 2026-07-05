// 계정 로그인/회원가입 화면 (로그인 안 하면 앱 대신 이 화면)
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import Logo from './Logo'

export default function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!email.trim() || pw.length < 6) { setMsg('이메일과 6자 이상 비밀번호를 입력하세요.'); return }
    setBusy(true)
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw })
      setBusy(false)
      if (error) setMsg('로그인 실패: ' + error.message)
    } else {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: pw })
      setBusy(false)
      if (error) setMsg('회원가입 실패: ' + error.message)
      else if (!data.session) setMsg('가입됨! 인증 메일을 확인한 뒤 로그인하세요.')
      // data.session 있으면 자동으로 앱 진입(onAuthStateChange)
    }
  }
  async function forgot() {
    if (!email.trim()) return setMsg('이메일을 먼저 입력하세요.')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
    setMsg(error ? '재설정 메일 실패: ' + error.message : '재설정 메일을 보냈어요. 메일 링크로 새 비밀번호를 설정하세요.')
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5 bg-canvas">
      <div className="w-full max-w-[380px]">
        <div className="flex flex-col items-center mb-6">
          <Logo size={48} />
          <div className="font-extrabold text-[22px] mt-3">모아</div>
          <div className="text-[13px] text-sub mt-1">자산·일정을 한 곳에서</div>
        </div>

        <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm">
          <div className="flex bg-canvas rounded-[10px] p-1 mb-4">
            {(['login', 'signup'] as const).map((m) => (
              <button key={m} onClick={() => { setMode(m); setMsg('') }} className={`flex-1 py-2 rounded-[8px] text-[13px] font-bold transition-colors ${mode === m ? 'bg-surface shadow-sm text-ink' : 'text-sub'}`}>
                {m === 'login' ? '로그인' : '회원가입'}
              </button>
            ))}
          </div>

          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일" autoComplete="email"
            className="w-full border border-line rounded-[10px] px-3 py-2.5 text-[14px] mb-2 outline-none focus:border-mint" />
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="비밀번호 (6자 이상)" autoComplete="current-password"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            className="w-full border border-line rounded-[10px] px-3 py-2.5 text-[14px] mb-3 outline-none focus:border-mint" />

          <button onClick={submit} disabled={busy} className="w-full bg-mint text-white font-bold text-[14px] rounded-[10px] py-2.5 hover:bg-mint-d disabled:opacity-50">
            {busy ? '처리 중…' : mode === 'login' ? '로그인' : '회원가입'}
          </button>

          {mode === 'login' && (
            <button onClick={forgot} className="w-full text-[12px] text-sub hover:text-ink mt-3">비밀번호를 잊으셨나요?</button>
          )}
          {msg && <div className="mt-3 text-[12.5px] text-center bg-mint-l text-mint-d rounded-lg px-3 py-2">{msg}</div>}
        </div>

        <div className="text-[11px] text-sub text-center mt-4">로그인하면 어느 기기에서나 내 데이터를 볼 수 있어요.</div>
      </div>
    </div>
  )
}
