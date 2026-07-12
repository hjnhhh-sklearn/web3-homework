// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.24;

// 反转字符串
contract ReverseString {
    function reverse(string memory str) public returns (bytes memory) {
        bytes memory strBytes = bytes(str);
        uint256 left = 0;
        uint256 right = strBytes.length - 1;
        return string(toReverse(strBytes, 0, right));
    }

    function toReverse(
        bytes memory strBytes,
        uint256 left,
        uint256 right
    ) public returns (bytes memory) {
        while (left != right) {
            bytes1 temp = strBytes[left];
            strBytes[left] = strBytes[right];
            strBytes[right] = temp;
            left++;
            right--;
        }
        return strBytes;
    }
}

// 整数转罗马
contract IntToRoman {
    // 构造罗马字符映射表，比如3689要转成罗马数字，依次对千、百、十、个位数字获取到相应的字符拼接即可
    // 罗马人认为“0”是一种虚无，不喜欢0
    string[10][4] private indexToChar = [
        ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"],
        ["", "X", "XX", "XXX", "XL", "L", "LX", "LXX", "LXXX", "XC"],
        ["", "C", "CC", "CCC", "CD", "D", "DC", "DCC", "DCCC", "CM"],
        ["", "M", "MM", "MMM", "", "", "", "", "", ""]
    ];

    function convert(uint256 num) external view returns (string memory) {
        string memory part1 = indexToChar[3][(num / 1000) % 10]; //千位索引
        string memory part2 = indexToChar[2][(num / 100) % 10]; //百位索引
        string memory part3 = indexToChar[1][(num / 10) % 10]; //十位索引
        string memory part4 = indexToChar[0][num % 10]; //个位索引

        // 拼接即可
        return string.concat(part1, part2, part3, part4);
    }
}

// 罗马转整数
contract RomanToInt {
    // MMMCMXCIX
    // 依次遍历，将对应的数字放入一个number数组中
    // 如果num[i] < num[i+1]，则sum-num[i]
    // 如果num[i] >= num[i+1]，则sum+num[i]
    function convert(string memory str) external pure returns (int256) {
        bytes memory strBytes = bytes(str);
        int256[] memory nums = new int256[](strBytes.length);

        for (int i = 0; i < strBytes.length; i++) {
            if (strBytes[i] == bytes1("M")) {
                nums[i] = 1000;
            } else if (strBytes[i] == bytes1("D")) {
                nums[i] = 500;
            } else if (strBytes[i] == bytes1("C")) {
                nums[i] = 100;
            } else if (strBytes[i] == bytes1("L")) {
                nums[i] = 50;
            } else if (strBytes[i] == bytes1("X")) {
                nums[i] = 10;
            } else if (strBytes[i] == bytes1("V")) {
                nums[i] = 5;
            } else if (strBytes[i] == bytes1("I")) {
                nums[i] = 1;
            } else {
                revert("invalid char");
            }
        }

        // 判断nums，用int256做中间计算，防止向下溢出
        int256 sum = 0;
        for (int256 i = 0; i < nums.length - 1; i++) {
            if (nums[i] < nums[i + 1]) {
                sum = sum - nums[i];
            } else {
                sum = sum + nums[i];
            }
        }
        return sum + nums[nums.length - 1];
    }
}

// 合并2个有序数组
contract MergeSort {
    function toMerge(
        uint256[] memory nums1,
        uint256[] memory nums2
    ) external pure returns (uint256[] memory) {
        uint256 n1 = nums1.length;
        uint256 n2 = nums2.length;
        uint256[] memory help = new uint256[](n1 + n2);
        uint256 p1 = 0;
        uint256 p2 = 0;
        uint256 i = 0;
        while (p1 < n1 && p2 < n2) {
            if (nums1[p1] <= nums2[p2]) {
                help[i] = nums1[p1];
                p1++;
            } else {
                help[i] = nums2[p2];
                p2++;
            }
            i++;
        }
        while (p1 < n1) {
            help[i] = nums1[p1];
            p1++;
            i++;
        }
        while (p2 < n2) {
            help[i] = nums2[p2];
            p2++;
            i++;
        }
        return help;
    }
}

// 二分查找
contract BinarySearch {
    function binarySearch(
        int[] memory nums,
        int target
    ) external pure returns (int) {
        uint left = 0;
        uint right = nums.length - 1;
        while (left <= right) {
            uint mid = uint(left + (right - left) / 2);
            if (nums[mid] < target) {
                left = mid + 1;
            } else if (nums[mid] > target) {
                right = mid - 1;
            } else {
                return int(mid);
            }
        }
        return -1;
    }
}
