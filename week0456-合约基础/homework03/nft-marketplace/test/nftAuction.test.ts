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
 * 
 * 原理：
 * 1. 获取当前最新区块的时间戳
 * 2. 计算需要增加的时间 = deadline - 当前时间 + 1秒（确保严格超过）
 * 3. 通过 evm_increaseTime RPC 调用增加时间
 * 4. 通过 evm_mine RPC 调用挖一个新块，使时间变更生效
 * 
 * 注意：Solidity 中 block.timestamp 是秒级时间戳
 */
async function advanceTimePastDeadline(deadline: bigint) {
    const currentBlock = await ethers.provider.getBlock("latest");
    const currentTimestamp = BigInt(currentBlock?.timestamp || 0);
    const timeToIncrease = deadline - currentTimestamp + BigInt(1);

    if (timeToIncrease > 0n) {
        // 使用 evm_increaseTime 增加区块链时间
        // 参数需要转为字符串，因为 JSON-RPC 不支持 bigint
        await ethers.provider.send("evm_increaseTime", [timeToIncrease.toString()]);
        // 挖一个新块，使时间推进生效
        await ethers.provider.send("evm_mine", []);
    }
}

// 开始编写测试
describe("NFTAuction", async function () {

    // 定义fixture，直接从缓存取，极快
    async function deployHTOKENFixture() {
        // 获取账号
        const [account1, account2, account3, account4, account5] = await ethers.getSigners();

        // 部署auction合约
        // 默认使用第一个 signer（account1）作为部署者，account5作为资金接收
        const nftAuctionFactory = await ethers.getContractFactory("NFTAuction");
        const nftAuctionDeployed = await nftAuctionFactory.deploy(account5, ZeroAddress);
        await nftAuctionDeployed.waitForDeployment();

        // 部署nft合约
        const HToken = await ethers.getContractFactory("HToken");
        const htokenDeployed = await HToken.deploy(account1);
        await htokenDeployed.waitForDeployment();

        // 获取实例
        const nftAuction = await ethers.getContractAt("NFTAuction", await nftAuctionDeployed.getAddress());
        const htoken = await ethers.getContractAt("HToken", await htokenDeployed.getAddress());

        return { account1, account2, account3, account4, account5, nftAuction, htoken };
    }

    /**
     * module1---->测试创建拍卖
     */
    describe("CreateAuction", async function () {
        // 测试0地址
        it("Should reject zero address fro nftcontract param", async function () {
            const { nftAuction, account1 } = await connection.networkHelpers.loadFixture(deployHTOKENFixture);
            const inner = nftAuction.connect(account1);
            await expect(inner.createAuction(ZeroAddress, 0, ethers.parseEther("5"), 3)).to.be.revertedWith("Invalid NFT address");
        })

        // 起拍价没设置 startPrice
        it("Should set startPrice", async function () {
            const { nftAuction, account1, htoken } = await connection.networkHelpers.loadFixture(deployHTOKENFixture);
            const inner = nftAuction.connect(account1);
            await expect(
                inner.createAuction(htoken.getAddress(), 1, 0, 3)
            ).to.be.revertedWith("StartPrice must be great then zero");
        })

        // 持续时间至少1小时起步
        it("Should durationTime must at least 1 hour", async function () {
            const { nftAuction, account1, htoken } = await connection.networkHelpers.loadFixture(deployHTOKENFixture);
            const inner = nftAuction.connect(account1);
            await expect(
                inner.createAuction(htoken.getAddress(), 1, 5, 0)
            ).to.be.revertedWith("DurationTime must at least 1 hour");
        })

        // 验证nft的所有权是否属于sender
        it("Should nft's owner is the tx sender", async function () {
            // 先mint一个nft
            const { nftAuction, account1, htoken, account2 }
                = await connection.networkHelpers.loadFixture(deployHTOKENFixture);
            await htoken.safeMint(account2, { value: ethers.parseEther("0.01") });

            // 目前tokenId = 0的nft的 owner 是account2
            // console.log("htoken's owner: ", await htoken.ownerOf(0));
            // console.log("account2: ", account2.address);
            /**
             * htoken's owner:  0x70997970C51812dc3A010C7d01b50e0d17dc79C8
                account2:  0x70997970C51812dc3A010C7d01b50e0d17dc79C8
             */

            // 如果使用account1账号发起拍卖，会报错
            const inner = nftAuction.connect(account1);
            await expect(
                inner.createAuction(htoken.getAddress(), 0, 5, 2)
            ).to.be.revertedWith("nft not owner");
        })

        // 验证seller是否授权给auction合约NFT
        it("Should seller approve the NFT to auction contract", async function () {
            // 先mint一个nft
            const { nftAuction, account1, htoken, account2 }
                = await connection.networkHelpers.loadFixture(deployHTOKENFixture);
            await htoken.safeMint(account2, { value: ethers.parseEther("0.01") });

            // nft所有这account2来创建拍卖，因为没授权，应该过不去
            const inner = nftAuction.connect(account2);
            await expect(
                inner.createAuction(htoken.getAddress(), 0, 5, 2)
            ).to.be.revertedWith("Current marketplace not approved");
        })

        // 所有校验都通过，拍卖事件应该被成功发送
        it("Should emit the event for auction", async function () {
            // 先mint一个nft
            const { nftAuction, account1, htoken, account2 }
                = await connection.networkHelpers.loadFixture(deployHTOKENFixture);
            await htoken.safeMint(account2, { value: ethers.parseEther("0.01") });

            // nft所有这account2来创建拍卖，因为没授权，应该过不去
            const inner = nftAuction.connect(account2);

            // account2授权0号nft给auction合约
            await htoken.connect(account2).approve(inner.getAddress(), 0);

            // 断言事件
            const curTime = await connection.networkHelpers.time.latest();
            await expect(inner.createAuction(htoken.getAddress(), 0, 5, 2))
                .to.be.emit(inner, "AuctionCreated")
                .withArgs(
                    1,
                    account2.address,
                    htoken.getAddress(),
                    0,
                    5,
                    // 允许±5s的偏差，因为可能有前置合约部署等等操作
                    (value: any) => {
                        expect(value).to.be.closeTo(curTime + (2 * 3600), 5);
                        return true;
                    }
                )
        })
    });

    /**
     * module2----> 测试ETH出价
     */
    describe("PlaceBid", async function () {
        let htoken: any;
        let nftAuction: any;
        let seller: any;
        let buyer: any;
        let account1: any, account2: any, account3: any, account4: any, account5: any;
        beforeEach(async function () {
            // 解构变量，提升作用域
            ({ account1, account2, account3, account4, account5, nftAuction, htoken }
                = await connection.networkHelpers.loadFixture(deployHTOKENFixture));

            // 创建拍卖活动
            await htoken.connect(account1).safeMint(account2, { value: ethers.parseEther("0.01") }); // mint
            await htoken.connect(account2).approve(nftAuction.getAddress(), 0); // approved
            seller = nftAuction.connect(account2);
            await seller.createAuction(htoken.getAddress(), 0, 5, 2)
            buyer = nftAuction.connect(account3);
        })

        // 当前排名活动必须是active状态，才能进行出价
        it("Should auction is active", async function () {
            // 设置成false
            await seller.setAuctionStatus(1, false);
            await expect(buyer.placeBid(1)).to.be.revertedWith("Auction is not active");
        })

        // 当前时间必须没有结束，才能进行出价
        it("Should placedBid must be time is not over", async function () {
            // 获取拍卖合约中的拍卖对象
            const auction = await nftAuction.acutionMaps(1);
            // 将区块链时间推进到超过指定截止时间
            await advanceTimePastDeadline(auction.endTime);
            // 再来调用出价函数
            await expect(buyer.placeBid(1)).to.be.revertedWith("Auction is end");
        })

        // seller不能自己给自己出价
        it("Should reject if seller placeBid to himself", async function () {
            await expect(seller.placeBid(1)).to.be.revertedWith("You can not placeBid by yourself");
        })

        // 如果出价低于上次报价的5%，则报错
        it("Should reject if price less then 5% of last price", async function () {
            // 先第一次出价
            await buyer.placeBid(1, { value: ethers.parseEther("5") });

            // 上次出完价后，当前拍卖的highestBid应该等于5了，再来个买家出价，必须>=5.25
            const buyer2 = nftAuction.connect(account4);
            await expect(buyer2.placeBid(1, { value: ethers.parseEther("5.23") }))
                .to.be.revertedWith("Invalid placeBid");

            // 出价如果大于等于5.25，就不会有问题
            await buyer2.placeBid(1, { value: ethers.parseEther("5.25") })
        })

        // 记录之前出价者的待退款金额，用4个出价者，account2作为seller
        it("Should record before placeBid", async function () {
            const buyer1 = await nftAuction.connect(account1);
            const buyer2 = await nftAuction.connect(account3);
            const buyer3 = await nftAuction.connect(account4);
            const buyer4 = await nftAuction.connect(account5);

            // 各自出价
            await buyer1.placeBid(1, { value: ethers.parseEther("5") });
            await buyer2.placeBid(1, { value: ethers.parseEther("10") });
            await buyer3.placeBid(1, { value: ethers.parseEther("15") });
            await buyer4.placeBid(1, { value: ethers.parseEther("20") });

            // account1出价2次
            await buyer1.placeBid(1, { value: ethers.parseEther("25") });

            // account4再次出价，但是这次出价不会记录
            await buyer4.placeBid(1, { value: ethers.parseEther("30") });

            const refund1 = await nftAuction.pendingRefundMap(1, account1.address);
            const refund2 = await nftAuction.pendingRefundMap(1, account3.address);
            const refund3 = await nftAuction.pendingRefundMap(1, account4.address);
            const refund4 = await nftAuction.pendingRefundMap(1, account5.address);
            expect(await refund1).to.equal(ethers.parseEther("30"))
            expect(await refund2).to.equal(ethers.parseEther("10"))
            expect(await refund3).to.equal(ethers.parseEther("15"))
            expect(await refund4).to.equal(ethers.parseEther("20"))
        })
    });

    /**
     * module3----> 拍卖结束，时间到，测试重入攻击
     */
    describe("EndAuction", async function () {
        let htoken: any;
        let nftAuction: any;
        let seller: any;
        let buyer: any;
        let account1: any, account2: any, account3: any, account4: any, account5: any;
        beforeEach(async function () {
            // 解构变量，提升作用域
            ({ account1, account2, account3, account4, account5, nftAuction, htoken }
                = await connection.networkHelpers.loadFixture(deployHTOKENFixture));

            // 创建1号拍卖活动，给account2铸造一枚NFT
            await htoken.connect(account1).safeMint(account2, { value: ethers.parseEther("0.01") }); // mint
            await htoken.connect(account2).approve(nftAuction.getAddress(), 0); // approved
            seller = nftAuction.connect(account2);
            await seller.createAuction(htoken.getAddress(), 0, 5, 2)
            buyer = nftAuction.connect(account3);
        })

        // 测试活动已经结束
        it("Should reject cause auction is closed", async function () {
            await seller.setAuctionStatus(1, false);
            await expect(seller.endAuction(1)).to.be.revertedWith("Auction already closed");
        })

        // 测试时间活动还未结束，不能调用该函数
        it("Should reject cause auction is not closed", async function () {
            await expect(seller.endAuction(1)).to.be.revertedWith("Auction is not end");
        })

        // 测试活动结束后，金额计算是否准确，包括手续费，卖家收到的钱
        // account5作为fee接收地址，account2作为卖家，其余三个账号作为买家
        it("Should caculate correct for fee and sellerAmount", async function () {
            // 模拟多人出价 
            const buyer1 = await nftAuction.connect(account1);
            const buyer2 = await nftAuction.connect(account3);
            const buyer3 = await nftAuction.connect(account4);

            // 各自出价
            await buyer1.placeBid(1, { value: ethers.parseEther("5") });
            await buyer2.placeBid(1, { value: ethers.parseEther("10") });
            await buyer3.placeBid(1, { value: ethers.parseEther("15") });

            // account1出价2次
            await buyer1.placeBid(1, { value: ethers.parseEther("25") });

            // account4再次出价，但是这次出价不会记录
            await buyer3.placeBid(1, { value: ethers.parseEther("30") });

            const refund1 = await nftAuction.pendingRefundMap(1, account1.address);
            const refund2 = await nftAuction.pendingRefundMap(1, account3.address);
            const refund3 = await nftAuction.pendingRefundMap(1, account4.address);

            // 时间结束，调用endAuction函数，计算最终价格
            const auction = await nftAuction.acutionMaps(1);
            await advanceTimePastDeadline(auction.endTime);
            // console.log("current highestBid: ", auction.highestBid);
            // console.log("current highestBidder: ", auction.highestBidder);

            // 比较fee地址和卖家收到的钱，扣除gas费后
            const beforeFeeReceiptBalance = await ethers.provider.getBalance(account5.address);
            // console.log('beforeFeeReceiptBalance: ', beforeFeeReceiptBalance);
            const beforeSellerBalance = await ethers.provider.getBalance(account2.address);
            // console.log('beforeSellerBalance: ', beforeSellerBalance);

            const tx = await seller.endAuction(1); // 结束交易
            // 计算gas费用，由交易发起者承担
            const receipt = await tx.wait();
            const gasFee = BigInt(receipt!.gasUsed) * BigInt(receipt!.gasPrice);

            // 计算手续费
            const highestBid = BigInt(auction.highestBid);
            const ratio = BigInt(await nftAuction.platformFee());
            const fee = (highestBid * ratio) / 10000n;

            // 因此seller收到的钱就是 highestBid - 手续费fee - gasFee
            const curSellerBalance = await ethers.provider.getBalance(account2.address);
            expect(curSellerBalance).to.equal(BigInt(beforeSellerBalance) + highestBid - gasFee - fee);

            const curFeeReceiptBalance = await ethers.provider.getBalance(account5.address);
            expect(curFeeReceiptBalance).to.equal(BigInt(beforeFeeReceiptBalance) + fee);
        })

        // 测试活动结束后买家退款
        it("Should caculate correct for fee and sellerAmount", async function () {
            // 模拟多人出价 
            const buyer1 = await nftAuction.connect(account1);
            const buyer2 = await nftAuction.connect(account3);
            const buyer3 = await nftAuction.connect(account4);

            // 各自出价
            await buyer1.placeBid(1, { value: ethers.parseEther("5") });
            await buyer2.placeBid(1, { value: ethers.parseEther("10") });
            await buyer3.placeBid(1, { value: ethers.parseEther("15") });

            // account1出价2次
            await buyer1.placeBid(1, { value: ethers.parseEther("25") });

            // account4再次出价，但是这次出价不会记录
            await buyer3.placeBid(1, { value: ethers.parseEther("30") });

            // 待退款金额
            const refund1 = await nftAuction.pendingRefundMap(1, account1.address);
            const refund2 = await nftAuction.pendingRefundMap(1, account3.address);
            const refund3 = await nftAuction.pendingRefundMap(1, account4.address);

            // 活动结束
            await seller.setAuctionStatus(1, false);

            // 模拟account1退款，因为这次是account4价格最高
            const beforeBalance = await ethers.provider.getBalance(account1.address);
            const tx = await buyer1.withdraw(1);
            const receipt = await tx.wait();
            const gasFee = BigInt(receipt!.gasUsed) * BigInt(receipt!.gasPrice);
            const currentBalance = await ethers.provider.getBalance(account1.address);
            expect(currentBalance).to.equal(beforeBalance + ethers.parseEther("30") - gasFee);
        })
    })

    /**
     * module4----> 测试喂价
     */
    describe("MockV3Aggregator", async function () {
        it("Should get the mock price of ETH", async function () {
            // 部署MockV3Aggregator
            const [account1, account2, account3, account4, account5] = await ethers.getSigners();
            const mockV3 = await ethers.getContractFactory("MyMockV3Aggregator");
            const mockV3Deployed = await mockV3.deploy(DECIMAL, INITIAL_ANSWER);
            await mockV3Deployed.waitForDeployment();

            // 获取实例
            const mockV3Instance
                = await ethers.getContractAt("MyMockV3Aggregator", await mockV3Deployed.getAddress());

            // 部署nft拍卖合约
            const nftAuctionFactory = await ethers.getContractFactory("NFTAuction");
            const nftAuctionDeployed = await nftAuctionFactory.deploy(account1, mockV3Deployed.getAddress());
            await nftAuctionDeployed.waitForDeployment();

            const instance = await ethers.getContractAt("NFTAuction", await nftAuctionDeployed.getAddress());
            const res = await instance.showEth2USD(BigInt("1000000000000000000"))
            expect(res).to.equal(BigInt("1666000000000000000000"));
        })
    })
});