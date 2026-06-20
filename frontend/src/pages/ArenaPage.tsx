import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getRecentBattles, createBattle, getStats } from '../services/pyre'
import { BattleCard } from '../components/BattleCard'
import { Button } from '../components/ui/Button'
import { MonospaceLabel } from '../components/ui/MonospaceLabel'
import { useWallet } from '../lib/wallet'
import { ErrorState } from '../components/ui/ErrorState'
import { LoadingState } from '../components/ui/LoadingState'
import { EmptyState } from '../components/ui/EmptyState'

export function ArenaPage() {
  const navigate = useNavigate()
  const wallet = useWallet()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const initialTopic = params.get('new') ?? ''

  const [topic, setTopic] = useState(initialTopic)
  const [stakeGen, setStakeGen] = useState(0.01)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<number | null>(null)

  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: getStats, refetchInterval: 10_000 })
  const { data: recent } = useQuery({
    queryKey: ['recent-arena', 30, 0],
    queryFn: () => getRecentBattles(30, 0),
    refetchInterval: 10_000,
  })

  useEffect(() => {
    if (initialTopic) setTopic(initialTopic)
  }, [initialTopic])

  async function create() {
    if (!topic.trim()) {
      setError('Topic is required.')
      return
    }
    if (wallet.kind === 'disconnected') {
      setError('Connect a wallet first.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      const stakeWei = BigInt(Math.floor(stakeGen * 1e18))
      await createBattle(wallet.viemAccount as any, topic.trim(), stakeWei)
      queryClient.invalidateQueries({ queryKey: ['recent-arena'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      // We don't know the new id without polling; just navigate to the arena
      // list and let the user pick. The mock returns no id; live mode requires
      // a follow-up get_recent_battles to find the new top id.
      setCreated(-1)
    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message ?? 'Failed to create battle')
    } finally {
      setBusy(false)
    }
  }

  const open = (recent?.battles ?? []).filter((b) => b.state === 'open' || b.state === 'both_joined' || b.state === 'both_burned')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32, paddingTop: 24 }}>
      <header>
        <h1 style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', margin: 0 }}>ARENA</h1>
        <p style={{ color: 'var(--muted)', maxWidth: '60ch' }}>
          Open duels waiting for a challenger. Pick one, or open a new one.
        </p>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>
          <MonospaceLabel size="xs">OPEN A NEW DUEL</MonospaceLabel>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              create()
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}
          >
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value.slice(0, 120))}
              placeholder="the topic. keep it under 120 chars."
              rows={2}
              maxLength={120}
              style={{
                background: 'var(--bg)',
                color: 'var(--ink)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--r-sm)',
                padding: '12px 14px',
                fontFamily: 'var(--font-body)',
                fontSize: '15px',
                outline: 'none',
                resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <MonospaceLabel size="xs">STAKE</MonospaceLabel>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={stakeGen}
                onChange={(e) => setStakeGen(parseFloat(e.target.value) || 0)}
                style={{
                  width: 100,
                  background: 'var(--bg)',
                  color: 'var(--ink)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--r-sm)',
                  padding: '8px 10px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  outline: 'none',
                }}
              />
              <MonospaceLabel size="xs">GEN</MonospaceLabel>
            </div>
            <Button variant="burn" type="submit" disabled={busy || !topic.trim()}>
              {busy ? 'BROADCASTING...' : 'CREATE BATTLE'}
            </Button>
            {error && <ErrorState message={error} hint="Check your wallet connection." />}
            {created !== null && (
              <LoadingState
                label="DUEL OPENED"
                message="The arena will refresh with your new battle momentarily."
                phases={[
                  { label: 'TX SUBMITTED', done: true, active: false },
                  { label: 'CONSOLIDATING', done: false, active: true },
                ]}
              />
            )}
          </form>
        </div>

        <div>
          <MonospaceLabel size="xs">ARENA STATUS</MonospaceLabel>
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Stat label="OPEN" value={stats?.open_battles ?? 0} />
            <Stat label="RESOLVED" value={stats?.resolved_battles ?? 0} />
            <Stat label="DISPUTED" value={stats?.disputed_battles ?? 0} />
            <Stat label="TOTAL" value={stats?.total_battles ?? 0} />
          </div>
        </div>
      </section>

      <section>
        <MonospaceLabel size="xs">OPEN DUELS · {open.length}</MonospaceLabel>
        {open.length === 0 ? (
          <div style={{ marginTop: 12 }}>
            <EmptyState
              label="ARENA QUIET"
              message="No open duels. Be the first to pick a fight."
            />
          </div>
        ) : (
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            {open.map((b) => (
              <BattleCard key={b.id} battle={b} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ padding: '14px 16px', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)' }}>
      <MonospaceLabel size="xs">{label}</MonospaceLabel>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 700, marginTop: 4, color: 'var(--ink)' }}>{value}</div>
    </div>
  )
}