import { network } from "hardhat";
import { DECIMAL, INITIAL_ANSWER, networkConfig, developmentNetwork } from "../helper-hardhat-config.js"

/**
 * 真正的升级合约，将proxy合约的imple指向新的logic地址
 * 
 * 使用方法：
 * npx hardhat run scripts/upgrade.ts --network <network>
 * 
 * 环境变量配置：
 * - PROXY_ADDRESS: 代理合约地址（必需）
 * - {NETWORK}_PROXY_ADMIN_OWNER: ProxyAdmin 的所有者地址（可选，用于验证）
 * 
 * 示例：
 * npx hardhat run scripts/upgrade.ts --network sepolia
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
    const [deployer] = await ethers.getSigners();

    // 初始化变量
    let proxyAddress: any;
    let dataFeedAddr: any;
    if (developmentNetwork.includes(networkName)) {
        proxyAddress = deployer.address;
        const mockFactory = await ethers.getContractFactory("MyMockV3Aggregator");
        const deployed = await mockFactory.deploy(DECIMAL, INITIAL_ANSWER);
        await deployed.waitForDeployment();
        dataFeedAddr = await deployed.getAddress();
    } else {
        const addrKey = `${networkName.toUpperCase()}_PROXY_ADDRESS`;
        proxyAddress = process.env[addrKey];
        dataFeedAddr = networkConfig[chainId].eth2USDDataFeed;
    }
    if (!ethers.isAddress(proxyAddress) || proxyAddress == "" || proxyAddress == ethers.ZeroAddress) {
        throw new Error("Invalid proxyAddress");
    }


    console.log("Upgrading NFTAuction...");
    console.log(`Network: ${networkName} (Chain ID: ${chainId})`);
    console.log("Deployer:", deployer.address);
    console.log("Proxy Address:", proxyAddress);

    // 获取当前实现合约地址
    const ERC1967_PROXY_STORAGE_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
    const currentImplementationStorage = await ethers.provider.getStorage(
        proxyAddress,
        ERC1967_PROXY_STORAGE_SLOT
    );
    const implStorageHex = currentImplementationStorage.startsWith("0x")
        ? currentImplementationStorage.slice(2)
        : currentImplementationStorage;
    const currentImpl = ethers.getAddress("0x" + implStorageHex.slice(-40).padStart(40, '0'));
    console.log("Current Implementation:", currentImpl);

    // 获取 ProxyAdmin 合约地址
    const ERC1967_ADMIN_STORAGE_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
    const adminStorage = await ethers.provider.getStorage(
        proxyAddress,
        ERC1967_ADMIN_STORAGE_SLOT
    );
    const adminStorageHex = adminStorage.startsWith("0x") ? adminStorage.slice(2) : adminStorage;
    const proxyAdminAddress = ethers.getAddress("0x" + adminStorageHex.slice(-40).padStart(40, '0'));
    console.log("ProxyAdmin Address:", proxyAdminAddress);

    // 步骤 1: 部署新版本的实现合约
    console.log("\n[1/4] Deploying new implementation contract...");
    const NFTAuctionV2 = await ethers.getContractFactory("NFTAuctionV2");
    const newImplementation = await NFTAuctionV2.deploy();
    await newImplementation.waitForDeployment();
    const newImplementationAddress = await newImplementation.getAddress();
    console.log("New Implementation:", newImplementationAddress);

    // 新合约参数初始化
    const routerFactory = await ethers.getContractFactory("PriceOracleRouter");
    const routerFactoryDeployed = await routerFactory.deploy(dataFeedAddr, DECIMAL);
    await routerFactoryDeployed.waitForDeployment();
    const routerAddress = await routerFactoryDeployed.getAddress();
    console.log('routerAddress: ', routerAddress);

    const initializeInterface = new ethers.Interface([
        "function initializeV2(address _priceOracle, uint256 _version)"
    ]);
    const initData = initializeInterface.encodeFunctionData("initializeV2", [routerAddress, 2]);

    // 步骤 2: 验证 ProxyAdmin 所有者
    console.log("\n[2/4] Verifying ProxyAdmin owner...");
    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    const proxyAdmin = ProxyAdmin.attach(proxyAdminAddress);
    const adminOwner = await proxyAdmin.owner();
    console.log("ProxyAdmin Owner:", adminOwner);

    // 验证所有者地址不是 ProxyAdmin 地址本身
    if (adminOwner.toLowerCase() === proxyAdminAddress.toLowerCase()) {
        throw new Error(
            `ProxyAdmin 的所有者地址与 ProxyAdmin 地址相同，这是不正确的配置。`
        );
    }

    // 从环境变量获取期望的 ProxyAdmin 所有者（如果配置了）
    const expectedOwnerEnvKey = `${networkName.toUpperCase()}_PROXY_ADMIN_ADDRESS`;
    const expectedOwnerFromEnv = process.env[expectedOwnerEnvKey];

    if (expectedOwnerFromEnv) {
        const expectedOwner = ethers.getAddress(expectedOwnerFromEnv);
        if (expectedOwner.toLowerCase() !== adminOwner.toLowerCase()) {
            throw new Error(
                `环境变量配置的 ProxyAdmin 所有者 (${expectedOwner}) 与链上的实际所有者 (${adminOwner}) 不匹配。`
            );
        }
    }

    // 检查部署者是否是 ProxyAdmin 的所有者  部署者应该是admin的owner，才有权利升级合约
    if (adminOwner.toLowerCase() !== deployer.address.toLowerCase()) {
        throw new Error(
            `Deployer (${deployer.address}) is not the owner of ProxyAdmin (${adminOwner}). ` +
            `请使用地址 ${adminOwner} 对应的私钥配置 ${networkName.toUpperCase()}_PRIVATE_KEY`
        );
    }

    // 步骤 3: 执行升级
    console.log("\n[3/4] Executing upgrade...");
    const upgradeTx = await proxyAdmin.upgradeAndCall(
        proxyAddress,
        newImplementationAddress,
        initData
    );
    console.log("Transaction hash:", upgradeTx.hash);
    await upgradeTx.wait();
    console.log("✓ Upgrade transaction confirmed");

    // 验证新实现地址
    const newImplStorage = await ethers.provider.getStorage(
        proxyAddress,
        ERC1967_PROXY_STORAGE_SLOT
    );
    const newImplStorageHex = newImplStorage.startsWith("0x")
        ? newImplStorage.slice(2)
        : newImplStorage;
    const verifiedNewImpl = ethers.getAddress("0x" + newImplStorageHex.slice(-40).padStart(40, '0'));
    if (verifiedNewImpl.toLowerCase() !== newImplementationAddress.toLowerCase()) {
        throw new Error(
            `升级验证失败：实现地址不匹配。期望: ${newImplementationAddress}, 实际: ${verifiedNewImpl}`
        );
    }

    // 步骤 4: 初始化 V2 功能并验证
    console.log("\n[4/4] Initializing V2 features and verifying...");
    const auction = await ethers.getContractAt("NFTAuctionV2", proxyAddress);
    try {
        await auction.priceOracle();
    } catch (error: any) {
        throw new Error(`Contract V2 verification failed: ${error.message}`);
    }

    // 最终验证
    const finalVersion = await auction.version();
    const platformFee = await auction.platformFee();
    const feeReceiver = await auction.feeReceiver();

    console.log("\n=== Upgrade Summary ===");
    console.log("Proxy Address:", proxyAddress);
    console.log("New Implementation:", newImplementationAddress);
    console.log("Version:", finalVersion.toString());
    console.log("feeReceiver:", feeReceiver);
    console.log("platformFee:", platformFee);

    return {
        proxy: proxyAddress,
        implementation: newImplementationAddress,
        version: finalVersion.toString(),
    };
}

main()
    .then(() => {
        console.log("\n✓ Upgrade successful");
        process.exit(0);
    })
    .catch((error) => {
        console.error("\n✗ Upgrade failed:");
        console.error(error);
        process.exit(1);
    });
