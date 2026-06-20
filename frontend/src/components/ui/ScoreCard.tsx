import type { BurnScores } from '../../services/types'
import { MonospaceLabel } from './MonospaceLabel'

interface ScoreCardProps {
  scores: BurnScores
  label?: string
}

const dims: Array<{ key: keyof Omit<BurnScores, 'total'>; label: string }> = [
  { key: 'wit', label: 'WIT' },
  { key: 'originality', label: 'ORIGINALITY' },
  { key: 'burn', label: 'BURN' },
  { key: 'rhyme', label: 'RHYME' },
  { key: 'topicality', label: 'TOPICALITY' },
]

export function ScoreCard({ scores, label }: ScoreCardProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {label && (
        <MonospaceLabel size="xs">{label}</MonospaceLabel>
      )}
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '2.4rem',
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: 'var(--ink)',
          lineHeight: 1,
        }}
      >
        {scores.total}
        <span style={{ fontSize: '0.85rem', color: 'var(--muted)', marginLeft: 6 }}>
          /100
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px' }}>
        {dims.map((d) => (
          <div key={d.key} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <MonospaceLabel size="xs">{d.label}</MonospaceLabel>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                color: 'var(--ink)',
                fontWeight: 500,
              }}
            >
              {scores[d.key]}/20
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}