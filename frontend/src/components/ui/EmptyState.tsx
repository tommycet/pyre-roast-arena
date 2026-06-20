import type { ReactNode } from 'react'
import { MonospaceLabel } from './MonospaceLabel'

interface EmptyStateProps {
  label: string
  message: string
  action?: ReactNode
}

export function EmptyState({ label, message, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        padding: '64px 24px',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-md)',
        background: 'var(--surface)',
        textAlign: 'center',
      }}
    >
      <MonospaceLabel size="xs">{label}</MonospaceLabel>
      <p style={{ margin: 0, maxWidth: 480, color: 'var(--muted)' }}>{message}</p>
      {action}
    </div>
  )
}