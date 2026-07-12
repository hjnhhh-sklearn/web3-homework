import { expect } from "chai"
import { network } from "hardhat"


// 从 Hardhat 网络连接中获取 ethers 实例
// Hardhat v3 的语法：需要先 await network.getOrCreate() 才能使用 ethers
const connection = await network.getOrCreate();
const { ethers } = connection;
describe("HToken", async function () {
    // 定义 Fixture 函数 下次直接从缓存取，速度极快，主要是获取一些部署的合约、账号等前置对象
    async function deployHTOKENFixture() {
        // 获取账号
        const [account1, account2, account3, account4, account5] = await ethers.getSigners();

        // 使用account1来部署合约
        const HToken = await ethers.getContractFactory("HToken");
        const htokenDeployed = await HToken.deploy(account1);
        await htokenDeployed.waitForDeployment();

        // 获取实例
        const htoken = await ethers.getContractAt("HToken", await htokenDeployed.getAddress());

        return { account1, account2, account3, account4, account5, htoken, htokenDeployed };
    }

    // 测试链接fixture
    it("safeMint: test connect fixture", async function () {
        // 在 Hardhat v3 中，loadFixture 是 connection.networkHelpers.loadFixture，
        // 而不是 connection.loadFixture。
        const fixture = await connection.networkHelpers.loadFixture(deployHTOKENFixture);
    })

    // 测试调用safeMint，只有owner能调用
    it("safeMint: test owner call safeMint", async function () {
        const { htoken, account1, account2 } =
            await connection.networkHelpers.loadFixture(deployHTOKENFixture);
        // 1.用account1账号应该调用成功
        await htoken.safeMint(account2.address, { value: ethers.parseEther("0.01") });
        // 判断account2的余额是否有1个NFT
        expect(await htoken.balanceOf(account2.address)).to.equal(BigInt(1));

        // 尝试用account2去调用safeMint函数
        const htokenSecondAccount = htoken.connect(account2);
        // 应该报错 OwnableUnauthorizedAccount
        await expect(htokenSecondAccount.safeMint(account1, { value: ethers.parseEther("0.01") }))
            .to.be.revertedWithCustomError(htoken, "OwnableUnauthorizedAccount");
    })

    // 测试调用safeMint后的事件发送
    it("safeMint: test mint event send successfully", async function () {
        const { htoken, account1, account2 } =
            await connection.networkHelpers.loadFixture(deployHTOKENFixture);
        // 用account1账号调用成功

        // 查看事件是否调用
        expect(await htoken.safeMint(account2.address, { value: ethers.parseEther("0.01") }))
            .to.be.emit(htoken, "NFTMinted")
            .withArgs(account1.address, account2.address, "https://sufficient-lime-mink.myfilebase.com/ipfs/QmS6G2xPqaHtzQoEHnmjzQa7hMjeDtdVUNhBLACeKAinYP");
    })

    // 测试调用safeMint后，合约真正收到了mint的费用
    it("safeMint: test contract get eth after owner call safeMint", async function () {
        const { htoken, account1, account2 } =
            await connection.networkHelpers.loadFixture(deployHTOKENFixture);
        await htoken.safeMint(account2.address, { value: ethers.parseEther("0.01") });
        // 合约余额是否正确
        const balance = await ethers.provider.getBalance(htoken.getAddress());
        expect(balance).to.equal(ethers.parseEther("0.01"));
    })

    // 测试不能超过最大供应量
    it("safeMint: can't more then max supply", async function () {
        const { htoken, account1, account2 } =
            await connection.networkHelpers.loadFixture(deployHTOKENFixture);
        await htoken.setMaxSupply(3);

        // 循环3次
        for (let index = 0; index < 3; index++) {
            await htoken.safeMint(account2.address, { value: ethers.parseEther("0.01") });
        }
        // console.log('now supply', await htoken._nextTokenId())  // 3n
        // 第4次调用
        await expect(htoken.safeMint(account2.address, { value: ethers.parseEther("0.01") }))
            .to.be.revertedWith("more then max supply");
    })

    // 调用者的余额要大于mint_price
    it("safeMint: test caller's balance must more then mint_price", async function () {
        const { htoken, account2 } =
            await connection.networkHelpers.loadFixture(deployHTOKENFixture);
        await expect(htoken.safeMint(account2.address, { value: ethers.parseEther("0.005") }))
            .to.be.revertedWith("you don't have enough money to mint");
    })

    // withdraw函数，onlyOwner能进行取现
    it("withdraw: only owner and balance check", async function () {
        const { htoken, account1, account2 } = await connection.networkHelpers.loadFixture(deployHTOKENFixture);

        // 先确保余额充足
        // console.log('mint前余额：', await ethers.provider.getBalance(account1.address));
        await htoken.safeMint(account2.address, { value: ethers.parseEther("2") });

        // 查看余额 当前合约balance:  2000000000000000000n
        // console.log('当前合约balance: ', await ethers.provider.getBalance(htoken.getAddress()));

        // 切换另一个账号取现
        const htokenSecondAccount = htoken.connect(account2);
        await expect(htokenSecondAccount.withdraw()).to.be.revertedWithCustomError(htoken, "OwnableUnauthorizedAccount");

        // 切换到主账号取现
        const beforeBalance = await ethers.provider.getBalance(account1.address)
        // console.log('取现前余额：', beforeBalance);

        // 手动计算gas费用
        const tx = await htoken.connect(account1).withdraw();
        const receipt = await tx.wait();
        const gasFee = receipt!.gasUsed * receipt!.gasPrice;
        const afterBalance = await ethers.provider.getBalance(account1.address);
        // console.log('取现后余额：', afterBalance)
        expect(afterBalance).to.equal(beforeBalance + ethers.parseEther("2") - gasFee);

        /**
         * mint前余额： 9999997116936783203125n
            取现前余额： 9997996924265065047315n
            取现后余额： 9999996897779004780808n
         */
    })

    // withdraw函数，合约余额为0不能提款
    it("withdraw: contract's balance is zero, can not withdraw", async function () {
        const { htoken, account1, account2 } = await connection.networkHelpers.loadFixture(deployHTOKENFixture);
        await expect(htoken.connect(account1).withdraw()).to.be.revertedWith("balance is not enough");
    })
})
