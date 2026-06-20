import { MonospaceLabel } from './MonospaceLabel'

export interface SubmitPhase {
  label: string
  done: boolean
  active: boolean
}

interface LoadingStateProps {
  label: string
  message?: string
  phases?: SubmitPhase[]
}

export function LoadingState({ label, message, phases }: LoadingStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        padding: '24px',
        border: '1px solid var(--line)',
        background: 'var(--surface)',
        borderRadius: 'var(--r-md)',
      }}
    >
      <MonospaceLabel size="xs">{label}</MonospaceLabel>
      {message && <div style={{ color: 'var(--muted)' }}>{message}</div>}
      {phases && (
        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {phases.map((p, i) => (
            <li
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: p.done
                  ? 'var(--emerald)'
                  : p.active
                    ? 'var(--ember)'
                    : 'var(--muted)',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  border: '1px solid currentColor',
                  borderRadius: '50%',
                  background: p.done ? 'currentColor' : 'transparent',
                  flexShrink: 0,
                }}
              />
              {p.label}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}