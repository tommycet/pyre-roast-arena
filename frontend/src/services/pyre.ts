/**
 * Service layer for the PYRE contract.
 *
 * Routes to either the live genlayer-js client or the in-memory mock layer
 * based on `IS_DEPLOYED`. The interface is identical on both sides, so
 * pages never touch the difference.
 *
 * Live writes follow the consensus-aware polling pattern from the
 * genlayer-dapp-development skill: waitForTransactionReceipt between every
 * write and the next read. Polling uses no-change-fast / error-only-backoff.
 */
import {
  CONSENSUS_TIMEOUT_MS,
  CONTRACT_ADDRESS,
  IS_DEPLOYED,
  RECEIPT_TIMEOUT_MS,
} from '../lib/genlayer'
import {
  coerceAddr,
  coerceBool,
  coerceInt,
} from '../lib/format'
import type {
  Battle,
  Combatant,
  Dispute,
  Stats,
  WriteResult,
} from './types'
import { mockBackend } from './mockData'

// ---------- Real client (lazy-imported so the mock path never pulls genlayer-js) ----------

let _liveClient: any | null = null

async function getClient() {
  if (_liveClient) return _liveClient
  const { createClient } = await import('genlayer-js')
  const { CHAIN_DEF } = await import('../lib/genlayer')
  _liveClient = createClient({ chain: CHAIN_DEF })
  return _liveClient
}

// ---------- Response normalization ----------

function normalizeBattle(raw: any): Battle {
  return {
    id: coerceInt(raw.id),
    topic: raw.topic ?? '',
    creator: coerceAddr(raw.creator),
    opponent: coerceAddr(raw.opponent),
    state: raw.state ?? 'open',
    stake: coerceInt(raw.stake),
    created_at: coerceInt(raw.created_at),
    burns: Array.isArray(raw.burns) ? raw.burns.map((b: any) => normalizeBurn(b)) : [],
    verdict: normalizeVerdict(raw.verdict),
  }
}

function normalizeBurn(raw: any) {
  const scores = raw.scores ?? {}
  return {
    combatant: coerceAddr(raw.combatant),
    text: raw.text ?? '',
    context_url: raw.context_url ?? '',
    scores: {
      wit: coerceInt(scores.wit),
      originality: coerceInt(scores.originality),
      burn: coerceInt(scores.burn),
      rhyme: coerceInt(scores.rhyme),
      topicality: coerceInt(scores.topicality),
      total: coerceInt(scores.total),
    },
    submitted_at: coerceInt(raw.submitted_at),
  }
}

function normalizeVerdict(raw: any) {
  return {
    battle_id: coerceInt(raw.battle_id),
    winner: coerceAddr(raw.winner),
    loser: coerceAddr(raw.loser),
    margin: coerceInt(raw.margin),
    reasoning: raw.reasoning ?? '',
    judged_at: coerceInt(raw.judged_at),
    judge_count: coerceInt(raw.judge_count),
  }
}

function normalizeCombatant(raw: any): Combatant {
  return {
    addr: coerceAddr(raw.addr),
    wins: coerceInt(raw.wins),
    losses: coerceInt(raw.losses),
    draws: coerceInt(raw.draws),
    reputation: coerceInt(raw.reputation),
    total_burns: coerceInt(raw.total_burns),
    best_score: coerceInt(raw.best_score),
    best_score_battle: coerceInt(raw.best_score_battle),
  }
}

function normalizeDispute(raw: any): Dispute {
  return {
    id: coerceInt(raw.id),
    battle_id: coerceInt(raw.battle_id),
    raised_by: coerceAddr(raw.raised_by),
    reason: raw.reason ?? '',
    raised_at: coerceInt(raw.raised_at),
    status: (raw.status as Dispute['status']) ?? 'open',
    prior_winner: coerceAddr(raw.prior_winner),
    resolved_at: coerceInt(raw.resolved_at),
  }
}

function normalizeStats(raw: any): Stats {
  return {
    total_battles: coerceInt(raw.total_battles),
    resolved_battles: coerceInt(raw.resolved_battles),
    disputed_battles: coerceInt(raw.disputed_battles),
    open_battles: coerceInt(raw.open_battles),
    total_combatants: coerceInt(raw.total_combatants),
    total_disputes: coerceInt(raw.total_disputes),
  }
}

// ---------- Live read helpers ----------

async function liveRead<T>(functionName: string, args: any[] = []): Promise<T> {
  const client = await getClient()
  const raw = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
  })
  // Contract returns JSON-encoded strings; parse before normalization.
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as T
    } catch {
      return raw as T
    }
  }
  return raw as T
}

