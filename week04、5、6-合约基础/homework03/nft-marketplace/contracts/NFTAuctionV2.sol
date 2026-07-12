// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./NFTAuctionUpgradeable.sol";
import "./dataFeed/PriceOracleRouter.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title NFTAuctionV2 NFT拍卖系统 V2
 * @dev V1（NFTAuctionUpgradeable）的可升级版本
 *      新增功能：
 *      1. 支持ERC20代币出价（不只局限于ETH）
 *      2. 使用PriceOracleRouter统一查询任意代币的USD价格
 * @notice 继承V1的所有功能，V1的ETH出价方式依然保留
 */
contract NFTAuctionV2 is NFTAuctionUpgradeable {
    // ============ 新增状态变量（追加在父合约之后，保证存储布局兼容） ============

    /// @notice PriceOracleRouter 合约地址，用于查询代币 USD 价格
    PriceOracleRouter public priceOracle;

    /// @notice 记录每场拍卖使用的出价代币地址（address(0) = ETH, 其他 = ERC20地址）
    mapping(uint256 => address) public auctionBidToken;

    // 版本号
    uint256 public version;

    // ============ 事件 ============

    /// @notice ERC20出价事件
    event BidPlacedWithERC20(
        uint256 indexed auctionId,
        address indexed bidder,
        address indexed token,
        uint256 amount
    );

    // ============ 初始化 ============

    /**
     * @dev V2 初始化函数（reinitializer(2) 确保在 V1 之后调用）
     * @param _priceOracle PriceOracleRouter 合约地址
     */
    function initializeV2(
        address _priceOracle,
        uint256 _version
    ) external reinitializer(2) {
        require(_priceOracle != address(0), "Invalid priceOracle address");
        version = _version;
        priceOracle = PriceOracleRouter(_priceOracle);
    }

    // ============ ERC20 出价 ============

    /**
     * @dev 使用 ERC20 代币出价
     * @param auctionId 拍卖ID
     * @param token ERC20代币合约地址
     * @param amount 出价数量（代币自身精度）
     */
    function placeBidWithERC20(
        uint256 auctionId,
        address token,
        uint256 amount
    ) external {
        Auction storage auction = acutionMaps[auctionId];

        // 校验：拍卖必须活跃、未结束、不能自买自卖
        require(auction.active, "Auction is not active");
        require(block.timestamp < auction.endTime, "Auction is ended");
        require(
            _msgSender() != auction.seller,
            "You cannot bid on your own auction"
        );
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Invalid amount");

        // 首次ERC20出价：锁定该拍卖使用的代币类型
        if (
            auctionBidToken[auctionId] == address(0) && auction.highestBid == 0
        ) {
            auctionBidToken[auctionId] = token;
        }

        // 之后每次出价都必须使用同一种代币
        require(
            auctionBidToken[auctionId] == token,
            "Bid token mismatch: this auction uses a different token"
        );

        // 计算最低出价
        uint256 minPrice;
        if (auction.highestBid == 0) {
            minPrice = auction.startPrice;
        } else {
            minPrice = auction.highestBid + ((auction.highestBid * 5) / 100);
        }

        require(amount >= minPrice, "Bid amount too low");

        // 转移 ERC20 代币到合约
        IERC20(token).transferFrom(_msgSender(), address(this), amount);

        // 如果有前一个出价人，记录待退款
        if (auction.highestBidder != address(0)) {
            pendingRefundMap[auctionId][auction.highestBidder] += auction
                .highestBid;
        }

        // 更新出价
        auction.highestBid = amount;
        auction.highestBidder = _msgSender();

        emit BidPlacedWithERC20(auctionId, _msgSender(), token, amount);
    }

    // ============ 价格查询 ============

    /**
     * @dev [V2增强] 获取指定代币到USD价格（替换原来的 showEth2USD）
     *      通过 PriceOracleRouter 查询，支持任意已注册的代币
     * @param token 代币地址（address(0) = ETH）
     * @param amount 代币数量
     * @return usdAmount 等值USD金额（18位精度）
     */
    function getTokenPriceInUSD(
        address token,
        uint256 amount
    ) public view returns (uint256 usdAmount) {
        require(amount > 0, "Invalid amount");
        require(
            address(priceOracle) != address(0),
            "PriceOracle not initialized"
        );
        return priceOracle.getTokenAmountInUSD(token, amount);
    }

    /**
     * @dev [保持兼容] 重写父合约的 showEth2USD，仍然只查ETH
     *      新代码建议使用 getTokenPriceInUSD
     */
    function showEth2USD(
        uint256 amount
    ) external view override returns (uint256) {
        return getTokenPriceInUSD(address(0), amount);
    }

    // ============ 结束拍卖（V2版本，支持ERC20结算） ============

    /**
     * @dev V2 结束拍卖 — 同时支持 ETH 和 ERC20 出价的拍卖
     *      注意：这不是 override（父合约 endAuction 不是 virtual）
     *      它是一个独立的新函数，自动判断出价类型
     * @param auctionId 拍卖ID
     */
    function endAuctionV2(uint256 auctionId) external nonReentrant {
        Auction storage auction = acutionMaps[auctionId];
        require(auction.active, "Auction already closed");
        require(block.timestamp >= auction.endTime, "Auction is not ended");

        // CEI 模式：先改状态
        auction.active = false;

        if (auction.highestBidder != address(0)) {
            // 计算手续费
            uint256 fee = (auction.highestBid * platformFee) / 10000;
            uint256 sellerAmount = auction.highestBid - fee;

            // 转移 NFT
            IERC721(auction.nftContract).safeTransferFrom(
                auction.seller,
                auction.highestBidder,
                auction.tokenId
            );

            // 判断是 ETH 还是 ERC20 出价
            address bidToken = auctionBidToken[auctionId];

            if (bidToken == address(0)) {
                // === ETH 结算 ===
                (bool success1, ) = auction.seller.call{value: sellerAmount}(
                    ""
                );
                require(success1, "Seller ETH transfer failed");

                (bool success2, ) = feeReceiver.call{value: fee}("");
                require(success2, "FeeReceiver ETH transfer failed");
            } else {
                // === ERC20 结算 ===
                IERC20 token = IERC20(bidToken);

                (bool success1, ) = address(token).call(
                    abi.encodeWithSelector(
                        IERC20.transfer.selector,
                        auction.seller,
                        sellerAmount
                    )
                );
                require(success1, "Seller ERC20 transfer failed");

                (bool success2, ) = address(token).call(
                    abi.encodeWithSelector(
                        IERC20.transfer.selector,
                        feeReceiver,
                        fee
                    )
                );
                require(success2, "FeeReceiver ERC20 transfer failed");
            }

            emit AuctionEnd(
                auctionId,
                auction.highestBidder,
                auction.highestBid
            );
        } else {
            emit AuctionEnd(auctionId, address(0), 0);
        }
    }

    // ============ 提取退款（V2版本，支持ERC20退款） ============

    /**
     * @dev V2 提取退款 — 自动判断该拍卖是 ETH 还是 ERC20 出价，按对应方式退款
     * @param auctionId 拍卖ID
     */
    function withdrawV2(uint256 auctionId) external {
        Auction storage auction = acutionMaps[auctionId];
        require(!auction.active, "Auction is not closed");

        uint256 amount = pendingRefundMap[auctionId][_msgSender()];
        require(amount > 0, "No refund available");

        // CEI 模式
        pendingRefundMap[auctionId][_msgSender()] = 0;

        address bidToken = auctionBidToken[auctionId];

        if (bidToken == address(0)) {
            // ETH 退款
            (bool success, ) = _msgSender().call{value: amount}("");
            require(success, "ETH withdraw failed");
        } else {
            // ERC20 退款
            (bool success, ) = address(bidToken).call(
                abi.encodeWithSelector(
                    IERC20.transfer.selector,
                    _msgSender(),
                    amount
                )
            );
            require(success, "ERC20 withdraw failed");
        }
    }

    // 因为使用了3个状态变量，所以预留的存储间隙-3
    // ============ 存储间隙 ============
    uint256[47] private __gap;
}
