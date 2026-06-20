import { MonospaceLabel } from './MonospaceLabel'

interface ErrorStateProps {
  label?: string
  message: string
  hint?: string
}

export function ErrorState({ label = 'ERROR', message, hint }: ErrorStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '20px 22px',
        border: '1px solid var(--ember)',
        background: 'var(--ember-soft)',
        borderRadius: 'var(--r-md)',
      }}
    >
      <MonospaceLabel size="xs" style={{ color: 'var(--ember)' }}>
        {label}
      </MonospaceLabel>
      <div style={{ color: 'var(--ink)' }}>{message}</div>
      {hint && <div style={{ color: 'var(--muted)', fontSize: 13 }}>{hint}</div>}
    </div>
  )
}