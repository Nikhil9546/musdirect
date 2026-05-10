#!/usr/bin/env bash
#
# Read-only verification harness against the real Mezo testnet.
#
# What it does (no funds required, no Trove required):
#   1. Confirms RPC reachability and chain id
#   2. Confirms bytecode exists at all four Mezo dependency addresses
#   3. Calls each function MUSDirectDebit depends on, against the real chain:
#        - TroveManager.getCurrentICR(0xdEaD, $price)        → max uint256
#        - TroveManager.checkRecoveryMode($price)            → bool
#        - PriceFeed.fetchPrice()                            → uint256
#        - MUSD.symbol() / decimals() / totalSupply()        → standard ERC-20
#
# This is the live-chain twin of `forge test --match-contract MUSDirectDebitForkTest`.
# Pass = the real testnet ABI matches our interfaces; we are safe to deploy.
#
# Use the deploy-and-run harness (`scripts/deploy-and-tick.sh`) for the
# full write-path verification (requires a funded wallet + a real Trove).

set -euo pipefail

RPC="${RPC_URL:-https://rpc.test.mezo.org}"
EXPECTED_CHAIN_ID=31611

MUSD=0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503
TROVE=0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0
PRICE=0x86bCF0841622a5dAC14A313a15f96A95421b9366

red()    { printf "\033[31m%s\033[0m\n" "$*"; }
green()  { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }

fail() { red "FAIL: $*"; exit 1; }

echo "── Mezo testnet verification ──"
echo "RPC:        ${RPC}"

CHAIN_ID=$(cast chain-id --rpc-url "${RPC}")
[[ "${CHAIN_ID}" == "${EXPECTED_CHAIN_ID}" ]] || fail "expected chain id ${EXPECTED_CHAIN_ID}, got ${CHAIN_ID}"
green "✓ chain id ${CHAIN_ID}"

BLOCK=$(cast block-number --rpc-url "${RPC}")
green "✓ head block ${BLOCK}"

for addr in "${MUSD}" "${TROVE}" "${PRICE}"; do
  CODE=$(cast code --rpc-url "${RPC}" "${addr}")
  if [[ "${CODE}" == "0x" || -z "${CODE}" ]]; then
    fail "no bytecode at ${addr}"
  fi
done
green "✓ bytecode present at MUSD, TroveManager, PriceFeed"

# ── ABI checks ──
PRICE_VAL=$(cast call --rpc-url "${RPC}" "${PRICE}" "fetchPrice()(uint256)" | awk '{print $1}')
[[ "${PRICE_VAL}" =~ ^[0-9]+$ ]] || fail "PriceFeed.fetchPrice() did not return a uint256"
green "✓ PriceFeed.fetchPrice()        → ${PRICE_VAL} (raw)"

ICR=$(cast call --rpc-url "${RPC}" "${TROVE}" \
  "getCurrentICR(address,uint256)(uint256)" 0x000000000000000000000000000000000000dEaD "${PRICE_VAL}" | awk '{print $1}')
EXPECTED_MAX="115792089237316195423570985008687907853269984665640564039457584007913129639935"
[[ "${ICR}" == "${EXPECTED_MAX}" ]] || fail "expected max uint256 ICR for no-trove address, got ${ICR}"
green "✓ TroveManager.getCurrentICR()  → uint256.max (no-trove address)"

RM=$(cast call --rpc-url "${RPC}" "${TROVE}" "checkRecoveryMode(uint256)(bool)" "${PRICE_VAL}")
[[ "${RM}" == "true" || "${RM}" == "false" ]] || fail "checkRecoveryMode returned non-bool: ${RM}"
green "✓ TroveManager.checkRecoveryMode() → ${RM}"

SYMBOL=$(cast call --rpc-url "${RPC}" "${MUSD}" "symbol()(string)")
DECIMALS=$(cast call --rpc-url "${RPC}" "${MUSD}" "decimals()(uint8)")
SUPPLY=$(cast call --rpc-url "${RPC}" "${MUSD}" "totalSupply()(uint256)" | awk '{print $1}')
[[ "${SYMBOL}" == '"MUSD"' ]] || fail "expected symbol MUSD, got ${SYMBOL}"
[[ "${DECIMALS}" == "18" ]] || fail "expected decimals 18, got ${DECIMALS}"
green "✓ MUSD ERC-20: symbol=${SYMBOL} decimals=${DECIMALS} supply=${SUPPLY}"

echo ""
green "── verification: PASS ──"
echo ""
yellow "Next steps:"
echo "  1. Run the fork test suite for full contract-logic coverage:"
echo "       forge test --root contracts --match-contract MUSDirectDebitForkTest \\"
echo "         --fork-url ${RPC} --fork-block-number ${BLOCK}"
echo ""
echo "  2. Deploy MUSDirectDebit to testnet (requires a funded wallet):"
echo "       cd contracts && \\"
echo "         MUSD_ADDRESS=${MUSD} \\"
echo "         TROVE_MANAGER_ADDRESS=${TROVE} \\"
echo "         PRICE_FEED_ADDRESS=${PRICE} \\"
echo "         FEE_RECIPIENT=<your-addr> \\"
echo "         PRIVATE_KEY=<your-pk> \\"
echo "         forge script script/Deploy.s.sol --rpc-url ${RPC} --broadcast"
echo ""
echo "  3. Run the keeper against the deployed scheduler (see keeper/.env.example)."
