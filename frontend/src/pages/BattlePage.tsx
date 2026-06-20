import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getBattle, joinBattle, submitBurn, judgeBattle, getCombatant } from '../services/pyre'
import { Card } from '../components/ui/Card'
import { MonospaceLabel } from '../components/ui/MonospaceLabel'
import { Button } from '../components/ui/Button'
import { StatusPill } from '../components/ui/StatusPill'
import { ScoreCard } from '../components/ui/ScoreCard'
import { LoadingState } from '../components/ui/LoadingState'
import { ErrorState } from '../components/ui/ErrorState'
import { EmptyState } from '../components/ui/EmptyState'
import { BurnInput } from '../components/ui/BurnInput'
import { DisputePanel } from '../components/DisputePanel'
import { Arena3D } from '../components/Arena3D'
import { useWallet } from '../lib/wallet'
import { shortAddr, formatRelative, formatStake } from '../lib/format'

const ENTRY_FEE_WEI = 10n ** 16n

export function BattlePage() {
  const { id } = useParams<{ id: string }>()
  const battleId = Number(id)
  const wallet = useWallet()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: battle, isLoading, refetch } = useQuery({
    queryKey: ['battle', battleId],
    queryFn: () => getBattle(battleId),
    refetchInterval: 5000,
  })

  const { data: combatantA } = useQuery({
    queryKey: ['combatant', battle?.creator],
    queryFn: () => battle ? getCombatant(battle.creator) : null,
    enabled: !!battle,
  })
  const { data: combatantB } = useQuery({
    queryKey: ['combatant', battle?.opponent],
    queryFn: () => battle?.opponent ? getCombatant(battle.opponent) : null,
    enabled: !!battle?.opponent,
  })

  if (isLoading) {
    return <LoadingState label="LOADING BATTLE" message="Fetching from chain..." />
  }
  if (!battle) {
    return (
      <EmptyState
        label="BATTLE NOT FOUND"
        message={`No battle with id ${battleId} on this chain.`}
        action={<Button variant="ghost" onClick={() => navigate('/arena')}>BACK TO ARENA</Button>}
      />
    )
  }

  const isCreator = wallet.address === battle.creator
  const isOpponent = wallet.address === battle.opponent
  const isCombatant = isCreator || isOpponent
  const myBurn = battle.burns.find((b) => b.combatant === wallet.address)
  const opponentBurn = battle.burns.find((b) => b.combatant !== wallet.address)

  async function onJoin() {
    if (wallet.kind === 'disconnected') {
      setError('Connect a wallet to join.')
      return
    }
    setBusy('join')
    setError(null)
    try {
      await joinBattle(wallet.viemAccount as any, battleId)
      await queryClient.invalidateQueries({ queryKey: ['battle', battleId] })
    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message ?? 'Join failed')
    } finally {
      setBusy(null)
    }
  }

  async function onSubmitBurn(text: string, contextUrl: string) {
    if (wallet.kind === 'disconnected') {
      setError('Connect a wallet first.')
      return
    }
    setBusy('submit')
    setError(null)
    try {
      await submitBurn(wallet.viemAccount as any, battleId, text, contextUrl)
      await queryClient.invalidateQueries({ queryKey: ['battle', battleId] })
    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message ?? 'Submit failed')
    } finally {
      setBusy(null)
    }
  }

  async function onJudge() {
    if (wallet.kind === 'disconnected') {
      setError('Connect a wallet first.')
      return
    }
    setBusy('judge')
    setError(null)
    try {
      await judgeBattle(wallet.viemAccount as any, battleId)
      await queryClient.invalidateQueries({ queryKey: ['battle', battleId] })
    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message ?? 'Judge failed')
    } finally {
      setBusy(null)
    }
  }

  const statePillMap: Record<string, 'open' | 'judging' | 'resolved' | 'disputed'> = {
    open: 'open',
    both_joined: 'open',
    both_burned: 'judging',
    judging: 'judging',
    resolved: 'resolved',
    disputed: 'disputed',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, paddingTop: 24 }}>
      <header>
        <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
          <StatusPill state={statePillMap[battle.state] ?? 'open'} />
          <MonospaceLabel size="xs">BATTLE #{battle.id}</MonospaceLabel>
          <MonospaceLabel size="xs">{formatRelative(battle.created_at)}</MonospaceLabel>
        </div>
        <h1 style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', margin: '8px 0 4px', fontFamily: 'var(--font-display)' }}>
          {battle.topic}
        </h1>
        <div style={{ display: 'flex', gap: 16, color: 'var(--muted)' }}>
          <span>CREATOR <span style={{ fontFamily: 'var(--font-mono)' }}>{shortAddr(battle.creator)}</span></span>
          {battle.opponent && <span>· OPPONENT <span style={{ fontFamily: 'var(--font-mono)' }}>{shortAddr(battle.opponent)}</span></span>}
          <span>· STAKE <span style={{ fontFamily: 'var(--font-mono)' }}>{formatStake(battle.stake)}</span></span>
        </div>
      </header>

      <Arena3D
        state={{
          phase: battle.state === 'both_burned' || battle.state === 'judging'
            ? 'judging'
            : battle.state === 'resolved' || battle.state === 'disputed'
              ? 'resolved'
              : 'open',
          winner: battle.verdict?.winner,
          combatantA: battle.creator,
          combatantB: battle.opponent,
        }}
        height={360}
      />

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <BurnPane
          label="SLOT A"
          address={battle.creator}
          combatant={combatantA}
          burn={battle.burns[0]}
          verdict={battle.verdict}
          side="A"
        />
        <BurnPane
          label="SLOT B"
          address={battle.opponent || 'awaiting challenger'}
          combatant={combatantB}
          burn={battle.burns[1]}
          verdict={battle.verdict}
          side="B"
        />
      </section>

      {error && <ErrorState message={error} hint="Check wallet and network." />}

      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {battle.state === 'open' && !isCreator && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Button variant="primary" onClick={onJoin} disabled={busy !== null}>
              {busy === 'join' ? 'JOINING...' : 'JOIN BATTLE'}
            </Button>
            <MonospaceLabel size="xs">ENTRY {formatStake(ENTRY_FEE_WEI)}</MonospaceLabel>
          </div>
        )}

        {battle.state === 'both_joined' && !myBurn && isCombatant && (
          <Card>
            <MonospaceLabel size="xs">YOUR BURN</MonospaceLabel>
            <div style={{ marginTop: 12 }}>
              <BurnInput onSubmit={onSubmitBurn} disabled={busy !== null} />
            </div>
          </Card>
        )}
        {battle.state === 'both_joined' && isCombatant && myBurn && (
          <div style={{ color: 'var(--emerald)' }}>Burn submitted. Waiting on opponent.</div>
        )}
        {battle.state === 'both_joined' && !isCombatant && (
          <div style={{ color: 'var(--muted)' }}>Waiting for both combatants to submit.</div>
        )}

        {battle.state === 'both_burned' && isCombatant && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Button variant="burn" onClick={onJudge} disabled={busy !== null}>
              {busy === 'judge' ? 'BROADCASTING...' : 'TRIGGER CONSENSUS'}
            </Button>
            <MonospaceLabel size="xs">Triggers AI validator judging. ~60s on studionet.</MonospaceLabel>
          </div>
        )}
      </section>

      {battle.verdict && battle.verdict.judged_at > 0 && (
        <section>
          <Card variant="verdict">
            <MonospaceLabel size="xs" style={{ color: 'var(--emerald)' }}>VERDICT</MonospaceLabel>
            <h2 style={{ margin: '8px 0 0', fontSize: '1.6rem' }}>
              {battle.verdict.winner === '0xDRAW'
                ? 'DRAW'
                : `${shortAddr(battle.verdict.winner)} WINS`}
            </h2>
            <p style={{ marginTop: 8, color: 'var(--ink)' }}>{battle.verdict.reasoning}</p>
            <div style={{ display: 'flex', gap: 16, color: 'var(--muted)', marginTop: 12 }}>
              <span>MARGIN {battle.verdict.margin}</span>
              <span>· JUDGES {battle.verdict.judge_count}</span>
              <span>· {formatRelative(battle.verdict.judged_at)}</span>
            </div>
          </Card>
          {battle.state === 'resolved' && (
            <div style={{ marginTop: 16 }}>
              <DisputePanel battle={battle} />
            </div>
          )}
        </section>
      )}

      <div>
        <Link to="/arena" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
          ← BACK TO ARENA
        </Link>
      </div>
    </div>
  )
}

