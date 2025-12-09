import Post from "../models/Post.js";
import User from "../models/User.js";
import Vote from "../models/Vote.js";

// Create a new post
export const createPost = async (req, res) => {
  try {
    const { title, content, tags, media } = req.body;
    const userId = req.user.userId;

    // Validation
    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: "Title and content are required",
      });
    }

    if (title.length < 5 || title.length > 200) {
      return res.status(400).json({
        success: false,
        message: "Title must be between 5 and 200 characters",
      });
    }

    if (content.length < 10) {
      return res.status(400).json({
        success: false,
        message: "Content must be at least 10 characters",
      });
    }

    // Validate media if present
    if (media && !Array.isArray(media)) {
      return res.status(400).json({
        success: false,
        message: "Media must be an array",
      });
    }

    // Create post
    const postData = {
      userId,
      title: title.trim(),
      content: content.trim(),
      tags: tags || [],
      media: media || []
    };

    const newPost = await Post.create(postData);

    console.log('Post created successfully:', newPost.postId);

    // Add post ID to user's postIds
    await User.addPost(userId, newPost.postId);

    res.status(201).json({
      success: true,
      message: "Post created successfully",
      data: newPost,
    });
  } catch (err) {
    console.error("Error in createPost:", err);
    console.error("Error stack:", err.stack);
    res.status(500).json({
      success: false,
      message: "Failed to create post",
      error: err.message,
    });
  }
};

// Get all posts with pagination
export const getAllPosts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const sortBy = req.query.sortBy || "createdAt";
    const order = req.query.order === "asc" ? 1 : -1;
    const userId = req.user?.userId || null; // Get userId if authenticated

    // Validate pagination
    if (page < 1 || limit < 1 || limit > 100) {
      return res.status(400).json({
        success: false,
        message: "Invalid pagination parameters",
      });
    }

    const result = await Post.getAllPosts(page, limit, sortBy, order, userId);

    res.status(200).json({
      success: true,
      message: "Posts retrieved successfully",
      data: result.posts,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error("Error in getAllPosts:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve posts",
      error: err.message,
    });
  }
};

export const getPostById = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user?.userId || null; // Get userId if authenticated

    const post = await Post.findByPostId(postId);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    // Populate user data
    const populatedPosts = await Post.populateUserData([post]);
    
    // Populate vote data for the current user
    const postsWithVotes = await Post.populateVoteData(populatedPosts, userId);
    const populatedPost = postsWithVotes[0];

    // Increment view count
    await Post.incrementViewCount(postId);

    res.status(200).json({
      success: true,
      message: "Post retrieved successfully",
      data: populatedPost,
    });
  } catch (err) {
    console.error("Error in getPostById:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve post",
      error: err.message,
    });
  }
};

// Get posts by user ID - UPDATED VERSION
export const getPostsByUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

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

    const result = await Post.getPostsByUserId(userId, page, limit);

    // Populate user data
    const populatedPosts = await Post.populateUserData(result.posts);

    res.status(200).json({
      success: true,
      message: "User posts retrieved successfully",
      data: populatedPosts,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error("Error in getPostsByUserId:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve user posts",
      error: err.message,
    });
  }
};

// Search posts
export const searchPosts = async (req, res) => {
  try {
    const { q, sortBy = "relevance" } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    // Validate query
    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Search query must be at least 2 characters",
      });
    }

    // Validate pagination
    if (page < 1 || limit < 1 || limit > 100) {
      return res.status(400).json({
        success: false,
        message: "Invalid pagination parameters",
      });
    }

    // Validate sortBy
    const validSortOptions = ["relevance", "recent", "popular"];
    const finalSortBy = validSortOptions.includes(sortBy) ? sortBy : "relevance";
    
    const result = await Post.searchPosts(q.trim(), page, limit, finalSortBy);

    res.status(200).json({
      success: true,
      message: "Search results retrieved successfully",
      data: result.posts,
      pagination: result.pagination,
      query: q.trim(),
      sortBy: finalSortBy
    });
  } catch (err) {
    console.error("Error in searchPosts:", err.message);

    // If text index error, try regex fallback
    if(err.message.includes("text index")) {
      console.log("Text index not found, using regex search as fallback.");
      try {
        const { q } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const result = await Post.regexSearchPosts(q.trim(), page, limit);
        return res.status(200).json({
          success: true,
          message: "Search results retrieved successfully (regex mode)",
          data: result.posts,
          pagination: result.pagination,
          query: q.trim()
        });
      } catch (regexErr) {
        console.error("Regex search also failed:", regexErr.message);
      }
    }

    res.status(500).json({
      success: false,
      message: "Failed to search posts",
      error: err.message,
    });
  }
};

