import Comment from "../models/Comment.js";
import Post from "../models/Post.js";
import User from "../models/User.js";

// Create a new comment
export const createComment = async (req, res) => {
  try {
    const { postId, content, parentCommentId } = req.body;
    const userId = req.user.userId;

    // Validation
    if (!postId || !content) {
      return res.status(400).json({
        success: false,
        message: "Post ID and content are required",
      });
    }

    if (content.length < 1 || content.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Content must be between 1 and 1000 characters",
      });
    }

    // Check if post exists
    const post = await Post.findByPostId(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    // Check if post is locked
    if (post.isLocked) {
      return res.status(403).json({
        success: false,
        message: "Cannot comment on a locked post",
      });
    }

    // If parentCommentId is provided, validate it exists
    if (parentCommentId) {
      const parentComment = await Comment.findByCommentId(parentCommentId);
      if (!parentComment) {
        return res.status(404).json({
          success: false,
          message: "Parent comment not found",
        });
      }
      if (parentComment.isDeleted) {
        return res.status(400).json({
          success: false,
          message: "Cannot reply to a deleted comment",
        });
      }
    }

    // Create comment
    const commentData = {
      postId,
      userId,
      content: content.trim(),
      parentCommentId: parentCommentId || null,
    };

    const newComment = await Comment.create(commentData);

    // Add comment ID to post's commentIds
    await Post.addComment(postId, newComment.commentId);

    // Add comment ID to user's commentIds
    User.addComment(userId, newComment.commentId);

    res.status(201).json({
      success: true,
      message: "Comment created successfully",
      data: newComment,
    });
  } catch (err) {
    console.error("Error in createComment:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to create comment",
      error: err.message,
    });
  }
};

//////////

// Get comments by post ID
export const getCommentsByPostId = async (req, res) => {
  try {
    const { postId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    // Validate pagination
    if (page < 1 || limit < 1 || limit > 100) {
      return res.status(400).json({
        success: false,
        message: "Invalid pagination parameters",
      });
    }

    // Check if post exists
    const post = await Post.findByPostId(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    const result = await Comment.getCommentsByPostId(postId, page, limit);

    res.status(200).json({
      success: true,
      message: "Comments retrieved successfully",
      data: result.comments,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error("Error in getCommentsByPostId:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve comments",
      error: err.message,
    });
  }
};

//////////

// Get comments by user ID
export const getCommentsByUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    // Validate pagination
    if (page < 1 || limit < 1 || limit > 100) {
      return res.status(400).json({
        success: false,
        message: "Invalid pagination parameters",
      });
    }

    // Check if user exists
    const user = await User.findByUserId(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const result = await Comment.getCommentsByUserId(userId, page, limit);

    res.status(200).json({
      success: true,
      message: "User comments retrieved successfully",
      data: result.comments,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error("Error in getCommentsByUserId:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve user comments",
      error: err.message,
    });
  }
};

//////////

// Get a single comment by ID
export const getCommentById = async (req, res) => {
  try {
    const { commentId } = req.params;

    const comment = await Comment.findByCommentId(commentId);

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Comment not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Comment retrieved successfully",
      data: comment,
    });
  } catch (err) {
    console.error("Error in getCommentById:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve comment",
      error: err.message,
    });
  }
};

//////////

// Get replies by comment ID
export const getRepliesByCommentId = async (req, res) => {
  try {
    const { commentId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    // Validate pagination
    if (page < 1 || limit < 1 || limit > 100) {
      return res.status(400).json({
        success: false,
        message: "Invalid pagination parameters",
      });
    }

    // Check if parent comment exists
    const parentComment = await Comment.findByCommentId(commentId);
    if (!parentComment) {
      return res.status(404).json({
        success: false,
        message: "Comment not found",
      });
    }

    const result = await Comment.getRepliesByCommentId(commentId, page, limit);

    res.status(200).json({
      success: true,
      message: "Replies retrieved successfully",
      data: result.replies,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error("Error in getRepliesByCommentId:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve replies",
      error: err.message,
    });
  }
};

//////////

// Update a comment
export const updateComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { content } = req.body;
    const userId = req.user.userId;

    // Check if comment exists
    const comment = await Comment.findByCommentId(commentId);
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Comment not found",
      });
    }

    // Check if comment is deleted
    if (comment.isDeleted) {
      return res.status(400).json({
        success: false,
        message: "Cannot update a deleted comment",
      });
    }

    // Check if user owns the comment
    if (comment.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to update this comment",
      });
    }

    // Validate content
    if (!content) {
      return res.status(400).json({
        success: false,
        message: "Content is required",
      });
    }

    if (content.length < 1 || content.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Content must be between 1 and 1000 characters",
      });
    }

    const updatedComment = await Comment.updateComment(commentId, content.trim());

    res.status(200).json({
      success: true,
      message: "Comment updated successfully",
      data: updatedComment,
    });
  } catch (err) {
    console.error("Error in updateComment:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to update comment",
      error: err.message,
    });
  }
};

//////////

