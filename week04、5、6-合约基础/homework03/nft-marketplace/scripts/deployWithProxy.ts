
import { network } from "hardhat";
import { developmentNetwork } from "../helper-hardhat-config.js"
import { config } from "@chainlink/env-enc"
config()
import { DECIMAL, INITIAL_ANSWER, networkConfig } from "../helper-hardhat-config.js"

/**
 * 透明代理模式部署
 * npx hardhat run scripts/deployWithProxy.ts --network <network>
 * 
 * ${networkName.toUpperCase()}__PROXY_ADMIN_ADDRESS -- 管理员地址，从环境变量获取
 */
async function main() {
    // 获取ethers对象
    const connection = await network.getOrCreate();
    const { ethers } = connection;

    // 获取当前网络名称
    const args = process.argv;
    const networkIndex = args.indexOf("--network");
    const networkName = (networkIndex !== -1 && args[networkIndex + 1])
        ? args[networkIndex + 1]
        : "hardhat";
    const networkInfo = await ethers.provider.getNetwork();
    const chainId = Number(networkInfo.chainId);

    // 统一的状态变量
    let proxyAdminOwner: any;
    let dataFeedAddr: any; // dataFeed地址，dev为mock的，stg为环境配置
    let feeReceiver: any; // 手续费接收地址

    // 根据网络名称，取不同的admin owner
    if (developmentNetwork.includes(networkName)) {
        // 走开发环境部署，mock一个喂价合约, proxyAdminOwner为account1了默认
        const [deployer, _feeReceiver] = await ethers.getSigners();
        proxyAdminOwner = deployer.address;
        feeReceiver = _feeReceiver.address;
        const mockFactory = await ethers.getContractFactory("MyMockV3Aggregator");
        const deployed = await mockFactory.deploy(DECIMAL, INITIAL_ANSWER);
        await deployed.waitForDeployment();
        dataFeedAddr = await deployed.getAddress();
    } else {// 走测试网部署 
        // 获取配置
        const ownerKey = `${networkName.toUpperCase()}_PROXY_ADMIN_ADDRESS`;
        proxyAdminOwner = process.env[ownerKey];
        const feeReceiverKey = `${networkName.toUpperCase()}_FEE_RECEIVER_ADDRESS`;
        feeReceiver = process.env[feeReceiverKey];

        // eth2USDDataFeed
        dataFeedAddr = networkConfig[chainId].eth2USDDataFeed;
    }
    console.log('networkName: ', networkName, "\nproxyAdminOwner: ", proxyAdminOwner);
    console.log("dataFeedAddr: ", dataFeedAddr);
    console.log("feeReceiver: ", feeReceiver);

    // 管理员地址必须有效
    if (!ethers.isAddress(proxyAdminOwner) || proxyAdminOwner == "" || proxyAdminOwner == ethers.ZeroAddress) {
        throw new Error("Invalid proxyAdminOwner");
    }
    // feeReceiver地址必须有效
    if (!ethers.isAddress(feeReceiver) || feeReceiver == "" || feeReceiver == ethers.ZeroAddress) {
        throw new Error("Invalid feeReceiver");
    }
    // dataFeedAddr地址必须有效
    if (!ethers.isAddress(dataFeedAddr) || dataFeedAddr == "" || dataFeedAddr == ethers.ZeroAddress) {
        throw new Error("Invalid dataFeedAddr");
    }

    // 部署实现合约，同时准备初始化数据，让代理合约通过delegatecall调用logic合约，初始化状态在proxy内部
    console.log("Deploying NFTAuctionUpgradeable...");
    const implementationFactory = await ethers.getContractFactory("NFTAuctionUpgradeable");
    const implementationDeployed = await implementationFactory.deploy();
    await implementationDeployed.waitForDeployment();
    const implementationAddress = await implementationDeployed.getAddress();
    console.log("implementationAddress:", implementationAddress);

    // 准备初始化数据
    const initializeInterface = new ethers.Interface([
        "function initialize(address _feeReceiver,address _dataFeed)"
    ]);
    const initData = initializeInterface.encodeFunctionData("initialize", [
        feeReceiver,
        dataFeedAddr,
    ]);

    // 部署代理合约，并进行初始化操作
    console.log("Deploying TransparentUpgradeableProxy...");
    const TransparentUpgradeableProxy = await ethers.getContractFactory(
        "TransparentUpgradeableProxy"
    );
    const proxy = await TransparentUpgradeableProxy.deploy(
        implementationAddress,
        proxyAdminOwner,
        initData
    );
    await proxy.waitForDeployment();
    const proxyAddress = await proxy.getAddress();

    // 因为代理合约的构造器里面有部署proxyAdmin合约，我们从存储槽读取并验证admin owner
    const ERC1967_ADMIN_STORAGE_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
    const adminStorage = await ethers.provider.getStorage(
        proxyAddress,
        ERC1967_ADMIN_STORAGE_SLOT
    );
    const adminStorageHex = adminStorage.startsWith("0x") ? adminStorage.slice(2) : adminStorage;
    const actualProxyAdminAddress = ethers.getAddress("0x" + adminStorageHex.slice(-40).padStart(40, '0'));

    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    const proxyAdmin = ProxyAdmin.attach(actualProxyAdminAddress);
    const actualProxyAdminOwner = await proxyAdmin.owner();
    console.log('actualProxyAdminOwner: ', actualProxyAdminOwner);
    console.log('proxyAdminOwner: ', proxyAdminOwner);

    // 校验proxAdmin合约的admin owner 和 我们配置的proxyAdminOwner是不是同一个
    if (actualProxyAdminOwner.toLowerCase() !== proxyAdminOwner.toLowerCase()) {
        throw new Error(
            `ProxyAdmin 所有者设置失败！期望: ${proxyAdminOwner}, 实际: ${actualProxyAdminOwner}`
        );
    }


    // 验证部署 以NFTAuctionUpgradeable的ABI部署，向proxyAddress地址发交易
    const auction = await ethers.getContractAt("NFTAuctionUpgradeable", proxyAddress);
    const receiver = await auction.feeReceiver();
    const platformFee = await auction.platformFee();

    console.log("\n=== Deployment Summary ===");
    console.log("Proxy Address:", proxyAddress);
    console.log("Implementation Address:", implementationAddress);
    console.log("ProxyAdmin Address:", actualProxyAdminAddress);
    console.log("ProxyAdmin Owner:", proxyAdminOwner);
    console.log("FeeReceiver:", receiver);
    console.log("PlatformFee:", platformFee);
}

main()
    .then(() => {
        console.log("\n✓ Deployment successful");
        console.log("\n⚠️  重要提示：ProxyAdmin 的所有者可以升级代理合约，请确保安全保管私钥！");
        process.exit(0);
    })
    .catch((error) => {
        console.error("\n✗ Deployment failed:");
        console.error(error);
        process.exit(1);
    })