/**
 * Chain configuration for the PYRE frontend.
 *
 * Uses genlayer-js v1.x built-in chains (`chains.studionet`, `chains.testnetBradbury`).
 * These ship with the consensus-side fields the SDK needs (consensusMainContract,
 * defaultNumberOfInitialValidators, defaultConsensusMaxRotations) which a custom
 * `{ id, name, rpcUrls }` chain would lack.
 *
 * The active chain is selected via the VITE_NETWORK env var so the same build
 * can ship to studionet for demo and bradbury for live consensus.
 */
import { chains } from 'genlayer-js'

export type NetworkId = 'studionet' | 'bradbury'

const NETWORK = (import.meta.env.VITE_NETWORK ?? 'studionet') as NetworkId

// The genlayer-js chain objects are typed as `Chain` from viem. We re-export
// the chosen chain as `any` here so call-sites don't need a viem import.
export const CHAIN_DEF: any =
  NETWORK === 'bradbury' ? chains.testnetBradbury : chains.studionet

export const NETWORK_NAME: string = CHAIN_DEF.name ?? NETWORK
export const CHAIN_ID: number = CHAIN_DEF.id

/** Contract address on the active chain. Empty string while pre-deploy. */
export const CONTRACT_ADDRESS = (import.meta.env.VITE_CONTRACT_ADDRESS ??
  '0x0000000000000000000000000000000000000000') as `0x${string}`

/**
 * Whether the contract is live and the service layer should hit real chain.
 * Flipped to true once VITE_CONTRACT_ADDRESS points at a deployed contract.
 */
export const IS_DEPLOYED: boolean =
  (import.meta.env.VITE_IS_DEPLOYED ?? 'false').toLowerCase() === 'true' &&
  CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000'

/**
 * Consensus wait budget in milliseconds. Studionet resolves in ~45s;
 * bradbury real-LLM consensus takes 4-6 minutes.
 */
export const CONSENSUS_TIMEOUT_MS =
  NETWORK === 'bradbury' ? 7 * 60 * 1000 : 90 * 1000

/**
 * Default wait-for-receipt timeout. Same reasoning — long enough for
 * the slowest realistic consensus path.
 */
export const RECEIPT_TIMEOUT_MS =
  NETWORK === 'bradbury' ? 6 * 60 * 1000 : 60 * 1000