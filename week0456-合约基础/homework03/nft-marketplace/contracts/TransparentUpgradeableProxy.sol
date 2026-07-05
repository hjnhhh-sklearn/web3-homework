// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// 导入并重新导出 OpenZeppelin 的 TransparentUpgradeableProxy 合约，透明代理合约，维护logic地址和管理员
// 这个文件用于让 Hardhat 能够编译和部署 TransparentUpgradeableProxy
import {TransparentUpgradeableProxy as OpenZeppelinTransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

// 重新导出以便 Hardhat 可以找到
contract TransparentUpgradeableProxy is
    OpenZeppelinTransparentUpgradeableProxy
{
    constructor(
        address _logic,
        address admin_,
        bytes memory _data
    ) OpenZeppelinTransparentUpgradeableProxy(_logic, admin_, _data) {}
}
