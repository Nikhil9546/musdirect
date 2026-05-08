#!/usr/bin/env bash
#
# End-to-end harness:
#   1. Start anvil
#   2. Deploy MUSDirectDebit + mocks via DeployLocal
#   3. Mint MUSD to a payer, set a healthy ICR, approve the scheduler
#   4. Create a schedule with first_exec = now (so it's immediately due)
#   5. Run a single keeper tick
#   6. Assert the payee received MUSD
#
# Run from repo root:
#   keeper/scripts/e2e.sh

set -euo pipefail

# ── Anvil's first default account; well-known and safe for local tests only.
PAYER_PK="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
PAYER_ADDR="0xf39Fd6e51aad88F6F4ce6aB8827279cfFFb92266"

KEEPER_PK="0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
KEEPER_ADDR="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"

PAYEE_ADDR="0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
FEE_RECIPIENT="0x90F79bf6EB2c4f870365E785982E1f101E93b906"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTRACTS="${ROOT}/contracts"
KEEPER="${ROOT}/keeper"

ANVIL_PORT=8545
RPC="http://127.0.0.1:${ANVIL_PORT}"
CHAIN_ID=31337

echo "── starting anvil on ${RPC} ──"
anvil --port "${ANVIL_PORT}" --silent --chain-id "${CHAIN_ID}" &
ANVIL_PID=$!

cleanup() {
  if kill -0 "${ANVIL_PID}" 2>/dev/null; then
    kill "${ANVIL_PID}" 2>/dev/null || true
    wait "${ANVIL_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Wait for anvil to be reachable.
for _ in $(seq 1 50); do
  if cast block-number --rpc-url "${RPC}" >/dev/null 2>&1; then break; fi
  sleep 0.1
done

echo "── deploying MUSDirectDebit + mocks ──"
cd "${CONTRACTS}"
DEPLOY_OUT="$(
  PRIVATE_KEY="${PAYER_PK}" \
  FEE_RECIPIENT="${FEE_RECIPIENT}" \
  forge script script/DeployLocal.s.sol \
    --rpc-url "${RPC}" \
    --broadcast \
    --silent
)"

# Pull addresses from the broadcast artifact instead of stdout for robustness.
BROADCAST_FILE="${CONTRACTS}/broadcast/DeployLocal.s.sol/${CHAIN_ID}/run-latest.json"
SCHEDULER=$(jq -r '[.transactions[] | select(.contractName=="MUSDirectDebit")][0].contractAddress' "${BROADCAST_FILE}")
MUSD=$(jq -r       '[.transactions[] | select(.contractName=="MockMUSD")][0].contractAddress'        "${BROADCAST_FILE}")
TROVE=$(jq -r      '[.transactions[] | select(.contractName=="MockTroveManager")][0].contractAddress' "${BROADCAST_FILE}")
BORROW_OPS=$(jq -r '[.transactions[] | select(.contractName=="MockBorrowerOperations")][0].contractAddress' "${BROADCAST_FILE}")
PRICE=$(jq -r      '[.transactions[] | select(.contractName=="MockPriceFeed")][0].contractAddress'   "${BROADCAST_FILE}")

echo "    scheduler:    ${SCHEDULER}"
echo "    musd:         ${MUSD}"
echo "    trove:        ${TROVE}"
echo "    borrower-ops: ${BORROW_OPS}"
echo "    priceFeed:    ${PRICE}"

echo "── seeding state ──"
# Mint payer 10,000 MUSD; set healthy ICR (400%); leave RM off (default).
cast send "${MUSD}"  "mint(address,uint256)"  "${PAYER_ADDR}" "10000000000000000000000" \
  --rpc-url "${RPC}" --private-key "${PAYER_PK}" --silent
cast send "${TROVE}" "setICR(address,uint256)" "${PAYER_ADDR}" "4000000000000000000" \
  --rpc-url "${RPC}" --private-key "${PAYER_PK}" --silent

