import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Upload } from 'lucide-react'
import { repo, uid } from '../db/repository'
import { useProfile } from '../state/profile'
import { won } from '../lib/format'
import { parseCSV, toCSV, normDate, parseAmount } from '../lib/csv'
import { EXPENSE_CATS } from '../lib/categories'
import { Card, CardLabel, PageHeader, Button, Empty, inputCls } from '../components/ui'
import type { Transaction } from '../db/types'

type FieldKey = 'date' | 'type' | 'merchant' | 'category' | 'amount' | 'method' | 'memo'
const FIELDS: { key: FieldKey; label: string; required?: boolean }[] = [
  { key: 'date', label: '날짜', required: true },
  { key: 'merchant', label: '가맹점/내용', required: true },
  { key: 'amount', label: '금액', required: true },
  { key: 'type', label: '유형(지출/수입)' },
  { key: 'category', label: '카테고리' },
  { key: 'method', label: '결제수단' },
  { key: 'memo', label: '메모' },
]

const TEMPLATE = toCSV([
  ['날짜', '유형', '가맹점', '카테고리', '금액', '결제수단', '메모'],
  ['2026-07-01', '지출', '스타벅스', '식비', 6300, '국민카드', ''],
  ['2026-07-01', '수입', '급여', '급여', 4200000, '', ''],
])

function autoMap(headers: string[]): Record<FieldKey, number> {
  const find = (...keys: string[]) => headers.findIndex((h) => keys.some((k) => h.replace(/\s/g, '').includes(k)))
  return {
    date: find('날짜', '거래일', '이용일', '승인일'),
    type: find('유형', '구분', '입출'),
    merchant: find('가맹점', '내용', '적요', '가맹'),
    category: find('카테고리', '분류'),
    amount: find('금액', '이용금액', '승인금액', '출금', '입금'),
    method: find('결제', '카드', '수단'),
    memo: find('메모', '비고'),
  }
}

