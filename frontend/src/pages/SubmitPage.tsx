import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { getBattle, submitBurn, pollUntilBattleBurned } from '../services/pyre'
import { useWallet } from '../lib/wallet'
import { Card } from '../components/ui/Card'
import { MonospaceLabel } from '../components/ui/MonospaceLabel'
import { BurnInput } from '../components/ui/BurnInput'
import { LoadingState, type SubmitPhase } from '../components/ui/LoadingState'
import { ErrorState } from '../components/ui/ErrorState'
import { Button } from '../components/ui/Button'
import { shortAddr } from '../lib/format'

export function SubmitPage() {
  const { id } = useParams<{ id: string }>()
  const battleId = Number(id)
  const navigate = useNavigate()
  const wallet = useWallet()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phaseIdx, setPhaseIdx] = useState(-1)

  const { data: battle } = useQuery({
    queryKey: ['battle', battleId],
    queryFn: () => getBattle(battleId),
    refetchInterval: 4000,
  })

  const PHASES: SubmitPhase[] = [
    { label: 'Sending to wallet', done: phaseIdx > 0, active: phaseIdx === 0 },
    { label: 'Waiting for signature', done: phaseIdx > 1, active: phaseIdx === 1 },
    { label: 'Broadcasting to chain', done: phaseIdx > 2, active: phaseIdx === 2 },
    { label: 'Tx confirmed, awaiting consensus', done: phaseIdx > 3, active: phaseIdx === 3 },
    { label: 'Burn landed', done: phaseIdx > 4, active: phaseIdx === 4 },
  ]

  async function submit(text: string, contextUrl: string) {
    if (wallet.kind === 'disconnected') {
      setError('Connect a wallet first.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      setPhaseIdx(0)
      await new Promise((r) => setTimeout(r, 200))
      setPhaseIdx(1)
      await submitBurn(wallet.viemAccount as any, battleId, text, contextUrl)
      setPhaseIdx(2)
      await new Promise((r) => setTimeout(r, 400))
      setPhaseIdx(3)
      const updated = await pollUntilBattleBurned(battleId)
      if (!updated) {
        throw new Error('Burn did not appear on chain within 30s. Check the battle page.')
      }
      setPhaseIdx(4)
      setTimeout(() => navigate(`/battle/${battleId}`), 800)
    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message ?? 'Submit failed')
      setPhaseIdx(-1)
    } finally {
      setBusy(false)
    }
  }

  if (!battle) return <LoadingState label="LOADING" />

  if (battle.state === 'both_burned' || battle.state === 'judging' || battle.state === 'resolved') {
    return (
      <Card>
        <MonospaceLabel size="xs">ALREADY DONE</MonospaceLabel>
        <p style={{ color: 'var(--ink)', marginTop: 8 }}>Both combatants have already submitted. The battle is past the burn phase.</p>
        <Button variant="primary" onClick={() => navigate(`/battle/${battleId}`)}>GO TO BATTLE</Button>
      </Card>
    )
  }

  const isCombatant = battle.creator === wallet.address || battle.opponent === wallet.address
  const myBurn = battle.burns.find((b) => b.combatant === wallet.address)
  if (myBurn) {
    return (
      <Card>
        <MonospaceLabel size="xs">ALREADY SUBMITTED</MonospaceLabel>
        <p style={{ color: 'var(--ink)', marginTop: 8 }}>You have already submitted a burn for this battle. Waiting on opponent.</p>
        <Button variant="primary" onClick={() => navigate(`/battle/${battleId}`)}>GO TO BATTLE</Button>
      </Card>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 24, maxWidth: 720 }}>
      <header>
        <MonospaceLabel size="xs">BURN PHASE</MonospaceLabel>
        <h1 style={{ fontSize: '2rem', margin: '4px 0' }}>{battle.topic}</h1>
        <div style={{ color: 'var(--muted)' }}>
          vs <span style={{ fontFamily: 'var(--font-mono)' }}>{shortAddr(battle.opponent || battle.creator)}</span>
        </div>
      </header>

      {!isCombatant && (
        <ErrorState
          label="NOT A COMBATANT"
          message="Only the two registered combatants may submit burns."
          hint="Connect with the wallet that created or joined this battle."
        />
      )}

      {isCombatant && (
        <Card>
          <BurnInput onSubmit={submit} disabled={busy} />
        </Card>
      )}

      {busy && <LoadingState label="SUBMITTING" message="Honest consensus progress. Each phase waits for what it can verify." phases={PHASES} />}
      {error && <ErrorState message={error} hint="Check wallet and try again." />}

      <Link to={`/battle/${battleId}`} style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
        ← BACK TO BATTLE
      </Link>
    </div>
  )
}