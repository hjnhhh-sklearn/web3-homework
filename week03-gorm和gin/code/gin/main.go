package main

import (
	"fmt"
	"gin/models"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"log"
	"net/http"
	"os"
	"time"
)

var db *gorm.DB

func initDB() {
	// 2. 配置DSN（适配你之前的MySQL环境：端口3307，库名go-study）
	dsn := "root:x3237219@tcp(192.168.0.58:3306)/go-study?charset=utf8mb4&parseTime=True&loc=Local"

	// 3. 配置Gorm日志（方便查看SQL执行过程）
	newLogger := logger.New(
		log.New(os.Stdout, "\r\n", log.LstdFlags), // 输出到控制台
		logger.Config{
			SlowThreshold: time.Second, // 慢SQL阈值
			LogLevel:      logger.Info, // 日志级别：Info显示执行的SQL
			Colorful:      true,        // 彩色输出
		},
	)

	// 4. 连接MySQL数据库 db为全局变量
	var err error
	db, err = gorm.Open(mysql.Open(dsn), &gorm.Config{
		Logger: newLogger, // 启用日志
	})
	if err != nil {
		fmt.Printf("数据库连接失败：%v\n", err)
		return
	}
	fmt.Println("db", db)

	// 删除某个字段
	//migrator := db.Migrator()
	//if migrator.HasColumn(&Post{}, "comment_status") { // 先检查字段是否存在
	//	err = migrator.DropColumn(&Post{}, "comment_status")
	//	if err != nil {
	//		log.Fatalf("删除 comments 表的 comment_status 字段失败：%v", err)
	//	}
	//	log.Println("✅ 成功删除 comments 表的 comment_status 字段")
	//}

	// 5. 自动迁移（创建表 + 维护字段/索引/外键）
	err = db.AutoMigrate(&models.User{}, &models.Post{}, &models.Comment{})
	if err != nil {
		log.Fatalf("创建表失败：%v", err)
	}
	log.Println("表创建/更新成功！")
}

func Register(c *gin.Context) {
	var user models.User
	if err := c.ShouldBindJSON(&user); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// 加密密码
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(user.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}
	user.Password = string(hashedPassword)

	if err := db.Create(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "User registered successfully"})
}

// 1. 定义文章创建的请求结构体（加校验标签）
type CreatePostRequest struct {
	Title   string `json:"title" binding:"required"`   // 标题必填
	Content string `json:"content" binding:"required"` // 内容必填
	UserID  string `json:"userid" binding:"required"`  // 用户ID必填
}

// 2. 根据ID查询/删除文章的请求结构体（仅传ID）
type PostIDRequest struct {
	ID uint64 `json:"id" binding:"required"` // 文章ID必填（uint64匹配GORM的uint类型）
}

// 3. 修改文章的请求结构体（ID必填，其他可选）
type UpdatePostRequest struct {
	ID      uint64 `json:"id" binding:"required"` // 文章ID必填
	Title   string `json:"title"`                 // 标题（可选）
	Content string `json:"content"`               // 内容（可选）
	UserID  string `json:"userid"`                // 用户ID（可选）
}

// 创建文章
func CreatePost(c *gin.Context) {
	var req CreatePostRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 构造模型参数
	post := models.Post{
		Title:   req.Title,
		Content: req.Content,
		UserID:  req.UserID,
	}

	// 插入数据库
	if err := db.Create(&post).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{
		"code": 200,
		"msg":  "文章创建成功",
		"data": "any",
	})
}

// 2. 根据ID获取文章（POST，JSON传ID）
func GetPostByID(c *gin.Context) {
	var req PostIDRequest
	// 绑定JSON中的ID参数
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误：" + err.Error()})
		return
	}

	// 查询文章
	var post models.Post
	result := db.First(&post, req.ID) // 根据主键查询
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "文章不存在"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "查询文章失败：" + result.Error.Error()})
		}
		return
	}

	// 返回查询结果
	c.JSON(http.StatusOK, gin.H{
		"code": 200,
		"msg":  "查询文章成功",
		"data": post,
	})
}

