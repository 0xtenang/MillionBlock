// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

interface IMillionBlock {
    function mint(uint16 x, uint16 y, uint16 w, uint16 h) external payable;
    function list(uint256[] calldata ids, uint256[] calldata prices) external;
}

/// @dev Test helper: a seller contract that refuses ETH.
contract RejectingSeller {
    IMillionBlock public immutable mb;

    constructor(address mb_) {
        mb = IMillionBlock(mb_);
    }

    function mintAndList(uint256 price, uint256 listAt) external payable {
        mb.mint{value: price}(0, 0, 1, 1);
        uint256[] memory ids = new uint256[](1);
        uint256[] memory prices = new uint256[](1);
        prices[0] = listAt;
        mb.list(ids, prices);
    }

    receive() external payable {
        revert("no ETH");
    }
}
