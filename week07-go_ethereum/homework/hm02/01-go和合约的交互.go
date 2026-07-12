package main

import (
	"context"
	"crypto/ecdsa"
	"fmt"
	"log"
	"math/big"
	"os"
	"time"

	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"

	"homework/hm02/solidity/contarct/binding" // 引入刚才生成的合约包
)

func main() {
	// 配置环境变量
	rpcURL := os.Getenv("ETH_RPC_URL")
	if rpcURL == "" {
		log.Fatal("ETH_RPC_URL is not set")
	}
	privateKeyHex := os.Getenv("SENDER_PRIVATE_KEY")
	if privateKeyHex == "" {
		log.Fatal("SENDER_PRIVATE_KEY is not set (required for send mode)")
	}

	// 1. 连接到 sepolia 测试网 RPC 节点
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	client, err := ethclient.DialContext(ctx, rpcURL)
	if err != nil {
		log.Fatalf("failed to connect to Ethereum node: %v", err)
	}
	defer client.Close()
	fmt.Println("成功连接至 Sepolia 测试网络!")

	// 2. 根据私钥获取from address
	privateKey, err := crypto.HexToECDSA(privateKeyHex)
	if err != nil {
		log.Fatalf("解析私钥失败: %v", err)
	}
	publicKey := privateKey.Public()
	publicKeyECDSA, ok := publicKey.(*ecdsa.PublicKey)
	if !ok {
		log.Fatal("无法获取公钥")
	}
	fromAddress := crypto.PubkeyToAddress(*publicKeyECDSA)

	// 3. 获取 Nonce 和 建议的 Gas Price
	nonce, err := client.PendingNonceAt(ctx, fromAddress)
	if err != nil {
		log.Fatalf("获取Nonce失败: %v", err)
	}

	gasPrice, err := client.SuggestGasPrice(ctx)
	if err != nil {
		log.Fatalf("获取GasPrice失败: %v", err)
	}

	// 4. 构建交易签名
	chainID := big.NewInt(11155111)
	auth, err := bind.NewKeyedTransactorWithChainID(privateKey, chainID)
	if err != nil {
		log.Fatalf("创建签名器失败: %v", err)
	}
	auth.Nonce = big.NewInt(int64(nonce))
	auth.Value = big.NewInt(0)     // 转账 0 ETH
	auth.GasLimit = uint64(100000) // 限制最大 Gas 消耗
	auth.GasPrice = gasPrice

	// 5. 绑定在 Sepolia 上部署好的合约地址
	contractAddressHex := "0xD25B5E9ECDaa2ab588B61567e4377c516709b91F"
	contractAddress := common.HexToAddress(contractAddressHex)

	instance, err := binding.NewCounter(contractAddress, client)
	if err != nil {
		log.Fatalf("绑定合约失败: %v", err)
	}

	// 6. 交互前：查询当前计数器的值 (读操作不需要 auth，传 nil 即可)
	currentNum, err := instance.Num(nil)
	if err != nil {
		log.Fatalf("查询初始值失败: %v", err)
	}
	fmt.Printf("当前计数器初始值: %s\n", currentNum.String())

	// 7. 交互中：调用 incrementNum 方法修改状态 (写操作，需要发交易签名)
	fmt.Println("正在发送交易调用 incrementNum()...")
	tx, err := instance.IncrementNum(auth)
	if err != nil {
		log.Fatalf("调用 incrementNum 失败: %v", err)
	}
	fmt.Printf("交易已发送! 交易 Hash: %s\n", tx.Hash().Hex())
	fmt.Println("正在等待区块打包交易...")

	// 8. 交互后：等待交易打包再查询新值
	receipt, err := bind.WaitMined(context.Background(), client, tx)
	if err != nil {
		log.Fatalf("等待交易打包时发生错误: %v", err)
	}
	// 检查收据中的状态：1 代表成功，0 代表失败（Revert）
	if receipt.Status == 0 {
		log.Fatalf("❌ 交易在链上执行失败 (Revert)！请去 Etherscan 检查 Hash: %s", tx.Hash().Hex())
	}
	fmt.Printf("🎉 交易打包成功！所在区块高度: %d\n", receipt.BlockNumber.Uint64())

	newNum, err := instance.Num(nil)
	if err != nil {
		log.Fatalf("查询最新值失败: %v", err)
	}
	fmt.Printf("🎉 调用成功! 计数器最新值已变为: %s\n", newNum.String())
}
