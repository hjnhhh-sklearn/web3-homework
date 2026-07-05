import { network } from "hardhat";

/**
 * 准备升级：验证新版本合约是否可以升级
 * 
 * 此脚本用于在正式升级前验证新版本的合约代码
 * 
 * 使用方法：
 * npx hardhat run scripts/prepareUpgrade.ts --network <network>
 */
async function main() {
    const connection = await network.getOrCreate();
    const { ethers } = connection;

    // TODO 这里根据部署后的代理合约，需要动态传值
    const proxyAddress = "0xC1f775f067Ce8D125FFEC5c50d3D305b3716326F";

    if (!ethers.isAddress(proxyAddress) || proxyAddress == ethers.ZeroAddress) {
        throw new Error("Invalid proxyAddress");
    }

    console.log("Preparing upgrade...");
    console.log("Proxy Address:", proxyAddress);

    // 获取当前实现合约地址
    const ERC1967_PROXY_STORAGE_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
    const currentImplementationAddress = await ethers.provider.getStorage(
        proxyAddress,
        ERC1967_PROXY_STORAGE_SLOT
    );
    const implStorageHex = currentImplementationAddress.startsWith("0x")
        ? currentImplementationAddress.slice(2)
        : currentImplementationAddress;
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

    // 部署新版本的实现合约（仅用于验证，不实际升级）
    console.log("\nDeploying new implementation contract...");
    const MultiSigWalletV2 = await ethers.getContractFactory("NFTAuctionV2");
    const newImplementation = await MultiSigWalletV2.deploy();
    await newImplementation.waitForDeployment();
    const newImplementationAddress = await newImplementation.getAddress();
    console.log("New Implementation:", newImplementationAddress);

    // 验证合约可调用
    try {
        const v2Contract = await ethers.getContractAt("NFTAuctionV2", newImplementationAddress);
        await v2Contract.priceOracle();
    } catch (error: any) {
        throw new Error(`New implementation contract verification failed: ${error.message}`);
    }

    console.log("\n=== Preparation Summary ===");
    console.log("New Implementation:", newImplementationAddress);
    console.log("Current Implementation:", currentImpl);
    console.log("ProxyAdmin Address:", proxyAdminAddress);

    return {
        newImplementation: newImplementationAddress,
        currentImplementation: currentImpl,
        proxyAdmin: proxyAdminAddress,
    };
}

main()
    .then(() => {
        console.log("\n✓ Preparation successful");
        process.exit(0);
    })
    .catch((error) => {
        console.error("\n✗ Preparation failed:");
        console.error(error);
        process.exit(1);
    });
