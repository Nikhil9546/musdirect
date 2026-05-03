// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ITroveManager} from "../../src/interfaces/ITroveManager.sol";

/// @notice Test double — lets us set the ICR per borrower directly.
contract MockTroveManager is ITroveManager {
    mapping(address => uint256) public icrOf;

    function setICR(address borrower, uint256 icr) external {
        icrOf[borrower] = icr;
    }

    function getCurrentICR(address _borrower, uint256 /*_price*/) external view returns (uint256) {
        return icrOf[_borrower];
    }
}
