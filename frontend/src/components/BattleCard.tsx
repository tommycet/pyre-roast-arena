import { Link } from 'react-router-dom'
import type { Battle, Combatant } from '../services/types'
import { StatusPill } from './ui/StatusPill'
import { MonospaceLabel } from './ui/MonospaceLabel'
import { shortAddr, topicPreview, formatRelative, formatStake } from '../lib/format'

interface BattleCardProps {
  battle: Battle
  combatantA?: Combatant
  combatantB?: Combatant
}

export function BattleCard({ battle, combatantA, combatantB }: BattleCardProps) {
  const statePillMap: Record<Battle['state'], 'open' | 'judging' | 'resolved' | 'disputed'> = {
    open: 'open',
    both_joined: 'open',
    both_burned: 'judging',
    judging: 'judging',
    resolved: 'resolved',
    disputed: 'disputed',
  }

  return (
    <Link
      to={`/battle/${battle.id}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '20px 22px',
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-md)',
        textDecoration: 'none',
        color: 'var(--ink)',
        transition: 'border-color var(--dur-fast) var(--ease)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <StatusPill state={statePillMap[battle.state]} />
        <MonospaceLabel size="xs">#{battle.id}</MonospaceLabel>
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.15rem',
          fontWeight: 600,
          letterSpacing: '-0.01em',
          color: 'var(--ink)',
          lineHeight: 1.25,
        }}
      >
        {topicPreview(battle.topic, 100)}
      </div>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <MonospaceLabel size="xs">CREATOR</MonospaceLabel>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
            {shortAddr(battle.creator)}
          </span>
        </div>
        {battle.opponent && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <MonospaceLabel size="xs">OPPONENT</MonospaceLabel>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
              {shortAddr(battle.opponent)}
            </span>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'right' }}>
          <MonospaceLabel size="xs">STAKE</MonospaceLabel>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
            {formatStake(battle.stake)}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <MonospaceLabel size="xs">{formatRelative(battle.created_at)}</MonospaceLabel>
        {(combatantA || combatantB) && (
          <MonospaceLabel size="xs">
            {combatantA ? combatantA.wins : 0}W · {combatantB ? combatantB.wins : 0}W
          </MonospaceLabel>
        )}
      </div>
    </Link>
  )
}