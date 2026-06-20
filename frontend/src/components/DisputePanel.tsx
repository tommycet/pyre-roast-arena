import { useState } from 'react'
import type { Battle } from '../services/types'
import { useWallet } from '../lib/wallet'
import { raiseDispute } from '../services/pyre'
import { ErrorState } from './ui/ErrorState'
import { MonospaceLabel } from './ui/MonospaceLabel'
import { Button } from './ui/Button'

interface DisputePanelProps {
  battle: Battle
}

export function DisputePanel({ battle }: DisputePanelProps) {
  const wallet = useWallet()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function submit() {
    if (!reason.trim()) return
    if (wallet.kind === 'disconnected') {
      setError('Connect a wallet to raise a dispute.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await raiseDispute(wallet.viemAccount as any, battle.id, reason.trim())
      setDone(true)
    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message ?? 'Dispute failed')
    } finally {
      setBusy(false)
    }
  }

  if (battle.state === 'disputed') {
    return (
      <div
        style={{
          padding: '14px 18px',
          background: 'var(--amber-soft)',
          border: '1px solid var(--amber)',
          borderRadius: 'var(--r-md)',
        }}
      >
        <MonospaceLabel size="xs" style={{ color: 'var(--amber)' }}>DISPUTED</MonospaceLabel>
        <div style={{ marginTop: 6, color: 'var(--ink)' }}>
          A dispute is open against this verdict. See /dispute for details.
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div
        style={{
          padding: '14px 18px',
          background: 'var(--emerald-soft)',
          border: '1px solid var(--emerald)',
          borderRadius: 'var(--r-md)',
        }}
      >
        <MonospaceLabel size="xs" style={{ color: 'var(--emerald)' }}>DISPUTE RAISED</MonospaceLabel>
        <div style={{ marginTop: 6, color: 'var(--ink)' }}>
          The validators will re-judge this battle. Refresh to see the new verdict.
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <MonospaceLabel size="xs">RAISE A DISPUTE</MonospaceLabel>
      <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
        Disputes re-run consensus. They cost nothing but burn gas. Use sparingly.
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value.slice(0, 280))}
        placeholder="Why is this verdict wrong?"
        rows={3}
        maxLength={280}
        style={{
          width: '100%',
          background: 'var(--bg)',
          color: 'var(--ink)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--r-sm)',
          padding: '10px 12px',
          fontFamily: 'var(--font-body)',
          fontSize: '14px',
          outline: 'none',
          resize: 'vertical',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <MonospaceLabel size="xs">{reason.length}/280</MonospaceLabel>
        <Button variant="burn" size="sm" onClick={submit} disabled={busy || !reason.trim()}>
          {busy ? 'BROADCASTING...' : 'RAISE DISPUTE'}
        </Button>
      </div>
      {error && <ErrorState message={error} hint="Check wallet connection or network status." />}
    </div>
  )
}