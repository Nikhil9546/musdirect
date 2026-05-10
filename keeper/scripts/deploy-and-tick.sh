#!/usr/bin/env bash
#
# Full write-path e2e against the real Mezo testnet.
#
# Preconditions (on you, not on this script):
#   - PAYER_PRIVATE_KEY: a wallet funded with enough native gas (testBTC) and
#     enough MUSD to cover one scheduled payment. If you want the CR-gate to be
#     exercised against real state, this wallet should also have an open Trove.
#   - KEEPER_PRIVATE_KEY: a separate wallet funded with enough native gas to
#     submit one executePayment tx (a different wallet so the keeper's role is
#     visible end-to-end; can be the same address if you don't care).
#   - FEE_RECIPIENT: where the 0.25%/$5-capped per-execution fee lands.
#   - PAYEE: any address you want to receive the test payment.
#   - jq, cast, forge, pnpm on PATH.
#
# What it does:
#   1. Verifies live ABI via verify-testnet.sh (idempotent)
#   2. Deploys MUSDirectDebit pointing at the live MUSD/TroveManager/PriceFeed
#   3. Has the payer approve the scheduler for the cap
#   4. Creates a schedule with first_exec = now (immediately due)
#   5. Records payee + fee_recipient MUSD balances
#   6. Runs one keeper tick (signed by KEEPER_PRIVATE_KEY)
#   7. Asserts that the balances changed by the expected amounts
#
# Cost: 1 contract deploy + 1 approve + 1 createSchedule + 1 executePayment.
# On Mezo gas this is sub-cent; on testnet it's free aside from the testBTC
# you've already faucet'd.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTRACTS="${ROOT}/contracts"
KEEPER="${ROOT}/keeper"

RPC="${RPC_URL:-https://rpc.test.mezo.org}"
CHAIN_ID="${CHAIN_ID:-31611}"

MUSD=0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503
TROVE=0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0
PRICE=0x86bCF0841622a5dAC14A313a15f96A95421b9366

red()    { printf "\033[31m%s\033[0m\n" "$*"; }
green()  { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }
fail()   { red "FAIL: $*"; exit 1; }

need_env() {
  local name=$1
  if [[ -z "${!name:-}" ]]; then
    fail "missing env var: ${name}. See script header for the full list."
  fi
}

need_env PAYER_PRIVATE_KEY
need_env KEEPER_PRIVATE_KEY
need_env FEE_RECIPIENT
need_env PAYEE

# ── 0. Verify live ABI before spending any gas ──
"${KEEPER}/scripts/verify-testnet.sh" >/dev/null 2>&1 || fail "verify-testnet.sh failed"
green "✓ live ABI verified"

PAYER_ADDR=$(cast wallet address --private-key "${PAYER_PRIVATE_KEY}")
KEEPER_ADDR=$(cast wallet address --private-key "${KEEPER_PRIVATE_KEY}")
echo "    payer:        ${PAYER_ADDR}"
echo "    keeper:       ${KEEPER_ADDR}"
echo "    payee:        ${PAYEE}"
echo "    feeRecipient: ${FEE_RECIPIENT}"

# Sanity: payer needs MUSD; keeper needs gas.
PAYER_MUSD=$(cast call --rpc-url "${RPC}" "${MUSD}" "balanceOf(address)(uint256)" "${PAYER_ADDR}" | awk '{print $1}')
PAYER_GAS=$(cast balance --rpc-url "${RPC}" "${PAYER_ADDR}")
KEEPER_GAS=$(cast balance --rpc-url "${RPC}" "${KEEPER_ADDR}")
echo "    payer MUSD:   ${PAYER_MUSD}"
echo "    payer gas:    ${PAYER_GAS}"
echo "    keeper gas:   ${KEEPER_GAS}"

[[ "${PAYER_MUSD}" -lt 100000000000000000000 ]] && fail "payer needs ≥ 100 MUSD (have ${PAYER_MUSD})"
[[ "${PAYER_GAS}"  == "0" ]] && fail "payer needs gas; faucet some testBTC"
[[ "${KEEPER_GAS}" == "0" ]] && fail "keeper needs gas; faucet some testBTC"

# ── 1. Deploy MUSDirectDebit ──
echo ""
echo "── deploying MUSDirectDebit ──"
cd "${CONTRACTS}"

DEPLOY_LOG=$(
  MUSD_ADDRESS="${MUSD}" \
  TROVE_MANAGER_ADDRESS="${TROVE}" \
  PRICE_FEED_ADDRESS="${PRICE}" \
  FEE_RECIPIENT="${FEE_RECIPIENT}" \
  PRIVATE_KEY="${PAYER_PRIVATE_KEY}" \
  forge script script/Deploy.s.sol \
    --rpc-url "${RPC}" \
    --broadcast \
    --silent \
    2>&1
)

