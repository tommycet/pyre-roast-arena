import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getCombatant, getRecentBattles } from '../services/pyre'
import { MOCK_COMBATANTS } from '../services/mockData'
import { IS_DEPLOYED } from '../lib/genlayer'
import { Card } from '../components/ui/Card'
import { MonospaceLabel } from '../components/ui/MonospaceLabel'
import { LoadingState } from '../components/ui/LoadingState'
import { EmptyState } from '../components/ui/EmptyState'
import { Button } from '../components/ui/Button'
import { shortAddr, formatRelative } from '../lib/format'

export function CombatantPage() {
  const { addr } = useParams<{ addr: string }>()
  const navigate = useNavigate()
  const { data: combatant, isLoading } = useQuery({
    queryKey: ['combatant', addr],
    queryFn: () => addr ? getCombatant(addr) : null,
    enabled: !!addr,
  })

  const { data: recent } = useQuery({
    queryKey: ['combatant-battles', addr],
    queryFn: () => getRecentBattles(50, 0),
  })

  if (isLoading) return <LoadingState label="LOADING COMBATANT" />

  // Fall back to a combatant snapshot derived from recent battles in live mode.
  // For a single address this is just empty if they've never battled.
  const profile = combatant ?? (IS_DEPLOYED ? null : (addr ? MOCK_COMBATANTS[addr] : null))
  if (!profile) {
    return (
      <EmptyState
        label="COMBATANT NOT FOUND"
        message={`No combatant registered at ${shortAddr(addr || '')}.`}
        action={<Button variant="ghost" onClick={() => navigate('/flame')}>HALL OF FLAME</Button>}
      />
    )
  }

  const myBattles = (recent?.battles ?? []).filter(
    (b) => b.creator === addr || b.opponent === addr,
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, paddingTop: 24 }}>
      <header>
        <MonospaceLabel size="xs">COMBATANT</MonospaceLabel>
        <h1 style={{ fontSize: '1.6rem', fontFamily: 'var(--font-mono)', margin: '4px 0' }}>{shortAddr(profile.addr, 10, 8)}</h1>
        <div style={{ color: 'var(--muted)' }}>
          Reputation {profile.reputation} · {profile.total_burns} burns · best {profile.best_score}/100
        </div>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, border: '1px solid var(--line)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
        <Stat label="WINS" value={profile.wins} />
        <Stat label="LOSSES" value={profile.losses} />
        <Stat label="DRAWS" value={profile.draws} />
        <Stat label="REPUTATION" value={profile.reputation} />
      </section>

      {myBattles.length > 0 && (
        <section>
          <MonospaceLabel size="xs">BATTLES</MonospaceLabel>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {myBattles.map((b) => (
              <Link
                key={b.id}
                to={`/battle/${b.id}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '60px 1fr auto auto',
                  gap: 12,
                  padding: '12px 16px',
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--r-sm)',
                  textDecoration: 'none',
                  color: 'var(--ink)',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontFamily: 'var(--font-mono)' }}>#{b.id}</span>
                <span>{b.topic}</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>{formatRelative(b.created_at)}</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>
                  {b.verdict.winner === '0xDRAW'
                    ? 'DRAW'
                    : b.verdict.winner === addr
                      ? 'WON'
                      : b.verdict.loser === addr
                        ? 'LOST'
                        : '—'}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ padding: '16px 18px', borderRight: '1px solid var(--line)' }}>
      <MonospaceLabel size="xs">{label}</MonospaceLabel>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  )
}