// Update a post
export const updatePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const { title, content, tags } = req.body;
    const userId = req.user.userId;

    // Check if post exists
    const post = await Post.findByPostId(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    // Check if user owns the post
    if (post.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to update this post",
      });
    }

    // Validate update data
    const updateData = {};
    
    if (title !== undefined) {
      if (title.length < 5 || title.length > 200) {
        return res.status(400).json({
          success: false,
          message: "Title must be between 5 and 200 characters",
        });
      }
      updateData.title = title.trim();
    }

    if (content !== undefined) {
      if (content.length < 10) {
        return res.status(400).json({
          success: false,
          message: "Content must be at least 10 characters",
        });
      }
      updateData.content = content.trim();
    }

    if (tags !== undefined) {
      updateData.tags = tags;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields to update",
      });
    }

    const updatedPost = await Post.updatePost(postId, updateData);

    res.status(200).json({
      success: true,
      message: "Post updated successfully",
      data: updatedPost,
    });
  } catch (err) {
    console.error("Error in updatePost:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to update post",
      error: err.message,
    });
  }
};

// Delete a post
export const deletePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.userId;

    // Check if post exists
    const post = await Post.findByPostId(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    // Check if user owns the post
    if (post.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete this post",
      });
    }

    // Delete the post
    const deleted = await Post.deletePost(postId,userId);

    if (deleted) {
      // Remove post ID from user's postIds
      await User.removePost(userId, postId);

      res.status(200).json({
        success: true,
        message: "Post deleted successfully",
      });
    } else {
      throw new Error("Failed to delete post");
    }
  } catch (err) {
    console.error("Error in deletePost:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to delete post",
      error: err.message,
    });
  }
};

// Upvote a post
export const upvotePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.userId; // From your auth middleware

    // Check if post exists
    const post = await Post.findByPostId(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    const result = await Vote.handleUpvote(postId, userId);

    if (result.success) {
      const updatedPost = await Post.findByPostId(postId);
      res.status(200).json({
        success: true,
        message: `Post ${result.action.replace(/_/g, ' ')}`,
        data: {
          postId,
          upvotes: updatedPost.upvotes,
          downvotes: updatedPost.downvotes,
          userVote: result.newVote,
          action: result.action,
        },
      });
    } else {
      throw new Error("Failed to process upvote");
    }
  } catch (err) {
    console.error("Error in upvotePost:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to process upvote",
      error: err.message,
    });
  }
};

// Downvote a post
export const downvotePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.userId; // From your auth middleware

    // Check if post exists
    const post = await Post.findByPostId(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    const result = await Vote.handleDownvote(postId, userId);

    if (result.success) {
      const updatedPost = await Post.findByPostId(postId);
      res.status(200).json({
        success: true,
        message: `Post ${result.action.replace(/_/g, ' ')}`,
        data: {
          postId,
          upvotes: updatedPost.upvotes,
          downvotes: updatedPost.downvotes,
          userVote: result.newVote,
          action: result.action,
        },
      });
    } else {
      throw new Error("Failed to process downvote");
    }
  } catch (err) {
    console.error("Error in downvotePost:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to process downvote",
      error: err.message,
    });
  }
};

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

// Toggle lock status (admin only - you can add admin middleware later)
export const toggleLockPost = async (req, res) => {
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

    const toggled = await Post.toggleLock(postId);

    if (toggled) {
      const updatedPost = await Post.findByPostId(postId);
      res.status(200).json({
        success: true,
        message: `Post ${updatedPost.isLocked ? "locked" : "unlocked"} successfully`,
        data: {
          postId,
          isLocked: updatedPost.isLocked,
        },
      });
    } else {
      throw new Error("Failed to toggle lock status");
    }
  } catch (err) {
    console.error("Error in toggleLockPost:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to toggle lock status",
      error: err.message,
    });
  }
};