// Soft delete a comment
export const softDeleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.userId;

    // Check if comment exists
    const comment = await Comment.findByCommentId(commentId);
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Comment not found",
      });
    }

    // Check if comment is already deleted
    if (comment.isDeleted) {
      return res.status(400).json({
        success: false,
        message: "Comment is already deleted",
      });
    }

    // Check if user owns the comment
    if (comment.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete this comment",
      });
    }

    const deleted = await Comment.softDeleteComment(commentId);

    if (deleted) {
      res.status(200).json({
        success: true,
        message: "Comment deleted successfully",
      });
    } else {
      throw new Error("Failed to delete comment");
    }
  } catch (err) {
    console.error("Error in softDeleteComment:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to delete comment",
      error: err.message,
    });
  }
};

// Hard delete a comment
export const hardDeleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.userId;

    // Check if comment exists
    const comment = await Comment.findByCommentId(commentId);
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Comment not found",
      });
    }

    // Check if user owns the comment
    if (comment.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete this comment",
      });
    }

    const deleted = await Comment.hardDeleteComment(
      commentId,
      comment.postId,
      comment.userId
    );

    if (deleted) {
      // Remove comment ID from post's commentIds
      await Post.removeComment(comment.postId, commentId);

      // Remove comment ID from user's commentIds
      await User.removeComment(userId, commentId);

      res.status(200).json({
        success: true,
        message: "Comment permanently deleted",
      });
    } else {
      throw new Error("Failed to delete comment");
    }
  } catch (err) {
    console.error("Error in hardDeleteComment:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to delete comment",
      error: err.message,
    });
  }
};

//////////

// Upvote a comment
export const upvoteComment = async (req, res) => {
  try {
    const { commentId } = req.params;

    // Check if comment exists
    const comment = await Comment.findByCommentId(commentId);
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Comment not found",
      });
    }

    if (comment.isDeleted) {
      return res.status(400).json({
        success: false,
        message: "Cannot upvote a deleted comment",
      });
    }

    const upvoted = await Comment.upvote(commentId);

    if (upvoted) {
      const updatedComment = await Comment.findByCommentId(commentId);
      res.status(200).json({
        success: true,
        message: "Comment upvoted successfully",
        data: {
          commentId,
          upvotes: updatedComment.upvotes,
        },
      });
    } else {
      throw new Error("Failed to upvote comment");
    }
  } catch (err) {
    console.error("Error in upvoteComment:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to upvote comment",
      error: err.message,
    });
  }
};

// Downvote a comment
export const downvoteComment = async (req, res) => {
  try {
    const { commentId } = req.params;

    // Check if comment exists
    const comment = await Comment.findByCommentId(commentId);
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Comment not found",
      });
    }

    if (comment.isDeleted) {
      return res.status(400).json({
        success: false,
        message: "Cannot downvote a deleted comment",
      });
    }

    const downvoted = await Comment.downvote(commentId);

    if (downvoted) {
      const updatedComment = await Comment.findByCommentId(commentId);
      res.status(200).json({
        success: true,
        message: "Comment downvoted successfully",
        data: {
          commentId,
          downvotes: updatedComment.downvotes,
        },
      });
    } else {
      throw new Error("Failed to downvote comment");
    }
  } catch (err) {
    console.error("Error in downvoteComment:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to downvote comment",
      error: err.message,
    });
  }
};

//////////

// Toggle pin status (admin only - you can add admin middleware later)
export const togglePinPost = async (req, res) => {
  try {
    const { postId } = req.params;

    // Check if post exists
    const post = await Post.findByPostId(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    const toggled = await Post.togglePin(postId);

    if (toggled) {
      const updatedPost = await Post.findByPostId(postId);
      res.status(200).json({
        success: true,
        message: `Post ${updatedPost.isPinned ? "pinned" : "unpinned"} successfully`,
        data: {
          postId,
          isPinned: updatedPost.isPinned,
        },
      });
    } else {
      throw new Error("Failed to toggle pin status");
    }
  } catch (err) {
    console.error("Error in togglePinPost:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to toggle pin status",
      error: err.message,
    });
  }
};

//////////

// Get comment count for a post
export const getCommentCount = async (req, res) => {
  try {
    const { postId } = req.params;

    // Check if post exists
    const post = await Post.findByPostId(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    const count = await Comment.getCommentCountByPostId(postId);

    res.status(200).json({
      success: true,
      message: "Comment count retrieved successfully",
      data: {
        postId,
        count,
      },
    });
  } catch (err) {
    console.error("Error in getCommentCount:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to get comment count",
      error: err.message,
    });
  }
};

// Get reply count for a comment
export const getReplyCount = async (req, res) => {
  try {
    const { commentId } = req.params;

    // Check if comment exists
    const comment = await Comment.findByCommentId(commentId);
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Comment not found",
      });
    }

    const count = await Comment.getReplyCountByCommentId(commentId);

    res.status(200).json({
      success: true,
      message: "Reply count retrieved successfully",
      data: {
        commentId,
        count,
      },
    });
  } catch (err) {
    console.error("Error in getReplyCount:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to get reply count",
      error: err.message,
    });
  }
};