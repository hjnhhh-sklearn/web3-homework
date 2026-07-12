// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.24;

contract Counter {
    address public owner;
    uint256 public num = 0;

    constructor() {
        owner = msg.sender;
    }

    function incrementNum() external returns (uint256) {
        num++;
        return num;
    }
}
