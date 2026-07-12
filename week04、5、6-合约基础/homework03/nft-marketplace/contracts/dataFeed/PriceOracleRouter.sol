// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/**
 * @title PriceOracleRouter 价格预言机路由器
 * @dev 统一管理多个代币对USD的Chainlink喂价地址
 *      不需要为每个ERC20单独部署预言机，只需在此注册对应Chainlink Feed地址即可
 * @notice 支持ETH和任意注册过的ERC20代币查询USD价格
 */
contract PriceOracleRouter {
    // ============ 常量 ============

    /// @notice ETH的虚拟地址标识（address(0)代表ETH，而非ERC20）
    address public constant ETH = address(0);

    // ============ 状态变量 ============

    /// @notice 每个代币对应的Chainlink Feed地址
    mapping(address => AggregatorV3Interface) public tokenPriceFeeds;

    /// @notice 每个代币Feed的精度（如ETH/USD feed通常是8位）
    mapping(address => uint8) public tokenFeedDecimals;

    /// @notice 支持的代币列表（用于遍历查询）
    address[] public supportedTokens;

    // ============ 事件 ============

    /// @notice 设置代币喂价地址时触发
    event TokenFeedSet(
        address indexed token,
        address indexed feed,
        uint8 decimals
    );

    /// @notice 移除代币喂价地址时触发
    event TokenFeedRemoved(address indexed token);

    // ============ 构造函数 ============

    /**
     * @dev 构造函数：默认设置ETH/USD feed
     * @param _ethFeed ETH/USD的Chainlink Feed地址
     * @param _ethFeedDecimals ETH/USD feed的精度（通常是8）
     */
    constructor(address _ethFeed, uint8 _ethFeedDecimals) {
        require(_ethFeed != address(0), "Invalid feed address");
        _setTokenFeed(ETH, _ethFeed, _ethFeedDecimals);
    }

    // ============ 管理函数 ============

    /**
     * @dev 设置或更新某个代币的喂价地址
     * @param token ERC20代币合约地址（ETH使用address(0)）
     * @param feed Chainlink AggregatorV3Interface合约地址
     * @param decimals feed的精度（通常是8）
     */
    function setTokenFeed(
        address token,
        address feed,
        uint8 decimals
    ) external {
        require(feed != address(0), "Invalid feed address");
        require(decimals > 0, "Invalid decimals");
        _setTokenFeed(token, feed, decimals);
    }

    /**
     * @dev 移除某个代币的喂价
     * @param token 要移除的代币地址
     */
    function removeTokenFeed(address token) external {
        require(
            address(tokenPriceFeeds[token]) != address(0),
            "Token feed not set"
        );
        delete tokenPriceFeeds[token];
        delete tokenFeedDecimals[token];

        // 从列表中移除：用最后一个元素覆盖再pop
        for (uint256 i = 0; i < supportedTokens.length; i++) {
            if (supportedTokens[i] == token) {
                supportedTokens[i] = supportedTokens[
                    supportedTokens.length - 1
                ];
                supportedTokens.pop();
                break;
            }
        }

        emit TokenFeedRemoved(token);
    }

    // ============ 查询函数 ============

    /**
     * @dev 获取某个代币的当前USD价格
     * @param token ERC20代币地址（ETH使用address(0)）
     * @return price 代币的USD价格（以18位精度返回，方便后续计算）
     * @return decimals feed的原始精度（如8）
     */
    function getTokenPriceUSD(
        address token
    ) public view returns (uint256 price, uint8 decimals) {
        AggregatorV3Interface feed = tokenPriceFeeds[token];
        require(address(feed) != address(0), "Token feed not found");

        decimals = tokenFeedDecimals[token];

        // prettier-ignore
        (
            /* uint80 roundId */,
            int256 answer,
            /* uint256 startedAt */,
            /* uint256 updatedAt */,
            /* uint80 answeredInRound */
        ) = feed.latestRoundData();

        require(answer > 0, "Invalid price");
        price = uint256(answer);
    }

    /**
     * @dev 获取指定数量的代币等值的USD金额
     * @param token ERC20代币地址（ETH使用address(0)）
     * @param amount 代币数量（使用代币自身精度）
     * @return usdAmount 等值的USD金额（18位精度）
     */
    function getTokenAmountInUSD(
        address token,
        uint256 amount
    ) public view returns (uint256 usdAmount) {
        require(amount > 0, "Invalid amount");
        (uint256 price, ) = getTokenPriceUSD(token);
        usdAmount = (amount * price) / 10 ** 8;
    }

    /**
     * @dev 获取支持的代币数量
     */
    function getSupportedTokenCount() external view returns (uint256) {
        return supportedTokens.length;
    }

    /**
     * @dev 获取所有支持的代币地址列表
     */
    function getSupportedTokenList() external view returns (address[] memory) {
        return supportedTokens;
    }

    // ============ 内部函数 ============

    /**
     * @dev 内部：设置喂价地址
     */
    function _setTokenFeed(
        address token,
        address feed,
        uint8 decimals
    ) internal {
        // 如果是新增代币（之前没注册过），加入列表
        if (
            address(tokenPriceFeeds[token]) == address(0) &&
            address(feed) != address(0)
        ) {
            supportedTokens.push(token);
        }

        tokenPriceFeeds[token] = AggregatorV3Interface(feed);
        tokenFeedDecimals[token] = decimals;

        emit TokenFeedSet(token, feed, decimals);
    }
}
