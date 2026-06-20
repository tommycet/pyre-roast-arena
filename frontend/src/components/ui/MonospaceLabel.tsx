import type { CSSProperties, ReactNode } from 'react'

interface MonospaceLabelProps {
  children: ReactNode
  style?: CSSProperties
  size?: 'xs' | 'sm'
  onClick?: () => void
}

export function MonospaceLabel({ children, style, size = 'sm', onClick }: MonospaceLabelProps) {
  return (
    <span
      onClick={onClick}
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: size === 'xs' ? '10px' : '11px',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--muted)',
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
    >
      {children}
    </span>
  )
}