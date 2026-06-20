#!/usr/bin/env node
/**
 * PYRE Live E2E — resume variant for bradbury.
 *
 * Skips create_battle (the prior run already created battle #N on bradbury
 * before waitForTransactionReceipt timed out — the tx itself succeeded).
 * Picks up at step 2: BOB joins the fresh open battle.
 *
 * Reads RPC + CONTRACT_ADDRESS from env. Uses PYRE_KEY_1 / PYRE_KEY_2 for
 * the two combatants.
 */
import { createClient, createAccount, chains } from 'genlayer-js'

const RPC = process.env.PYRE_RPC || 'https://rpc-bradbury.genlayer.com'
const CONTRACT = process.env.PYRE_CONTRACT
if (!CONTRACT) {
  console.error('Set PYRE_CONTRACT env var to the deployed address')
  process.exit(1)
}

const CHAIN = RPC.includes('bradbury') ? chains.testnetBradbury : chains.studionet

const KEY_A = process.env.PYRE_KEY_1
const KEY_B = process.env.PYRE_KEY_2
if (!KEY_A || !KEY_B) {
  console.error('Set PYRE_KEY_1 and PYRE_KEY_2 to funded private keys')
  process.exit(1)
}

const client = createClient({ chain: CHAIN })
const alice = createAccount(KEY_A)
const bob = createAccount(KEY_B)

console.log('='.repeat(64))
console.log('PYRE LIVE E2E — RESUME (skip create_battle)')
console.log('RPC:', RPC)
console.log('CONTRACT:', CONTRACT)
console.log('ALICE:', alice.address)
console.log('BOB:', bob.address)
console.log('='.repeat(64))

function waitForReceipt(hash, label) {
  const isBradbury = RPC.includes('bradbury')
  const retries = isBradbury ? 400 : 120
  const interval = isBradbury ? 4000 : 2000
  return client.waitForTransactionReceipt({ hash, interval, retries })
    .then((r) => console.log(`  ✔ ${label} confirmed (${hash.slice(0, 12)}…) status=${r.status ?? '?'}`))
    .catch((e) => {
      console.error(`  ✗ ${label} receipt wait failed:`, e.message)
      throw e
    })
}

async function pollBattleState(battleId, until, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const raw = await client.readContract({
        address: CONTRACT,
        functionName: 'get_battle',
        args: [BigInt(battleId)],
      })
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (until.includes(parsed.state)) {
        console.log(`\n  ✔ battle ${battleId} state → ${parsed.state}`)
        return parsed
      }
      process.stdout.write(`\r  ⏳ ${label} — state=${parsed.state} (${Math.round((deadline - Date.now()) / 1000)}s left)   `)
    } catch (e) {
      process.stdout.write(`\r  ⏳ read error: ${e.message?.slice(0, 60)}   `)
    }
    await new Promise((r) => setTimeout(r, 5000))
  }
  process.stdout.write('\n')
  throw new Error(`Battle ${battleId} did not reach state in [${until.join(',')}] within ${timeoutMs / 1000}s`)
}

async function findOurFreshBattle() {
  console.log('\n[setup] Locating fresh open battle owned by ALICE...')
  const raw = await client.readContract({
    address: CONTRACT,
    functionName: 'get_recent_battles',
    args: [BigInt(20), BigInt(0)],
  })
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
  const candidates = (parsed.battles || []).filter(
    (b) =>
      b.creator?.toLowerCase() === alice.address.toLowerCase() &&
      (b.state === 'open' || b.state === 'both_joined'),
  )
  if (candidates.length === 0) throw new Error('No open/joined battle owned by ALICE found')
  const fresh = candidates.sort((a, b) => Number(b.id) - Number(a.id))[0]
  console.log(`  ✔ found fresh battle id=${fresh.id} state=${fresh.state}`)
  return Number(fresh.id)
}

