import type { CSSProperties, ReactNode } from 'react'

type State = 'pending' | 'verified' | 'disputed' | 'burned' | 'open' | 'judging' | 'resolved'

interface StatusPillProps {
  state: State
  children?: ReactNode
}

const stateColors: Record<State, { fg: string; bg: string }> = {
  pending:  { fg: 'var(--muted)',    bg: 'transparent' },
  verified: { fg: 'var(--emerald)',  bg: 'var(--emerald-soft)' },
  disputed: { fg: 'var(--amber)',    bg: 'var(--amber-soft)' },
  burned:   { fg: 'var(--ember)',    bg: 'var(--ember-soft)' },
  open:     { fg: 'var(--muted)',    bg: 'transparent' },
  judging:  { fg: 'var(--ember)',    bg: 'var(--ember-soft)' },
  resolved: { fg: 'var(--emerald)',  bg: 'var(--emerald-soft)' },
}

const stateLabels: Record<State, string> = {
  pending:  'PENDING',
  verified: 'VERIFIED',
  disputed: 'DISPUTED',
  burned:   'BURNED',
  open:     'OPEN DUEL',
  judging:  'CONSENSUS PENDING',
  resolved: 'VERIFIED WIN',
}

export function StatusPill({ state, children }: StatusPillProps) {
  const c = stateColors[state]
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: c.fg,
    background: c.bg,
    padding: '4px 8px',
    border: `1px solid ${c.fg}`,
    borderRadius: 'var(--r-sm)',
  }
  return <span style={style}>{children ?? stateLabels[state]}</span>
}