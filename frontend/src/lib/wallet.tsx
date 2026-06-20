/**
 * Wallet context. Handles three connection modes:
 *  - Disconnected
 *  - MetaMask (external wallet via window.ethereum)
 *  - Demo signer (in-browser ephemeral keypair via genlayer-js createAccount)
 *
 * The local-key path uses genlayer-js createAccount because viem's
 * privateKeyToAccount produces EIP-155 signatures that studionet validators
 * reject. The demo private key below is for prototype use only.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { createAccount } from 'genlayer-js'
import { createWalletClient, custom } from 'viem'
import { CHAIN_DEF, CHAIN_ID } from './genlayer'

export type WalletKind = 'disconnected' | 'demo' | 'metamask'

export interface WalletState {
  kind: WalletKind
  address: string
  /** Address as string for viem custom-transport routing, OR the demo account
   *  object for local signing. See genlayer-js dual-shape pitfall in SKILL. */
  viemAccount: string | { address: string; type?: string }
  chainId: number
  error: string | null
}

const DISCONNECTED: WalletState = {
  kind: 'disconnected',
  address: '',
  viemAccount: '',
  chainId: 0,
  error: null,
}

interface WalletContextValue extends WalletState {
  connectDemo: () => void
  connectMetaMask: () => Promise<void>
  disconnect: () => void
  /** viem WalletClient for the external-wallet path; null when not connected. */
  walletClient: ReturnType<typeof createWalletClient> | null
}

const WalletContext = createContext<WalletContextValue | null>(null)

// Demo signer key. Deterministic but ephemeral — generated at module load so
// the key never appears in source control. Demo mode is for hackathon
// walkthroughs only; production flows always use an external wallet.
const DEMO_KEY = (import.meta.env.VITE_DEMO_KEY as string | undefined) ||
  (() => {
    const bytes = new Uint8Array(32)
    crypto.getRandomValues(bytes)
    return ('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`
  })()

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>(DISCONNECTED)
  const [walletClient, setWalletClient] =
    useState<ReturnType<typeof createWalletClient> | null>(null)

  const connectDemo = useCallback(() => {
    const acct = createAccount(DEMO_KEY as `0x${string}`)
    setState({
      kind: 'demo',
      address: acct.address,
      viemAccount: acct as unknown as { address: string },
      chainId: CHAIN_ID,
      error: null,
    })
    setWalletClient(null)
  }, [])

  const connectMetaMask = useCallback(async () => {
    if (typeof window === 'undefined' || !window.ethereum) {
      setState((s) => ({
        ...s,
        error:
          'No Ethereum wallet detected. Install MetaMask or use the demo signer.',
      }))
      return
    }
    try {
      const accounts = (await window.ethereum.request({
        method: 'eth_requestAccounts',
      })) as string[]
      const address = accounts[0]
      if (!address) throw new Error('No account returned from wallet')
      const wc = createWalletClient({
        chain: CHAIN_DEF,
        transport: custom(window.ethereum),
        account: address as `0x${string}`,
      })
      setWalletClient(wc)
      setState({
        kind: 'metamask',
        address,
        // store as STRING — the genlayer-js custom transport checks
        // `typeof config.account !== "object"` to decide routing. A string
        // sets isAddress=true and routes eth_sendTransaction to window.ethereum.
        viemAccount: address,
        chainId: CHAIN_ID,
        error: null,
      })
    } catch (err: any) {
      setState((s) => ({
        ...s,
        error: err?.shortMessage ?? err?.message ?? 'Wallet connection failed',
      }))
    }
  }, [])

  const disconnect = useCallback(() => {
    setState(DISCONNECTED)
    setWalletClient(null)
  }, [])

  // Track MetaMask account changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.ethereum) return
    const onAccountsChanged = (accounts: unknown) => {
      const arr = accounts as string[]
      if (!arr || arr.length === 0) {
        disconnect()
      } else if (state.kind === 'metamask') {
        setState((s) => ({ ...s, address: arr[0], viemAccount: arr[0] }))
      }
    }
    window.ethereum?.on?.('accountsChanged', onAccountsChanged)
    return () => {
      window.ethereum?.removeListener?.('accountsChanged', onAccountsChanged)
    }
  }, [state.kind, disconnect])

  const value = useMemo<WalletContextValue>(
    () => ({ ...state, walletClient, connectDemo, connectMetaMask, disconnect }),
    [state, walletClient, connectDemo, connectMetaMask, disconnect],
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used inside WalletProvider')
  return ctx
}