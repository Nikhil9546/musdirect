// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPriceFeed} from "../../src/interfaces/IPriceFeed.sol";

/// @notice Test double — non-view fetchPrice matches the real interface.
contract MockPriceFeed is IPriceFeed {
    uint256 public price = 70_000e18;

    function setPrice(uint256 _price) external {
        price = _price;
    }

    function fetchPrice() external view returns (uint256) {
        return price;
    }
}
