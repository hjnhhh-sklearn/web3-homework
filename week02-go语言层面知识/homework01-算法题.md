# 一、流程控制

## 1、只出现一次的数字

**[只出现一次的数字](https://leetcode.cn/problems/single-number/)**：给定一个非空整数数组，除了某个元素只出现一次以外，其余每个元素均出现两次。找出那个只出现了一次的元素。可以使用 `for` 循环遍历数组，结合 `if` 条件判断和 `map` 数据结构来解决，例如通过 `map` 记录每个元素出现的次数，然后再遍历 `map` 找到出现次数为1的元素。

```go
package main

import "fmt"

func singleNumber(nums []int) int {
	// 用map记录每个数字出现的次数
	countMap := make(map[int]int)

	// 第一次遍历：统计每个数字出现次数
	for _, num := range nums {
		countMap[num]++
	}

	// 第二次遍历：找到出现次数为1的数字
	for num, count := range countMap {
		if count == 1 {
			return num
		}
	}

	return 0
}
```



## 2、回文数

**[回文数](https://leetcode-cn.com/problems/palindrome-number/)**：判断一个整数是否是回文数

考察：数字操作、条件判断

```go
package main

import (
	"fmt"
	"strings"
)

func isPalindrome(x int) bool {
	s := fmt.Sprint(x)
	var sb strings.Builder
	for i := len(s) - 1; i >= 0; i-- {
		sb.WriteByte(s[i])
	}
	return s == sb.String()
}
```



# 二、字符串

## 1、有效的括号

考察：字符串处理、栈的使用

题目：给定一个只包括 '('，')'，'{'，'}'，'['，']' 的字符串，判断字符串是否有效

链接：https://leetcode-cn.com/problems/valid-parentheses/

```go
package main

import "fmt"

func isValid(s string) bool {
	// 定义括号匹配的映射：右括号为key，左括号为value
	match := map[rune]rune{ // rune是int32的别名
		')': '(',
		'}': '{',
		']': '[',
	}
	// 用切片模拟栈
	stack := []rune{}

	// 遍历字符串每个字符
	for _, char := range s {
		// 如果是右括号
		if left, ok := match[char]; ok {
			// 栈空 或 栈顶不匹配，直接返回false
			if len(stack) == 0 || stack[len(stack)-1] != left {
				return false
			}
			// 匹配成功，弹出栈顶
			stack = stack[:len(stack)-1]
		} else {
			// 左括号，入栈
			stack = append(stack, char)
		}
	}
	// 最终栈空才是有效括号
	return len(stack) == 0
}
```



## 2、最长公共前缀

考察：字符串处理、循环嵌套

题目：查找字符串数组中的最长公共前缀

链接：https://leetcode-cn.com/problems/longest-common-prefix/

```go
package main

import "fmt"

func longestCommonPrefix(strs []string) string {
	// 空数组直接返回空
	if len(strs) == 0 {
		return ""
	}
	// 以第一个字符串为基准，逐个字符对比
	prefix := strs[0]
	for i := 1; i < len(strs); i++ {
		// 嵌套循环：对比当前prefix和第i个字符串的每个字符
		j := 0
		for j < len(prefix) && j < len(strs[i]) && prefix[j] == strs[i][j] {
			j++
		}
		// 截断prefix到匹配的长度
		prefix = prefix[:j]
		// 提前退出：prefix为空则无需继续，因为至少肯定有一个字符串和其他所有字符串没有公共前缀了
		if prefix == "" {
			break
		}
	}
	return prefix
}
```

# 三、基本值类型

## 1、加一

考察：数组操作、进位处理

题目：给定一个由整数组成的非空数组所表示的非负整数，在该数的基础上加一

链接：https://leetcode-cn.com/problems/plus-one/

```go
package main

import "fmt"

func plusOne(digits []int) []int {
	// 从数组末尾（个位）开始遍历
	for i := len(digits) - 1; i >= 0; i-- {
		// 当前位加1
		digits[i]++
		// 处理进位：取余10，若不为0则无进位，直接返回
		digits[i] %= 10
		if digits[i] != 0 {
			return digits
		}
	}
	// 所有位都进位（如999→1000），新建数组补1
	// append([]int{1}, digits...) 是 Go 中 “数组头部添加元素” 的极简写法，... 表示把 digits 切片的元素展开传入；
	return append([]int{1}, digits...)
}
```

# 四、引用类型：切片

## 1、删除有序数组的重复项

**[删除有序数组中的重复项](https://leetcode.cn/problems/remove-duplicates-from-sorted-array/)**：给你一个有序数组 `nums` ，请你原地删除重复出现的元素，使每个元素只出现一次，返回删除后数组的新长度。不要使用额外的数组空间，你必须在原地修改输入数组并在使用 O(1) 额外空间的条件下完成。可以使用双指针法，一个慢指针 `i` 用于记录不重复元素的位置，一个快指针 `j` 用于遍历数组，当 `nums[i]` 与 `nums[j]` 不相等时，将 `nums[j]` 赋值给 `nums[i + 1]`，并将 `i` 后移一位。

链接：https://leetcode-cn.com/problems/remove-duplicates-from-sorted-array/

```
package main

import "fmt"

func removeDuplicates(nums []int) int {
	// 空数组直接返回0
	if len(nums) == 0 {
		return 0
	}
	// 慢指针i：记录不重复元素的最后位置
	i := 0
	// 快指针j：遍历数组
	// arr   [1, 2, 2, 2, 3]
	// index [0, 1, 2, 3, 4]
	for j := 1; j < len(nums); j++ {
		// 找到不同元素，更新慢指针位置
		if nums[j] != nums[i] {
			i++
			nums[i] = nums[j]
		}
	}
	// 新长度是慢指针索引+1
	return i + 1
}
```



## 2、合并区间

**[合并区间](https://leetcode.cn/problems/merge-intervals/)**：以数组 `intervals` 表示若干个区间的集合，其中单个区间为 `intervals[i] = [starti, endi]` 。请你合并所有重叠的区间，并返回一个不重叠的区间数组，该数组需恰好覆盖输入中的所有区间。可以先对区间数组按照区间的起始位置进行排序，然后使用一个切片来存储合并后的区间，遍历排序后的区间数组，将当前区间与切片中最后一个区间进行比较，如果有重叠，则合并区间；如果没有重叠，则将当前区间添加到切片中。

```go
package main

import (
	"fmt"
	"sort"
)

func merge(intervals [][]int) [][]int {
	// 空数组直接返回
	if len(intervals) == 0 {
		return nil
	}

	// 按区间起始位置排序（对应Java的Arrays.sort）
	sort.Slice(intervals, func(i, j int) bool {
		return intervals[i][0] < intervals[j][0]
	})

	// 初始化起始和结束值
	s := intervals[0][0]
	e := intervals[0][1]

	// 定义结果切片（对应Java的res数组）
	res := make([][]int, 0, len(intervals)) // 切片类型，初始长度为0，容量为len(intervals)

	// 从1开始遍历区间
	// 对区间排序 [[1,3],[2,6],[8,10],[15,18]]
	for i := 1; i < len(intervals); i++ {
		if intervals[i][0] <= e {
			// 有重叠，更新结束值为较大者
			if intervals[i][1] > e {
				e = intervals[i][1]
			}
		} else {
			// 无重叠，添加当前合并的区间到结果
			res = append(res, []int{s, e})
			// 重置起始和结束值为当前区间
			s = intervals[i][0]
			e = intervals[i][1]
		}
	}

	// 添加最后一组区间
	res = append(res, []int{s, e})

	return res
}
```



# 五、基础

## 1、两数之和

**两数之和**

考察：数组遍历、map使用

题目：给定一个整数数组 nums 和一个目标值 target，请你在该数组中找出和为目标值的那两个整数

链接：https://leetcode-cn.com/problems/two-sum/

```go
package main

func twoSum(nums []int, target int) []int {
	// 准备一个map存储 ： 数值 ：索引
	numMap := map[int]int{}
	
	// 准备结果
	var res []int = make([]int, 2)
	for index, num := range nums {
		if index == 0 {
			numMap[num] = index
		} else {
			// 差值在 map 中
			if j, ok := numMap[target-num]; ok {
				res[0] = j
				res[1] = index
				break
			}else {
				// 差值不在map中，把当前值put进map
				numMap[num] = index
			}
		}
	}
	return res
}
```

