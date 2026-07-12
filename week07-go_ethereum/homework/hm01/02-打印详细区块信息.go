package main

import (
	"context"
	"fmt"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/ethclient"
	"log"
	"os"
	"time"
)

func main() {
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

	// 获取最新区块信息
	latest, err := client.BlockByNumber(ctx, nil)
	if err != nil {
		log.Fatal("fail to get latest:", err)
	}

	printBlockInfo("latest blockInfo", latest)
}

// printBlockInfo 打印详细的区块信息
func printBlockInfo(title string, block *types.Block) {
	fmt.Println("======================================")
	fmt.Println(title)
	fmt.Println("======================================")
	fmt.Printf("Block: %+v\n", block)

	// 基本信息
	fmt.Printf("Number       : %d\n", block.Number().Uint64())
	fmt.Printf("Hash         : %s\n", block.Hash().Hex())
	fmt.Printf("Parent Hash  : %s\n", block.ParentHash().Hex())

	// 时间信息
	blockTime := time.Unix(int64(block.Time()), 0)
	fmt.Printf("Time         : %s\n", blockTime.Format(time.RFC3339))
	fmt.Printf("Time (Local) : %s\n", blockTime.Local().Format("2006-01-02 15:04:05 MST"))

	// Gas 信息
	gasUsed := block.GasUsed()
	gasLimit := block.GasLimit()
	gasUsagePercent := float64(gasUsed) / float64(gasLimit) * 100
	fmt.Printf("Gas Used     : %d (%.2f%%)\n", gasUsed, gasUsagePercent)
	fmt.Printf("Gas Limit    : %d\n", gasLimit)

	// 交易信息
	txCount := len(block.Transactions())
	fmt.Printf("Tx Count     : %d\n", txCount)

	// 区块根信息（Merkle 树根）
	fmt.Printf("State Root   : %s\n", block.Root().Hex())
	fmt.Printf("Tx Root      : %s\n", block.TxHash().Hex())
	fmt.Printf("Receipt Root : %s\n", block.ReceiptHash().Hex())

	// 区块大小估算（简化版，实际大小还包括其他字段）
	if txCount > 0 {
		fmt.Printf("\nFirst Tx Hash: %s\n", block.Transactions()[0].Hash().Hex())
		if txCount > 1 {
			fmt.Printf("Last Tx Hash : %s\n", block.Transactions()[txCount-1].Hash().Hex())
		}
	}

	// 难度信息（PoW 相关，PoS 后基本固定）
	fmt.Printf("Difficulty   : %s\n", block.Difficulty().String())

	// 区块奖励相关信息
	coinbase := block.Coinbase()
	if coinbase != (common.Address{}) {
		fmt.Printf("Coinbase     : %s\n", coinbase.Hex())
	}

	fmt.Println("======================================")
	fmt.Println()
}
