import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { repo, uid } from '../db/repository'
import { useProfile } from '../state/profile'
import { won } from '../lib/format'
import { Card, CardLabel, PageHeader, Button, Empty, Modal, Field, inputCls, Fab } from '../components/ui'
import AmountInput from '../components/AmountInput'
import type { Asset, AssetType } from '../db/types'

const TYPES: { key: AssetType; label: string; emoji: string; color: string }[] = [
  { key: 'account', label: '현금·계좌', emoji: '🏦', color: '#12b8a6' },
  { key: 'cash', label: '현금', emoji: '💵', color: '#3fc7b8' },
  { key: 'stock', label: '증권', emoji: '📈', color: '#5b8def' },
  { key: 'coin', label: '코인', emoji: '🪙', color: '#9b8afb' },
  { key: 'etc', label: '기타', emoji: '📦', color: '#f5a524' },
]

export default function Assets() {
  const { profileId } = useProfile()
  const assets = useLiveQuery(() => (profileId ? repo.listAssets(profileId) : []), [profileId], [])
  const [modal, setModal] = useState(false)
  const [edit, setEdit] = useState<Asset | undefined>()

  const total = assets.reduce((s, a) => s + a.amount, 0)
  const byType = TYPES.map((t) => ({
    ...t,
    sum: assets.filter((a) => a.type === t.key).reduce((s, a) => s + a.amount, 0),
    items: assets.filter((a) => a.type === t.key),
  })).filter((t) => t.items.length > 0)

  return (
    <div>
      <PageHeader title="자산" desc="계좌·증권·코인 통합 · 수동 입력(추후 시세 자동 갱신)" />

      <Card>
        <CardLabel>자산 구성 · 총 ₩{won(total)}</CardLabel>
        <div className="flex h-7 rounded-lg overflow-hidden mt-1">
          {byType.map((t) => (
            <div
              key={t.key}
              style={{ width: `${total ? (t.sum / total) * 100 : 0}%`, background: t.color }}
              className="flex items-center justify-center text-white text-[11px] font-bold"
              title={`${t.label} ${won(t.sum)}`}
            >
              {total && t.sum / total > 0.1 ? `${Math.round((t.sum / total) * 100)}%` : ''}
            </div>
          ))}
        </div>
        <div className="flex gap-3 flex-wrap mt-2.5">
          {byType.map((t) => (
            <span key={t.key} className="text-[11.5px] text-sub flex items-center gap-1">
              <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: t.color }} />
              {t.label} {Math.round((t.sum / total) * 100)}%
            </span>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3.5 mt-3.5">
        {byType.length === 0 && <Empty>자산이 없어요. ‘자산 추가’로 입력하세요.</Empty>}
        {byType.map((t) => (
          <Card key={t.key}>
            <CardLabel>{t.emoji} {t.label} · ₩{won(t.sum)}</CardLabel>
            {t.items.map((a) => (
              <div
                key={a.id}
                onClick={() => { setEdit(a); setModal(true) }}
                className="flex items-center justify-between py-2.5 border-b border-line last:border-0 cursor-pointer hover:bg-canvas -mx-2 px-2 rounded-lg"
              >
                <div>
                  <div className="text-[13.5px] font-semibold">{a.name}</div>
                  {a.quantity != null && (
                    <div className="text-[11px] text-sub tnum">{a.quantity}{a.ticker ? ` ${a.ticker}` : ''}</div>
                  )}
                </div>
                <span className="text-[14px] font-bold tnum">{won(a.amount)}</span>
              </div>
            ))}
          </Card>
        ))}
      </div>

      <Fab onClick={() => { setEdit(undefined); setModal(true) }} label="자산 추가" />
      <AssetModal open={modal} onClose={() => setModal(false)} edit={edit} profileId={profileId} />
    </div>
  )
}

function AssetModal({ open, onClose, edit, profileId }: { open: boolean; onClose: () => void; edit?: Asset; profileId: string }) {
  const [type, setType] = useState<AssetType>('account')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [quantity, setQuantity] = useState('')
  const [ticker, setTicker] = useState('')

  useEffect(() => {
    if (!open) return
    if (edit) {
      setType(edit.type); setName(edit.name); setAmount(edit.amount)
      setQuantity(edit.quantity != null ? String(edit.quantity) : ''); setTicker(edit.ticker ?? '')
    } else {
      setType('account'); setName(''); setAmount(null); setQuantity(''); setTicker('')
    }
  }, [open, edit])

  const investKind = type === 'stock' || type === 'coin'

  async function save() {
    if (!name.trim() || !(Number(amount) > 0)) return
    const a: Asset = {
      id: edit?.id ?? uid(),
      profileId,
      type,
      name: name.trim(),
      amount: amount!,
      quantity: quantity ? Number(quantity) : undefined,
      unitPrice: quantity && Number(quantity) > 0 ? amount! / Number(quantity) : undefined,
      ticker: ticker.trim() || undefined,
      updatedAt: new Date().toISOString(),
    }
    await repo.upsertAsset(a)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={edit ? '자산 수정' : '자산 추가'}>
      <Field label="종류">
        <select value={type} onChange={(e) => setType(e.target.value as AssetType)} className={inputCls}>
          {TYPES.map((t) => <option key={t.key} value={t.key}>{t.emoji} {t.label}</option>)}
        </select>
      </Field>
      <Field label="이름"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 국민은행 입출금" className={inputCls} /></Field>
      <Field label="평가금액 (원)"><AmountInput value={amount} onChange={setAmount} /></Field>
      {investKind && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="보유 수량"><input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputCls + ' text-right tnum'} /></Field>
          <Field label="종목코드(선택)"><input value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="AAPL" className={inputCls} /></Field>
        </div>
      )}
      <div className="flex gap-2 mt-4">
        {edit && <Button variant="ghost" className="!text-expense" onClick={async () => { await repo.deleteAsset(edit.id); onClose() }}>삭제</Button>}
        <div className="flex-1" />
        <Button variant="line" onClick={onClose}>취소</Button>
        <Button onClick={save}>저장</Button>
      </div>
    </Modal>
  )
}
