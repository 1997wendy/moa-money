// 청약 — 관심지역의 분양 일정을 보고, 평형별 '추첨제 물량'을 확인하는 화면
// 가점(청약 점수)이 낮아도 노려볼 수 있는 물량이 얼마나 되는지가 핵심 정보다.
import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, MapPin, ExternalLink, Settings2, X, Plus, Info, HelpCircle, ArrowUpDown, Bell } from 'lucide-react'
import { repo } from '../db/repository'
import { useProfile } from '../state/profile'
import { useToast } from '../components/Toast'
import { EMPTY_WATCH, loadWatch, saveWatch, sendTest, canUseNotify, type Watch } from '../lib/applyNotify'
import { todayISO } from '../lib/format'
import { PageHeader, Card, Button, Modal, Empty, inputCls } from '../components/ui'
import {
  DEFAULT_REGIONS, fetchApplyHome, calcItem, phaseOf, PHASE_LABEL, ZONE_LABEL, eok, amt, moveInLabel, paymentPlan,
  myChance, CASE_LABEL, CASE_DESC,
  type ApplyItem, type ApplyResponse, type Phase, type ModelCalc, type ApplyCase,
} from '../lib/applyHome'

// 진행·예정 = 오늘 기준 아직 안 끝난 청약 / 지난 공고 = 당첨자 발표까지 끝난 청약(참고용)
type Tab = 'live' | 'past'

const PHASE_STYLE: Record<Phase, string> = {
  open: 'bg-mint text-white',
  upcoming: 'bg-[#fff3e0] text-[#c77700]',
  result: 'bg-[#e7f0ff] text-[#2f6fed]',
  done: 'bg-canvas text-sub',
}

