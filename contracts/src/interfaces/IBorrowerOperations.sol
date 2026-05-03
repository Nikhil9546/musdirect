// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Subset of Mezo's BorrowerOperations interface used by MUSDirectDebit.
/// Mezo testnet address: 0xCdF7028ceAB81fA0C6971208e83fa7872994beE5
interface IBorrowerOperations {
    /// @notice True if the system Total Collateral Ratio is below 150% (Recovery Mode).
    function checkRecoveryMode(uint256 _price) external view returns (bool);
}
