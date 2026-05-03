// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Subset of Mezo's PriceFeed interface used by MUSDirectDebit.
/// Mezo testnet address: 0x86bCF0841622a5dAC14A313a15f96A95421b9366
/// fetchPrice() updates state (so it's non-view); BTC/USD scaled by 1e18.
interface IPriceFeed {
    function fetchPrice() external returns (uint256);
}
