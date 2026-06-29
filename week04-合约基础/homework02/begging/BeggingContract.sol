// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract BeggingContract {
    // 合约所有者
    address public owner;

    // 记录每个捐赠人的捐款金额
    mapping(address => uint256) funderAmount;

    // 事件
    event Donation(address addr, uint256 amount);

    // 构造器
    constructor() {
        owner = msg.sender;
    }

    // 允许用户向合约地址发送以太币，这里不用显示使用call函数来想合约转ETH，因为有payable修饰，solidity会自动处理
    function donate() external payable {
        // 金额必须大于0
        require(msg.value > 0, "your value must more then zero");

        // 不能是0地址
        require(msg.sender != address(0), "address can not be zero");

        // 转账后记录
        funderAmount[msg.sender] += msg.value;

        // 记录事件
        emit Donation(msg.sender, msg.value);
    }

    // 允许合约所有者提取所有捐赠的资金
    function withdraw() external onlyOwner {
        bool success;
        (success, ) = payable(msg.sender).call{value: address(this).balance}(
            ""
        );
        require(success, "tx failed");

        // 投资记录也要清零
        funderAmount[msg.sender] = 0;
    }

    // 获取某个捐赠者金额
    function getDonation(address funder) external view returns (uint256) {
        return funderAmount[funder];
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    // 显示捐赠金额最多的前三个地址
}