# Approve the scheduler for the maximum amount.
cast send "${MUSD}" "approve(address,uint256)" "${SCHEDULER}" \
  "115792089237316195423570985008687907853269984665640564039457584007913129639935" \
  --rpc-url "${RPC}" --private-key "${PAYER_PK}" --silent

echo "── creating schedule (100 MUSD / month, cap 1200, minSafeCR 250%) ──"
NOW=$(date +%s)
EXPIRY=$((NOW + 365*24*3600))
TX=$(cast send "${SCHEDULER}" \
  "createSchedule(address,uint128,uint64,uint64,uint64,uint128,uint128)(uint256)" \
  "${PAYEE_ADDR}" \
  "100000000000000000000" \
  "2592000" \
  "${NOW}" \
  "${EXPIRY}" \
  "1200000000000000000000" \
  "2500000000000000000" \
  --rpc-url "${RPC}" --private-key "${PAYER_PK}" --json)

# Anvil mines instantly, so the schedule exists at block N. We pull it from a
# subsequent isDue() readContract.
SCHEDULE_ID=1
DUE=$(cast call "${SCHEDULER}" "isDue(uint256)(bool)" "${SCHEDULE_ID}" --rpc-url "${RPC}")
echo "    schedule ${SCHEDULE_ID} isDue=${DUE}"
if [[ "${DUE}" != "true" ]]; then
  echo "FAIL: schedule should be immediately due"
  exit 1
fi

PAYEE_BEFORE=$(cast call "${MUSD}" "balanceOf(address)(uint256)" "${PAYEE_ADDR}" --rpc-url "${RPC}")
FEE_BEFORE=$(cast call   "${MUSD}" "balanceOf(address)(uint256)" "${FEE_RECIPIENT}" --rpc-url "${RPC}")
echo "    payee MUSD before: ${PAYEE_BEFORE}"
echo "    fee   MUSD before: ${FEE_BEFORE}"

echo "── running keeper one-shot tick ──"
cd "${KEEPER}"
RPC_URL="${RPC}" \
CHAIN_ID="${CHAIN_ID}" \
SCHEDULER_ADDRESS="${SCHEDULER}" \
KEEPER_PRIVATE_KEY="${KEEPER_PK}" \
START_BLOCK=0 \
MAX_PER_TICK=10 \
LOG_LEVEL=info \
pnpm tick:env

PAYEE_AFTER=$(cast call "${MUSD}" "balanceOf(address)(uint256)" "${PAYEE_ADDR}" --rpc-url "${RPC}")
FEE_AFTER=$(cast call   "${MUSD}" "balanceOf(address)(uint256)" "${FEE_RECIPIENT}" --rpc-url "${RPC}")
echo "    payee MUSD after:  ${PAYEE_AFTER}"
echo "    fee   MUSD after:  ${FEE_AFTER}"

# Strip "[uint256]" suffix that cast call sometimes prints.
PAYEE_AFTER=${PAYEE_AFTER%% *}
FEE_AFTER=${FEE_AFTER%% *}
PAYEE_BEFORE=${PAYEE_BEFORE%% *}
FEE_BEFORE=${FEE_BEFORE%% *}

# Expected: payee +99.75 MUSD (amount 100 minus 0.25 fee). Fee recipient +0.25 MUSD.
EXPECTED_NET="99750000000000000000"
EXPECTED_FEE="250000000000000000"

PAYEE_DELTA=$(python3 -c "print(int('${PAYEE_AFTER}') - int('${PAYEE_BEFORE}'))")
FEE_DELTA=$(python3   -c "print(int('${FEE_AFTER}')   - int('${FEE_BEFORE}'))")

echo "    payee delta: ${PAYEE_DELTA}  (expected ${EXPECTED_NET})"
echo "    fee   delta: ${FEE_DELTA}    (expected ${EXPECTED_FEE})"

if [[ "${PAYEE_DELTA}" != "${EXPECTED_NET}" || "${FEE_DELTA}" != "${EXPECTED_FEE}" ]]; then
  echo "FAIL: balances do not match expected"
  exit 1
fi

echo "── e2e: PASS ──"