export default function Import() {
  const { profileId } = useProfile()
  const nav = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [map, setMap] = useState<Record<FieldKey, number>>({ date: -1, type: -1, merchant: -1, category: -1, amount: -1, method: -1, memo: -1 })
  const [done, setDone] = useState('')

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = '모아_가계부_템플릿.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  async function onFile(file: File) {
    const parsed = parseCSV(await file.text())
    if (parsed.length < 2) { setDone('⚠️ 데이터가 없어요.'); return }
    const hs = parsed[0]
    setHeaders(hs)
    setRows(parsed.slice(1))
    setMap(autoMap(hs))
    setDone('')
  }

  const preview = useMemo(() => {
    if (map.date < 0 || map.merchant < 0 || map.amount < 0) return []
    return rows.map((r) => {
      const rawType = map.type >= 0 ? r[map.type] ?? '' : ''
      const type: 'income' | 'expense' = /수입|입금|\+/.test(rawType) ? 'income' : 'expense'
      return {
        date: normDate(r[map.date] ?? '') ?? '',
        type,
        merchant: (r[map.merchant] ?? '').trim(),
        category: map.category >= 0 ? (r[map.category] ?? '').trim() : '',
        amount: parseAmount(r[map.amount] ?? ''),
        method: map.method >= 0 ? (r[map.method] ?? '').trim() : '',
        memo: map.memo >= 0 ? (r[map.memo] ?? '').trim() : '',
      }
    })
  }, [rows, map])

  const valid = preview.filter((p) => p.date && p.merchant && p.amount > 0)
  const canImport = map.date >= 0 && map.merchant >= 0 && map.amount >= 0 && valid.length > 0

  async function doImport() {
    const txs: Transaction[] = valid.map((p) => ({
      id: uid(), profileId, date: p.date, type: p.type, merchant: p.merchant,
      amount: p.amount, method: p.method || undefined, memo: p.memo || undefined,
      splits: [{ id: uid(), category: p.category || (p.type === 'income' ? '기타수입' : '기타'), amount: p.amount }],
      createdAt: new Date().toISOString(),
    }))
    for (const t of txs) await repo.upsertTransaction(t)
    setDone(`${txs.length}건을 가져왔어요.`)
    setTimeout(() => nav('/ledger'), 900)
  }

  return (
    <div>
      <PageHeader title="가져오기 (엑셀/CSV)" />

      <Card>
        <CardLabel>1. 템플릿 (권장)</CardLabel>
        <p className="text-[13px] text-sub mb-3">템플릿을 받아 내용을 채운 뒤 올리면 자동으로 들어가요. 카드사에서 받은 CSV도 바로 올려서 아래에서 열을 맞추면 돼요. (엑셀에서 <b>다른 이름으로 저장 → CSV</b>)</p>
        <Button variant="line" onClick={downloadTemplate}><Download size={15} className="inline -mt-0.5 mr-1.5" />템플릿 내려받기</Button>
      </Card>

      <Card className="mt-3.5">
        <CardLabel>2. 파일 올리기</CardLabel>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <Button onClick={() => fileRef.current?.click()}><Upload size={15} className="inline -mt-0.5 mr-1.5" />CSV 파일 선택</Button>
        {headers.length > 0 && <span className="text-[12px] text-sub ml-3">{rows.length}행 읽음</span>}
      </Card>

      {headers.length > 0 && (
        <Card className="mt-3.5">
          <CardLabel>3. 열 맞추기</CardLabel>
          <div className="grid grid-cols-2 gap-3">
            {FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="text-[12px] font-semibold text-sub">{f.label}{f.required && <span className="text-expense"> *</span>}</span>
                <select value={map[f.key]} onChange={(e) => setMap({ ...map, [f.key]: Number(e.target.value) })} className={inputCls + ' mt-1'}>
                  <option value={-1}>(없음)</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h || `열 ${i + 1}`}</option>)}
                </select>
              </label>
            ))}
          </div>
          <p className="text-[11px] text-sub mt-2">카테고리 예시: {EXPENSE_CATS.join(' · ')}</p>
        </Card>
      )}

      {preview.length > 0 && (
        <Card className="mt-3.5">
          <CardLabel>4. 미리보기 · 등록 가능 {valid.length}건 / 전체 {preview.length}건</CardLabel>
          <div className="overflow-auto">
            <table className="w-full text-[12px]">
              <thead><tr className="text-sub text-left border-b border-line">
                <th className="py-1.5 pr-2">날짜</th><th className="pr-2">유형</th><th className="pr-2">가맹점</th><th className="pr-2">카테고리</th><th className="text-right">금액</th>
              </tr></thead>
              <tbody>
                {preview.slice(0, 12).map((p, i) => {
                  const bad = !p.date || !p.merchant || !p.amount
                  return (
                    <tr key={i} className={`border-b border-line ${bad ? 'text-expense/70' : ''}`}>
                      <td className="py-1.5 pr-2 tnum">{p.date || '?'}</td>
                      <td className="pr-2">{p.type === 'income' ? '수입' : '지출'}</td>
                      <td className="pr-2">{p.merchant || '?'}</td>
                      <td className="pr-2">{p.category || '-'}</td>
                      <td className="text-right tnum">{won(p.amount)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {preview.length > 12 && <div className="text-[11px] text-sub mt-1">…외 {preview.length - 12}건</div>}
          </div>
          <div className="flex justify-end mt-4">
            <Button onClick={doImport} disabled={!canImport}>{valid.length}건 가져오기</Button>
          </div>
        </Card>
      )}

      {headers.length === 0 && <Empty>파일을 올리면 여기에 미리보기가 나와요.</Empty>}
      {done && <div className="mt-4 text-[13px] bg-mint-l text-mint-d rounded-lg px-4 py-3">{done}</div>}
    </div>
  )
}