async function liveWrite(
  account: any,
  functionName: string,
  args: any[],
  value?: bigint,
): Promise<WriteResult> {
  const client = await getClient()
  const hash = await client.writeContract({
    account,
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    ...(value !== undefined ? { value } : {}),
  })
  // Wait for receipt before returning — this is what makes the next read see
  // post-write state instead of stale pre-write state.
  try {
    await client.waitForTransactionReceipt({
      hash,
      interval: 2000,
      retries: Math.ceil(RECEIPT_TIMEOUT_MS / 2000),
    })
  } catch {
    // Receipt timeout is non-fatal for the caller; the page-level polling
    // will continue and either succeed or surface the error to the user.
  }
  return { hash }
}

// ---------- Public reads ----------

export async function getStats(): Promise<Stats> {
  if (!IS_DEPLOYED) return mockBackend.getStats()
  const raw = await liveRead<any>('get_stats')
  return normalizeStats(raw)
}

export async function getRecentBattles(
  limit: number,
  offset: number,
): Promise<{ battles: Battle[]; total: number }> {
  if (!IS_DEPLOYED) return mockBackend.getRecentBattles(limit, offset)
  const raw = await liveRead<any>('get_recent_battles', [BigInt(limit), BigInt(offset)])
  return {
    battles: Array.isArray(raw.battles) ? raw.battles.map(normalizeBattle) : [],
    total: coerceInt(raw.total),
  }
}

export async function getBattle(id: number): Promise<Battle | null> {
  if (!IS_DEPLOYED) return mockBackend.getBattle(id)
  const raw = await liveRead<any>('get_battle', [BigInt(id)])
  if (raw?.error) return null
  return normalizeBattle(raw)
}

export async function getCombatant(addr: string): Promise<Combatant | null> {
  if (!IS_DEPLOYED) return mockBackend.getCombatant(addr)
  const raw = await liveRead<any>('get_combatant', [addr])
  if (raw?.error) return null
  return normalizeCombatant(raw)
}

export async function getDispute(id: number): Promise<Dispute | null> {
  if (!IS_DEPLOYED) return mockBackend.getDispute(id)
  const raw = await liveRead<any>('get_dispute', [BigInt(id)])
  if (raw?.error) return null
  return normalizeDispute(raw)
}

// ---------- Public writes ----------

export async function createBattle(
  account: any,
  topic: string,
  stakeWei: bigint,
): Promise<WriteResult> {
  if (!IS_DEPLOYED) return mockBackend.createBattle(account, topic, stakeWei)
  return liveWrite(account, 'create_battle', [topic, stakeWei])
}

export async function joinBattle(account: any, battleId: number): Promise<WriteResult> {
  if (!IS_DEPLOYED) return mockBackend.joinBattle(account, battleId)
  return liveWrite(account, 'join_battle', [BigInt(battleId)])
}

export async function submitBurn(
  account: any,
  battleId: number,
  text: string,
  contextUrl: string,
): Promise<WriteResult> {
  if (!IS_DEPLOYED) return mockBackend.submitBurn(account, battleId, text, contextUrl)
  return liveWrite(account, 'submit_burn', [BigInt(battleId), text, contextUrl])
}

export async function judgeBattle(account: any, battleId: number): Promise<WriteResult> {
  if (!IS_DEPLOYED) return mockBackend.judgeBattle(account, battleId)
  return liveWrite(account, 'judge_battle', [BigInt(battleId)])
}

export async function raiseDispute(
  account: any,
  battleId: number,
  reason: string,
): Promise<WriteResult> {
  if (!IS_DEPLOYED) return mockBackend.raiseDispute(account, battleId, reason)
  return liveWrite(account, 'raise_dispute', [BigInt(battleId), reason])
}

export async function resolveDispute(account: any, disputeId: number): Promise<WriteResult> {
  if (!IS_DEPLOYED) return mockBackend.resolveDispute(account, disputeId)
  return liveWrite(account, 'resolve_dispute', [BigInt(disputeId)])
}

// ---------- Polling helpers (used by submit/battle pages) ----------

export async function pollUntilBattleResolved(
  battleId: number,
  signal?: AbortSignal,
): Promise<Battle | null> {
  const deadline = Date.now() + CONSENSUS_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (signal?.aborted) return null
    try {
      const b = await getBattle(battleId)
      if (b && (b.state === 'resolved' || b.state === 'disputed')) return b
    } catch {
      // Transient read error — keep polling
    }
    await new Promise((r) => setTimeout(r, 5000))
  }
  return null
}

export async function pollUntilBattleBurned(
  battleId: number,
  signal?: AbortSignal,
): Promise<Battle | null> {
  const deadline = Date.now() + 30 * 1000
  while (Date.now() < deadline) {
    if (signal?.aborted) return null
    try {
      const b = await getBattle(battleId)
      if (b && (b.state === 'both_burned' || b.state === 'judging' || b.state === 'resolved' || b.state === 'disputed')) return b
    } catch {
      // keep polling
    }
    await new Promise((r) => setTimeout(r, 4000))
  }
  return null
}