// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockERC20
 * @dev 用于测试的简单 ERC20 代币，支持自由铸造
 */
contract MockERC20 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    /**
     * @dev 公开的铸造函数，方便测试中给任意地址发币
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
