import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { getDispute, resolveDispute } from '../services/pyre'
import { MOCK_DISPUTES } from '../services/mockData'
import { IS_DEPLOYED } from '../lib/genlayer'
import { Card } from '../components/ui/Card'
import { MonospaceLabel } from '../components/ui/MonospaceLabel'
import { StatusPill } from '../components/ui/StatusPill'
import { LoadingState } from '../components/ui/LoadingState'
import { EmptyState } from '../components/ui/EmptyState'
import { Button } from '../components/ui/Button'
import { ErrorState } from '../components/ui/ErrorState'
import { useWallet } from '../lib/wallet'
import { shortAddr, formatRelative } from '../lib/format'

export function DisputePage() {
  const { id } = useParams<{ id: string }>()
  const disputeId = Number(id)
  const navigate = useNavigate()
  const wallet = useWallet()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: dispute, isLoading, refetch } = useQuery({
    queryKey: ['dispute', disputeId],
    queryFn: () => getDispute(disputeId),
    enabled: !!id,
  })

  if (isLoading) return <LoadingState label="LOADING DISPUTE" />
  const d = dispute ?? (IS_DEPLOYED ? null : MOCK_DISPUTES.find((x) => x.id === disputeId) ?? null)
  if (!d) {
    return (
      <EmptyState
        label="DISPUTE NOT FOUND"
        message={`No dispute with id ${disputeId} on this chain.`}
        action={<Button variant="ghost" onClick={() => navigate('/arena')}>BACK TO ARENA</Button>}
      />
    )
  }

  async function resolve() {
    if (wallet.kind === 'disconnected') {
      setError('Connect a wallet to resolve.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await resolveDispute(wallet.viemAccount as any, disputeId)
      await refetch()
    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message ?? 'Resolve failed')
    } finally {
      setBusy(false)
    }
  }

  const stateMap: Record<string, 'disputed' | 'verified'> = {
    open: 'disputed',
    upheld: 'verified',
    overturned: 'disputed',
  }
  const stateKey = (d.status in stateMap ? d.status : 'open') as keyof typeof stateMap

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 24, maxWidth: 720 }}>
      <header>
        <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
          <StatusPill state={stateMap[stateKey]}>{d.status === 'open' ? 'OPEN' : d.status.toUpperCase()}</StatusPill>
          <MonospaceLabel size="xs">DISPUTE #{d.id}</MonospaceLabel>
        </div>
        <h1 style={{ fontSize: '1.6rem', margin: '6px 0 0' }}>Battle #{d.battle_id}</h1>
      </header>

      <Card>
        <MonospaceLabel size="xs">REASON</MonospaceLabel>
        <p style={{ marginTop: 8, fontSize: '1.05rem' }}>{d.reason}</p>
        <div style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 12, marginTop: 8 }}>
          raised by {shortAddr(d.raised_by)} · {formatRelative(d.raised_at)}
        </div>
      </Card>

      <Card>
        <MonospaceLabel size="xs">PRIOR VERDICT</MonospaceLabel>
        <div style={{ marginTop: 8, fontSize: '1.1rem' }}>Winner: {shortAddr(d.prior_winner)}</div>
      </Card>

      {d.status === 'open' && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Button variant="burn" onClick={resolve} disabled={busy}>
            {busy ? 'RESOLVING...' : 'RESOLVE (RE-JUDGE)'}
          </Button>
          <MonospaceLabel size="xs">Triggers a fresh consensus pass.</MonospaceLabel>
        </div>
      )}

      {d.status !== 'open' && (
        <Card>
          <MonospaceLabel size="xs" style={{ color: d.status === 'overturned' ? 'var(--amber)' : 'var(--emerald)' }}>
            {d.status === 'overturned' ? 'OVERTURNED' : 'UPHELD'}
          </MonospaceLabel>
          <p style={{ marginTop: 8 }}>
            {d.status === 'overturned'
              ? 'The new verdict differed from the prior winner. See the battle page for the updated result.'
              : 'The new verdict matched the prior winner. Original outcome stands.'}
          </p>
          <div style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            resolved {formatRelative(d.resolved_at)}
          </div>
        </Card>
      )}

      {error && <ErrorState message={error} />}
      <Link to={`/battle/${d.battle_id}`} style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
        → BATTLE PAGE
      </Link>
    </div>
  )
}