# NFT 拍卖市场 (NFT Auction Marketplace)

[![Solidity](https://img.shields.io/badge/Solidity-0.8.28-blue)](https://soliditylang.org/)
[![Hardhat](https://img.shields.io/badge/Hardhat-3.x-orange)](https://hardhat.org/)
[![OpenZeppelin](https://img.shields.io/badge/OpenZeppelin-5.6.1-green)](https://www.openzeppelin.com/contracts)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一个基于 **Hardhat 3** 开发的 NFT 英式拍卖智能合约项目，支持 **透明代理模式（Transparent Proxy）** 的合约升级，集成 **Chainlink 价格预言机**，并支持 **ETH 出价** 与 **ERC20 代币出价**。

---

## 目录

- [项目简介](#项目简介)
- [功能特性](#功能特性)
- [项目结构](#项目结构)
- [核心合约说明](#核心合约说明)
- [快速开始](#快速开始)
- [环境变量配置](#环境变量配置)
- [部署合约](#部署合约)
- [合约升级](#合约升级)
- [使用说明](#使用说明)
- [测试](#测试)
- [技术栈](#技术栈)
- [安全考虑](#安全考虑)
- [存储布局规则](#存储布局规则)
- [许可证](#许可证)
- [参考资源](#参考资源)

---

## 项目简介

本项目实现了一个去中心化的 **NFT 英式拍卖市场**，主要流程如下：

1. **卖家**创建拍卖，将 NFT 授权给拍卖合约，设置起拍价与拍卖时长。
2. **买家**使用 ETH 或 ERC20 代币出价，每次出价必须比当前最高价高出至少 **5%**。
3. 拍卖结束后，最高出价者获得 NFT，卖家获得成交价扣除平台手续费后的金额，平台收取 **2.5%** 手续费。
4. 未中标的出价人可以提取退款。
5. 通过 **透明代理模式** 部署，后续可平滑升级至 V2 版本，新增 ERC20 出价、多代币价格查询等功能。

---

## 功能特性

- ✅ **NFT 拍卖创建**：支持任意 ERC721 NFT 作为拍卖标的。
- ✅ **英式竞价机制**：每次出价必须高于当前最高价的 105%。
- ✅ **ETH 出价**：原生 ETH 参与拍卖，自动退款机制。
- ✅ **ERC20 出价**（V2）：支持使用 USDC、DAI 等 ERC20 代币出价。
- ✅ **价格预言机**：集成 Chainlink，可查看 ETH/ERC20 等值 USD 价格。
- ✅ **平台手续费**：默认 2.5%，可配置手续费接收地址。
- ✅ **透明代理升级**：使用 OpenZeppelin TransparentUpgradeableProxy 实现可升级架构。
- ✅ **安全防护**：ReentrancyGuard、CEI 模式、输入校验、权限控制。

---

## 项目结构

```
nft-marketplace/
├── contracts/
│   ├── HToken.sol                          # ERC721 NFT 合约（测试用）
│   ├── NFTAuction.sol                      # 原始不可升级拍卖合约
│   ├── NFTAuctionUpgradeable.sol           # 可升级拍卖合约 V1
│   ├── NFTAuctionV2.sol                    # 升级版本 V2（支持 ERC20 出价）
│   ├── TransparentUpgradeableProxy.sol     # 透明代理合约
│   ├── ProxyAdmin.sol                      # 代理管理员合约
│   ├── dataFeed/
│   │   └── PriceOracleRouter.sol           # Chainlink 价格预言机路由器
│   └── mocks/
│       ├── MyMockV3Aggregator.sol          # Chainlink Mock 喂价合约
│       └── MockERC20.sol                   # 测试用 ERC20 代币合约
├── scripts/
│   ├── deployWithProxy.ts                  # 透明代理方式部署 V1（推荐）
│   ├── upgrade.ts                          # 升级至 V2 并初始化
│   └── prepareUpgrade.ts                   # 准备升级（验证新实现合约）
├── test/
│   ├── nftAuction.test.ts                  # 原始拍卖合约测试
│   ├── nftAuctionV2.test.ts                # V2 升级版拍卖合约测试
│   ├── hToken.test.ts                      # HToken NFT 合约测试
│   └── priceOracleRouter.test.ts           # 价格预言机路由器测试
├── ignition/
│   └── modules/
│       └── Counter.ts                      # Hardhat Ignition 示例模块
├── helper-hardhat-config.ts                # 网络配置与 Mock 喂价参数
├── hardhat.config.ts                       # Hardhat 配置文件
├── package.json                            # 项目依赖
├── tsconfig.json                           # TypeScript 配置
├── README.md                               # 项目文档
```

---

## 核心合约说明

### 1. `HToken.sol`

- 基于 OpenZeppelin `ERC721`、`ERC721URIStorage`、`ERC721Burnable`、`Ownable` 构建的测试用 NFT。
- 最大供应量：1000（可通过 `setMaxSupply` 调整，便于测试）。
- 铸造价格：0.01 ETH。
- 只有合约所有者（Owner）可以调用 `safeMint`，合约 ETH 余额可由 Owner 提取。

### 2. `NFTAuction.sol`（原始版本）

- 不可升级的英式拍卖合约。
- 核心功能：
  - `createAuction`：创建拍卖，需要卖家拥有 NFT 并授权给合约。
  - `placeBid`：ETH 出价，需高于当前最高价 5%。
  - `setAuctionStatus`：卖家可暂停/恢复拍卖。
  - `endAuction`：时间到后结束拍卖，转移 NFT 并分配资金。
  - `withdraw`：未中标者提取退款。
  - `showEth2USD`：通过 Chainlink 查询 ETH 等值 USD 价格。

### 3. `NFTAuctionUpgradeable.sol`（V1 可升级版本）

- 继承 `Initializable`、`ContextUpgradeable`、`ReentrancyGuard`。
- 使用 `initialize` 替代构造函数，适配透明代理模式。
- 预留 `uint256[50] __gap` 存储间隙，保证后续升级时存储布局兼容。

### 4. `NFTAuctionV2.sol`（V2 升级版本）

- 继承 `NFTAuctionUpgradeable`，保留 V1 的 ETH 拍卖能力。
- 新增功能：
  - `placeBidWithERC20`：使用 ERC20 代币出价，每场拍卖锁定一种出价代币。
  - `endAuctionV2`：支持 ETH 与 ERC20 两种结算方式。
  - `withdrawV2`：支持 ETH 与 ERC20 退款。
  - `getTokenPriceInUSD` / 重写 `showEth2USD`：通过 `PriceOracleRouter` 查询任意代币的 USD 价格。
  - `version` 版本号字段。
- 新增状态变量后，将 `__gap` 从 50 调整为 47，保持总存储槽数一致。

### 5. `PriceOracleRouter.sol`

- 统一管理多个代币的 Chainlink 喂价地址。
- 默认注册 ETH/USD Feed。
- 支持通过 `setTokenFeed` 注册任意 ERC20/USD Feed。
- 提供 `getTokenPriceUSD` 与 `getTokenAmountInUSD`，结果统一按 18 位精度返回。

### 6. `TransparentUpgradeableProxy.sol` / `ProxyAdmin.sol`

- 透明代理标准实现，代理合约持有状态，实现合约持有逻辑。
- `ProxyAdmin` 拥有升级权限，只有其所有者可以调用 `upgradeAndCall`。

### 7. `MockERC20.sol`

- 用于测试 ERC20 出价功能的简单 ERC20 代币合约。
- 基于 OpenZeppelin `ERC20` 构建，公开 `mint` 函数，可在测试中自由给任意地址铸造代币。
- 仅在本地测试网络中使用，不上线。

---

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 编译合约

```bash
npx hardhat compile
```

### 3. 运行测试

```bash
npx hardhat test
```

或按合约分别测试：

```bash
npx hardhat test test/nftAuction.test.ts
npx hardhat test test/nftAuctionV2.test.ts
npx hardhat test test/hToken.test.ts
npx hardhat test test/priceOracleRouter.test.ts
```

---

## 环境变量配置

在本地开发环境中，Mock 喂价合约会自动部署。在 Sepolia 等测试网部署时，需要配置环境变量：

```bash
# RPC 节点
SEPOLIA_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY

# 至少 5 个私钥（Hardhat config 要求）
PRIVATE_KEY1=0x...
PRIVATE_KEY2=0x...
PRIVATE_KEY3=0x...
PRIVATE_KEY4=0x...
PRIVATE_KEY5=0x...

# 代理管理员地址（必须是私钥对应的地址之一）
SEPOLIA_PROXY_ADMIN_ADDRESS=0x...

# 手续费接收地址
SEPOLIA_FEE_RECEIVER_ADDRESS=0x...

# （升级时使用）代理合约地址
SEPOLIA_PROXY_ADDRESS=0x...
```

项目使用 `@chainlink/env-enc` 读取环境变量，请确保本地 `.env` 文件已正确配置。

---

## 部署合约

### 方式一：本地开发网络（推荐首次体验）

```bash
npx hardhat run scripts/deployWithProxy.ts --network hardhat
```

本地网络会自动：
1. 部署 `MyMockV3Aggregator` 作为 ETH/USD 喂价源。
2. 部署 `NFTAuctionUpgradeable` 作为实现合约。
3. 部署 `TransparentUpgradeableProxy` 作为代理合约，并完成初始化。
4. 校验 `ProxyAdmin` 的所有者是否正确设置。

### 方式二：Sepolia 测试网

```bash
npx hardhat run scripts/deployWithProxy.ts --network sepolia
```

部署成功后会输出：

```
=== Deployment Summary ===
Proxy Address:            0x...
Implementation Address:   0x...
ProxyAdmin Address:       0x...
ProxyAdmin Owner:         0x...
FeeReceiver:              0x...
PlatformFee:              250
```

> ⚠️ **重要提示**：`ProxyAdmin` 的所有者拥有升级代理合约的权限，请务必安全保管对应私钥。

---

## 合约升级

### 步骤 1：准备升级（验证新实现合约）

```bash
npx hardhat run scripts/prepareUpgrade.ts --network sepolia
```

此脚本会：
- 读取代理合约当前的实现地址与 `ProxyAdmin` 地址。
- 部署 `NFTAuctionV2` 新实现合约（仅验证，不真正升级）。
- 验证新合约可正常调用。

> 注意：`scripts/prepareUpgrade.ts` 中硬编码了一个代理地址，使用前请修改为你自己的代理地址。

### 步骤 2：执行升级（V1 → V2）

```bash
npx hardhat run scripts/upgrade.ts --network sepolia
```

升级脚本会：
1. 部署 `NFTAuctionV2` 新实现合约。
2. 部署 `PriceOracleRouter` 价格预言机路由器。
3. 校验 `ProxyAdmin` 所有者与部署者是否一致。
4. 调用 `ProxyAdmin.upgradeAndCall`，同时执行 `initializeV2` 完成 V2 初始化。
5. 读取链上实现地址，确认升级成功。
6. 验证 V2 的 `priceOracle`、`version`、`platformFee`、`feeReceiver` 等状态。

升级成功后会输出：

```
=== Upgrade Summary ===
Proxy Address:            0x...
New Implementation:       0x...
Version:                  2
feeReceiver:              0x...
platformFee:              250
```

---

## 使用说明

### 部署 HToken NFT（测试用）

```typescript
const HToken = await ethers.getContractFactory("HToken");
const htoken = await HToken.deploy(initialOwner.address);
await htoken.waitForDeployment();
```

### 铸造 NFT

```typescript
await htoken.safeMint(buyer.address, { value: ethers.parseEther("0.01") });
```

### 创建拍卖

```typescript
// 卖家先授权 NFT 给拍卖合约
await htoken.connect(seller).approve(auctionAddress, tokenId);

// 创建拍卖：起拍价 1 ETH，持续 2 小时
const auction = await ethers.getContractAt("NFTAuctionUpgradeable", proxyAddress);
await auction.connect(seller).createAuction(
  htokenAddress,
  tokenId,
  ethers.parseEther("1"),  // startPrice
  2                         // durationTime（小时）
);
```

### ETH 出价

```typescript
await auction.connect(buyer1).placeBid(auctionId, { value: ethers.parseEther("1") });
await auction.connect(buyer2).placeBid(auctionId, { value: ethers.parseEther("1.05") }); // ≥ +5%
```

### ERC20 出价（V2）

```typescript
// 先授权 ERC20 给拍卖合约
const usdc = await ethers.getContractAt("IERC20", usdcAddress);
await usdc.connect(buyer).approve(proxyAddress, amount);

// 使用 ERC20 出价
const auctionV2 = await ethers.getContractAt("NFTAuctionV2", proxyAddress);
await auctionV2.connect(buyer).placeBidWithERC20(auctionId, usdcAddress, amount);
```

### 查看 USD 价格

```typescript
// V1：仅 ETH
const usdAmount = await auction.showEth2USD(ethers.parseEther("1"));

// V2：任意已注册代币
const usdAmount = await auctionV2.getTokenPriceInUSD(usdcAddress, ethers.parseUnits("100", 6));
```

### 结束拍卖

```typescript
// V1 / ETH 拍卖
await auction.connect(seller).endAuction(auctionId);

// V2 / 混合拍卖
await auctionV2.connect(seller).endAuctionV2(auctionId);
```

### 提取退款

```typescript
// V1
await auction.connect(buyer).withdraw(auctionId);

// V2
await auctionV2.connect(buyer).withdrawV2(auctionId);
```

### 注册 ERC20 喂价（PriceOracleRouter）

```typescript
const router = await ethers.getContractAt("PriceOracleRouter", routerAddress);
await router.setTokenFeed(usdcAddress, usdcUsdFeedAddress, 8);
```

---

## 测试

本项目包含完整的测试套件，覆盖以下场景：

### `nftAuction.test.ts`

- ✅ 创建拍卖参数校验（0 地址、起拍价、时长、所有权、授权）
- ✅ 拍卖创建事件验证
- ✅ ETH 出价校验（活跃状态、时间、卖家自买、最低加价 5%）
- ✅ 待退款金额累计计算
- ✅ 拍卖结束与资金分配（手续费、卖家收入、重入防护）
- ✅ 买家退款提取
- ✅ Chainlink Mock 喂价与 ETH/USD 换算

### `nftAuctionV2.test.ts`

- ✅ 创建拍卖参数校验（继承 V1，验证基础逻辑）
- ✅ ETH 出价完整功能（与 V1 一致的出价、退款记录、事件）
- ✅ **ERC20 代币出价**（零地址、零金额、状态校验、最低加价 5%、代币类型锁定、Token 转账、退款记录、事件）
- ✅ **ETH 与 ERC20 混合拍卖场景**（同合约内两种拍卖共存、代币类型隔离）
- ✅ **结束拍卖 V2 — ETH 结算**（状态校验、资金分配、手续费、NFT 转移、流拍场景）
- ✅ **结束拍卖 V2 — ERC20 结算**（ERC20 转账给卖家和手续费接收方、NFT 转移、事件）
- ✅ **提取退款 V2 — ETH 退款**（未中标者退款、退款清零）
- ✅ **提取退款 V2 — ERC20 退款**（ERC20 退还出价、余额验证）
- ✅ **价格预言机集成**（ETH/USD 查询、ERC20/USD 查询、showEth2USD 兼容、版本号校验）

### `hToken.test.ts`

- ✅ 只有 Owner 可以铸造
- ✅ 铸造事件验证
- ✅ 合约收到铸造费用
- ✅ 最大供应量限制
- ✅ 铸造价格校验
- ✅ Owner 提现与余额校验

### `priceOracleRouter.test.ts`

- ✅ 构造函数初始化（ETH feed 地址/精度注册、supportedTokens 初始化）
- ✅ **setTokenFeed**（新增代币、更新已有、重复不冗余、零地址/零精度拒绝、事件、多代币注册）
- ✅ **removeTokenFeed**（正常移除、列表计数、swap-and-pop 顺序保持、不存在代币拒绝、事件）
- ✅ **getTokenPriceUSD**（ETH/ERC20 查询、未注册拒绝、feed 更新后价格变化、非正价格拒绝）
- ✅ **getTokenAmountInUSD**（ETH/ERC20 金额换算、小额精度、零金额拒绝）
- ✅ **getSupportedTokenCount / getSupportedTokenList**（增删后计数与列表一致性）

运行测试：

```bash
npx hardhat test
```

---

## 技术栈

- **Solidity**: 0.8.28
- **Hardhat**: 3.1.0
- **Hardhat Ignition**: 3.1.7
- **Hardhat Toolbox (Mocha + Ethers)**: 3.0.7
- **OpenZeppelin Contracts**: 5.6.1
- **OpenZeppelin Contracts Upgradeable**: 5.x
- **Chainlink Contracts**: 1.5.0
- **TypeScript**: ~5.8.0
- **Ethers.js**: v6
- **Mocha / Chai**: 测试框架

---

## 安全考虑

本项目在设计与实现中采取了以下安全措施：

1. **重入攻击防护**
   - 使用 OpenZeppelin `ReentrancyGuard` 修饰涉及 ETH/ERC20 转账的函数（`endAuction`、`endAuctionV2`、`withdraw`、`withdrawV2`）。
   - 遵循 **Checks-Effects-Interactions（CEI）** 模式，先修改状态再执行外部调用。

2. **输入验证**
   - 校验 NFT 合约地址非 0。
   - 校验起拍价大于 0。
   - 校验拍卖时长至少 1 小时。
   - 校验卖家拥有 NFT 并授权给拍卖合约。
   - 校验出价金额满足最低加价要求。

3. **权限控制**
   - 只有 NFT 所有者可以创建对应拍卖。
   - 只有卖家可以设置拍卖状态或结束拍卖。
   - `HToken` 的铸造与提现仅限 Owner。
   - 代理升级权限归 `ProxyAdmin` 所有者所有。

4. **状态一致性**
   - 防止重复确认与无效出价。
   - 拍卖结束后标记 `active = false`，避免重复结算。

5. **代理模式安全**
   - 使用 OpenZeppelin 标准 `TransparentUpgradeableProxy` 与 `ProxyAdmin`。
   - 实现合约通过 `initializer` / `reinitializer(2)` 保证初始化函数只执行一次。

6. **价格安全**
   - Chainlink 喂价返回 `answer > 0` 才视为有效价格。
   - `PriceOracleRouter` 统一管理喂价地址，降低单点配置错误风险。

---

## 存储布局规则

由于使用透明代理模式，升级新实现合约时必须严格遵守 **存储布局兼容规则**：

- ✅ **可以**：在现有状态变量之后追加新的状态变量。
- ✅ **可以**：修改函数逻辑（不影响存储布局）。
- ✅ **可以**：新增事件与函数。
- ❌ **不能**：删除已有的状态变量。
- ❌ **不能**：改变已有状态变量的类型。
- ❌ **不能**：改变已有状态变量的顺序。
- ❌ **不能**：在已有状态变量之间插入新变量。

### 当前合约的存储布局

#### `NFTAuctionUpgradeable`（V1）

| 顺序 | 变量 | 类型 | 说明 |
|------|------|------|------|
| 1 | `acutionMaps` | `mapping(uint256 => Auction)` | 拍卖信息 |
| 2 | `acutionCounter` | `uint256` | 拍卖计数器 |
| 3 | `pendingRefundMap` | `mapping(uint256 => mapping(address => uint256))` | 待退款 |
| 4 | `platformFee` | `uint256` | 平台手续费（基点） |
| 5 | `feeReceiver` | `address` | 手续费接收地址 |
| 6 | `dataFeed` | `AggregatorV3Interface` | Chainlink 喂价 |
| 7 | `__gap` | `uint256[50]` | 存储间隙 |

#### `NFTAuctionV2`

| 顺序 | 变量 | 类型 | 说明 |
|------|------|------|------|
| 继承 V1 的所有变量 | — | — | — |
| +1 | `priceOracle` | `PriceOracleRouter` | 价格预言机路由器 |
| +2 | `auctionBidToken` | `mapping(uint256 => address)` | 每场拍卖的出价代币 |
| +3 | `version` | `uint256` | 版本号 |
| 调整 | `__gap` | `uint256[47]` | 保持总槽数不变 |

> **提示**：升级前建议使用 `npx hardhat validate-upgrade` 或 OpenZeppelin Upgrades 插件检查存储布局兼容性。

---

## 许可证

本项目采用 [MIT License](https://opensource.org/licenses/MIT) 开源许可。

---

## 参考资源

- [OpenZeppelin Contracts 文档](https://docs.openzeppelin.com/contracts/5.x/)
- [OpenZeppelin Upgrades 插件文档](https://docs.openzeppelin.com/upgrades-plugins/1.x/)
- [OpenZeppelin 代理模式详解](https://docs.openzeppelin.com/upgrades-plugins/1.x/proxies)
- [Hardhat 官方文档](https://hardhat.org/docs)
- [Hardhat Ignition 文档](https://hardhat.org/ignition/docs)
- [Chainlink 价格 Feeds 文档](https://docs.chain.link/data-feeds/using-data-feeds)
- [EIP-1967: Proxy Storage Slots](https://eips.ethereum.org/EIPS/eip-1967)

---

## 贡献

欢迎提交 Issue 和 Pull Request！

如果你发现文档或代码中有任何问题，欢迎提交 Issue 或 Pull Request。