function BurnPane({
  label,
  address,
  combatant,
  burn,
  verdict,
  side,
}: {
  label: string
  address: string
  combatant?: { wins: number; losses: number; draws: number; reputation: number } | null
  burn?: { text: string; context_url: string; scores: any }
  verdict?: { winner: string; loser: string; margin: number; reasoning: string; judged_at: number }
  side: 'A' | 'B'
}) {
  const isWinner = verdict && verdict.winner === address
  const isLoser = verdict && verdict.loser === address
  return (
    <Card variant={isWinner ? 'verdict' : 'combatant'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <MonospaceLabel size="xs">{label}</MonospaceLabel>
        {verdict && verdict.judged_at > 0 && (
          isWinner ? <StatusPill state="resolved" />
          : isLoser ? <StatusPill state="disputed" />
          : null
        )}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', marginTop: 8, color: 'var(--ink)' }}>{shortAddr(address)}</div>
      {combatant && (
        <div style={{ color: 'var(--muted)', marginTop: 4, fontSize: 13 }}>
          {combatant.wins}W · {combatant.losses}L · {combatant.draws}D · REP {combatant.reputation}
        </div>
      )}
      <div style={{ marginTop: 16 }}>
        {burn ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: 0, fontSize: '1.05rem', lineHeight: 1.4 }}>{burn.text}</p>
            {burn.context_url && (
              <div style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 11, wordBreak: 'break-all' }}>
                CTX: {burn.context_url}
              </div>
            )}
            {burn.scores && burn.scores.total > 0 && <ScoreCard scores={burn.scores} label="JUDGE SCORECARD" />}
          </div>
        ) : (
          <div style={{ color: 'var(--muted)' }}>awaiting burn...</div>
        )}
      </div>
    </Card>
  )
}