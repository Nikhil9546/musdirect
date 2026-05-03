// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Subset of Mezo's TroveManager interface used by MUSDirectDebit.
/// Mainnet/testnet TroveManager exposes more methods; we only need ICR.
/// Mezo testnet address: 0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0
interface ITroveManager {
    /// @notice Returns the borrower's individual collateral ratio at the given price.
    /// Scaled by 1e18 (so 250% = 2.5e18). Returns max uint256 if no debt.
    function getCurrentICR(address _borrower, uint256 _price) external view returns (uint256);
}
