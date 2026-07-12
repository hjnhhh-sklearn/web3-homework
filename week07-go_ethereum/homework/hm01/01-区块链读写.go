package main

import (
	"context"
	"fmt"
	"github.com/ethereum/go-ethereum/ethclient"
	"log"
	"math/big"
	"os"
	"time"
)

// 使用etherClient.Client连接节点
func connectNode() {
	rpcURL := os.Getenv("ETH_RPC_URL")
	if rpcURL == "" {
		log.Fatal("ETH_RPC_URL is not set")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	client, err := ethclient.DialContext(ctx, rpcURL)

	if err != nil {
		log.Fatal("出现错误")
	}
	defer client.Close()

	// 真正发送请求：获取最新区块号
	// 如果 endpoint 被 disable 了，这里就会报错
	blockNumber, err := client.BlockNumber(ctx)
	if err != nil {
		log.Fatal("fail to get blockNumber:", err)
	}

	// chainID
	chainId, err := client.ChainID(ctx)
	if err != nil {
		log.Fatal("fail to get chainId:", err)
	}

	// blockInfo
	num := big.NewInt(11255001)
	blockInfo, err := client.BlockByNumber(ctx, num)
	if err != nil {
		log.Fatal("fail to get blockInfo:", err)
	}

	// 获取某个区块下的交易数量
	txCount, err := client.TransactionCount(ctx, blockInfo.Hash())
	if err != nil {
		log.Fatal("fail to get txCount:", err)
	}

	fmt.Printf("连接成功！最新区块号: %d\n", blockNumber)
	fmt.Printf("当前区块号: %d\n", blockInfo.Number().Uint64())
	fmt.Printf("chainId: %d\n", chainId)
	fmt.Printf("blockInfo TxHash: %s\n", blockInfo.Header().TxHash)
	fmt.Printf("blockInfo hash: %s\n", blockInfo.Hash().Hex())
	fmt.Printf("blockInfo Header().Time: %d\n", blockInfo.Header().Time)
	fmt.Printf("blockInfo txCount: %d\n", txCount)

}

func main() {
	connectNode()
}
