// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {MUSDirectDebit} from "../src/MUSDirectDebit.sol";
import {MockMUSD} from "../test/mocks/MockMUSD.sol";
import {MockTroveManager} from "../test/mocks/MockTroveManager.sol";
import {MockBorrowerOperations} from "../test/mocks/MockBorrowerOperations.sol";
import {MockPriceFeed} from "../test/mocks/MockPriceFeed.sol";

/// @notice Deploys MUSDirectDebit + all mock dependencies on a local anvil chain.
/// Used by the keeper's e2e harness so it can exercise the full execution path
/// against a real EVM without needing Mezo testnet RPC access.
///
/// Required env:
///   PRIVATE_KEY (anvil default works), FEE_RECIPIENT
contract DeployLocal is Script {
    function run()
        external
        returns (
            MUSDirectDebit scheduler,
            MockMUSD musd,
            MockTroveManager trove,
            MockBorrowerOperations borrowerOps,
            MockPriceFeed priceFeed
        )
    {
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");
        uint256 pk = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(pk);
        musd = new MockMUSD();
        trove = new MockTroveManager();
        borrowerOps = new MockBorrowerOperations();
        priceFeed = new MockPriceFeed();

        scheduler = new MUSDirectDebit(musd, trove, borrowerOps, priceFeed, feeRecipient);
        vm.stopBroadcast();

        console2.log("=== Local deployment ===");
        console2.log("MUSDirectDebit:    ", address(scheduler));
        console2.log("MockMUSD:          ", address(musd));
        console2.log("MockTroveManager:  ", address(trove));
        console2.log("MockBorrowerOps:   ", address(borrowerOps));
        console2.log("MockPriceFeed:     ", address(priceFeed));
        console2.log("feeRecipient:      ", feeRecipient);
    }
}
