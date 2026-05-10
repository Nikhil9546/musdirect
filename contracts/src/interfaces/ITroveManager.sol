// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Subset of Mezo's TroveManager interface used by MUSDirectDebit.
/// Mezo testnet address: 0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0
///
/// Verified live against testnet (chain id 31611) on 2026-05-04:
///   getCurrentICR(0x...dEaD, 80185e18) → type(uint256).max  (no Trove for this addr)
///   checkRecoveryMode(80185e18)        → false              (TCR ≈ 235%)
///   getTCR(80185e18)                   → 2.356e18           (sanity)
interface ITroveManager {
    /// @notice Borrower's individual collateral ratio at the given price.
    /// Scaled by 1e18 (so 250% = 2.5e18). Returns type(uint256).max for an address with no debt.
    function getCurrentICR(address _borrower, uint256 _price) external view returns (uint256);

    /// @notice True if the system Total Collateral Ratio is below 150% (Recovery Mode).
    /// Mezo (Liquity-fork) places this on TroveManager, not BorrowerOperations.
    function checkRecoveryMode(uint256 _price) external view returns (bool);
}
