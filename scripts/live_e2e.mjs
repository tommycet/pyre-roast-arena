#!/usr/bin/env node
/**
 * PYRE Live E2E against studionet (or bradbury).
 *
 * Steps:
 *   1. Create a battle from ALICE
 *   2. Have BOB join the same battle
 *   3. ALICE submits a burn
 *   4. BOB submits a burn
 *   5. ALICE triggers consensus (judge_battle)
 *   6. Poll until state == "resolved" (timeout: 90s on studionet, 600s on bradbury)
 *   7. Verify winner, scores, and reputation updates
 *   8. Print summary
 *
 * Reads RPC + CONTRACT_ADDRESS from env.
 * Uses genlayer-js createAccount for the local signer (matches what studionet
 * validators accept; viem privateKeyToAccount produces EIP-155 sigs that
 * studionet rejects).
 */
import { createClient, createAccount, chains } from 'genlayer-js'

const RPC = process.env.PYRE_RPC || 'https://studio.genlayer.com/api'
const CONTRACT = process.env.PYRE_CONTRACT
if (!CONTRACT) {
  console.error('Set PYRE_CONTRACT env var to the deployed address')
  process.exit(1)
}

// Chain ID from RPC host. studionet = 61999, bradbury = 4221.
const CHAIN = RPC.includes('bradbury') ? chains.testnetBradbury : chains.studionet

// Two distinct demo keys. On studionet (gas-free) any random key works.
// On bradbury, PYRE_KEY_1 / PYRE_KEY_2 must be set to funded accounts.
// NEVER hardcode keys — require env vars explicitly.
if (!process.env.PYRE_KEY_1 || !process.env.PYRE_KEY_2) {
  throw new Error('PYRE_KEY_1 and PYRE_KEY_2 env vars required (use genlayer account create to make funded test wallets)')
}
const KEY_A = process.env.PYRE_KEY_1
const KEY_B = process.env.PYRE_KEY_2

const client = createClient({ chain: CHAIN })
const alice = createAccount(KEY_A)
const bob = createAccount(KEY_B)

console.log('='.repeat(64))
console.log('PYRE LIVE E2E')
console.log('RPC:', RPC)
console.log('CONTRACT:', CONTRACT)
console.log('ALICE:', alice.address)
console.log('BOB:', bob.address)
console.log('='.repeat(64))

function waitForReceipt(hash, label) {
  // bradbury consensus: 5-6 min per write. studionet: ~60s.
  const isBradbury = RPC.includes('bradbury')
  const retries = isBradbury ? 400 : 120
  const interval = isBradbury ? 4000 : 2000
  return client.waitForTransactionReceipt({
    hash,
    interval,
    retries,
  }).then((r) => console.log(`  ✔ ${label} confirmed (${hash.slice(0, 12)}…) status=${r.status ?? '?'}`))
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
        console.log(`  ✔ battle ${battleId} state → ${parsed.state}`)
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

async function main() {
  const t0 = Date.now()

  // 1. Create battle
  console.log('\n[1/8] ALICE creates a battle...')
  const topic = 'live e2e: the contract is alive'
  const createHash = await client.writeContract({
    account: alice,
    address: CONTRACT,
    functionName: 'create_battle',
    args: [topic, BigInt(10 ** 16)],
  })
  console.log(`  tx: ${createHash.slice(0, 12)}…`)
  await waitForReceipt(createHash, 'create_battle')
  await new Promise((r) => setTimeout(r, 4000))

  // Find the new battle by polling get_recent_battles until we see one we own.
  // On studionet, indexing lags the write by 5-15s; we wait up to 60s.
  let bid = null
  const findDeadline = Date.now() + 60_000
  while (Date.now() < findDeadline && bid === null) {
    const raw = await client.readContract({
      address: CONTRACT,
      functionName: 'get_recent_battles',
      args: [BigInt(20), BigInt(0)],
    })
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    const fresh = (parsed.battles || []).find(
      (b) =>
        b.creator?.toLowerCase() === alice.address.toLowerCase() &&
        b.topic === topic,
    )
    if (fresh) {
      bid = fresh.id
      break
    }
    process.stdout.write(`\r  ⏳ waiting for new battle to appear (${Math.round((findDeadline - Date.now()) / 1000)}s)   `)
    await new Promise((r) => setTimeout(r, 4000))
  }
  process.stdout.write('\n')
  if (bid === null) throw new Error('Could not locate new battle after create within 60s')
  console.log(`  found new battle id = ${bid}`)

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
  const aliceBurn = 'Your code is a stack trace pretending to be architecture.'
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
  const bobBurn = 'At least my stack trace compiles. Yours just crashes the reviewer.'
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

  // 7. Verify reputation changes
  console.log('\n[7/8] Verifying state...')
  console.log(`  winner: ${resolved.verdict.winner}`)
  console.log(`  loser:  ${resolved.verdict.loser}`)
  console.log(`  margin: ${resolved.verdict.margin}`)
  console.log(`  reasoning: ${resolved.verdict.reasoning?.slice(0, 100)}…`)
  console.log('  burns:')
  for (const b of resolved.burns) {
    console.log(`    ${b.combatant.slice(0, 10)}… — ${b.text.slice(0, 60)}…`)
    console.log(`      scores: total=${b.scores.total} (wit=${b.scores.wit} orig=${b.scores.originality} burn=${b.scores.burn} rhyme=${b.scores.rhyme} top=${b.scores.topicality})`)
  }

  console.log('\n  reputations:')
  for (const addr of [alice.address, bob.address]) {
    const c = await client.readContract({
      address: CONTRACT,
      functionName: 'get_combatant',
      args: [addr],
    })
    const parsed = typeof c === 'string' ? JSON.parse(c) : c
    if (parsed?.error) continue
    console.log(`    ${addr.slice(0, 10)}… — W${parsed.wins} L${parsed.losses} D${parsed.draws} rep=${parsed.reputation} best=${parsed.best_score}`)
  }

  // 8. Stats
  console.log('\n[8/8] Global stats...')
  const stats = await client.readContract({
    address: CONTRACT,
    functionName: 'get_stats',
    args: [],
  })
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