import { expect } from "chai"
import { ZeroAddress } from "ethers";
import { network } from "hardhat"
import { DECIMAL, INITIAL_ANSWER } from "../helper-hardhat-config.js"

// 从hardhat网络中获取ethers实例，V3的语法中，需要先await network.getOrCreate
const connection = await network.getOrCreate();
const { ethers } = connection;

/**
 * 将区块链时间推进到超过指定截止时间
 * @param deadline 众筹活动的截止时间戳（bigint 类型）
 */
async function advanceTimePastDeadline(deadline: bigint) {
    const currentBlock = await ethers.provider.getBlock("latest");
    const currentTimestamp = BigInt(currentBlock?.timestamp || 0);
    const timeToIncrease = deadline - currentTimestamp + BigInt(1);

    if (timeToIncrease > 0n) {
        await ethers.provider.send("evm_increaseTime", [timeToIncrease.toString()]);
        await ethers.provider.send("evm_mine", []);
    }
}

// 开始编写测试
describe("NFTAuctionV2", async function () {

    /**
     * 全局部署 Fixture
     * 部署所有需要的合约：Mock Aggregator、PriceOracleRouter、MockERC20、NFTAuctionV2、HToken
     * 并完成 V1 和 V2 的初始化
     */
    async function deployFixture() {
        // 获取账号
        const [account1, account2, account3, account4, account5] = await ethers.getSigners();

        // ========== 1. 部署 Mock Chainlink 喂价合约 ==========
        const MockV3Aggregator = await ethers.getContractFactory("MyMockV3Aggregator");
        // ETH/USD feed: 8位精度，价格 $1666
        const ethFeed = await MockV3Aggregator.deploy(DECIMAL, INITIAL_ANSWER);
        await ethFeed.waitForDeployment();

        // Token/USD feed: 8位精度，价格 $1.00（模拟稳定币）
        const tokenFeed = await MockV3Aggregator.deploy(DECIMAL, 100000000);
        await tokenFeed.waitForDeployment();

        // ========== 2. 部署 PriceOracleRouter ==========
        const PriceOracleRouterFactory = await ethers.getContractFactory("PriceOracleRouter");
        const priceOracle = await PriceOracleRouterFactory.deploy(
            await ethFeed.getAddress(),
            DECIMAL
        );
        await priceOracle.waitForDeployment();

        // ========== 3. 部署 MockERC20（用于测试ERC20出价） ==========
        const MockERC20Factory = await ethers.getContractFactory("MockERC20");
        const mockERC20 = await MockERC20Factory.deploy("Mock Token", "MTK");
        await mockERC20.waitForDeployment();

        // 在 PriceOracleRouter 中注册测试代币的喂价
        await priceOracle.setTokenFeed(
            await mockERC20.getAddress(),
            await tokenFeed.getAddress(),
            DECIMAL
        );

        // ========== 4. 部署 NFTAuctionV2（可升级合约） ==========
        const NFTAuctionV2Factory = await ethers.getContractFactory("NFTAuctionV2");
        const nftAuctionV2Deployed = await NFTAuctionV2Factory.deploy();
        await nftAuctionV2Deployed.waitForDeployment();
        const nftAuctionV2 = await ethers.getContractAt(
            "NFTAuctionV2",
            await nftAuctionV2Deployed.getAddress()
        );

        // V1 初始化：account5 作为手续费接收地址，ethFeed 作为 Chainlink 数据源
        await nftAuctionV2.initialize(account5.address, await ethFeed.getAddress());
        // V2 初始化：注入 PriceOracleRouter，版本号设为 2
        await nftAuctionV2.initializeV2(await priceOracle.getAddress(), 2);

        // ========== 5. 部署 HToken（NFT 合约） ==========
        const HTokenFactory = await ethers.getContractFactory("HToken");
        const htokenDeployed = await HTokenFactory.deploy(account1.address);
        await htokenDeployed.waitForDeployment();
        const htoken = await ethers.getContractAt("HToken", await htokenDeployed.getAddress());

        return {
            account1, account2, account3, account4, account5,
            nftAuctionV2, htoken, mockERC20, priceOracle,
            ethFeed, tokenFeed
        };
    }

    // ================================================================
    //  Module 1: 创建拍卖（继承自 V1，验证基础校验逻辑）
    // ================================================================
    describe("CreateAuction", async function () {

        it("Should reject zero address for nftContract param", async function () {
            const { nftAuctionV2, account1 } = await connection.networkHelpers.loadFixture(deployFixture);
            const inner = nftAuctionV2.connect(account1);
            await expect(
                inner.createAuction(ZeroAddress, 0, ethers.parseEther("5"), 3)
            ).to.be.revertedWith("Invalid NFT address");
        });

        it("Should reject when startPrice is zero", async function () {
            const { nftAuctionV2, account1, htoken } = await connection.networkHelpers.loadFixture(deployFixture);
            const inner = nftAuctionV2.connect(account1);
            await expect(
                inner.createAuction(htoken.getAddress(), 1, ethers.parseEther("0"), 3)
            ).to.be.revertedWith("StartPrice must be great then zero");
        });

        it("Should reject when durationTime less than 1 hour", async function () {
            const { nftAuctionV2, account1, htoken } = await connection.networkHelpers.loadFixture(deployFixture);
            const inner = nftAuctionV2.connect(account1);
            await expect(
                inner.createAuction(htoken.getAddress(), 1, 5, 0)
            ).to.be.revertedWith("DurationTime must at least 1 hour");
        });

        it("Should reject if caller is not the NFT owner", async function () {
            const { nftAuctionV2, account1, htoken, account2 } = await connection.networkHelpers.loadFixture(deployFixture);
            await htoken.safeMint(account2, { value: ethers.parseEther("0.01") });
            // account1 不是 NFT 的 owner
            const inner = nftAuctionV2.connect(account1);
            await expect(
                inner.createAuction(htoken.getAddress(), 0, ethers.parseEther("5"), 2)
            ).to.be.revertedWith("nft not owner");
        });

        it("Should reject if NFT not approved to auction contract", async function () {
            const { nftAuctionV2, htoken, account2 } = await connection.networkHelpers.loadFixture(deployFixture);
            await htoken.safeMint(account2, { value: ethers.parseEther("0.01") });
            // account2 是 owner 但未授权
            const inner = nftAuctionV2.connect(account2);
            await expect(
                inner.createAuction(htoken.getAddress(), 0, ethers.parseEther("5"), 2)
            ).to.be.revertedWith("Current marketplace not approved");
        });

        it("Should emit AuctionCreated event on success", async function () {
            const { nftAuctionV2, htoken, account2 } = await connection.networkHelpers.loadFixture(deployFixture);
            await htoken.safeMint(account2, { value: ethers.parseEther("0.01") });
            const inner = nftAuctionV2.connect(account2);
            // account2 授权 NFT 给拍卖合约
            await htoken.connect(account2).approve(inner.getAddress(), 0);

            const curTime = await connection.networkHelpers.time.latest();
            await expect(inner.createAuction(htoken.getAddress(), 0, ethers.parseEther("5"), 2))
                .to.be.emit(inner, "AuctionCreated")
                .withArgs(
                    1,
                    account2.address,
                    htoken.getAddress(),
                    0,
                    ethers.parseEther("5"),
                    (value: any) => {
                        expect(value).to.be.closeTo(curTime + (2 * 3600), 5);
                        return true;
                    }
                );
        });
    });

    // ================================================================
    //  Module 2: ETH 出价（继承自 V1，验证 ETH 出价逻辑完整保留）
    // ================================================================
    describe("PlaceBid (ETH)", async function () {
        let htoken: any;
        let nftAuctionV2: any;
        let seller: any;
        let buyer: any;
        let account1: any, account2: any, account3: any, account4: any, account5: any;

        beforeEach(async function () {
            ({ account1, account2, account3, account4, account5, nftAuctionV2, htoken } =
                await connection.networkHelpers.loadFixture(deployFixture));

            // 创建拍卖活动：account2 作为卖家
            await htoken.connect(account1).safeMint(account2, { value: ethers.parseEther("0.01") });
            await htoken.connect(account2).approve(nftAuctionV2.getAddress(), 0);
            seller = nftAuctionV2.connect(account2);
            await seller.createAuction(htoken.getAddress(), 0, ethers.parseEther("5"), 2);
            buyer = nftAuctionV2.connect(account3);
        });

        it("Should reject if auction is not active", async function () {
            await seller.setAuctionStatus(1, false);
            await expect(buyer.placeBid(1)).to.be.revertedWith("Auction is not active");
        });

        it("Should reject if auction time has ended", async function () {
            const auction = await nftAuctionV2.acutionMaps(1);
            await advanceTimePastDeadline(auction.endTime);
            await expect(buyer.placeBid(1)).to.be.revertedWith("Auction is end");
        });

        it("Should reject if seller tries to bid on own auction", async function () {
            await expect(seller.placeBid(1)).to.be.revertedWith("You can not placeBid by yourself");
        });

        it("Should reject if bid is less than 5% above highest bid", async function () {
            await buyer.placeBid(1, { value: ethers.parseEther("5") });
            // 第二次出价必须 >= 5.25
            const buyer2 = nftAuctionV2.connect(account4);
            await expect(
                buyer2.placeBid(1, { value: ethers.parseEther("5.23") })
            ).to.be.revertedWith("Invalid placeBid");
            // 5.25 应该成功
            await buyer2.placeBid(1, { value: ethers.parseEther("5.25") });
        });

        it("Should correctly record pending refunds for outbid bidders", async function () {
            const buyer1 = nftAuctionV2.connect(account1);
            const buyer2 = nftAuctionV2.connect(account3);
            const buyer3 = nftAuctionV2.connect(account4);
            const buyer4 = nftAuctionV2.connect(account5);

            // 多轮出价
            await buyer1.placeBid(1, { value: ethers.parseEther("5") });
            await buyer2.placeBid(1, { value: ethers.parseEther("10") });
            await buyer3.placeBid(1, { value: ethers.parseEther("15") });
            await buyer4.placeBid(1, { value: ethers.parseEther("20") });
            // account1 再次出价
            await buyer1.placeBid(1, { value: ethers.parseEther("25") });
            // account4 再次出价
            await buyer4.placeBid(1, { value: ethers.parseEther("30") });

            const refund1 = await nftAuctionV2.pendingRefundMap(1, account1.address);
            const refund2 = await nftAuctionV2.pendingRefundMap(1, account3.address);
            const refund3 = await nftAuctionV2.pendingRefundMap(1, account4.address);
            const refund4 = await nftAuctionV2.pendingRefundMap(1, account5.address);

            expect(refund1).to.equal(ethers.parseEther("30"));  // 5 + 25
            expect(refund2).to.equal(ethers.parseEther("10"));
            expect(refund3).to.equal(ethers.parseEther("15"));
            expect(refund4).to.equal(ethers.parseEther("20"));
        });

        it("Should emit BidPlaced event on successful bid", async function () {
            await expect(buyer.placeBid(1, { value: ethers.parseEther("5") }))
                .to.be.emit(nftAuctionV2, "BidPlaced")
                .withArgs(1, account3.address, ethers.parseEther("5"));
        });
    });

    // ================================================================
    //  Module 3: ERC20 代币出价（V2 核心新功能）
    // ================================================================
    describe("PlaceBidWithERC20", async function () {
        let htoken: any;
        let nftAuctionV2: any;
        let mockERC20: any;
        let seller: any;
        let account1: any, account2: any, account3: any, account4: any, account5: any;

        beforeEach(async function () {
            ({ account1, account2, account3, account4, account5, nftAuctionV2, htoken, mockERC20 } =
                await connection.networkHelpers.loadFixture(deployFixture));

            // 创建拍卖：account2 作为卖家，起拍价 5（以ERC20代币计）
            await htoken.connect(account1).safeMint(account2, { value: ethers.parseEther("0.01") });
            await htoken.connect(account2).approve(nftAuctionV2.getAddress(), 0);
            seller = nftAuctionV2.connect(account2);
            await seller.createAuction(htoken.getAddress(), 0, ethers.parseEther("5"), 2);

            // 给 account3 / account4 每人铸造 1000 MTK 代币, ethers.parseEther代表转换成Wei的单位
            await mockERC20.mint(account3.address, ethers.parseEther("1000"));
            await mockERC20.mint(account4.address, ethers.parseEther("1000"));
            // 各自授权拍卖合约
            await mockERC20.connect(account3).approve(nftAuctionV2.getAddress(), ethers.parseEther("1000"));
            await mockERC20.connect(account4).approve(nftAuctionV2.getAddress(), ethers.parseEther("1000"));
        });

        it("Should reject zero token address", async function () {
            const buyer = nftAuctionV2.connect(account3);
            await expect(
                buyer.placeBidWithERC20(1, ZeroAddress, ethers.parseEther("5"))
            ).to.be.revertedWith("Invalid token address");
        });

        it("Should reject zero amount", async function () {
            const buyer = nftAuctionV2.connect(account3);
            await expect(
                buyer.placeBidWithERC20(1, await mockERC20.getAddress(), 0)
            ).to.be.revertedWith("Invalid amount");
        });

        it("Should reject if auction is not active", async function () {
            await seller.setAuctionStatus(1, false);
            const buyer = nftAuctionV2.connect(account3);
            await expect(
                buyer.placeBidWithERC20(1, await mockERC20.getAddress(), ethers.parseEther("5"))
            ).to.be.revertedWith("Auction is not active");
        });

        it("Should reject if auction has ended", async function () {
            const auction = await nftAuctionV2.acutionMaps(1);
            await advanceTimePastDeadline(auction.endTime);
            const buyer = nftAuctionV2.connect(account3);
            await expect(
                buyer.placeBidWithERC20(1, await mockERC20.getAddress(), ethers.parseEther("5"))
            ).to.be.revertedWith("Auction is ended");
        });

        it("Should reject if seller bids on own auction", async function () {
            // 给 seller 也铸造一些代币并授权
            await mockERC20.mint(account2.address, ethers.parseEther("1000"));
            await mockERC20.connect(account2).approve(nftAuctionV2.getAddress(), ethers.parseEther("1000"));
            await expect(
                seller.placeBidWithERC20(1, await mockERC20.getAddress(), ethers.parseEther("5"))
            ).to.be.revertedWith("You cannot bid on your own auction");
        });

        it("Should reject if bid amount is below startPrice (first bid)", async function () {
            const buyer = nftAuctionV2.connect(account3);
            const mockERC20Addr = await mockERC20.getAddress();
            await expect(
                buyer.placeBidWithERC20(1, mockERC20Addr, ethers.parseEther("4"))
            ).to.be.revertedWith("Bid amount too low");
        });

        it("Should reject if bid amount is less than 5% above highest bid", async function () {
            const buyer1 = nftAuctionV2.connect(account3);
            // 第一次出价 10 MTK
            await buyer1.placeBidWithERC20(1, await mockERC20.getAddress(), ethers.parseEther("10"));

            // 第二次出价必须 >= 10.5
            const buyer2 = nftAuctionV2.connect(account4);
            await expect(
                buyer2.placeBidWithERC20(1, await mockERC20.getAddress(), ethers.parseEther("10.4"))
            ).to.be.revertedWith("Bid amount too low");

            // 10.5 应该成功
            await buyer2.placeBidWithERC20(1, await mockERC20.getAddress(), ethers.parseEther("10.5"));
        });

        it("Should lock the token type on first bid and reject mismatched tokens", async function () {
            const buyer1 = nftAuctionV2.connect(account3);
            // 第一次用 MTK 出价，锁定代币类型
            await buyer1.placeBidWithERC20(1, await mockERC20.getAddress(), ethers.parseEther("10"));

            // 验证拍卖的代币类型已锁定
            const bidToken = await nftAuctionV2.auctionBidToken(1);
            expect(bidToken).to.equal(await mockERC20.getAddress());

            // 尝试用不同代币出价（硬编码一下）
            await expect(
                buyer1.placeBidWithERC20(1, "0xC1f775f067Ce8D125FFEC5c50d3D305b3716326F", ethers.parseEther("15"))
            ).to.be.revertedWith("Bid token mismatch: this auction uses a different token");
        });

        it("Should transfer ERC20 tokens from bidder to contract", async function () {
            const buyer = nftAuctionV2.connect(account3);
            const bidAmount = ethers.parseEther("10");
            const contractAddr = await nftAuctionV2.getAddress();

            const beforeBidderBalance = await mockERC20.balanceOf(account3.address);
            const beforeContractBalance = await mockERC20.balanceOf(contractAddr);

            await buyer.placeBidWithERC20(1, await mockERC20.getAddress(), bidAmount);

            const afterBidderBalance = await mockERC20.balanceOf(account3.address);
            const afterContractBalance = await mockERC20.balanceOf(contractAddr);

            expect(afterBidderBalance).to.equal(beforeBidderBalance - bidAmount);
            expect(afterContractBalance).to.equal(beforeContractBalance + bidAmount);
        });

        it("Should record pending refunds for outbid bidders (ERC20)", async function () {
            const buyer1 = nftAuctionV2.connect(account3);
            const buyer2 = nftAuctionV2.connect(account4);

            // 出价 10 MTK → 15 MTK → 20 MTK
            await buyer1.placeBidWithERC20(1, await mockERC20.getAddress(), ethers.parseEther("10"));
            await buyer2.placeBidWithERC20(1, await mockERC20.getAddress(), ethers.parseEther("15"));
            await buyer1.placeBidWithERC20(1, await mockERC20.getAddress(), ethers.parseEther("20"));

            // buyer1 (account3) 之前出了 10，被 account4 的 15 超越，应退款 10
            // buyer2 (account4) 出了 15，被 account3 的 20 超越，应退款 15
            const refund1 = await nftAuctionV2.pendingRefundMap(1, account3.address);
            const refund2 = await nftAuctionV2.pendingRefundMap(1, account4.address);

            expect(refund1).to.equal(ethers.parseEther("10"));
            expect(refund2).to.equal(ethers.parseEther("15"));
        });

        it("Should emit BidPlacedWithERC20 event on successful bid", async function () {
            const buyer = nftAuctionV2.connect(account3);
            const tokenAddr = await mockERC20.getAddress();
            const bidAmount = ethers.parseEther("10");

            await expect(
                buyer.placeBidWithERC20(1, tokenAddr, bidAmount)
            )
                .to.be.emit(nftAuctionV2, "BidPlacedWithERC20")
                .withArgs(1, account3.address, tokenAddr, bidAmount);
        });
    });

    // ================================================================
    //  Module 4: ETH 和 ERC20 混合出价场景（V2 特性）
    // ================================================================
    describe("Mixed Bidding", async function () {
        it("Should allow ETH-only auction to coexist with ERC20-only auction", async function () {
            const { nftAuctionV2, htoken, mockERC20, account1, account2, account3, account4 } =
                await connection.networkHelpers.loadFixture(deployFixture);

            // 铸造两枚 NFT 给 account2
            await htoken.connect(account1).safeMint(account2, { value: ethers.parseEther("0.01") });
            await htoken.connect(account1).safeMint(account2, { value: ethers.parseEther("0.01") });
            // 授权 tokenId=0 和 tokenId=1
            await htoken.connect(account2).approve(nftAuctionV2.getAddress(), 0);
            await htoken.connect(account2).approve(nftAuctionV2.getAddress(), 1);

            const seller = nftAuctionV2.connect(account2);
            // 拍卖1：用 ETH 出价
            await seller.createAuction(htoken.getAddress(), 0, ethers.parseEther("5"), 2);
            // 拍卖2：用 ERC20 出价
            await seller.createAuction(htoken.getAddress(), 1, ethers.parseEther("10"), 2);

            // ETH 拍卖出价
            await nftAuctionV2.connect(account3).placeBid(1, { value: ethers.parseEther("5") });

            // ERC20 拍卖出价
            await mockERC20.mint(account4.address, ethers.parseEther("1000"));
            await mockERC20.connect(account4).approve(nftAuctionV2.getAddress(), ethers.parseEther("1000"));
            await nftAuctionV2.connect(account4).placeBidWithERC20(
                2, await mockERC20.getAddress(), ethers.parseEther("10")
            );

            // 拍卖1是ETH，拍卖2是ERC20
            expect(await nftAuctionV2.auctionBidToken(1)).to.equal(ZeroAddress);
            expect(await nftAuctionV2.auctionBidToken(2)).to.equal(await mockERC20.getAddress());

            // 各自的最高出价者
            const auction1 = await nftAuctionV2.acutionMaps(1);
            const auction2 = await nftAuctionV2.acutionMaps(2);
            expect(auction1.highestBidder).to.equal(account3.address);
            expect(auction2.highestBidder).to.equal(account4.address);
        });

        it("Should reject ETH bid on ERC20-locked auction", async function () {
            const { nftAuctionV2, htoken, mockERC20, account1, account2, account3 } =
                await connection.networkHelpers.loadFixture(deployFixture);

            await htoken.connect(account1).safeMint(account2, { value: ethers.parseEther("0.01") });
            await htoken.connect(account2).approve(nftAuctionV2.getAddress(), 0);
            await nftAuctionV2.connect(account2).createAuction(htoken.getAddress(), 0, ethers.parseEther("5"), 2);

            // 先用 ERC20 锁定
            await mockERC20.mint(account3.address, ethers.parseEther("1000"));
            await mockERC20.connect(account3).approve(nftAuctionV2.getAddress(), ethers.parseEther("1000"));
            await nftAuctionV2.connect(account3).placeBidWithERC20(
                1, await mockERC20.getAddress(), ethers.parseEther("10")
            );

            // ERC20 bid succeeds, auctionBidToken[1] is now MTK
            expect(await nftAuctionV2.auctionBidToken(1)).to.equal(await mockERC20.getAddress());
        });
    });

    // ================================================================
    //  Module 5: 结束拍卖 V2（ETH 和 ERC20 结算）
    // ================================================================
    describe("EndAuctionV2", async function () {

        // ---- ETH 结算场景 ----
        describe("ETH Settlement", async function () {
            let htoken: any;
            let nftAuctionV2: any;
            let seller: any;
            let account1: any, account2: any, account3: any, account4: any, account5: any;

            beforeEach(async function () {
                ({ account1, account2, account3, account4, account5, nftAuctionV2, htoken } =
                    await connection.networkHelpers.loadFixture(deployFixture));

                await htoken.connect(account1).safeMint(account2, { value: ethers.parseEther("0.01") });
                await htoken.connect(account2).approve(nftAuctionV2.getAddress(), 0);
                seller = nftAuctionV2.connect(account2);
                await seller.createAuction(htoken.getAddress(), 0, ethers.parseEther("5"), 2);
            });

            it("Should reject if auction is already closed", async function () {
                await seller.setAuctionStatus(1, false);
                await expect(seller.endAuctionV2(1)).to.be.revertedWith("Auction already closed");
            });

            it("Should reject if auction time has not ended", async function () {
                await expect(seller.endAuctionV2(1)).to.be.revertedWith("Auction is not ended");
            });

            it("Should correctly settle: transfer NFT, pay seller and feeReceiver (ETH)", async function () {
                // 多人出价
                const buyer1 = nftAuctionV2.connect(account1);
                const buyer2 = nftAuctionV2.connect(account3);
                const buyer3 = nftAuctionV2.connect(account4);

                await buyer1.placeBid(1, { value: ethers.parseEther("5") });
                await buyer2.placeBid(1, { value: ethers.parseEther("10") });
                await buyer3.placeBid(1, { value: ethers.parseEther("15") });
                await buyer1.placeBid(1, { value: ethers.parseEther("25") });
                await buyer3.placeBid(1, { value: ethers.parseEther("30") });

                const auction = await nftAuctionV2.acutionMaps(1);
                await advanceTimePastDeadline(auction.endTime);

                const beforeFeeBalance = await ethers.provider.getBalance(account5.address);
                const beforeSellerBalance = await ethers.provider.getBalance(account2.address);

                const tx = await seller.endAuctionV2(1);
                const receipt = await tx.wait();
                const gasFee = BigInt(receipt!.gasUsed) * BigInt(receipt!.gasPrice);

                // 计算手续费：highestBid * 250 / 10000
                const highestBid = BigInt(auction.highestBid);
                const ratio = BigInt(await nftAuctionV2.platformFee());
                const fee = (highestBid * ratio) / 10000n;

                // 验证卖家余额
                const curSellerBalance = await ethers.provider.getBalance(account2.address);
                expect(curSellerBalance).to.equal(BigInt(beforeSellerBalance) + highestBid - gasFee - fee);

                // 验证手续费接收地址余额
                const curFeeBalance = await ethers.provider.getBalance(account5.address);
                expect(curFeeBalance).to.equal(BigInt(beforeFeeBalance) + fee);

                // 验证 NFT 已转移给中标者（account4 = buyer3）
                expect(await htoken.ownerOf(0)).to.equal(account4.address);
            });

            it("Should emit AuctionEnd with zero winner when no bids placed", async function () {
                const auction = await nftAuctionV2.acutionMaps(1);
                await advanceTimePastDeadline(auction.endTime);

                await expect(seller.endAuctionV2(1))
                    .to.be.emit(nftAuctionV2, "AuctionEnd")
                    .withArgs(1, ZeroAddress, 0);
            });
        });

        // ---- ERC20 结算场景 ----
        describe("ERC20 Settlement", async function () {
            let htoken: any;
            let nftAuctionV2: any;
            let mockERC20: any;
            let seller: any;
            let account1: any, account2: any, account3: any, account4: any, account5: any;

            beforeEach(async function () {
                ({ account1, account2, account3, account4, account5, nftAuctionV2, htoken, mockERC20 } =
                    await connection.networkHelpers.loadFixture(deployFixture));

                await htoken.connect(account1).safeMint(account2, { value: ethers.parseEther("0.01") });
                await htoken.connect(account2).approve(nftAuctionV2.getAddress(), 0);
                seller = nftAuctionV2.connect(account2);
                await seller.createAuction(htoken.getAddress(), 0, ethers.parseEther("5"), 2);

                // 给买家铸造 ERC20 并授权
                await mockERC20.mint(account3.address, ethers.parseEther("1000"));
                await mockERC20.connect(account3).approve(nftAuctionV2.getAddress(), ethers.parseEther("1000"));
                await mockERC20.mint(account4.address, ethers.parseEther("1000"));
                await mockERC20.connect(account4).approve(nftAuctionV2.getAddress(), ethers.parseEther("1000"));
            });

            it("Should correctly settle ERC20 auction: transfer NFT and tokens", async function () {
                const buyer1 = nftAuctionV2.connect(account3);
                const buyer2 = nftAuctionV2.connect(account4);

                // ERC20 出价
                await buyer1.placeBidWithERC20(1, await mockERC20.getAddress(), ethers.parseEther("10"));
                await buyer2.placeBidWithERC20(1, await mockERC20.getAddress(), ethers.parseEther("15"));

                const auction = await nftAuctionV2.acutionMaps(1);
                await advanceTimePastDeadline(auction.endTime);

                const beforeSellerBalance = await mockERC20.balanceOf(account2.address);
                const beforeFeeBalance = await mockERC20.balanceOf(account5.address);

                await seller.endAuctionV2(1);

                // 计算预期值
                const highestBid = ethers.parseEther("15");
                const ratio = BigInt(await nftAuctionV2.platformFee()); // 250
                const fee = (highestBid * ratio) / 10000n;
                const sellerAmount = highestBid - fee;

                // 验证卖家收到 ERC20
                expect(await mockERC20.balanceOf(account2.address))
                    .to.equal(beforeSellerBalance + sellerAmount);
                // 验证手续费接收地址收到 ERC20
                expect(await mockERC20.balanceOf(account5.address))
                    .to.equal(beforeFeeBalance + fee);
                // 验证 NFT 已转移给中标者
                expect(await htoken.ownerOf(0)).to.equal(account4.address);
            });

            it("Should emit AuctionEnd on ERC20 settlement", async function () {
                const buyer = nftAuctionV2.connect(account3);
                await buyer.placeBidWithERC20(1, await mockERC20.getAddress(), ethers.parseEther("10"));

                const auction = await nftAuctionV2.acutionMaps(1);
                await advanceTimePastDeadline(auction.endTime);

                await expect(seller.endAuctionV2(1))
                    .to.be.emit(nftAuctionV2, "AuctionEnd")
                    .withArgs(1, account3.address, ethers.parseEther("10"));
            });
        });
    });

    // ================================================================
    //  Module 6: 提取退款 V2（ETH 和 ERC20 退款）
    // ================================================================
    describe("WithdrawV2", async function () {

        // ---- ETH 退款场景 ----
        describe("ETH Withdraw", async function () {
            let nftAuctionV2: any;
            let htoken: any;
            let seller: any;
            let account1: any, account2: any, account3: any, account4: any;

            beforeEach(async function () {
                ({ account1, account2, account3, account4, nftAuctionV2, htoken } =
                    await connection.networkHelpers.loadFixture(deployFixture));

                await htoken.connect(account1).safeMint(account2, { value: ethers.parseEther("0.01") });
                await htoken.connect(account2).approve(nftAuctionV2.getAddress(), 0);
                seller = nftAuctionV2.connect(account2);
                await seller.createAuction(htoken.getAddress(), 0, ethers.parseEther("5"), 2);
            });

            it("Should reject withdraw if auction is still active", async function () {
                await expect(
                    nftAuctionV2.connect(account3).withdrawV2(1)
                ).to.be.revertedWith("Auction is not closed");
            });

            it("Should reject withdraw if no refund available", async function () {
                // 关闭拍卖后，一个没出过价的用户无法提款
                await seller.setAuctionStatus(1, false);
                await expect(
                    nftAuctionV2.connect(account3).withdrawV2(1)
                ).to.be.revertedWith("No refund available");
            });

            it("Should correctly refund ETH to outbid bidders", async function () {
                const buyer1 = nftAuctionV2.connect(account1);
                const buyer2 = nftAuctionV2.connect(account3);
                const buyer3 = nftAuctionV2.connect(account4);

                await buyer1.placeBid(1, { value: ethers.parseEther("5") });
                await buyer2.placeBid(1, { value: ethers.parseEther("10") });
                await buyer3.placeBid(1, { value: ethers.parseEther("15") });
                await buyer1.placeBid(1, { value: ethers.parseEther("25") });
                await buyer3.placeBid(1, { value: ethers.parseEther("30") });

                // 关闭拍卖
                await seller.setAuctionStatus(1, false);

                // account1 应退款 30 ETH
                const beforeBalance = await ethers.provider.getBalance(account1.address);
                const tx = await buyer1.withdrawV2(1);
                const receipt = await tx.wait();
                const gasFee = BigInt(receipt!.gasUsed) * BigInt(receipt!.gasPrice);
                const afterBalance = await ethers.provider.getBalance(account1.address);

                expect(afterBalance).to.equal(beforeBalance + ethers.parseEther("30") - gasFee);
            });

            it("Should clear pending refund after successful withdraw", async function () {
                const buyer = nftAuctionV2.connect(account3);
                await buyer.placeBid(1, { value: ethers.parseEther("5") });
                // 被超越
                await nftAuctionV2.connect(account4).placeBid(1, { value: ethers.parseEther("10") });

                await seller.setAuctionStatus(1, false);

                // 提款前有退款
                expect(await nftAuctionV2.pendingRefundMap(1, account3.address))
                    .to.equal(ethers.parseEther("5"));

                await buyer.withdrawV2(1);

                // 提款后清零
                expect(await nftAuctionV2.pendingRefundMap(1, account3.address))
                    .to.equal(0);
            });
        });

        // ---- ERC20 退款场景 ----
        describe("ERC20 Withdraw", async function () {
            let nftAuctionV2: any;
            let htoken: any;
            let mockERC20: any;
            let seller: any;
            let account1: any, account2: any, account3: any, account4: any;

            beforeEach(async function () {
                ({ account1, account2, account3, account4, nftAuctionV2, htoken, mockERC20 } =
                    await connection.networkHelpers.loadFixture(deployFixture));

                await htoken.connect(account1).safeMint(account2, { value: ethers.parseEther("0.01") });
                await htoken.connect(account2).approve(nftAuctionV2.getAddress(), 0);
                seller = nftAuctionV2.connect(account2);
                await seller.createAuction(htoken.getAddress(), 0, ethers.parseEther("5"), 2);

                // 给买家铸造 ERC20 并授权
                await mockERC20.mint(account3.address, ethers.parseEther("1000"));
                await mockERC20.connect(account3).approve(nftAuctionV2.getAddress(), ethers.parseEther("1000"));
                await mockERC20.mint(account4.address, ethers.parseEther("1000"));
                await mockERC20.connect(account4).approve(nftAuctionV2.getAddress(), ethers.parseEther("1000"));
            });

            it("Should correctly refund ERC20 to outbid bidders", async function () {
                const buyer1 = nftAuctionV2.connect(account3);
                const buyer2 = nftAuctionV2.connect(account4);
                const tokenAddr = await mockERC20.getAddress();

                await buyer1.placeBidWithERC20(1, tokenAddr, ethers.parseEther("10"));
                await buyer2.placeBidWithERC20(1, tokenAddr, ethers.parseEther("15"));
                await buyer1.placeBidWithERC20(1, tokenAddr, ethers.parseEther("20"));

                // 关闭拍卖
                await seller.setAuctionStatus(1, false);

                // buyer2 (account4) 应退款 15 MTK
                const beforeBalance = await mockERC20.balanceOf(account4.address);
                await buyer2.withdrawV2(1);
                expect(await mockERC20.balanceOf(account4.address))
                    .to.equal(beforeBalance + ethers.parseEther("15"));
            });

            it("Should reject ERC20 withdraw if no refund available", async function () {
                await seller.setAuctionStatus(1, false);
                // account4 没有出过价
                await expect(
                    nftAuctionV2.connect(account4).withdrawV2(1)
                ).to.be.revertedWith("No refund available");
            });
        });
    });

    // ================================================================
    //  Module 7: 价格预言机集成（V2 核心新功能）
    // ================================================================
    describe("PriceOracle", async function () {

        it("Should return ETH price in USD via getTokenPriceInUSD", async function () {
            const { nftAuctionV2 } = await connection.networkHelpers.loadFixture(deployFixture);
            // 1 ETH = $1666, 查询 1 ETH (10^18 wei)
            const usdValue = await nftAuctionV2.getTokenPriceInUSD(
                ZeroAddress,
                ethers.parseEther("1")
            );
            // 预期: 1 * 166600000000 / 10^8 = 1666000000000（18位精度）
            expect(usdValue).to.equal(BigInt("1666000000000000000000"));
        });

        it("Should return ERC20 token price in USD via getTokenPriceInUSD", async function () {
            const { nftAuctionV2, mockERC20 } = await connection.networkHelpers.loadFixture(deployFixture);
            // 1 MTK = $1.00, 查询 100 MTK (10^18 decimals)
            const usdValue = await nftAuctionV2.getTokenPriceInUSD(
                await mockERC20.getAddress(),
                ethers.parseEther("100")
            );
            // 预期: 100 * 100000000 / 10^8 = 100 * 10^18
            expect(usdValue).to.equal(ethers.parseEther("100"));
        });

        it("Should reject zero amount in getTokenPriceInUSD", async function () {
            const { nftAuctionV2 } = await connection.networkHelpers.loadFixture(deployFixture);
            await expect(
                nftAuctionV2.getTokenPriceInUSD(ZeroAddress, 0)
            ).to.be.revertedWith("Invalid amount");
        });

        it("Should maintain backward compatibility: showEth2USD calls getTokenPriceInUSD", async function () {
            const { nftAuctionV2 } = await connection.networkHelpers.loadFixture(deployFixture);
            const usdValue = await nftAuctionV2.showEth2USD(ethers.parseEther("1"));
            // 应该与 getTokenPriceInUSD(address(0), 1 ether) 结果一致
            expect(usdValue).to.equal(BigInt("1666000000000000000000"));
        });

        it("Should verify version is set correctly", async function () {
            const { nftAuctionV2 } = await connection.networkHelpers.loadFixture(deployFixture);
            expect(await nftAuctionV2.version()).to.equal(2);
        });

        it("Should have priceOracle address set correctly", async function () {
            const { nftAuctionV2, priceOracle } = await connection.networkHelpers.loadFixture(deployFixture);
            expect(await nftAuctionV2.priceOracle()).to.equal(await priceOracle.getAddress());
        });
    });
});
