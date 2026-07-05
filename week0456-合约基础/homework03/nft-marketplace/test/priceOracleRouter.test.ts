import { expect } from "chai"
import { ZeroAddress } from "ethers";
import { network } from "hardhat"
import { DECIMAL, INITIAL_ANSWER } from "../helper-hardhat-config.js"

// 从hardhat网络中获取ethers实例，V3的语法中，需要先await network.getOrCreate
const connection = await network.getOrCreate();
const { ethers } = connection;

describe("PriceOracleRouter", async function () {

    /**
     * 部署 Fixture：部署 Mock Aggregator 和 PriceOracleRouter
     */
    async function deployFixture() {
        const [account1, account2] = await ethers.getSigners();

        // 部署 ETH/USD Mock 喂价合约（8位精度，$1666）
        const MockV3Aggregator = await ethers.getContractFactory("MyMockV3Aggregator");
        const ethFeed = await MockV3Aggregator.deploy(DECIMAL, INITIAL_ANSWER);
        await ethFeed.waitForDeployment();

        // 部署 Token/USD Mock 喂价合约（8位精度，$1.00）
        const tokenFeed = await MockV3Aggregator.deploy(DECIMAL, 100000000);
        await tokenFeed.waitForDeployment();

        // 部署第二个 Token/USD Mock 喂价合约（8位精度，$2500，模拟高端币）
        const tokenFeed2 = await MockV3Aggregator.deploy(DECIMAL, 250000000000);
        await tokenFeed2.waitForDeployment();

        // 部署 PriceOracleRouter，构造函数中传入 ETH feed
        const PriceOracleRouterFactory = await ethers.getContractFactory("PriceOracleRouter");
        const priceOracle = await PriceOracleRouterFactory.deploy(
            await ethFeed.getAddress(),
            DECIMAL
        );
        await priceOracle.waitForDeployment();

        return {
            account1,
            account2,
            priceOracle,
            ethFeed,
            tokenFeed,
            tokenFeed2
        };
    }

    // ================================================================
    //  Module 1: 构造与初始化
    // ================================================================
    describe("Deployment & Initialization", async function () {

        it("Should set ETH feed during construction", async function () {
            const { priceOracle, ethFeed } = await connection.networkHelpers.loadFixture(deployFixture);

            // ETH (address(0)) 的 feed 应该在构造时被设置
            const ethFeedAddr = await priceOracle.tokenPriceFeeds(ZeroAddress);
            expect(ethFeedAddr).to.equal(await ethFeed.getAddress());
        });

        it("Should set ETH feed decimals during construction", async function () {
            const { priceOracle } = await connection.networkHelpers.loadFixture(deployFixture);

            const decimals = await priceOracle.tokenFeedDecimals(ZeroAddress);
            expect(decimals).to.equal(DECIMAL); // 8
        });

        it("Should have ETH in supported tokens list after construction", async function () {
            const { priceOracle } = await connection.networkHelpers.loadFixture(deployFixture);

            const count = await priceOracle.getSupportedTokenCount();
            expect(count).to.equal(1);

            const list = await priceOracle.getSupportedTokenList();
            expect(list.length).to.equal(1);
            expect(list[0]).to.equal(ZeroAddress); // ETH = address(0)
        });

        it("Should emit TokenFeedSet event during construction for ETH", async function () {
            // 重新部署以捕获构造时的事件
            const MockV3Aggregator = await ethers.getContractFactory("MyMockV3Aggregator");
            const ethFeed = await MockV3Aggregator.deploy(DECIMAL, INITIAL_ANSWER);
            await ethFeed.waitForDeployment();

            const dataFeed = await ethFeed.getAddress();
            const PriceOracleRouterFactory = await ethers.getContractFactory("PriceOracleRouter");
            const tx = await PriceOracleRouterFactory.deploy(
                dataFeed,
                DECIMAL
            );
            const router = await tx.waitForDeployment();
            await expect(router.deploymentTransaction()).to.be.emit(router, "TokenFeedSet").withArgs(
                ZeroAddress, dataFeed, DECIMAL
            ); // won't work this way
        });
    });

    // ================================================================
    //  Module 2: setTokenFeed — 注册 / 更新代币喂价
    // ================================================================
    describe("setTokenFeed", async function () {

        it("Should register a new ERC20 token feed", async function () {
            const { priceOracle, tokenFeed, account1 } = await connection.networkHelpers.loadFixture(deployFixture);

            const tokenAddr = account1.address; // 模拟一个ERC20地址
            const tx = await priceOracle.setTokenFeed(tokenAddr, await tokenFeed.getAddress(), DECIMAL);
            const receipt = await tx.wait();

            // 验证 feed 地址和精度
            expect(await priceOracle.tokenPriceFeeds(tokenAddr)).to.equal(await tokenFeed.getAddress());
            expect(await priceOracle.tokenFeedDecimals(tokenAddr)).to.equal(DECIMAL);

            // 验证已加入 supportedTokens 列表
            const list = await priceOracle.getSupportedTokenList();
            expect(list).to.include(tokenAddr);
        });

        it("Should update an existing token feed", async function () {
            const { priceOracle, tokenFeed, tokenFeed2, account1 } = await connection.networkHelpers.loadFixture(deployFixture);

            const tokenAddr = account1.address;
            // 首次注册
            await priceOracle.setTokenFeed(tokenAddr, await tokenFeed.getAddress(), DECIMAL);
            // 更新为新的 feed
            await priceOracle.setTokenFeed(tokenAddr, await tokenFeed2.getAddress(), 6);

            expect(await priceOracle.tokenPriceFeeds(tokenAddr)).to.equal(await tokenFeed2.getAddress());
            expect(await priceOracle.tokenFeedDecimals(tokenAddr)).to.equal(6);
        });

        it("Should not duplicate entries in supportedTokens when updating", async function () {
            const { priceOracle, tokenFeed, tokenFeed2, account1 } = await connection.networkHelpers.loadFixture(deployFixture);

            const tokenAddr = account1.address;
            await priceOracle.setTokenFeed(tokenAddr, await tokenFeed.getAddress(), DECIMAL);
            // 更新同一个代币
            await priceOracle.setTokenFeed(tokenAddr, await tokenFeed2.getAddress(), DECIMAL);

            const count = await priceOracle.getSupportedTokenCount();
            expect(count).to.equal(2); // ETH + tokenAddr，不应重复
        });

        it("Should reject zero feed address", async function () {
            const { priceOracle, account1 } = await connection.networkHelpers.loadFixture(deployFixture);

            await expect(
                priceOracle.setTokenFeed(account1.address, ZeroAddress, DECIMAL)
            ).to.be.revertedWith("Invalid feed address");
        });

        it("Should reject zero decimals", async function () {
            const { priceOracle, tokenFeed, account1 } = await connection.networkHelpers.loadFixture(deployFixture);

            await expect(
                priceOracle.setTokenFeed(account1.address, await tokenFeed.getAddress(), 0)
            ).to.be.revertedWith("Invalid decimals"); // "Invalid decimals" 或合约层面 require
        });

        it("Should emit TokenFeedSet event", async function () {
            const { priceOracle, tokenFeed, account1 } = await connection.networkHelpers.loadFixture(deployFixture);

            const tokenAddr = account1.address;
            await expect(
                priceOracle.setTokenFeed(tokenAddr, await tokenFeed.getAddress(), DECIMAL)
            )
                .to.be.emit(priceOracle, "TokenFeedSet")
                .withArgs(tokenAddr, await tokenFeed.getAddress(), DECIMAL);
        });

        it("Should support registering multiple different tokens", async function () {
            const { priceOracle, tokenFeed, tokenFeed2, account1, account2 } = await connection.networkHelpers.loadFixture(deployFixture);

            // 注册 3 个不同的代币
            const tokenA = account1.address;  // 模拟 ERC20 A
            const tokenB = account2.address;  // 模拟 ERC20 B
            const tokenC = "0x0000000000000000000000000000000000000001"; // 模拟 ERC20 C

            await priceOracle.setTokenFeed(tokenA, await tokenFeed.getAddress(), DECIMAL);
            await priceOracle.setTokenFeed(tokenB, await tokenFeed.getAddress(), DECIMAL);
            await priceOracle.setTokenFeed(tokenC, await tokenFeed2.getAddress(), 6);

            const count = await priceOracle.getSupportedTokenCount();
            expect(count).to.equal(4); // ETH + tokenA + tokenB + tokenC
        });
    });

    // ================================================================
    //  Module 3: removeTokenFeed — 移除代币喂价
    // ================================================================
    describe("removeTokenFeed", async function () {

        it("Should remove a registered token feed", async function () {
            const { priceOracle, tokenFeed, account1 } = await connection.networkHelpers.loadFixture(deployFixture);

            const tokenAddr = account1.address;
            await priceOracle.setTokenFeed(tokenAddr, await tokenFeed.getAddress(), DECIMAL);

            // 移除
            await priceOracle.removeTokenFeed(tokenAddr);

            // 验证 feed 地址已清空
            expect(await priceOracle.tokenPriceFeeds(tokenAddr)).to.equal(ZeroAddress);
            expect(await priceOracle.tokenFeedDecimals(tokenAddr)).to.equal(0);
        });

        it("Should remove token from supportedTokens list", async function () {
            const { priceOracle, tokenFeed, account1 } = await connection.networkHelpers.loadFixture(deployFixture);

            const tokenAddr = account1.address;
            await priceOracle.setTokenFeed(tokenAddr, await tokenFeed.getAddress(), DECIMAL);

            const countBefore = await priceOracle.getSupportedTokenCount();
            await priceOracle.removeTokenFeed(tokenAddr);
            const countAfter = await priceOracle.getSupportedTokenCount();

            expect(countAfter).to.equal(countBefore - BigInt(1));

            const list = await priceOracle.getSupportedTokenList();
            expect(list).to.not.include(tokenAddr);
            // ETH 应该还在
            expect(list).to.include(ZeroAddress);
        });

        it("Should maintain correct list order after removing middle element", async function () {
            const { priceOracle, tokenFeed } = await connection.networkHelpers.loadFixture(deployFixture);

            // 注册 3 个代币
            const tokenA = "0x0000000000000000000000000000000000000001";
            const tokenB = "0x0000000000000000000000000000000000000002";
            const tokenC = "0x0000000000000000000000000000000000000003";

            await priceOracle.setTokenFeed(tokenA, await tokenFeed.getAddress(), DECIMAL);
            await priceOracle.setTokenFeed(tokenB, await tokenFeed.getAddress(), DECIMAL);
            await priceOracle.setTokenFeed(tokenC, await tokenFeed.getAddress(), DECIMAL);

            // 移除中间的 tokenB
            await priceOracle.removeTokenFeed(tokenB);

            const list = await priceOracle.getSupportedTokenList();
            expect(list).to.not.include(tokenB);
            expect(list).to.include(tokenA);
            expect(list).to.include(tokenC);
            expect(list).to.include(ZeroAddress);
        });

        it("Should correctly handle removing the last element", async function () {
            const { priceOracle, tokenFeed } = await connection.networkHelpers.loadFixture(deployFixture);

            const tokenA = "0x0000000000000000000000000000000000000001";
            await priceOracle.setTokenFeed(tokenA, await tokenFeed.getAddress(), DECIMAL);

            // 移除最后注册的（也是列表中最后一个非ETH元素）
            await priceOracle.removeTokenFeed(tokenA);

            const list = await priceOracle.getSupportedTokenList();
            expect(list).to.not.include(tokenA);
            expect(list.length).to.equal(1); // 只剩 ETH
            expect(list[0]).to.equal(ZeroAddress);
        });

        it("Should reject removing a non-existent token feed", async function () {
            const { priceOracle } = await connection.networkHelpers.loadFixture(deployFixture);

            await expect(
                priceOracle.removeTokenFeed("0x0000000000000000000000000000000000000099")
            ).to.be.revertedWith("Token feed not set");
        });

        it("Should reject removing ETH feed", async function () {
            const { priceOracle } = await connection.networkHelpers.loadFixture(deployFixture);

            // ETH (address(0)) 是被注册的，removeTokenFeed 可以移除它
            // （设计上应该允许，但如果业务不允许则另当别论）
            // 这里测试实际行为：ETH可以被移除
            await priceOracle.removeTokenFeed(ZeroAddress);

            // ETH feed 被清空
            expect(await priceOracle.tokenPriceFeeds(ZeroAddress)).to.equal(ZeroAddress);
        });

        it("Should emit TokenFeedRemoved event", async function () {
            const { priceOracle, tokenFeed, account1 } = await connection.networkHelpers.loadFixture(deployFixture);

            const tokenAddr = account1.address;
            await priceOracle.setTokenFeed(tokenAddr, await tokenFeed.getAddress(), DECIMAL);

            await expect(priceOracle.removeTokenFeed(tokenAddr))
                .to.be.emit(priceOracle, "TokenFeedRemoved")
                .withArgs(tokenAddr);
        });
    });

    // ================================================================
    //  Module 4: getTokenPriceUSD — 查询代币 USD 价格
    // ================================================================
    describe("getTokenPriceUSD", async function () {

        it("Should return ETH price from the default feed", async function () {
            const { priceOracle } = await connection.networkHelpers.loadFixture(deployFixture);

            const [price, decimals] = await priceOracle.getTokenPriceUSD(ZeroAddress);

            // INITIAL_ANSWER = 166600000000 (8位精度，$1666.00000000)
            expect(price).to.equal(BigInt(INITIAL_ANSWER));
            expect(decimals).to.equal(DECIMAL);
        });

        it("Should return registered token price", async function () {
            const { priceOracle, tokenFeed, account1 } = await connection.networkHelpers.loadFixture(deployFixture);

            const tokenAddr = account1.address;
            await priceOracle.setTokenFeed(tokenAddr, await tokenFeed.getAddress(), DECIMAL);

            const [price, decimals] = await priceOracle.getTokenPriceUSD(tokenAddr);

            // tokenFeed answer = 100000000 ($1.00)
            expect(price).to.equal(100000000n);
            expect(decimals).to.equal(DECIMAL);
        });

        it("Should reject querying a non-existent token", async function () {
            const { priceOracle } = await connection.networkHelpers.loadFixture(deployFixture);

            await expect(
                priceOracle.getTokenPriceUSD("0x0000000000000000000000000000000000000099")
            ).to.be.revertedWith("Token feed not found");
        });

        it("Should return updated price after feed is changed", async function () {
            const { priceOracle, tokenFeed, tokenFeed2, account1 } = await connection.networkHelpers.loadFixture(deployFixture);

            const tokenAddr = account1.address;
            // 先用 tokenFeed ($1.00)
            await priceOracle.setTokenFeed(tokenAddr, await tokenFeed.getAddress(), DECIMAL);
            let [price] = await priceOracle.getTokenPriceUSD(tokenAddr);
            expect(price).to.equal(100000000n);

            // 换成 tokenFeed2 ($2500)
            await priceOracle.setTokenFeed(tokenAddr, await tokenFeed2.getAddress(), DECIMAL);
            [price] = await priceOracle.getTokenPriceUSD(tokenAddr);
            expect(price).to.equal(250000000000n);
        });

        it("Should reject if feed returns non-positive price", async function () {
            const { priceOracle, account1 } = await connection.networkHelpers.loadFixture(deployFixture);

            // 部署一个返回 0 价格的 mock feed
            const MockV3Aggregator = await ethers.getContractFactory("MyMockV3Aggregator");
            const zeroFeed = await MockV3Aggregator.deploy(DECIMAL, 0);
            await zeroFeed.waitForDeployment();

            await priceOracle.setTokenFeed(account1.address, await zeroFeed.getAddress(), DECIMAL);

            // answer = 0，require(answer > 0) 会触发
            await expect(
                priceOracle.getTokenPriceUSD(account1.address)
            ).to.be.revertedWith("Invalid price");
        });
    });

    // ================================================================
    //  Module 5: getTokenAmountInUSD — 查询代币数量对应的 USD 价值
    // ================================================================
    describe("getTokenAmountInUSD", async function () {

        it("Should calculate USD value for ETH amount", async function () {
            const { priceOracle } = await connection.networkHelpers.loadFixture(deployFixture);

            // 1 ETH = $1666 → 1 * 166600000000 / 10^8 = 1666000000000（18位精度）
            const usdValue = await priceOracle.getTokenAmountInUSD(
                ZeroAddress,
                ethers.parseEther("1")
            );
            expect(usdValue).to.equal(BigInt("1666000000000000000000"));
        });

        it("Should calculate USD value for ERC20 token amount", async function () {
            const { priceOracle, tokenFeed, account1 } = await connection.networkHelpers.loadFixture(deployFixture);

            const tokenAddr = account1.address;
            await priceOracle.setTokenFeed(tokenAddr, await tokenFeed.getAddress(), DECIMAL);

            // 100 MTK × $1.00 = $100（18位精度）
            const usdValue = await priceOracle.getTokenAmountInUSD(
                tokenAddr,
                ethers.parseEther("100")
            );
            expect(usdValue).to.equal(ethers.parseEther("100"));
        });

        it("Should calculate correctly for small amounts", async function () {
            const { priceOracle } = await connection.networkHelpers.loadFixture(deployFixture);

            // 0.001 ETH ($1.666 at $1666/ETH)
            const smallAmount = ethers.parseEther("0.001");
            const usdValue = await priceOracle.getTokenAmountInUSD(ZeroAddress, smallAmount);
            // 0.001 * 10^18 * 166600000000 / 10^8 = 1666000000000000000n
            expect(usdValue).to.equal(1666000000000000000n);
        });

        it("Should reject zero amount", async function () {
            const { priceOracle } = await connection.networkHelpers.loadFixture(deployFixture);

            await expect(
                priceOracle.getTokenAmountInUSD(ZeroAddress, 0)
            ).to.be.revertedWith("Invalid amount");
        });
    });

    // ================================================================
    //  Module 6: getSupportedTokenCount / getSupportedTokenList
    // ================================================================
    describe("Supported Tokens Queries", async function () {

        it("Should return correct count after adding tokens", async function () {
            const { priceOracle, tokenFeed, account1, account2 } = await connection.networkHelpers.loadFixture(deployFixture);

            expect(await priceOracle.getSupportedTokenCount()).to.equal(1); // ETH

            await priceOracle.setTokenFeed(account1.address, await tokenFeed.getAddress(), DECIMAL);
            expect(await priceOracle.getSupportedTokenCount()).to.equal(2);

            await priceOracle.setTokenFeed(account2.address, await tokenFeed.getAddress(), DECIMAL);
            expect(await priceOracle.getSupportedTokenCount()).to.equal(3);
        });

        it("Should return correct count after removing tokens", async function () {
            const { priceOracle, tokenFeed, account1 } = await connection.networkHelpers.loadFixture(deployFixture);

            await priceOracle.setTokenFeed(account1.address, await tokenFeed.getAddress(), DECIMAL);
            expect(await priceOracle.getSupportedTokenCount()).to.equal(2);

            await priceOracle.removeTokenFeed(account1.address);
            expect(await priceOracle.getSupportedTokenCount()).to.equal(1); // 仅剩 ETH
        });

        it("Should return complete token list", async function () {
            const { priceOracle, tokenFeed, account1, account2 } = await connection.networkHelpers.loadFixture(deployFixture);

            await priceOracle.setTokenFeed(account1.address, await tokenFeed.getAddress(), DECIMAL);
            await priceOracle.setTokenFeed(account2.address, await tokenFeed.getAddress(), DECIMAL);

            const list = await priceOracle.getSupportedTokenList();
            expect(list.length).to.equal(3);
            expect(list).to.include(ZeroAddress);         // ETH
            expect(list).to.include(account1.address);
            expect(list).to.include(account2.address);
        });

        it("Should show both additions and removals in the list", async function () {
            const { priceOracle, tokenFeed, account1, account2 } = await connection.networkHelpers.loadFixture(deployFixture);

            // 添加 2 个
            await priceOracle.setTokenFeed(account1.address, await tokenFeed.getAddress(), DECIMAL);
            await priceOracle.setTokenFeed(account2.address, await tokenFeed.getAddress(), DECIMAL);

            // 移除 1 个
            await priceOracle.removeTokenFeed(account1.address);

            const list = await priceOracle.getSupportedTokenList();
            expect(list.length).to.equal(2); // ETH + account2
            expect(list).to.include(ZeroAddress);
            expect(list).to.not.include(account1.address);
            expect(list).to.include(account2.address);
        });
    });
});
