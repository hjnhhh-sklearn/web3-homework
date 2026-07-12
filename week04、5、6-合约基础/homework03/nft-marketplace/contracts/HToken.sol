// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.6.0
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Burnable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

contract HToken is ERC721, ERC721URIStorage, ERC721Burnable, Ownable {
    uint256 public _nextTokenId;

    // 自定义url
    string constant META_DATA =
        "https://sufficient-lime-mink.myfilebase.com/ipfs/QmS6G2xPqaHtzQoEHnmjzQa7hMjeDtdVUNhBLACeKAinYP";

    // 最大供应量
    uint256 public MAX_SUPPLY = 1000;

    // 每次铸造所花费的价格
    uint256 public MINT_PRICE = 0.01 ether; // ETH

    // 铸造事件
    event NFTMinted(address indexed from, address indexed to, string url);

    constructor(
        address initialOwner
    ) ERC721("HToken", "HTK") Ownable(initialOwner) {}

    // 添加一些限制条件和事件追踪
    function safeMint(address to) public payable onlyOwner returns (uint256) {
        // 不能超过最大供应量
        require(_nextTokenId < MAX_SUPPLY, "more then max supply");

        // 调用者的余额要大于mint_price
        require(msg.value >= MINT_PRICE, "you don't have enough money to mint");

        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, META_DATA);

        // 事件跟踪
        emit NFTMinted(msg.sender, to, tokenURI(tokenId));
        return tokenId;
    }

    // The following functions are overrides required by Solidity.
    function tokenURI(
        uint256 tokenId
    ) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    // 合约所有者可以withdraw相应的余额，因为每次mint都要支付一定的手续费
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "balance is not enough");

        bool success;
        (success, ) = owner().call{value: balance}("");
        require(success, "tx failed!");
    }

    // 设置最大供应量，便于测试
    function setMaxSupply(uint256 _maxSupply) external onlyOwner {
        MAX_SUPPLY = _maxSupply;
    }
}
