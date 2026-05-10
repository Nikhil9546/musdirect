// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {MUSDirectDebit} from "../src/MUSDirectDebit.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ITroveManager} from "../src/interfaces/ITroveManager.sol";
import {IPriceFeed} from "../src/interfaces/IPriceFeed.sol";

/// @notice Deploy MUSDirectDebit against real Mezo testnet (or mainnet) contracts.
///
/// Required env:
///   MUSD_ADDRESS, TROVE_MANAGER_ADDRESS, PRICE_FEED_ADDRESS, FEE_RECIPIENT, PRIVATE_KEY
///
/// Usage:
///   forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast
contract Deploy is Script {
    function run() external returns (MUSDirectDebit scheduler) {
        address musd = vm.envAddress("MUSD_ADDRESS");
        address trove = vm.envAddress("TROVE_MANAGER_ADDRESS");
        address priceFeed = vm.envAddress("PRICE_FEED_ADDRESS");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");

        uint256 pk = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(pk);
        scheduler = new MUSDirectDebit(
            IERC20(musd),
            ITroveManager(trove),
            IPriceFeed(priceFeed),
            feeRecipient
        );
        vm.stopBroadcast();

        console2.log("MUSDirectDebit deployed at:", address(scheduler));
        console2.log("  MUSD:         ", musd);
        console2.log("  TroveManager: ", trove);
        console2.log("  PriceFeed:    ", priceFeed);
        console2.log("  feeRecipient: ", feeRecipient);
    }
}
