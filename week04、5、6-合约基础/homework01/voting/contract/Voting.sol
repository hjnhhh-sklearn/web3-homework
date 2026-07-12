// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.24;

contract Voting {
    mapping(address => uint256) public voteMap;
    address[] public candidates;
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    function vote(address candidate) external {
        require(candidate != address(0), "address can not be zero!");
        if (voteMap[candidate] == 0) {
            voteMap[candidate] = 1;
            candidates.push(candidate);
        } else {
            voteMap[candidate] += 1;
        }
    }

    function getVotes(address candidate) external view returns (uint256) {
        require(candidate != address(0), "address can not be zero!");
        return voteMap[candidate];
    }

    function resetVotes() external onlyOwner {
        uint256 len = candidates.length;
        for (uint256 i = 0; i < len; i++) {
            address addr = candidates[i];
            voteMap[addr] = 0;
        }
        // 同步删除数组
        delete candidates;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner can do this option");
        _;
    }
}
