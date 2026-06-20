/**
 * Type shapes mirroring the contract's _battle_to_dict / _combatant_to_dict
 * / _dispute_to_dict / _verdict_to_dict outputs. Numbers come off the wire
 * after coercion (see lib/format.ts).
 */

export type BattleState =
  | 'open'
  | 'both_joined'
  | 'both_burned'
  | 'judging'
  | 'resolved'
  | 'disputed'

export interface BurnScores {
  wit: number
  originality: number
  burn: number
  rhyme: number
  topicality: number
  total: number
}

export interface Burn {
  combatant: string
  text: string
  context_url: string
  scores: BurnScores
  submitted_at: number
}

export interface Verdict {
  battle_id: number
  winner: string
  loser: string
  margin: number
  reasoning: string
  judged_at: number
  judge_count: number
}

export interface VerdictPartial {
  battle_id: number
  winner: string
  loser: string
  margin: number
  reasoning?: string
  judged_at: number
  judge_count: number
}

export interface Battle {
  id: number
  topic: string
  creator: string
  opponent: string
  state: BattleState
  stake: number
  created_at: number
  burns: Burn[]
  verdict: Verdict
}

export interface Combatant {
  addr: string
  wins: number
  losses: number
  draws: number
  reputation: number
  total_burns: number
  best_score: number
  best_score_battle: number
}

export interface Dispute {
  id: number
  battle_id: number
  raised_by: string
  reason: string
  raised_at: number
  status: 'open' | 'upheld' | 'overturned'
  prior_winner: string
  resolved_at: number
}

export interface Stats {
  total_battles: number
  resolved_battles: number
  disputed_battles: number
  open_battles: number
  total_combatants: number
  total_disputes: number
}

export interface WriteResult {
  hash: string
}