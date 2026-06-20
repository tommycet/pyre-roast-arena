import { type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react'

type Variant = 'primary' | 'ghost' | 'burn'
type Size = 'sm' | 'md'

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: Variant
  size?: Size
  children?: ReactNode
}

const baseStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  border: '1px solid var(--line)',
  background: 'transparent',
  color: 'var(--ink)',
  padding: '10px 18px',
  transition: 'border-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease)',
  fontSize: '12px',
  fontWeight: 500,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  borderRadius: 'var(--r-sm)',
}

const variantStyles: Record<Variant, CSSProperties> = {
  primary: {
    borderColor: 'var(--ink)',
    color: 'var(--ink)',
  },
  ghost: {
    borderColor: 'var(--line)',
    color: 'var(--muted)',
  },
  burn: {
    borderColor: 'var(--ember)',
    color: 'var(--ember)',
  },
}

const sizeStyles: Record<Size, CSSProperties> = {
  sm: { padding: '6px 12px', fontSize: '11px' },
  md: { padding: '10px 18px', fontSize: '12px' },
}

export function Button({ variant = 'primary', size = 'md', style, disabled, ...rest }: ButtonProps) {
  const merged: CSSProperties = {
    ...baseStyle,
    ...variantStyles[variant],
    ...sizeStyles[size],
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
    ...style,
  }
  return <button {...rest} disabled={disabled} style={merged} />
}