export default function Subscription() {
  const { profileId, profile } = useProfile()
  const regions = profile?.applyRegions ?? DEFAULT_REGIONS
  // 같은 공고라도 내 순위·무주택 여부에 따라 노려볼 수 있는 물량이 달라진다
  const myCase: ApplyCase = profile?.applyCase ?? 'rank2'
  async function setCase(c: ApplyCase) {
    if (profile) await repo.upsertProfile({ ...profile, applyCase: c })
  }
  const [res, setRes] = useState<ApplyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [tab, setTab] = useState<Tab>('live')
  const [regionModal, setRegionModal] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [sort, setSort] = useState<'new' | 'old'>('new')
  const [pay, setPay] = useState<{ name: string; model: ModelCalc } | null>(null)
  const [notifyModal, setNotifyModal] = useState(false)
  const [watch, setWatch] = useState<Watch | null>(null)
  const [canNotify, setCanNotify] = useState(false) // 알림은 허용된 계정에서만 보인다
  const toast = useToast()

  // 알림 설정 불러오기 (허용된 계정만)
  useEffect(() => {
    ;(async () => {
      const ok = await canUseNotify()
      setCanNotify(ok)
      if (ok) setWatch(await loadWatch())
    })()
  }, [])

  const key = regions.join(',')
  useEffect(() => {
    let cancel = false
    setLoading(true); setFailed(false)
    ;(async () => {
      const d = await fetchApplyHome(regions)
      if (cancel) return
      if (!d) setFailed(true)
      setRes(d); setLoading(false)
    })()
    return () => { cancel = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  async function refresh() {
    setLoading(true); setFailed(false)
    const d = await fetchApplyHome(regions, { refresh: true })
    if (!d) setFailed(true)
    setRes(d); setLoading(false)
  }

  const today = todayISO()
  const rows = useMemo(() => {
    const list = (res?.items ?? []).map((it) => ({ it, calc: calcItem(it), phase: phaseOf(it, today) }))
    const filtered = list.filter(({ phase }) => (tab === 'live' ? phase !== 'done' : phase === 'done'))
    // 정렬 기준 날짜 = 실제로 청약을 넣는 날(1순위 해당지역)
    const dt = (x: { it: ApplyItem }) => x.it.rank1Bgn ?? x.it.rceptBgn ?? x.it.recruitDate ?? ''
    return filtered.sort((a, b) => (sort === 'new' ? dt(b).localeCompare(dt(a)) : dt(a).localeCompare(dt(b))))
  }, [res, tab, today, sort])

  const liveCount = (res?.items ?? []).filter((it) => phaseOf(it, today) !== 'done').length

  // 진행·예정이 비었을 때 "고장난 게 아니라 원래 없는 것"임을 알려주기 위한 최신 공고
  const latest = useMemo(() => {
    const dt = (x: ApplyItem) => x.rceptBgn ?? x.recruitDate ?? ''
    return (res?.items ?? []).reduce<ApplyItem | null>((best, it) => (!best || dt(it) > dt(best) ? it : best), null)
  }, [res])

  return (
    <>
      <PageHeader
        title="청약"
        right={
          <div className="flex items-center gap-1.5">
            {canNotify && (
              <button onClick={() => setNotifyModal(true)} title="알림 설정"
                className={`text-[12px] border rounded-lg px-2.5 py-1 flex items-center gap-1 ${
                  watch?.enabled ? 'border-mint text-mint-d bg-mint-l' : 'border-line text-sub hover:bg-canvas'}`}>
                <Bell size={13} />알림{watch?.enabled ? ' 켜짐' : ''}
              </button>
            )}
            <button onClick={() => setRegionModal(true)} title="관심지역 설정"
              className="text-[12px] text-sub border border-line rounded-lg px-2.5 py-1 hover:bg-canvas flex items-center gap-1">
              <Settings2 size={13} />지역 {regions.length}
            </button>
            <button onClick={refresh} title="새로고침" disabled={loading}
              className="text-[12px] text-sub border border-line rounded-lg px-2.5 py-1 hover:bg-canvas flex items-center gap-1 disabled:opacity-40">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />새로고침
            </button>
          </div>
        }
      />

      {/* 점수 낮을 때의 전략 안내 — 이 화면의 존재 이유 */}
      <div className="bg-mint-l rounded-[12px] p-4 mb-4 flex gap-2.5">
        <Info size={16} className="text-mint-d shrink-0 mt-0.5" />
        <div className="text-[12.5px] text-mint-d leading-relaxed">
          <b>청약 점수가 낮다면 전용 60㎡ 이하를 노리세요.</b> 투기과열지구(서울 전역)에서 일반공급 1순위 추첨 비율은
          <b> 60㎡ 이하 60%</b>, 60~85㎡ 30%, <b>85㎡ 초과 20%</b>입니다. 큰 평수일수록 가점제 비중이 커집니다.
          <div className="text-[11.5px] opacity-80 mt-1">
            ※ 표시되는 추첨 세대수는 일반공급 1순위 기준 근사치입니다. 실제 배분은 공고문을 확인하세요.
          </div>
        </div>
      </div>

      {/* 내 조건 — 순위와 무주택 여부에 따라 실제 노려볼 수 있는 물량이 달라진다 */}
      <div className="mb-4">
        <div className="text-[12px] font-bold text-sub mb-1.5">내 조건</div>
        <div className="flex flex-wrap gap-1.5">
          {(['rank2', 'rank1_owned', 'rank1_nohome'] as ApplyCase[]).map((c) => (
            <button key={c} onClick={() => setCase(c)}
              className={`px-3 py-1.5 rounded-[10px] text-[12px] font-bold border transition-colors ${
                myCase === c ? 'bg-mint text-white border-mint' : 'bg-surface border-line text-sub hover:bg-canvas'}`}>
              {CASE_LABEL[c]}
            </button>
          ))}
        </div>
        <div className="text-[11.5px] text-sub mt-1.5">{CASE_DESC[myCase]}</div>
      </div>

      {/* 탭 + 정렬 */}
      <div className="flex items-center gap-1.5 mb-4">
        {([['live', `진행·예정${liveCount ? ` ${liveCount}` : ''}`], ['past', '지난 공고']] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-[10px] text-[12.5px] font-bold transition-colors ${
              tab === k ? 'bg-mint text-white' : 'bg-surface border border-line text-sub hover:bg-canvas'}`}>
            {label}
          </button>
        ))}
        <button
          onClick={() => setSort(sort === 'new' ? 'old' : 'new')}
          title="정렬 순서 바꾸기"
          className="ml-auto text-[12px] text-sub border border-line rounded-lg px-2.5 py-1.5 hover:bg-canvas flex items-center gap-1"
        >
          <ArrowUpDown size={13} />{sort === 'new' ? '최신순' : '과거순'}
        </button>
      </div>

      {loading && <Empty>청약 정보를 불러오는 중…</Empty>}

      {!loading && failed && (
        <Card className="text-[13px]">
          <div className="font-bold mb-1.5">청약 정보를 불러오지 못했어요.</div>
          <div className="text-sub leading-relaxed">
            <b>apply-home</b> 함수가 아직 배포되지 않았거나, <b>APPLYHOME_KEY</b> 설정이 빠졌을 수 있어요.
            Supabase 대시보드 → Edge Functions에서 확인해 주세요.
          </div>
        </Card>
      )}

      {!loading && !failed && rows.length === 0 && (
        tab === 'live' ? (
          <Card className="text-[13px] leading-relaxed">
            <div className="font-bold mb-1.5">지금 진행 중이거나 예정된 청약이 없어요.</div>
            <div className="text-sub">
              {latest && (
                <>관심지역의 가장 최근 공고는 <b className="text-ink">{latest.rceptBgn ?? latest.recruitDate} {latest.name}</b>였어요.</>
              )}
            </div>
          </Card>
        ) : (
          <Empty>해당하는 청약이 없어요.</Empty>
        )
      )}

      <div className="space-y-3">
        {!loading && rows.map(({ it, calc, phase }) => (
          <Card key={it.id} className="!p-0 overflow-hidden">
            {/* 헤더 */}
            <button onClick={() => setOpen(open === it.id ? null : it.id)} className="w-full text-left p-4 hover:bg-canvas/50 transition-colors">
              <div className="flex items-start gap-2 mb-1.5">
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${PHASE_STYLE[phase]}`}>
                  {PHASE_LABEL[phase]}
                </span>
                {it.kind === 'remndr' && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#ffe9f0] text-[#d6336c] shrink-0">
                    {it.houseKind ?? '무순위'} · 전원 추첨
                  </span>
                )}
                <span className="text-[11px] text-sub ml-auto shrink-0">{ZONE_LABEL[calc.zone]}</span>
              </div>

              <div className="font-bold text-[15px] leading-snug">{it.name}</div>
              <div className="text-[12px] text-sub mt-0.5 flex items-center gap-1">
                <MapPin size={11} className="shrink-0" />
                <span className="truncate">{it.address}</span>
              </div>

              {/* 추첨 물량 요약 — 가장 중요한 숫자 */}
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mt-2.5">
                <div>
                  <span className="text-[11px] text-sub">추첨 물량 </span>
                  <span className="text-[17px] font-extrabold text-mint-d">{calc.lotteryTotal}</span>
                  <span className="text-[12px] font-bold text-mint-d">세대</span>
                  {calc.hasUnknown && <span className="text-[11px] text-sub ml-1">+ 공고문 확인</span>}
                </div>
                {calc.smallLottery > 0 && (
                  <div className="text-[11.5px] text-sub">
                    이 중 <b className="text-ink">60㎡ 이하 {calc.smallLottery}세대</b>
                  </div>
                )}
                <div className="text-[11.5px] text-sub">총 {it.total}세대</div>
                {calc.minPrice > 0 && (
                  <div className="text-[11.5px] text-sub">
                    {eok(calc.minPrice)}{calc.maxPrice !== calc.minPrice && ` ~ ${eok(calc.maxPrice)}`}
                  </div>
                )}
              </div>

              {/* 위 숫자는 단지 전체 기준이라, 내 조건에서 실제로 노려볼 수 있는 양을 따로 보여준다 */}
              {(() => {
                const my = myChance(calc, myCase)
                return (
                  <div className={`mt-2 rounded-[8px] px-2.5 py-1.5 text-[11.5px] inline-flex items-center gap-1.5 ${
                    my.blocked ? 'bg-[#fff3e0] text-[#c77700]' : 'bg-mint-l text-mint-d'}`}>
                    <span className="font-bold">내 조건</span>
                    {my.units > 0
                      ? <span><b className="text-[13px]">{my.units}세대</b> · {my.label}</span>
                      : <span>{my.label}</span>}
                  </div>
                )
              })()}

              {/* 일정 요약 */}
              {/* 일반공급 추첨을 노린다면 '1순위 해당지역' 날짜가 실제 D-day.
                  API의 접수시작일(RCEPT_BGNDE)은 특별공급 날짜라 하루~사흘 앞선다. */}
              <div className="text-[11.5px] mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
                {it.rank1Bgn
                  ? <span className="text-ink font-bold">1순위 접수 {it.rank1Bgn}</span>
                  : it.rceptBgn && <span className="text-ink font-bold">접수 {it.rceptBgn}</span>}
                {it.winnerDate && <span className="text-sub">발표 {it.winnerDate}</span>}
                {it.moveIn && <span className="text-sub">입주 {moveInLabel(it.moveIn)}</span>}
                {it.rceptBgn && it.rank1Bgn && it.rceptBgn !== it.rank1Bgn && (
                  <span className="text-sub/70">특별공급 {it.rceptBgn}</span>
                )}
              </div>
            </button>

            {/* 펼친 상세 — 평형별 */}
            {open === it.id && (
              <div className="border-t border-line px-4 py-3 bg-canvas/40">
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px] min-w-[420px]">
                    <thead>
                      <tr className="text-sub text-left">
                        <th className="font-semibold py-1.5">주택형</th>
                        <th className="font-semibold text-right">전용</th>
                        <th className="font-semibold text-right">일반공급</th>
                        <th className="font-semibold text-right">추첨비율</th>
                        <th className="font-semibold text-right">추첨세대</th>
                        <th className="font-semibold text-right">분양가(최고)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calc.models.map((m) => (
                        <tr key={m.modelNo ?? m.houseTy} className={`border-t border-line ${m.area <= 60 ? 'bg-mint-l/50' : ''}`}>
                          <td className="py-1.5 font-semibold">{m.houseTy}</td>
                          <td className="text-right text-sub">{m.area.toFixed(2)}㎡</td>
                          <td className="text-right">{m.general}</td>
                          <td className="text-right text-sub">{m.lottery.label}</td>
                          <td className="text-right font-extrabold text-mint-d">
                            {m.lotteryUnits === null ? '—' : m.lotteryUnits}
                          </td>
                          <td className="text-right">
                            {m.price > 0 ? (
                              <button
                                onClick={() => setPay({ name: it.name, model: m })}
                                title="납부 계획 보기"
                                className="text-sub hover:text-mint-d inline-flex items-center gap-0.5"
                              >
                                {eok(m.price)}<HelpCircle size={11} />
                              </button>
                            ) : '-'}
                          </td>
                        </tr>
                      ))}
                      {calc.models.length === 0 && (
                        <tr><td colSpan={6} className="py-3 text-center text-sub">평형 정보가 아직 없어요.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {/* 추첨 물량도 무주택자에게 먼저 간다 — 숫자만 보고 기대치를 잘못 잡지 않도록 나눠 보여준다 */}
                {calc.zone !== 'remndr' && calc.lotteryTotal > 0 && (
                  <div className="bg-surface border border-line rounded-[10px] p-3 mt-3 text-[11.5px]">
                    <div className="font-bold text-[12px] mb-1.5">추첨 {calc.lotteryTotal}세대는 이렇게 나뉩니다</div>
                    <div className="flex justify-between py-0.5">
                      <span className="text-sub">무주택자 우선 (75%)</span>
                      <span className="font-bold">{calc.noHomeFirst}세대</span>
                    </div>
                    <div className="flex justify-between py-0.5">
                      <span className="text-sub">그 외 (25%) — 무주택 낙첨자·1주택 처분조건 우선</span>
                      <span className="font-bold">{calc.therest}세대</span>
                    </div>
                    <div className="text-sub/80 mt-1.5">
                      세대에 집이 있으면 위 <b>75%는 대상이 아니고</b>, 25%에서도 뒤로 밀립니다.
                    </div>
                  </div>
                )}

                <div className="text-[11px] text-sub mt-2 leading-relaxed">
                  연한 초록 = 전용 60㎡ 이하 (추첨 비율이 가장 높은 구간)<br />
                  청약은 <b>이 중 한 가지 주택형만</b> 신청할 수 있어요.
                  분양가는 같은 평형에서 <b>가장 비싼 호수 기준</b>이라 저층·비선호 향은 더 쌉니다. 옵션·취득세는 별도예요.
                </div>

                {/* 상세 정보 */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11.5px] mt-3 pt-3 border-t border-line">
                  {it.builder && <Info2 label="시공사" value={it.builder} />}
                  {it.detailKind && <Info2 label="구분" value={`${it.detailKind}${it.priceCap === 'Y' ? ' · 분양가상한제' : ''}`} />}
                  {it.recruitDate && <Info2 label="모집공고일" value={it.recruitDate} />}
                  {it.contractBgn && <Info2 label="계약" value={`${it.contractBgn} ~ ${it.contractEnd ?? ''}`} />}
                  {it.tel && <Info2 label="문의" value={it.tel} />}
                </div>

                <div className="flex gap-2 mt-3">
                  {it.url && (
                    <a href={it.url} target="_blank" rel="noreferrer"
                      className="text-[12px] font-bold text-mint-d border border-mint rounded-[10px] px-3 py-1.5 hover:bg-mint-l flex items-center gap-1">
                      <ExternalLink size={12} />청약홈 공고문
                    </a>
                  )}
                  {it.homepage && (
                    <a href={it.homepage} target="_blank" rel="noreferrer"
                      className="text-[12px] font-bold text-sub border border-line rounded-[10px] px-3 py-1.5 hover:bg-canvas flex items-center gap-1">
                      <ExternalLink size={12} />분양 홈페이지
                    </a>
                  )}
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>

      {res?.updatedAt && !loading && (
        <div className="text-[11px] text-sub text-center mt-4">
          기준 {new Date(res.updatedAt).toLocaleString('ko-KR')} · 출처 청약홈(한국부동산원)
        </div>
      )}

      <PayModal info={pay} onClose={() => setPay(null)} />

      <NotifyModal
        open={notifyModal && canNotify}
        onClose={() => setNotifyModal(false)}
        watch={watch}
        regions={regions}
        onChange={setWatch}
        toast={toast}
      />

      <RegionModal
        open={regionModal}
        onClose={() => setRegionModal(false)}
        regions={regions}
        onSave={async (next) => {
          if (!profile || !profileId) return
          await repo.upsertProfile({ ...profile, applyRegions: next })
        }}
      />
    </>
  )
}

function Toggle({ on, onClick, label, desc }: { on: boolean; onClick: () => void; label: string; desc?: string }) {
  return (
    <button onClick={onClick} className="w-full flex items-start gap-3 text-left py-2.5">
      <span className={`mt-0.5 w-9 h-5 rounded-full shrink-0 transition-colors relative ${on ? 'bg-mint' : 'bg-line'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
      <span className="flex-1">
        <span className="block text-[13.5px] font-bold">{label}</span>
        {desc && <span className="block text-[11.5px] text-sub mt-0.5 leading-relaxed">{desc}</span>}
      </span>
    </button>
  )
}

/** 알림 설정 — 실제 발송은 서버(apply-notify)가 하루 2번 돌면서 한다 */
function NotifyModal({
  open, onClose, watch, regions, onChange, toast,
}: {
  open: boolean
  onClose: () => void
  watch: Watch | null
  regions: string[]
  onChange: (w: Watch) => void
  toast: (m: string) => void
}) {
  const [w, setW] = useState<Watch>(watch ?? EMPTY_WATCH)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open && watch) setW(watch) }, [open, watch])

  async function save(next: Watch) {
    setW(next)
    const ok = await saveWatch({ ...next, regions })
    if (ok) onChange({ ...next, regions })
    else toast('저장에 실패했어요.')
  }

  async function test() {
    setBusy(true)
    const r = await sendTest(w.email)
    setBusy(false)
    toast(r.ok ? '테스트 메일을 보냈어요. 받은편지함을 확인해 주세요.' : (r.reason ?? '발송에 실패했어요.'))
  }

  return (
    <Modal open={open} onClose={onClose} title="청약 알림">
      <Toggle
        on={w.enabled}
        onClick={() => save({ ...w, enabled: !w.enabled })}
        label="알림 받기"
        desc={`관심지역 ${regions.length}곳(${regions.slice(0, 3).join('·')}${regions.length > 3 ? ' 외' : ''})의 새 공고를 매일 아침 확인해서 알려드려요.`}
      />

      <div className="bg-canvas rounded-[10px] p-3 text-[11.5px] text-sub leading-relaxed my-2">
        <b className="text-ink">언제 오나요?</b>
        <div className="mt-1">① 공고가 뜬 날 아침 8시 (접수 열흘쯤 전)</div>
        <div>② 1순위 접수 <b>전날</b> 아침 8시</div>
        <div>③ 1순위 접수 <b>당일 아침 8시 30분</b> (9시 시작 30분 전)</div>
        <div className="mt-1.5">특별공급일이 아니라 <b>1순위 해당지역 접수일</b> 기준이에요.</div>
      </div>

      <div className="border-t border-line pt-1 mt-2">
        <div className="text-[12px] font-bold text-sub mt-2 mb-1">받는 방법</div>

        <Toggle on={w.emailOn} onClick={() => save({ ...w, emailOn: !w.emailOn })} label="이메일" />
        {w.emailOn && (
          <input
            value={w.email}
            onChange={(e) => setW({ ...w, email: e.target.value })}
            onBlur={() => save(w)}
            placeholder="받을 메일 주소"
            className={inputCls}
          />
        )}
      </div>

      <div className="border-t border-line mt-3 pt-1">
        <Toggle
          on={w.specialOn}
          onClick={() => save({ ...w, specialOn: !w.specialOn })}
          label="특별공급도 알림 받기"
          desc="생애최초·신혼부부 등 특별공급 공고까지 포함합니다. 자격 요건(무주택 세대, 소득세 5년, 소득 기준 등)을 충족할 때만 켜세요. 기본은 꺼짐입니다."
        />
      </div>

      <div className="flex gap-2 mt-4">
        <Button variant="line" className="flex-1" onClick={test} disabled={busy}>지금 테스트 보내기</Button>
        <Button onClick={onClose}>닫기</Button>
      </div>

      <div className="text-[11px] text-sub mt-3 leading-relaxed">
        ※ 알림은 서버가 보내므로 이 창을 닫아도, 폰을 꺼둬도 옵니다.
      </div>
    </Modal>
  )
}

/** 분양가를 언제 얼마씩 내는지 — 한 번에 다 내는 게 아니라는 걸 보여주는 모달 */
function PayModal({ info, onClose }: { info: { name: string; model: ModelCalc } | null; onClose: () => void }) {
  if (!info) return null
  const { name, model } = info
  const plan = paymentPlan(model.price, model.area)

  return (
    <Modal open onClose={onClose} title="이 돈, 언제 얼마씩 내나요?">
      <div className="text-[13px] font-bold">{name}</div>
      <div className="text-[12px] text-sub mb-3">
        {model.houseTy} · 전용 {model.area.toFixed(2)}㎡ · 분양가 <b className="text-ink">{amt(model.price)}</b>
      </div>

      <div className="space-y-2 mb-4">
        {plan.steps.map((s) => (
          <div key={s.label} className="bg-canvas rounded-[10px] p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-bold">{s.label} <span className="text-sub font-semibold">{s.pct}%</span></span>
              <span className="text-[15px] font-extrabold text-mint-d">{amt(s.amount)}</span>
            </div>
            <div className="text-[11.5px] text-sub mt-0.5">
              {s.when}{s.note && ` · ${s.note}`}
            </div>
          </div>
        ))}
      </div>

      <div className="text-[12px] font-bold mb-1.5">이 밖에 따로 드는 돈</div>
      <div className="text-[12px] text-sub space-y-1 mb-4">
        <div className="flex justify-between">
          <span>취득세 ({(plan.taxRate * 100).toFixed(1)}%)</span>
          <span className="font-bold text-ink">{amt(plan.tax)}</span>
        </div>
        <div className="flex justify-between">
          <span>발코니 확장·옵션</span>
          <span>공고문 확인</span>
        </div>
      </div>

      {plan.bigLoan && (
        <div className="bg-[#fff3e0] text-[#c77700] rounded-[10px] p-3 text-[11.5px] leading-relaxed mb-3">
          <b>대출이 크게 막히는 구간입니다.</b> 규제지역에서 15억을 넘는 집은 주택담보대출 한도가 줄고,
          25억을 넘으면 2억까지만 나옵니다. 중도금 대출도 어려워서 사실상 현금이 있어야 합니다.
        </div>
      )}

      <div className="text-[11px] text-sub leading-relaxed">
        ※ 계약금·중도금 비율은 <b>단지마다 다릅니다.</b> 여기 숫자는 가장 흔한 20/60/20 기준으로 계산한 예시예요.
        분양가도 그 평형에서 <b>가장 비싼 호수 기준</b>이라 저층·비선호 향은 더 쌉니다. 정확한 금액은 모집공고문을 보세요.
      </div>

      <Button className="w-full mt-4" onClick={onClose}>닫기</Button>
    </Modal>
  )
}

function Info2({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <span className="text-sub shrink-0">{label}</span>
      <span className="font-semibold truncate">{value}</span>
    </div>
  )
}

/** 관심지역 편집 — 주소에 이 단어가 들어간 분양만 가져온다 */
function RegionModal({
  open, onClose, regions, onSave,
}: {
  open: boolean
  onClose: () => void
  regions: string[]
  onSave: (next: string[]) => Promise<void>
}) {
  const [list, setList] = useState<string[]>(regions)
  const [input, setInput] = useState('')
  useEffect(() => { if (open) { setList(regions); setInput('') } }, [open, regions])

  function add() {
    const v = input.trim()
    if (!v || list.includes(v)) { setInput(''); return }
    setList([...list, v]); setInput('')
  }

  return (
    <Modal open={open} onClose={onClose} title="관심지역">
      <div className="text-[12.5px] text-sub mb-3 leading-relaxed">
        분양 <b>주소에 이 단어가 들어간 것</b>만 가져옵니다.
        구 단위(<b>서초구</b>)로도, 동 단위(<b>반포동</b>)로도 됩니다.
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {list.map((r) => (
          <span key={r} className="bg-mint-l text-mint-d text-[12.5px] font-bold rounded-full pl-3 pr-1.5 py-1 flex items-center gap-1">
            {r}
            <button onClick={() => setList(list.filter((x) => x !== r))} className="hover:opacity-60"><X size={13} /></button>
          </span>
        ))}
        {list.length === 0 && <span className="text-[12.5px] text-sub">지역을 하나 이상 추가해 주세요.</span>}
      </div>

      <div className="flex gap-2 mb-3">
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder="예: 강남구" className={inputCls} />
        <Button variant="line" onClick={add}><Plus size={14} /></Button>
      </div>

      <button onClick={() => setList(DEFAULT_REGIONS)} className="text-[12px] text-sub hover:text-ink underline mb-4">
        기본값으로 되돌리기 (강남·서초·송파·용산·마포·성동)
      </button>

      <div className="flex gap-2">
        <Button className="flex-1" onClick={async () => { await onSave(list); onClose() }}>저장</Button>
        <Button variant="ghost" onClick={onClose}>취소</Button>
      </div>
    </Modal>
  )
}
