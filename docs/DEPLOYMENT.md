# PYRE Deployment

## Prerequisites

| Tool         | Version          |
|--------------|------------------|
| Python       | 3.11 or newer    |
| Node         | 20 or newer      |
| genlayer CLI | v0.39 or newer   |

Verify before deploying:

```bash
python3 --version    # 3.11+
node --version       # v20+
genlayer --version   # 0.39+
```

## One-time setup

Create a deployer keystore:

```bash
mkdir -p ~/.genlayer/keystores
genlayer keystore new --name deployer --out ~/.genlayer/keystores/deployer.json
```

Fund the keystore from the appropriate faucet for the target network. See the funding section below.

## Deploying to studionet

Studionet is gas-free and consensus completes in about 60 seconds per write:

```bash
cd /root/pyre/contracts
genlayer deploy --network studionet \
  --keystore ~/.genlayer/keystores/deployer.json \
  pyre.py
```

A successful deploy returns a contract address. The current studionet contract is at `0x0fFeF0ac3441823598e12CcaE068C344F204A8Bf` on chainId 61999 with RPC `https://studio.genlayer.com/api`.

## Deploying to bradbury

Bradbury runs the real LLM jury. A single verdict takes 5 to 6 minutes because the validators actually call a model and reach equivalence on the JSON shape:

```bash
cd /root/pyre/contracts
genlayer deploy --network bradbury \
  --keystore ~/.genlayer/keystores/deployer.json \
  pyre.py
```

Important: any client that polls for a verdict must use a timeout of at least 10 minutes. Default HTTP timeouts will cut the poll short and the write will look failed even though the validators are still running. Set the timeout explicitly:

```bash
genlayer call --contract <addr> --function judge_battle --args 1 \
  --network bradbury --timeout 900
```

The current bradbury contract is at `0xC583a939b97F394c64978F2565fd1Aa92a993370` on chainId 4221.

## Switching networks

The frontend reads `VITE_NETWORK` to pick the RPC and chain id, and `VITE_IS_DEPLOYED` to pick mock vs live:

```bash
# local dev with mock service (no real contract calls)
npm run dev

# studionet, live contract
VITE_NETWORK=studionet VITE_IS_DEPLOYED=true npm run dev

# bradbury, live contract
VITE_NETWORK=bradbury VITE_IS_DEPLOYED=true npm run dev
```

When `VITE_IS_DEPLOYED` is unset or `false`, the frontend uses the mock service regardless of `VITE_NETWORK`. Set both to talk to a real contract. Network selection alone does not enable live writes.

## The five GenVM gotchas

These are the bugs the contract hits first when porting from a vanilla Python mental model. Each one has a fixed form in the codebase.

### 1. `gl.UserError` does not exist

GenLayer does not expose a `UserError` class. Raising it crashes the write with a `NameError` instead of returning a clean revert.

Fix: raise plain `Exception("message")`. The validators surface the message string back to the caller.

### 2. Class-level `u256` constants read as zero

Declaring `MAX_FEE: u256 = 10**16` on the contract class does not survive storage. The validator reads it back as zero.

Fix: keep the constant as a plain Python `int` outside the `@allow_storage` block, or inline the literal at every use site. The contract uses inline literals for fee defaults.

### 3. `DynArray[T]()` cannot be user-instantiated

Calling `DynArray[Burn]()` from a write method raises a type error inside the validator.

Fix: store burns in a single flat `TreeMap[u256, Burn]` keyed by `battle_id * 2 + slot`. Slot 0 is slot A, slot 1 is slot B. This is the same trick the contract uses today. See `docs/ARCHITECTURE.md` for the key derivation.

### 4. `gl.message.sender_address` is an `Address`, not `str`

Comparing it directly to a string raises a type error. So does using it as a `TreeMap` key without a cast.

Fix: cast with `str(gl.message.sender_address)` at the boundary. The contract does this on every `msg.sender` read, and stores combatants by their stringified address.

### 5. Two combatants need distinct storage keys

A naive `combatants[a]` and `combatants[b]` is fine because the keys differ, but a naive `battle_burns[battle_id]` for both slots collapses them. The flat-burn-key trick from gotcha 3 is what keeps the two burns in one map without colliding on `battle_id`.

### 6. Receipt wait timeout must scale with the network

The default `genlayer-js` `waitForTransactionReceipt` polling budget is `retries: 120, interval: 2000` (240 s total). That is fine for studionet where consensus takes 30 to 90 s, but on bradbury a single write can spend 5 to 6 minutes in `COMMITTING` (status 3) before validators finalize it. The script throws a timeout error even though the transaction actually succeeded. Bump the budget on bradbury:

```js
const isBradbury = RPC.includes('bradbury')
const retries = isBradbury ? 400 : 120
const interval = isBradbury ? 4000 : 2000
return client.waitForTransactionReceipt({ hash, interval, retries })
```

In `live_e2e.mjs` this is applied per-network. The resume script `live_e2e_resume.mjs` carries the same logic. The symptom of getting this wrong: a write fails with `current status: 3` after 240 s on bradbury, even though the on-chain state has been updated. Check `genlayer trace <tx_hash>` to confirm: `result_code: 0` and a non-empty `return_data` mean the write actually committed.

## Debugging a failed write

When a write fails on studionet, the leader receipt stderr contains the validator-side stack trace:

```bash
genlayer receipt --tx <tx_hash> --network studionet 2>&1 | grep -A 40 'Traceback'
```

If the trace is empty but the receipt status is `REVERTED`, the failure is in the equivalence principle rather than in the contract code. Re-run with verbose logging to see the prompt sent to the LLM:

```bash
genlayer call --contract <addr> --function judge_battle --args <battle_id> \
  --network studionet --log-level debug
```

For repeated failures, capture the prompt and response pair to a file so you can re-run the equivalence check offline.

## Reading state

```bash
# list open battles
genlayer call --contract 0x0fFeF0ac3441823598e12CcaE068C344F204A8Bf \
  --function list_open_battles --args 10 \
  --network studionet

# fetch one battle
genlayer call --contract 0x0fFeF0ac3441823598e12CcaE068C344F204A8Bf \
  --function get_battle --args 2 \
  --network studionet

# fetch a specific burn
genlayer call --contract 0x0fFeF0ac3441823598e12CcaE068C344F204A8Bf \
  --function get_burn --args 2 0 \
  --network studionet
```

Receipts include the full state diff for the write. They are the cheapest way to verify a battle actually transitioned, since the consensus outcome alone does not tell you whether the storage was updated.

## Funding the deployer wallet

| Network   | Funding source                                                |
|-----------|---------------------------------------------------------------|
| Studionet | none required, writes are gas-free                            |
| Bradbury  | GenLayer bradbury faucet, testnet GEN in fixed parcels        |
| Local     | `genlayer-node` dev container seeds keystore on first run     |

For local testing against a `genlayer-node` dev container, no faucet is needed. The node seeds the keystore with a balance on first boot.

For bradbury, the faucet URL is in the GenLayer docs under "Bradbury testnet". The faucet drips testnet GEN once per address per 24 hours.

## Local development with genlayer-node

Spin up a local GenLayer node for offline testing:

```bash
docker run -d --name genlayer-node -p 4000:4000 \
  -v ~/.genlayer/keystores:/keystores \
  genlayer/node:latest
```

Deploy against the local node:

```bash
genlayer deploy --network local \
  --keystore ~/.genlayer/keystores/deployer.json \
  --rpc http://localhost:4000 \
  pyre.py
```

Local consensus is mocked, so writes return in under a second. Use this for frontend iteration, not for verifying equivalence behavior. The mocked equivalence always accepts the LLM output, so an equivalence bug that would surface on studionet will not surface here.

## Verifying a deployment

After a deploy, confirm the contract responds:

```bash
ADDR=0x0fFeF0ac3441823598e12CcaE068C344F204A8Bf
NETWORK=studionet

genlayer call --contract $ADDR --function list_open_battles --args 1 \
  --network $NETWORK
```

A successful response returns a JSON array of `Battle` objects. An empty array is a valid response and means no battles are open. A connection error means the deploy did not finalize or the RPC URL is wrong.

## Receipt anatomy

A receipt contains:

| Field                  | Meaning                                              |
|------------------------|------------------------------------------------------|
| `tx_hash`              | Transaction identifier                               |
| `status`               | `SUCCESS` or `REVERTED`                              |
| `block_number`         | Block the receipt was finalized in                   |
| `state_diff`           | Map of storage keys to before/after values           |
| `consensus_round`      | Equivalence round index                              |
| `validator_signatures` | List of validator pubkeys that signed                |

For a `REVERTED` receipt, `state_diff` is empty and `consensus_round` shows where the equivalence check failed. The leader's stderr is reachable through the CLI helper shown in the debugging section above.

## Network quick reference

| Network   | chainId | Gas     | Consensus latency | RPC                                          |
|-----------|---------|---------|-------------------|----------------------------------------------|
| local     | n/a     | free    | sub-second (mock) | `http://localhost:4000`                      |
| studionet | 61999   | free    | about 60 s/write  | `https://studio.genlayer.com/api`            |
| bradbury  | 4221    | paid    | 5 to 6 min/verdict | default bradbury RPC                         |
