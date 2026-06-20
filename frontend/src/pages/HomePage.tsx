import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { getStats, getRecentBattles } from '../services/pyre'
import { BattleCard } from '../components/BattleCard'
import { Button } from '../components/ui/Button'
import { MonospaceLabel } from '../components/ui/MonospaceLabel'
import { Card } from '../components/ui/Card'
import { Arena3D } from '../components/Arena3D'
import { useWallet } from '../lib/wallet'
import { networkLabel } from '../lib/format'
import { CHAIN_ID } from '../lib/genlayer'

export function HomePage() {
  const navigate = useNavigate()
  const wallet = useWallet()
  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: getStats, refetchInterval: 10_000 })
  const { data: recent } = useQuery({
    queryKey: ['recent-home', 4, 0],
    queryFn: () => getRecentBattles(4, 0),
    refetchInterval: 10_000,
  })

  const [topic, setTopic] = useState('')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 48, paddingTop: 32 }}>
      {/* Hero */}
      <section style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 48, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <MonospaceLabel size="xs" style={{ color: 'var(--ember)' }}>
            {networkLabel(CHAIN_ID)} · GENLAYER CONSENSUS
          </MonospaceLabel>
          <h1
            style={{
              fontSize: 'clamp(2.5rem, 5vw, 4.5rem)',
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              lineHeight: 1.02,
              margin: 0,
            }}
          >
            ROASTS COME AND GO.<br />
            <span style={{ color: 'var(--ember)' }}>CONSENSUS</span> IS FOREVER.
          </h1>
          <p style={{ color: 'var(--muted)', maxWidth: '60ch', fontSize: '1.05rem' }}>
            Two combatants. One topic. AI validators on GenLayer judge each burn across
            five dimensions: wit, originality, burn, rhyme, topicality. The verdict lives
            on-chain. Anyone can dispute it. The record is permanent.
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <Button variant="primary" onClick={() => navigate('/arena')}>
              ENTER THE ARENA
            </Button>
            <Button variant="ghost" onClick={() => navigate('/flame')}>
              HALL OF FLAME
            </Button>
          </div>
          {!wallet.address && (
            <div style={{ color: 'var(--amber)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Connect a wallet to start battling. Demo signer works on studionet.
            </div>
          )}
        </div>
        <div>
          <Arena3D state={{ phase: 'open', combatantA: '0xA', combatantB: '0xB' }} height={400} />
        </div>
      </section>

      {/* Stats strip — sober, not hero-metric */}
      {stats && (
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 0, border: '1px solid var(--line)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
          <StatCell label="TOTAL BATTLES" value={stats.total_battles} />
          <StatCell label="RESOLVED" value={stats.resolved_battles} />
          <StatCell label="OPEN DUELS" value={stats.open_battles} />
          <StatCell label="DISPUTED" value={stats.disputed_battles} />
          <StatCell label="COMBATANTS" value={stats.total_combatants} />
        </section>
      )}

      {/* Create battle quick-form */}
      <section>
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <MonospaceLabel size="xs">OPEN A DUEL</MonospaceLabel>
            <p style={{ margin: 0, color: 'var(--muted)' }}>
              Pick a topic, stake 0.01 GEN, and wait for a challenger. They join, both submit
              burns, validators judge. The whole loop takes about 90 seconds on studionet.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!topic.trim()) return
                navigate(`/arena?new=${encodeURIComponent(topic.trim())}`)
              }}
              style={{ display: 'flex', gap: 8 }}
            >
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="the topic. make it sting."
                maxLength={120}
                style={{
                  flex: 1,
                  background: 'var(--bg)',
                  color: 'var(--ink)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--r-sm)',
                  padding: '12px 14px',
                  fontFamily: 'var(--font-body)',
                  fontSize: '15px',
                  outline: 'none',
                }}
              />
              <Button variant="burn" type="submit" disabled={!topic.trim()}>
                CREATE
              </Button>
            </form>
          </div>
        </Card>
      </section>

      {/* Recent battles */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
          <h2 style={{ fontSize: '1.5rem', margin: 0 }}>RECENT</h2>
          <MonospaceLabel size="xs" style={{ cursor: 'pointer' }} onClick={() => navigate('/arena')}>
            ALL BATTLES →
          </MonospaceLabel>
        </div>
        {recent && recent.battles.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            {recent.battles.map((b) => (
              <BattleCard key={b.id} battle={b} />
            ))}
          </div>
        ) : (
          <div style={{ color: 'var(--muted)', padding: 32, textAlign: 'center', border: '1px solid var(--line)', borderRadius: 'var(--r-md)' }}>
            No battles yet. Be the first to start one.
          </div>
        )}
      </section>
    </div>
  )
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ padding: '20px 22px', borderRight: '1px solid var(--line)' }}>
      <MonospaceLabel size="xs">{label}</MonospaceLabel>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 700, color: 'var(--ink)', marginTop: 8, letterSpacing: '-0.02em' }}>
        {value}
      </div>
    </div>
  )
}