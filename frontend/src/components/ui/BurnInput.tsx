import { useState, type CSSProperties } from 'react'
import { MonospaceLabel } from './MonospaceLabel'

interface BurnInputProps {
  onSubmit: (text: string, contextUrl: string) => void
  disabled?: boolean
  maxLen?: number
}

export function BurnInput({ onSubmit, disabled, maxLen = 500 }: BurnInputProps) {
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const remaining = maxLen - text.length

  const textareaStyle: CSSProperties = {
    width: '100%',
    minHeight: 180,
    background: 'var(--bg)',
    color: 'var(--ink)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--r-md)',
    padding: '14px 16px',
    fontFamily: 'var(--font-body)',
    fontSize: '16px',
    lineHeight: 1.5,
    resize: 'vertical',
    outline: 'none',
  }

  const inputStyle: CSSProperties = {
    width: '100%',
    background: 'var(--bg)',
    color: 'var(--ink)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--r-sm)',
    padding: '10px 12px',
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
    outline: 'none',
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!text.trim() || disabled) return
        onSubmit(text.trim(), url.trim())
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <div>
        <MonospaceLabel size="xs">YOUR BURN</MonospaceLabel>
        <div style={{ marginTop: 6 }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, maxLen))}
            placeholder="Say it."
            disabled={disabled}
            style={textareaStyle}
            maxLength={maxLen}
          />
        </div>
        <div
          style={{
            marginTop: 6,
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ color: 'var(--muted)' }}>MAX {maxLen} CHARS</span>
          <span style={{ color: remaining < 50 ? 'var(--ember)' : 'var(--muted)' }}>
            {remaining} LEFT
          </span>
        </div>
      </div>

      <div>
        <MonospaceLabel size="xs">CONTEXT URL (OPTIONAL)</MonospaceLabel>
        <div style={{ marginTop: 6 }}>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            disabled={disabled}
            style={inputStyle}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={disabled || !text.trim()}
        style={{
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          fontSize: '12px',
          fontWeight: 600,
          padding: '14px 18px',
          background: text.trim() && !disabled ? 'var(--ember)' : 'transparent',
          color: text.trim() && !disabled ? 'var(--bg)' : 'var(--muted)',
          border: '1px solid',
          borderColor: text.trim() && !disabled ? 'var(--ember)' : 'var(--line)',
          borderRadius: 'var(--r-sm)',
          cursor: text.trim() && !disabled ? 'pointer' : 'not-allowed',
          transition: 'all var(--dur-fast) var(--ease)',
        }}
      >
        SUBMIT BURN
      </button>
    </form>
  )
}