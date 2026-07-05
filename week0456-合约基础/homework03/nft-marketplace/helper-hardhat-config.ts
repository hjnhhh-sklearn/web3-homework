// 通用配置文件

// Mock喂价合约入参，精度8位小数，ETH-USD的价格为1666美元
const DECIMAL = 8
const INITIAL_ANSWER = 166600000000

// 不同链的喂价地址，目前配置以太网和BNB的测试网，加上索引标签
const networkConfig: {
    [chainId: number]: { eth2USDDataFeed: string }
} = {
    11155111: {
        eth2USDDataFeed: "0x694AA1769357215DE4FAC081bf1f309aDC325306"
    },
    97: {
        eth2USDDataFeed: "0x143db3CEEfbdfe5631aDD3E50f7614B6ba708BA7"
    }
}

// 开发环境网络
const developmentNetwork = ["hardhat", "local"];

export {
    DECIMAL,
    INITIAL_ANSWER,
    developmentNetwork,
    networkConfig
}