// 3. 修改文章（POST，JSON传ID和更新字段）
func UpdatePost(c *gin.Context) {
	var req UpdatePostRequest
	// 绑定JSON参数（ID必填，其他可选）
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误：" + err.Error()})
		return
	}

	// 先检查文章是否存在
	var post models.Post
	result := db.First(&post, req.ID)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "文章不存在"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "查询文章失败：" + result.Error.Error()})
		}
		return
	}

	// 构造更新参数（只更新非空字段）
	updateData := make(map[string]interface{})
	if req.Title != "" {
		updateData["title"] = req.Title
	}
	if req.Content != "" {
		updateData["content"] = req.Content
	}
	if req.UserID != "" {
		updateData["user_id"] = req.UserID
	}

	// 执行更新
	if err := db.Model(&post).Updates(updateData).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "修改文章失败：" + err.Error()})
		return
	}

	// 查询更新后的文章
	db.First(&post, req.ID)
	c.JSON(http.StatusOK, gin.H{
		"code": 200,
		"msg":  "文章修改成功",
		"data": post,
	})
}

// 4. 删除文章（POST，JSON传ID）
func DeletePost(c *gin.Context) {
	var req PostIDRequest
	// 绑定JSON中的ID参数
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误：" + err.Error()})
		return
	}

	// 检查文章是否存在
	var post models.Post
	result := db.First(&post, req.ID)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "文章不存在"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "查询文章失败：" + result.Error.Error()})
		}
		return
	}

	// 执行软删除（如需物理删除，用 db.Unscoped().Delete(&post)）
	if err := db.Delete(&post).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除文章失败：" + err.Error()})
		return
	}

	// 返回成功响应
	c.JSON(http.StatusOK, gin.H{
		"code": 200,
		"msg":  "文章删除成功",
		"data": gin.H{"post_id": req.ID},
	})
}

// 发布评论
type CreateCommentRequest struct {
	PostID  uint   `json:"postId" binding:"required"`  // 关联文章ID（必填）
	UserID  uint   `json:"userId" binding:"required"`  // 评论用户ID（必填）
	Content string `json:"content" binding:"required"` // 评论内容（必填）
}

func CreateComment(c *gin.Context) {
	// 1. 绑定并校验评论参数
	var req CreateCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误：" + err.Error()})
		return
	}

	// 2. 校验关联的文章是否存在（避免评论不存在的文章）
	var post models.Post
	result := db.First(&post, req.PostID)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "关联的文章不存在，无法发布评论"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "查询关联文章失败：" + result.Error.Error()})
		}
		return
	}

	// 3. 构造评论模型
	comment := models.Comment{
		PostID:  req.PostID,  // 关联文章ID
		UserID:  req.UserID,  // 评论用户ID
		Content: req.Content, // 评论内容
	}

	// 4. 插入评论到数据库
	if err := db.Create(&comment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "发布评论失败：" + err.Error()})
		return
	}

	// 5. （可选）更新文章的评论状态（确保和Post模型的CommentStatus字段一致）
	db.Model(&post).Update("comment_status", "有评论")

	// 6. 返回成功响应
	c.JSON(http.StatusCreated, gin.H{
		"code": 200,
		"msg":  "评论发布成功",
		"data": comment,
	})
}

func Login(c *gin.Context) {
	var user models.User
	if err := c.ShouldBindJSON(&user); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var storedUser models.User
	if err := db.Where("user_name = ?", user.UserName).First(&storedUser).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid username or password"})
		return
	}

	// 验证密码
	if err := bcrypt.CompareHashAndPassword([]byte(storedUser.Password), []byte(user.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid username or password"})
		return
	}

	// 生成 JWT
	expirationTime := time.Now().Add(24 * time.Hour)
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"id":       storedUser.ID,
		"username": storedUser.UserName,
		"exp":      expirationTime.Unix(),
	})

	tokenString, err := token.SignedString([]byte("your_secret_key"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 200,
		"msg":  "Login success",
		"data": gin.H{
			"token":   tokenString,    // 返回生成的JWT Token
			"expires": expirationTime, // 返回过期时间（可选）
			"user": gin.H{ // 返回用户基本信息（避免敏感字段）
				"id":       storedUser.ID,
				"username": storedUser.UserName,
				"password": storedUser.Password,
				"email":    storedUser.Email,
			},
		},
	})
}

func main() {
	initDB()
	r := gin.Default()

	// 注册路由
	r.POST("/register", Register)

	// 文章的crud
	r.POST("/createPost", CreatePost)
	r.POST("/getPost", GetPostByID)
	r.POST("/updatePost", UpdatePost)
	r.POST("/delPost", DeletePost)

	// 新发评论
	r.POST("/creatComment", CreateComment)

	// jwt登录
	r.POST("/login", Login)

	r.Run(":8080")
}
