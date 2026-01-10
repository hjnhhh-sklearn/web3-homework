package models

import (
	"gorm.io/gorm"
	"log"
)

// 1.定义模型结构 + 关联关系
// User 用户
type User struct {
	gorm.Model        // 具有默认字段：ID，CreateAt，UpdatedAt, DeletedAt
	UserName   string `gorm:"type:varchar(50);not null;unique;comment:用户名"`
	Password   string `gorm:"type:varchar(100);not null;unique;comment:密码"`
	Email      string `gorm:"type:varchar(100);unique;comment:电子邮箱"`
	PostCount  int    `gorm:"default:0;comment:用户发布的文章数量"` // 新增统计字段
}

// Post 文章类
type Post struct {
	gorm.Model           // 具有默认字段：ID，CreateAt，UpdatedAt, DeletedAt
	Title         string `gorm:"type:varchar(200);not null;comment:文章标题"`
	Content       string `gorm:"type:text;not null;comment:文章内容"`
	UserID        string `gorm:"not null;comment:所属用户ID"`
	CommentStatus string `gorm:"default:'有评论';comment:评论状态（有评论/无评论）"` // 新增状态字段
}

// Post的钩子，创建后，更新用户文章数量
func (p *Post) AfterCreate(tx *gorm.DB) error {
	log.Printf("Post的钩子，创建后，更新用户文章数量")
	// 1. 校验用户ID是否有效
	if p.UserID == "" {
		log.Printf("警告：文章ID=%d 的用户ID为空，跳过文章数统计", p.ID)
		return nil
	}

	// 2. 更新用户文章数量，事务操作
	err := tx.Model(&User{}).
		Where("id = ?", p.UserID).
		Update("post_count", gorm.Expr("post_count + ?", 1)).Error

	if err != nil {
		log.Printf("更新用户ID=%d 的文章数失败：%v", p.UserID, err)
		return err
	}
	log.Println("用户文章数更新成功")
	return nil
}

// Comment 评论类
type Comment struct {
	gorm.Model        // 嵌入默认字段
	Content    string `gorm:"type:text;not null;comment:评论内容"`
	PostID     uint   `gorm:"not null;comment:所属文章ID"` // 外键：关联Post的ID
	UserID     uint   `gorm:"not null;comment:评论用户ID"` // 扩展：评论所属用户（可选）
}

// 钩子，评论删除时，检查文章的评论数量.如果评论数量为 0，则更新文章的评论状态为 "无评论"。
func (c *Comment) AfterDelete(tx *gorm.DB) error {
	// 1.检查文章id是否有效
	if c.PostID == 0 {
		log.Printf("警告：评论ID=%d 的文章ID为空，跳过评论状态检查", c.ID)
		return nil
	}

	// 2. 统计当前文章的剩余有效评论
	var curPostCommentCount int64
	err := tx.Model(&Comment{}).Where("post_id = ? AND deleted_at IS NULL", c.PostID).
		Count(&curPostCommentCount).Error

	if err != nil {
		log.Printf("统计文章ID=%d 的评论数失败：%v", c.PostID, err)
		return err
	}

	// 3.更新posts表相应的字段
	var status string
	if curPostCommentCount == 0 {
		status = "无评论"
	} else {
		status = "有评论"
	}

	err = tx.Model(&Post{}).
		Where("id = ?", c.PostID).
		Update("comment_status", status).Error

	if err != nil {
		log.Printf("更新文章ID=%d 的评论状态失败：%v", c.PostID, err)
		return err
	}

	log.Println("评论删除后更新文章数量成功")
	return nil
}

// 作用：把文章和评论组合起来，避免修改原始模型
type PostWithComments struct {
	Post     Post      `json:"post"`     // 文章基础信息
	Comments []Comment `json:"comments"` // 文章对应的评论
}

// 作用：某文章的数量
type PostCommentCount struct {
	PostId uint `gorm:"column:postId"`
	Count  int  `gorm:"column:count"`
}
