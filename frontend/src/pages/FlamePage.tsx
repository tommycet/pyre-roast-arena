import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getStats, getRecentBattles } from '../services/pyre'
import { MOCK_COMBATANTS } from '../services/mockData'
import type { Battle, Combatant } from '../services/types'
import { IS_DEPLOYED } from '../lib/genlayer'
import { Card } from '../components/ui/Card'
import { MonospaceLabel } from '../components/ui/MonospaceLabel'
import { shortAddr } from '../lib/format'
import { LoadingState } from '../components/ui/LoadingState'

/**
 * Live mode fallback for the leaderboard: derive a snapshot of combatants
 * from recent battle verdicts. The contract intentionally doesn't expose a
 * get_all_combatants view (smaller surface = smaller attack surface), so the
 * FlamePage aggregates what it sees. The mock registry is used in preview mode.
 */
function combatantsFromBattles(battles: Battle[]): Combatant[] {
  const byAddr = new Map<string, Combatant>()
  for (const b of battles) {
    for (const addr of [b.creator, b.opponent]) {
      if (!addr) continue
      if (!byAddr.has(addr)) {
        byAddr.set(addr, {
          addr,
          wins: 0,
          losses: 0,
          draws: 0,
          reputation: 50,
          total_burns: 0,
          best_score: 0,
          best_score_battle: 0,
        })
      }
    }
    if (!b.verdict || b.verdict.judged_at === 0) continue
    const { winner, loser } = b.verdict
    if (winner === '0xDRAW') {
      for (const addr of [b.creator, b.opponent]) {
        const c = byAddr.get(addr)
        if (c) c.draws += 1
      }
    } else if (winner && loser) {
      const wc = byAddr.get(winner)
      if (wc) wc.wins += 1
      const lc = byAddr.get(loser)
      if (lc) lc.losses += 1
    }
  }
  return Array.from(byAddr.values())
}

export function FlamePage() {
  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: getStats, refetchInterval: 15_000 })
  const { data: recent } = useQuery({
    queryKey: ['flame-recent', 50, 0],
    queryFn: () => getRecentBattles(50, 0),
    refetchInterval: 15_000,
  })

  if (!stats) return <LoadingState label="LOADING LEADERBOARD" />

  const combatants: Combatant[] = IS_DEPLOYED
    ? combatantsFromBattles(recent?.battles ?? []).sort(
        (a, b) => b.wins - a.wins,
      )
    : Object.values(MOCK_COMBATANTS).sort(
        (a: Combatant, b: Combatant) => b.wins - a.wins || b.best_score - a.best_score,
      )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, paddingTop: 24 }}>
      <header>
        <h1 style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', margin: 0 }}>HALL OF FLAME</h1>
        <p style={{ color: 'var(--muted)' }}>
          {IS_DEPLOYED
            ? 'Combatants with the most verified wins, derived from on-chain battle verdicts.'
            : 'Preview mode: full registry from in-memory data.'}
        </p>
      </header>

      {combatants.length === 0 ? (
        <Card>
          <MonospaceLabel size="xs">LEADERBOARD EMPTY</MonospaceLabel>
          <p style={{ marginTop: 8, color: 'var(--muted)' }}>
            No resolved battles yet. Be the first to battle and the first to be remembered.
          </p>
        </Card>
      ) : (
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {combatants.map((c, i) => (
            <Link
              key={c.addr}
              to={`/combatant/${c.addr}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: '20px 22px',
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--r-md)',
                textDecoration: 'none',
                color: 'var(--ink)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <MonospaceLabel size="xs">RANK {String(i + 1).padStart(2, '0')}</MonospaceLabel>
                <MonospaceLabel size="xs">REP {c.reputation}</MonospaceLabel>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}>{shortAddr(c.addr, 8, 6)}</div>
              <div style={{ display: 'flex', gap: 16, color: 'var(--muted)' }}>
                <span>{c.wins}W</span>
                <span>·</span>
                <span>{c.losses}L</span>
                <span>·</span>
                <span>{c.draws}D</span>
              </div>
              {c.best_score > 0 && (
                <div style={{ color: 'var(--ember)', fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  BEST {c.best_score}/100
                </div>
              )}
            </Link>
          ))}
        </section>
      )}

      {recent && (
        <section>
          <MonospaceLabel size="xs">RECENT VERDICTS</MonospaceLabel>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recent.battles
              .filter((b) => b.verdict.judged_at > 0)
              .slice(0, 6)
              .map((b) => (
                <Link
                  key={b.id}
                  to={`/battle/${b.id}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--r-sm)',
                    textDecoration: 'none',
                    color: 'var(--ink)',
                  }}
                >
                  <span>#{b.id} {b.topic}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--emerald)' }}>
                    {b.verdict.winner === '0xDRAW' ? 'DRAW' : `${shortAddr(b.verdict.winner)} +${b.verdict.margin}`}
                  </span>
                </Link>
              ))}
          </div>
        </section>
      )}
    </div>
  )
}