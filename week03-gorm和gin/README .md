# Gin + GORM 博客系统（用户 / 文章 / 评论）

该项目是一个基于 Gin 框架和 GORM 构建的轻量级博客后端系统，实现了用户注册 / 登录（JWT 认证）、文章 CRUD、评论发布等核心功能，所有接口均采用 POST 请求 + JSON 入参的方式。



## 一、运行环境

### 1. 基础环境

- Go 版本：≥ 1.21
- MySQL 版本：≥ 8.0.26
- 操作系统：Windows+Linux（无特殊依赖）

### 2. 数据库环境要求

- 数据库地址：`192.168.0.58`（可在代码中修改）
- 端口：`3306`（可在代码中修改）
- 数据库名：`go-study`（需提前创建）
- 账号密码：`root/x3237219`（需替换为自己的 MySQL 账号密码）



## 二、依赖安装

```
# 初始化
go mod init gin
# Gin 框架（Web 核心）
go get github.com/gin-gonic/gin

# GORM（ORM 框架）+ MySQL 驱动
go get gorm.io/gorm
go get gorm.io/driver/mysql

# bcrypt（密码加密）
go get golang.org/x/crypto/bcrypt

# JWT（身份认证）
go get github.com/golang-jwt/jwt/v5
```

## 三、项目配置文件

```
dsn := "root:x3237219@tcp(192.168.0.58:3306)/go-study?charset=utf8mb4&parseTime=True&loc=Local"
```

## 四、模型文件确认

三个对象，包括users、comments和post，分别代表用户，评论和文章

#### models/user.go

```go
package models

import "gorm.io/gorm"

type User struct {
	gorm.Model        // 包含ID、CreatedAt、UpdatedAt、DeletedAt
	Username string `gorm:"column:username;type:varchar(50);not null;unique;comment:用户名" json:"username"`
	Password string `gorm:"column:password;type:varchar(255);not null;comment:密码（哈希）" json:"password"`
	Email    string `gorm:"column:email;type:varchar(100);not null;unique;comment:邮箱" json:"email"`
}
```

#### models/post.go

```go
package models

import "gorm.io/gorm"

type Post struct {
	gorm.Model           // 包含ID、CreatedAt、UpdatedAt、DeletedAt
	Title         string `gorm:"type:varchar(200);not null;comment:文章标题" json:"title"`
	Content       string `gorm:"type:text;not null;comment:文章内容" json:"content"`
	UserID        string `gorm:"not null;comment:所属用户ID" json:"userid"`
	CommentStatus string `gorm:"default:'有评论';comment:评论状态（有评论/无评论）" json:"comment_status"`
}
```

#### models/comment.go

```go
package models

import "gorm.io/gorm"

type Comment struct {
	gorm.Model        // 包含ID、CreatedAt、UpdatedAt、DeletedAt
	PostID  uint64    `gorm:"not null;comment:关联文章ID" json:"post_id"`
	UserID  string    `gorm:"not null;comment:评论用户ID" json:"userid"`
	Content string    `gorm:"type:text;not null;comment:评论内容" json:"content"`
}
```

## 五、启动方式

### 1. 前置准备

- 确保 MySQL 服务已启动
- 提前创建数据库 `go-study`（执行 SQL：`CREATE DATABASE IF NOT EXISTS go_study DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`）

### 2. 启动项目

确保mysql连接正常

```go
go run main.go
```

## 六、核心接口说明

| 接口路径      | 功能描述            | 请求方式 | 入参示例（JSON）                                             |
| ------------- | ------------------- | -------- | ------------------------------------------------------------ |
| /register     | 用户注册            | POST     | {"username":"张一山","password":"12345678","email":"zhangyishan@example.com"} |
| /login        | 用户登录（返回JWT） | POST     | {"username":"张一山","password":"12345678"}                  |
| /createPost   | 创建文章            | POST     | {"title":"仙剑奇侠传","content":"文章内容","userid":"13"}    |
| /getPost      | 根据ID查询文章      | POST     | {"id":1}                                                     |
| /updatePost   | 根据ID修改文章      | POST     | {"id":1,"title":"修改后的标题","content":"修改后的内容"}     |
| /delPost      | 根据ID删除文章      | POST     | {"id":1}                                                     |
| /creatComment | 发布评论            | POST     | {"post_id":1,"userid":"13","content":"这篇文章写得真好！"}   |

