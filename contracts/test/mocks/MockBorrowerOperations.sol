// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IBorrowerOperations} from "../../src/interfaces/IBorrowerOperations.sol";

/// @notice Test double — lets us flip Recovery Mode on/off explicitly.
contract MockBorrowerOperations is IBorrowerOperations {
    bool public recoveryMode;

    function setRecoveryMode(bool on) external {
        recoveryMode = on;
    }

    function checkRecoveryMode(uint256 /*_price*/) external view returns (bool) {
        return recoveryMode;
    }
}
