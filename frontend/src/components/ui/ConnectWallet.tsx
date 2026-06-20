import { useWallet } from '../../lib/wallet'
import { Button } from './Button'
import { MonospaceLabel } from './MonospaceLabel'
import { shortAddr } from '../../lib/format'
import { CHAIN_ID, IS_DEPLOYED } from '../../lib/genlayer'

export function ConnectWallet() {
  const wallet = useWallet()

  if (wallet.kind === 'disconnected') {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button variant="ghost" size="sm" onClick={wallet.connectDemo}>
          DEMO SIGNER
        </Button>
        <Button variant="primary" size="sm" onClick={wallet.connectMetaMask}>
          CONNECT WALLET
        </Button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {!IS_DEPLOYED && (
        <MonospaceLabel
          size="xs"
          style={{
            color: 'var(--amber)',
            border: '1px solid var(--amber)',
            padding: '4px 8px',
            borderRadius: 'var(--r-sm)',
          }}
        >
          MOCK MODE
        </MonospaceLabel>
      )}
      <MonospaceLabel size="xs">CHAIN {CHAIN_ID}</MonospaceLabel>
      <Button variant="ghost" size="sm" onClick={wallet.disconnect}>
        {shortAddr(wallet.address)} · DISCONNECT
      </Button>
    </div>
  )
}