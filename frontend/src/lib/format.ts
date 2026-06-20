/**
 * Formatting helpers — addresses, timestamps, durations, scores.
 * No em-dashes anywhere. No emoji. Sober punctuation only.
 */

export function shortAddr(addr: string, head = 6, tail = 4): string {
  if (!addr) return ''
  if (addr.length <= head + tail + 2) return addr
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`
}

export function shortTx(hash: string): string {
  if (!hash) return ''
  if (hash.length <= 14) return hash
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`
}

export function formatRelative(unixSeconds: number): string {
  if (!unixSeconds) return '—'
  const now = Math.floor(Date.now() / 1000)
  const diff = Math.max(0, now - unixSeconds)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rs = s % 60
  return rs ? `${m}m ${rs}s` : `${m}m`
}

export function formatStake(wei: number | bigint): string {
  const n = typeof wei === 'bigint' ? Number(wei) : wei
  // GEN has 18 decimals. Display as the human-readable amount.
  const gen = n / 1e18
  if (gen >= 1) return `${gen.toFixed(2)} GEN`
  if (gen >= 0.01) return `${gen.toFixed(3)} GEN`
  return `${gen} GEN`
}

export function formatScore(n: number): string {
  return `${Math.round(n)}`
}

export function topicPreview(topic: string, max = 80): string {
  if (!topic) return ''
  if (topic.length <= max) return topic
  return `${topic.slice(0, max - 1)}…`
}

export function burnPreview(text: string, max = 240): string {
  if (!text) return ''
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

export function networkLabel(chainId: number): string {
  switch (chainId) {
    case 61999:
      return 'STUDIONET 61999'
    case 4221:
      return 'BRADBURY 4221'
    default:
      return `CHAIN ${chainId}`
  }
}

/**
 * Defensive coercion for values coming off the wire. Python u256 / bool
 * fields can serialize as native types or as strings depending on the
 * consensus path. Treat all of these as truthy/0.
 */
export function coerceInt(v: unknown, fallback = 0): number {
  if (typeof v === 'number') return v
  if (typeof v === 'bigint') return Number(v)
  if (typeof v === 'string') {
    const n = parseInt(v, 10)
    return Number.isFinite(n) ? n : fallback
  }
  return fallback
}

export function coerceBool(v: unknown): boolean {
  return v === true || v === 1 || v === '1' || v === 'true'
}

export function coerceAddr(v: unknown): string {
  return typeof v === 'string' ? v : ''
}