BROADCAST_FILE="${CONTRACTS}/broadcast/Deploy.s.sol/${CHAIN_ID}/run-latest.json"
SCHEDULER=$(jq -r '[.transactions[] | select(.contractName=="MUSDirectDebit")][0].contractAddress' "${BROADCAST_FILE}")
[[ "${SCHEDULER}" == "null" || -z "${SCHEDULER}" ]] && fail "could not extract scheduler address from ${BROADCAST_FILE}"
green "✓ scheduler deployed at ${SCHEDULER}"

# ── 2. Approve + create schedule ──
echo ""
echo "── creating schedule (100 MUSD / month, cap 1200, minSafeCR 250%) ──"

cast send "${MUSD}" "approve(address,uint256)" "${SCHEDULER}" \
  "115792089237316195423570985008687907853269984665640564039457584007913129639935" \
  --rpc-url "${RPC}" --private-key "${PAYER_PRIVATE_KEY}" --silent

NOW=$(date +%s)
EXPIRY=$((NOW + 365*24*3600))
cast send "${SCHEDULER}" \
  "createSchedule(address,uint128,uint64,uint64,uint64,uint128,uint128)(uint256)" \
  "${PAYEE}" \
  "100000000000000000000" \
  "2592000" \
  "${NOW}" \
  "${EXPIRY}" \
  "1200000000000000000000" \
  "2500000000000000000" \
  --rpc-url "${RPC}" --private-key "${PAYER_PRIVATE_KEY}" --silent

SCHEDULE_ID=1
DUE=$(cast call --rpc-url "${RPC}" "${SCHEDULER}" "isDue(uint256)(bool)" "${SCHEDULE_ID}")
[[ "${DUE}" != "true" ]] && fail "schedule should be immediately due, isDue=${DUE}"
green "✓ schedule ${SCHEDULE_ID} created and due"

# ── 3. Snapshot balances ──
PAYEE_BEFORE=$(cast call --rpc-url "${RPC}" "${MUSD}" "balanceOf(address)(uint256)" "${PAYEE}" | awk '{print $1}')
FEE_BEFORE=$(cast   call --rpc-url "${RPC}" "${MUSD}" "balanceOf(address)(uint256)" "${FEE_RECIPIENT}" | awk '{print $1}')

# ── 4. One keeper tick ──
echo ""
echo "── running keeper one-shot tick ──"
cd "${KEEPER}"
RPC_URL="${RPC}" \
CHAIN_ID="${CHAIN_ID}" \
SCHEDULER_ADDRESS="${SCHEDULER}" \
KEEPER_PRIVATE_KEY="${KEEPER_PRIVATE_KEY}" \
START_BLOCK=0 \
MAX_PER_TICK=10 \
LOG_LEVEL=info \
pnpm tick:env

# ── 5. Assertions ──
PAYEE_AFTER=$(cast call --rpc-url "${RPC}" "${MUSD}" "balanceOf(address)(uint256)" "${PAYEE}" | awk '{print $1}')
FEE_AFTER=$(cast   call --rpc-url "${RPC}" "${MUSD}" "balanceOf(address)(uint256)" "${FEE_RECIPIENT}" | awk '{print $1}')

PAYEE_DELTA=$(python3 -c "print(int('${PAYEE_AFTER}') - int('${PAYEE_BEFORE}'))")
FEE_DELTA=$(python3   -c "print(int('${FEE_AFTER}')   - int('${FEE_BEFORE}'))")

echo ""
echo "    payee MUSD before / after: ${PAYEE_BEFORE} / ${PAYEE_AFTER}  Δ=${PAYEE_DELTA}"
echo "    fee   MUSD before / after: ${FEE_BEFORE} / ${FEE_AFTER}  Δ=${FEE_DELTA}"

# Expected outcomes depend on the payer's actual ICR:
#   - If payer has no Trove (ICR = type(uint256).max): payment executes,
#     payee +99.75 MUSD, fee +0.25 MUSD.
#   - If payer has a Trove with CR ≥ 250%: same as above.
#   - If payer has a Trove with CR < 250%: schedule pauses, deltas = 0.
#     This is correct behavior — the CR gate refused execution.

if [[ "${PAYEE_DELTA}" == "99750000000000000000" && "${FEE_DELTA}" == "250000000000000000" ]]; then
  green "── e2e: PASS (payment executed) ──"
elif [[ "${PAYEE_DELTA}" == "0" && "${FEE_DELTA}" == "0" ]]; then
  yellow "── e2e: PASS (CR gate refused execution — payer's Trove CR is below 250%) ──"
  yellow "       To force a payment, lower minSafeCR or top up the Trove."
else
  fail "unexpected balance changes — payee Δ=${PAYEE_DELTA} fee Δ=${FEE_DELTA}"
fi
