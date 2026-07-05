// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/**
 * @title NFTAuction NFT拍卖系统
 * @dev NFT在线拍卖系统，英式拍卖
 * @notice 使用ReentrancyGuard防止重入攻击
 */
contract NFTAuction is ReentrancyGuard {
    /**
     * 拍卖结构体
     */
    struct Auction {
        address seller; // 卖家地址
        address nftContract; // nft的合约地址，因为可能适配不同的nft
        uint256 tokenId; // nft的唯一tokenid
        uint256 startPrice; // 起拍价
        uint256 highestBid; // 最高出价
        address highestBidder; // 最高出价人地址
        uint256 endTime; // 结束事件
        bool active; // 是否仍在进行中
    }

    // 拍卖映射
    mapping(uint256 => Auction) public acutionMaps;
    uint256 public acutionCounter; // 拍卖的数量

    // 待退款映射，用于给出价的买家退款
    mapping(uint256 => mapping(address => uint256)) public pendingRefundMap;

    // 平台手续费
    uint256 public platformFee = 250; // 2.5%

    // 手续费接收地址
    address public feeReceiver;

    // chainlink预言机
    AggregatorV3Interface internal dataFeed;

    // 创建拍卖事件，包括拍卖单，卖家，nft合约地址，tokenId，起拍价以及结束事件
    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed seller,
        address indexed nftContract,
        uint256 tokenId,
        uint256 startPrice,
        uint256 endTime
    );

    // 出价事件，哪个拍卖单，出价人是谁，出价多少钱
    event BidPlaced(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 amount
    );

    // 拍卖结束事件，哪个拍卖单，成交人以及成交价
    event AuctionEnd(
        uint256 indexed auctionId,
        address indexed winner,
        uint256 dealPrice
    );

    // 构造器
    constructor(address _feeReceiver, address _dataFeed) {
        require(_feeReceiver != address(0), "Invalid feeReceiver address");
        feeReceiver = _feeReceiver;
        dataFeed = AggregatorV3Interface(_dataFeed);
    }

    // 创建拍卖
    function createAuction(
        address nftContract,
        uint256 tokenId,
        uint256 startPrice,
        uint256 durationTime
    ) external returns (uint256) {
        // 校验0地址，起拍价，持续时间
        require(nftContract != address(0), "Invalid NFT address");
        require(startPrice > 0, "StartPrice must be great then zero");
        require(durationTime >= 1, "DurationTime must at least 1 hour");

        // 获取NFT合约
        IERC721 nft = IERC721(nftContract);

        // 验证所有权是否是seller
        require(nft.ownerOf(tokenId) == msg.sender, "nft not owner");

        // 验证seller是否给拍卖合约授权NFT
        require(
            nft.getApproved(tokenId) == address(this) ||
                nft.isApprovedForAll(msg.sender, address(this)),
            "Current marketplace not approved"
        );

        // 创建拍卖、事件、返回count
        acutionCounter++;
        acutionMaps[acutionCounter] = Auction({
            seller: msg.sender,
            nftContract: nftContract,
            tokenId: tokenId,
            startPrice: startPrice,
            highestBid: 0,
            highestBidder: address(0),
            endTime: block.timestamp + (durationTime * 1 hours),
            active: true
        });

        emit AuctionCreated(
            acutionCounter,
            msg.sender,
            nftContract,
            tokenId,
            startPrice,
            acutionMaps[acutionCounter].endTime
        );
        return acutionCounter;
    }

    // ETH出价, 需要支付足够的ETH，出价必须高于当前最高出价的5%
    function placeBid(uint256 auctionId) external payable {
        Auction storage auction = acutionMaps[auctionId];

        // 校验，必须是active状态，时间没有结束，不能自己买自己的
        require(auction.active, "Auction is not active");
        require(block.timestamp < auction.endTime, "Auction is end");
        require(
            msg.sender != auction.seller,
            "You can not placeBid by yourself"
        );

        // 计算最低出价
        uint256 minPrice;
        if (auction.highestBid == 0) {
            // 如果没有出价，那么此时就是起拍价
            minPrice = auction.startPrice;
        } else {
            minPrice = auction.highestBid + ((auction.highestBid * 5) / 100);
        }

        // 如果买家出价低于这个minPrice，视为无效
        require(msg.value >= minPrice, "Invalid placeBid");

        // 如果之前有出价者，记录待退款
        if (auction.highestBidder != address(0)) {
            pendingRefundMap[auctionId][auction.highestBidder] += auction
                .highestBid;
        }

        // 更新出价
        auction.highestBid = msg.value; // 这里应该给买家出的实际值，不然多的钱会被锁在合约里面
        auction.highestBidder = msg.sender;
        emit BidPlaced(auctionId, msg.sender, msg.value);
    }

    // 设置活动状态，检查是否存在，检查是否是seller在操作
    function setAuctionStatus(uint256 auctionId, bool flag) external {
        require(
            auctionId > 0 && auctionId <= acutionCounter,
            "Invalid auctionId"
        );
        require(acutionMaps[auctionId].seller != address(0), "Invalid auction");
        require(acutionMaps[auctionId].seller == msg.sender, "Only seller");
        acutionMaps[auctionId].active = flag;
    }

    // 显示用户出价的ETH和美元的换算 amount单位 ：Wei
    function showEth2USD(uint256 amount) external view returns (uint256) {
        require(amount > 0, "Invalid amount");

        // 168716453057，是10**8次方
        uint256 cur = uint256(getChainlinkDataFeedLatestAnswer());

        return (amount * cur) / 10 ** 8; // 结果保留18位，确保精度
    }

    // 拍卖结束，到点了，结束拍卖，以最高价为准，转移NFT，计算手续费，转钱给卖家
    function endAuction(uint256 index) external nonReentrant {
        Auction storage auction = acutionMaps[index];
        require(auction.active, "Auction already closed");
        require(block.timestamp >= auction.endTime, "Auction is not end");

        // CEI模式，先修改状态
        auction.active = false;

        // 如果有人出价，就开始资金分配，否则流拍
        if (auction.highestBidder != address(0)) {
            // 计算手续费
            uint256 fee = (auction.highestBid * platformFee) / 10000;

            // 最终价格
            uint256 sellerAmount = auction.highestBid - fee;

            // 转移NFT
            IERC721(auction.nftContract).safeTransferFrom(
                auction.seller,
                auction.highestBidder,
                auction.tokenId
            );

            // 转移资金
            bool success1;
            (success1, ) = auction.seller.call{value: sellerAmount}("");
            require(success1, "Seller tx fail");

            bool success2;
            (success2, ) = feeReceiver.call{value: fee}("");
            require(success2, "feeReceiver tx fail");

            emit AuctionEnd(index, auction.highestBidder, auction.highestBid);
        } else {
            emit AuctionEnd(index, address(0), 0);
        }
    }

    // 提取退款，包括中标人自己也要退，因为出价函数中，出完价后，在map中记录的是上一次的最高价
    // 这样，A退款的也是之前自己累计的出价和，和最新的这一次没关系
    function withdraw(uint256 auctionId) external {
        // 需要活动结束
        Auction storage auction = acutionMaps[auctionId];
        require(!auction.active, "Auction is not closed");

        // 需要你曾经出价过
        uint256 amount = pendingRefundMap[auctionId][msg.sender];
        require(
            amount > 0,
            "You don't have enough balance to support withdraw"
        );

        // CEI model
        pendingRefundMap[auctionId][msg.sender] = 0;

        bool success;
        (success, ) = msg.sender.call{value: amount}("");
        require(success, "Withdraw tx failed");
    }

    // 集成chainlink预言机，方便用户比价美元
    /**
     * Returns the latest answer.
     * 目前的价格：168716453057，是10**8次方的单位
     */
    function getChainlinkDataFeedLatestAnswer() public view returns (int256) {
        // prettier-ignore
        (
      /* uint80 roundId */
      ,
      int256 answer,
      /*uint256 startedAt*/
      ,
      /*uint256 updatedAt*/
      ,
      /*uint80 answeredInRound*/
    ) = dataFeed.latestRoundData();
        return answer;
    }
}
