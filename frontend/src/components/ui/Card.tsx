import { type CSSProperties, type ReactNode } from 'react'

type Variant = 'evidence' | 'combatant' | 'verdict'

interface CardProps {
  variant?: Variant
  children: ReactNode
  style?: CSSProperties
  as?: 'div' | 'article' | 'section'
}

const variantBorders: Record<Variant, string> = {
  evidence: 'var(--line)',
  combatant: 'var(--line)',
  verdict: 'var(--emerald)',
}

export function Card({ variant = 'evidence', children, style, as: Tag = 'div' }: CardProps) {
  return (
    <Tag
      style={{
        background: 'var(--surface)',
        border: `1px solid ${variantBorders[variant]}`,
        borderRadius: 'var(--r-md)',
        padding: '20px 22px',
        ...style,
      }}
    >
      {children}
    </Tag>
  )
}