async function main() {
  const t0 = Date.now()
  const bid = await findOurFreshBattle()

  // 2. BOB joins
  console.log('\n[2/8] BOB joins the battle...')
  const joinHash = await client.writeContract({
    account: bob,
    address: CONTRACT,
    functionName: 'join_battle',
    args: [BigInt(bid)],
  })
  console.log(`  tx: ${joinHash.slice(0, 12)}…`)
  await waitForReceipt(joinHash, 'join_battle')

  // 3. ALICE burns
  console.log('\n[3/8] ALICE submits her burn...')
  const aliceBurn = 'On bradbury the consensus is slow but the roast is lethal.'
  const burnAHash = await client.writeContract({
    account: alice,
    address: CONTRACT,
    functionName: 'submit_burn',
    args: [BigInt(bid), aliceBurn, ''],
  })
  console.log(`  tx: ${burnAHash.slice(0, 12)}…`)
  await waitForReceipt(burnAHash, 'submit_burn (alice)')

  // 4. BOB burns
  console.log('\n[4/8] BOB submits his burn...')
  const bobBurn = 'Five validators and your burn still loses the debate.'
  const burnBHash = await client.writeContract({
    account: bob,
    address: CONTRACT,
    functionName: 'submit_burn',
    args: [BigInt(bid), bobBurn, ''],
  })
  console.log(`  tx: ${burnBHash.slice(0, 12)}…`)
  await waitForReceipt(burnBHash, 'submit_burn (bob)')

  // 5. Trigger consensus
  console.log('\n[5/8] ALICE triggers consensus...')
  const judgeHash = await client.writeContract({
    account: alice,
    address: CONTRACT,
    functionName: 'judge_battle',
    args: [BigInt(bid)],
  })
  console.log(`  tx: ${judgeHash.slice(0, 12)}…`)
  await waitForReceipt(judgeHash, 'judge_battle')

  // 6. Poll for resolution
  const timeout = RPC.includes('bradbury') ? 600_000 : 90_000
  console.log(`\n[6/8] Polling for resolution (timeout ${timeout / 1000}s)...`)
  const resolved = await pollBattleState(bid, ['resolved', 'disputed'], timeout, 'awaiting verdict')

  // 7. Verify state
  console.log('\n[7/8] Verifying state...')
  console.log(`  winner: ${resolved.verdict.winner}`)
  console.log(`  loser:  ${resolved.verdict.loser}`)
  console.log(`  margin: ${resolved.verdict.margin}`)
  console.log(`  reasoning: ${resolved.verdict.reasoning?.slice(0, 120)}`)
  console.log('  burns:')
  for (const b of resolved.burns) {
    const s = b.scores
    console.log(`    ${b.combatant.slice(0, 10)}… — "${b.text.slice(0, 60)}…" total=${s.total} (wit=${s.wit} orig=${s.originality} burn=${s.burn} rhyme=${s.rhyme} top=${s.topicality})`)
  }

  console.log('\n  reputations:')
  for (const addr of [alice.address, bob.address]) {
    try {
      const c = await client.readContract({ address: CONTRACT, functionName: 'get_combatant', args: [addr] })
      const parsed = typeof c === 'string' ? JSON.parse(c) : c
      if (parsed?.error) continue
      console.log(`    ${addr.slice(0, 10)}… — W${parsed.wins} L${parsed.losses} D${parsed.draws} rep=${parsed.reputation} best=${parsed.best_score}`)
    } catch (e) {
      console.log(`    ${addr.slice(0, 10)}… — read failed: ${e.message?.slice(0, 60)}`)
    }
  }

  // 8. Stats
  console.log('\n[8/8] Global stats...')
  const stats = await client.readContract({ address: CONTRACT, functionName: 'get_stats', args: [] })
  const sParsed = typeof stats === 'string' ? JSON.parse(stats) : stats
  console.log(' ', sParsed)

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log('\n' + '='.repeat(64))
  console.log(`E2E COMPLETE in ${elapsed}s`)
  console.log(`Battle ${bid}: winner=${resolved.verdict.winner.slice(0, 12)}… margin=${resolved.verdict.margin}`)
  console.log('='.repeat(64))
}

main().catch((e) => {
  console.error('\nE2E FAILED:', e.message || e)
  process.exit(1)
})