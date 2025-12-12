import { ObjectId } from "mongodb";
import mongocon from "../config/mongocon.js";
import rediscon from "../config/rediscon.js";
import User from "./User.js"
import Post from "./Post.js"

class Comment {
  constructor(data) {
    this.commentId = data.commentId || new ObjectId().toString();
    this.postId = data.postId;
    this.userId = data.userId;
    this.content = data.content;
    this.parentCommentId = data.parentCommentId || null; // For nested replies
    this.upvotes = data.upvotes || 0;
    this.downvotes = data.downvotes || 0;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
    this.isEdited = data.isEdited || false;
    this.isDeleted = data.isDeleted || false;
  }

  // Create a new comment
  static async create(commentData) {
    try {
      const collection = await mongocon.commentsCollection();
      if (!collection) throw new Error("Database connection failed");

      const newComment = new Comment(commentData);
      const result = await collection.insertOne({
        _id: newComment.commentId,
        commentId: newComment.commentId,
        postId: newComment.postId,
        userId: newComment.userId,
        content: newComment.content,
        parentCommentId: newComment.parentCommentId,
        upvotes: newComment.upvotes,
        downvotes: newComment.downvotes,
        createdAt: newComment.createdAt,
        updatedAt: newComment.updatedAt,
        isEdited: newComment.isEdited,
        isDeleted: newComment.isDeleted,
      });

      if (result.acknowledged) {
        await rediscon.commentsCacheSet(newComment.commentId, newComment);
        User.addComment(newComment.userId,newComment.commentId)
        Post.addComment(newComment.postId,newComment.commentId)
        return newComment;
      }
      throw new Error("Failed to create comment");
    } catch (err) {
      console.error("Error creating comment:", err.message);
      throw err;
    }
  }

  static async populateUserData(comments) {
  if (!comments || comments.length === 0) return comments;

  // Extract unique userIds
  const userIds = [...new Set(comments.map(c => c.userId))];

  const userMap = new Map();
  const missingUserIds = [];

  // Check Redis cache first
  for (const userId of userIds) {
    const cachedUser = await rediscon.usersCacheGet(userId);
    if (cachedUser) {
      userMap.set(userId, {
        userId: cachedUser.userId,
        name: cachedUser.name,
        avatarLink: cachedUser.avatarLink,
        role: cachedUser.role
      });
    } else {
      missingUserIds.push(userId);
    }
  }

  // Fetch missing users from Mongo
  if (missingUserIds.length > 0) {
    const collection = await mongocon.usersCollection();
    if (collection) {
      const users = await collection
        .find({ userId: { $in: missingUserIds } })
        .toArray();

      const cachePairs = {};
      users.forEach(user => {
         userMap.set(user.userId, {
              userId: user.userId,
              name: user.name,
              avatarLink: user.avatarLink,
              role: user.role
            });
        cachePairs[user.userId] = user;
      });

      if (Object.keys(cachePairs).length > 0) {
        await rediscon.usersCacheMSet(cachePairs);
      }
    }
  }

  // 3️⃣ Attach user object to each comment
  return comments.map(comment => ({
    ...comment,
    user: userMap.get(comment.userId) || {
      userId: comment.userId,
      name: "Unknown",
      avatarLink: null,
      role: "user"
    }
  }));
}


  // Find comment by Comment ID
  static async findByCommentId(commentId) {
    const redisComment = await rediscon.commentsCacheGet(commentId);
    if (redisComment) return redisComment;

    try {
      const collection = await mongocon.commentsCollection();
      if (!collection) throw new Error("Database connection failed");

      const comment = await collection.findOne({ commentId });
      if (comment) await rediscon.commentsCacheSet(commentId, comment);

      return comment;
    } catch (err) {
      console.error("Error finding comment by Comment ID:", err.message);
      throw err;
    }
  }

  // Get comments by post ID with pagination
  static async getCommentsByPostId(postId, page = 1, limit = 20) {
  try {
    // First, try to get commentIds from Post collection
    const post = await Post.findByPostId(postId);
    
    if (post && post.commentIds && post.commentIds.length > 0) {
      const allCommentIds = post.commentIds;
      const topLevelComments = [];
      let currentIndex = (page - 1) * limit;
      const batchSize = limit;

      // Keep fetching batches until we have enough top-level comments or run out of IDs
      while (topLevelComments.length < limit && currentIndex < allCommentIds.length) {
        // Get next batch of comment IDs
        const batchCommentIds = allCommentIds.slice(currentIndex, currentIndex + batchSize);
        currentIndex += batchSize;

        if (batchCommentIds.length === 0) break;

        // Check which comments exist in Redis cache
        const cacheCheckPromises = batchCommentIds.map(async commentId => ({
          commentId,
          inCache: await rediscon.commentsCacheExists(commentId)
        }));
        const cacheChecks = await Promise.all(cacheCheckPromises);

        // Separate cached and non-cached comment IDs
        const cachedCommentIds = cacheChecks
          .filter(check => check.inCache)
          .map(check => check.commentId);
        
        const nonCachedCommentIds = cacheChecks
          .filter(check => !check.inCache)
          .map(check => check.commentId);

        // Fetch cached comments from Redis
        const cachedCommentsPromises = cachedCommentIds.map(commentId =>
          rediscon.commentsCacheGet(commentId)
        );
        const cachedComments = await Promise.all(cachedCommentsPromises);

        let nonCachedComments = [];
        
        // Fetch non-cached comments from MongoDB
        if (nonCachedCommentIds.length > 0) {
          const collection = await mongocon.commentsCollection();
          if (!collection) throw new Error("Database connection failed");

          nonCachedComments = await collection
            .find({ commentId: { $in: nonCachedCommentIds } })
            .toArray();
        }

        // Combine cached and non-cached comments
        const batchComments = [...cachedComments, ...nonCachedComments];

        // Create a map and maintain order
        const commentsMap = new Map(batchComments.map(comment => [comment.commentId, comment]));
        
        // Filter this batch for top-level comments only
        const batchTopLevelComments = batchCommentIds
          .map(id => commentsMap.get(id))
          .filter(comment => comment && !comment.isDeleted && !comment.parentCommentId);

        // Add to our collection
        topLevelComments.push(...batchTopLevelComments);
      }

      // Trim to exact limit if we fetched more
      const finalComments = topLevelComments.slice(0, limit);

      // Cache only the final returning comments
      if (finalComments.length > 0) {
        const cachePairs = {};
        finalComments.forEach((comment) => {
          cachePairs[comment.commentId] = comment;
        });
        await rediscon.commentsCacheMSet(cachePairs);
      }

      // Calculate total count of top-level comments (we need to check all)
      // This is expensive but necessary for accurate pagination
      let totalTopLevelCount = 0;
      for (const commentId of allCommentIds) {
        const comment = await rediscon.commentsCacheExists(commentId) 
          ? await rediscon.commentsCacheGet(commentId)
          : null;
        
        if (!comment) {
          const collection = await mongocon.commentsCollection();
          const dbComment = await collection.findOne({ commentId });
          if (dbComment && !dbComment.isDeleted && !dbComment.parentCommentId) {
            totalTopLevelCount++;
          }
        } else if (!comment.isDeleted && !comment.parentCommentId) {
          totalTopLevelCount++;
        }
      }

      const populated = await Comment.populateUserData(finalComments);
      return {
        comments: populated,
        pagination: {
          page,
          limit,
          total: totalTopLevelCount,
          totalPages: Math.ceil(totalTopLevelCount / limit),
        },
      };
    }

    // Fallback: Post doesn't exist or commentIds array is empty
    // Query comments collection directly
    const collection = await mongocon.commentsCollection();
    if (!collection) throw new Error("Database connection failed");

    const skip = (page - 1) * limit;

    const result = await collection.aggregate([
      {
        $match: { 
          postId: ObjectId.createFromHexString(postId),
          parentCommentId: null,
          isDeleted: false
        }
      },
      {
        $facet: {
          comments: [
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limit }
          ],
          totalCount: [
            { $count: "count" }
          ]
        }
      }
    ]).toArray();

    const comments = result[0].comments;
    const total = result[0].totalCount[0]?.count || 0;

    // Cache fetched comments
    if (comments.length > 0) {
      const cachePairs = {};
      comments.forEach((comment) => {
        cachePairs[comment.commentId] = comment;
      });
      await rediscon.commentsCacheMSet(cachePairs);
    }

    return {
      comments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (err) {
    console.error("Error getting comments by post ID:", err.message);
    throw err;
  }
}
  // Get replies to a specific comment
static async getRepliesByCommentId(parentCommentId, page = 1, limit = 10) {
  try {
    const collection = await mongocon.commentsCollection();
    if (!collection) throw new Error("Database connection failed");

    const skip = (page - 1) * limit;

    // Use aggregation pipeline with $facet to get replies and count in one query
    const result = await collection.aggregate([
      {
        $match: { 
          parentCommentId,
          isDeleted: false
        }
      },
      {
        $facet: {
          replies: [
            { $sort: { createdAt: 1 } }, // Oldest first for replies
            { $skip: skip },
            { $limit: limit }
          ],
          totalCount: [
            { $count: "count" }
          ]
        }
      }
    ]).toArray();

    const replies = result[0].replies;
    const total = result[0].totalCount[0]?.count || 0;

    // Cache fetched replies
    if (replies.length > 0) {
      const cachePairs = {};
      replies.forEach((reply) => {
        cachePairs[reply.commentId] = reply;
      });
      await rediscon.commentsCacheMSet(cachePairs);
    }

    // IMPORTANT: Populate user data for replies
    const populatedReplies = await Comment.populateUserData(replies);

    return {
      replies: populatedReplies,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (err) {
    console.error("Error getting replies by comment ID:", err.message);
    throw err;
  }
}

  // Get comments by user ID
  // Get comments by user ID with pagination - optimized version
static async getCommentsByUserId(userId, page = 1, limit = 20) {
  try {
    // First, try to get commentIds from User collection
    const user = await User.findByUserId(userId);
    
    if (user && user.commentIds && user.commentIds.length > 0) {
      // User exists and has comments in commentIds array
      const skip = (page - 1) * limit;
      const paginatedCommentIds = user.commentIds.slice(skip, skip + limit);

      if (paginatedCommentIds.length === 0) {
        return {
          comments: [],
          pagination: {
            page,
            limit,
            total: user.commentIds.length,
            totalPages: Math.ceil(user.commentIds.length / limit),
          },
        };
      }

      // Check which comments exist in Redis cache
      const cacheCheckPromises = paginatedCommentIds.map(async commentId => ({
        commentId,
        inCache: await rediscon.commentsCacheExists(commentId)
      }));
      const cacheChecks = await Promise.all(cacheCheckPromises);

      // Separate cached and non-cached comment IDs
      const cachedCommentIds = cacheChecks
        .filter(check => check.inCache)
        .map(check => check.commentId);
      
      const nonCachedCommentIds = cacheChecks
        .filter(check => !check.inCache)
        .map(check => check.commentId);

      // Fetch cached comments from Redis
      const cachedCommentsPromises = cachedCommentIds.map(commentId =>
        rediscon.commentsCacheGet(commentId)
      );
      const cachedComments = await Promise.all(cachedCommentsPromises);

      let nonCachedComments = [];
      
      // Fetch non-cached comments from MongoDB
      if (nonCachedCommentIds.length > 0) {
        const collection = await mongocon.commentsCollection();
        if (!collection) throw new Error("Database connection failed");

        nonCachedComments = await collection
          .find({ commentId: { $in: nonCachedCommentIds } })
          .toArray();

        // Cache the newly fetched comments
        if (nonCachedComments.length > 0) {
          const cachePairs = {};
          nonCachedComments.forEach((comment) => {
            cachePairs[comment.commentId] = comment;
          });
          await rediscon.commentsCacheMSet(cachePairs);
        }
      }

      // Combine cached and non-cached comments
      const allComments = [...cachedComments, ...nonCachedComments];

      // Sort comments in the same order as paginatedCommentIds
      const commentsMap = new Map(allComments.map(comment => [comment.commentId, comment]));
      const orderedComments = paginatedCommentIds
        .map(id => commentsMap.get(id))
        .filter(comment => comment && !comment.isDeleted);

      return {
        comments: orderedComments,
        pagination: {
          page,
          limit,
          total: user.commentIds.length,
          totalPages: Math.ceil(user.commentIds.length / limit),
        },
      };
    }

    // Fallback: User doesn't exist or commentIds array is empty
    // Query comments collection directly
    const collection = await mongocon.commentsCollection();
    if (!collection) throw new Error("Database connection failed");

    const skip = (page - 1) * limit;

    const result = await collection.aggregate([
      {
        $match: { 
          userId,
          isDeleted: false
        }
      },
      {
        $facet: {
          comments: [
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limit }
          ],
          totalCount: [
            { $count: "count" }
          ]
        }
      }
    ]).toArray();

    const comments = result[0].comments;
    const total = result[0].totalCount[0]?.count || 0;

    // Cache fetched comments
    if (comments.length > 0) {
      const cachePairs = {};
      comments.forEach((comment) => {
        cachePairs[comment.commentId] = comment;
      });
      await rediscon.commentsCacheMSet(cachePairs);
    }

    return {
      comments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (err) {
    console.error("Error getting comments by user ID:", err.message);
    throw err;
  }
}

  // Update comment
  static async updateComment(commentId, content) {
    try {
      const collection = await mongocon.commentsCollection();
      if (!collection) throw new Error("Database connection failed");

      // Validate that content is provided and not empty
      if (content === undefined || content === null || content.trim() === "") {
        return null;
      }

      const result = await collection.updateOne(
        { commentId },
        {
          $set: {
            content: content.trim(),
            updatedAt: new Date(),
            isEdited: true,
          },
        }
      );

      if (result.modifiedCount > 0) {
        await rediscon.commentsCacheDel(commentId);
        return await Comment.findByCommentId(commentId);
      }

      return null;
    } catch (err) {
      console.error("Error updating comment:", err.message);
      throw err;
    }
  }

  // Add upvote
  static async upvote(commentId) {
    try {
      const collection = await mongocon.commentsCollection();
      if (!collection) throw new Error("Database connection failed");

      const result = await collection.updateOne(
        { commentId },
        { $inc: { upvotes: 1 } }
      );

      if (result.modifiedCount > 0) {
        await rediscon.commentsCacheDel(commentId);
      }

      return result.modifiedCount > 0;
    } catch (err) {
      console.error("Error upvoting comment:", err.message);
      throw err;
    }
  }

  // Add downvote
  static async downvote(commentId) {
    try {
      const collection = await mongocon.commentsCollection();
      if (!collection) throw new Error("Database connection failed");

      const result = await collection.updateOne(
        { commentId },
        { $inc: { downvotes: 1 } }
      );

      if (result.modifiedCount > 0) {
        await rediscon.commentsCacheDel(commentId);
      }

      return result.modifiedCount > 0;
    } catch (err) {
      console.error("Error downvoting comment:", err.message);
      throw err;
    }
  }

  // Soft delete comment (mark as deleted but keep data)
  static async softDeleteComment(commentId) {
    try {
      const collection = await mongocon.commentsCollection();
      if (!collection) throw new Error("Database connection failed");

      const result = await collection.updateOne(
        { commentId },
        {
          $set: {
            isDeleted: true,
            content: "[deleted]",
            updatedAt: new Date(),
          },
        }
      );

      if (result.modifiedCount > 0) {
        await rediscon.commentsCacheDel(commentId);
      }

      return result.modifiedCount > 0;
    } catch (err) {
      console.error("Error soft deleting comment:", err.message);
      throw err;
    }
  }

  // Hard delete comment (permanently remove)
  static async hardDeleteComment(commentId,postId,userId) {
    try {
      const collection = await mongocon.commentsCollection();
      if (!collection) throw new Error("Database connection failed");

      const result = await collection.deleteOne({ commentId });
      await rediscon.commentsCacheDel(commentId);
      Post.removeComment(postId)
      User.removeComment(userId)
      return result.deletedCount > 0;
    } catch (err) {
      console.error("Error hard deleting comment:", err.message);
      throw err;
    }
  }

  // Get comment count for a post
  static async getCommentCountByPostId(postId) {
  try {
    // First, try to get commentIds from Post collection
    const post = await Post.findByPostId(postId);
    
    if (post && post.commentIds) {
      // Post exists, return the length of commentIds array
      return post.commentIds.length;
    }

    // Fallback: Post doesn't exist or commentIds array is missing
    // Query comments collection directly
    const collection = await mongocon.commentsCollection();
    if (!collection) throw new Error("Database connection failed");

    const count = await collection.countDocuments({
      postId,
      isDeleted: false,
    });

    return count;
  } catch (err) {
    console.error("Error getting comment count:", err.message);
    throw err;
  }
}

  // Get reply count for a comment
  static async getReplyCountByCommentId(parentCommentId) {
    try {
      const collection = await mongocon.commentsCollection();
      if (!collection) throw new Error("Database connection failed");

      const count = await collection.countDocuments({
        parentCommentId,
        isDeleted: false,
      });

      return count;
    } catch (err) {
      console.error("Error getting reply count:", err.message);
      throw err;
    }
  }

  // Delete all comments for a post (cascade delete)
  static async deleteCommentsByPostId(postId) {
    try {
      // First, get commentIds from Post collection (more efficient)
      const post = await Post.findByPostId(postId);
      
      let commentIds = [];
      
      if (post && post.commentIds && post.commentIds.length > 0) {
        // Use commentIds from post
        commentIds = post.commentIds;
      } else {
        // Fallback: Query comments collection directly
        const collection = await mongocon.commentsCollection();
        if (!collection) throw new Error("Database connection failed");
        
        const comments = await collection.find({ postId }).toArray();
        commentIds = comments.map((c) => c.commentId);
      }

      if (commentIds.length === 0) {
        return 0; // No comments to delete
      }

      // Delete from database
      const collection = await mongocon.commentsCollection();
      if (!collection) throw new Error("Database connection failed");
      
      const result = await collection.deleteMany({ 
        commentId: { $in: commentIds } 
      });

      // Clear cache for all deleted comments
      for (const commentId of commentIds) {
        await rediscon.commentsCacheDel(commentId);
      }

      // Clear commentIds array from post
      const postsCollection = await mongocon.postsCollection();
      if (postsCollection) {
        await postsCollection.updateOne(
          { postId },
          { $set: { commentIds: [] } }
        );
        
        // Update post cache
        await rediscon.postsCacheDel(postId);
      }

      // Remove comment IDs from users' commentIds arrays
      for (const commentId of commentIds) {
        const comment = await collection.findOne({ commentId });
        if (comment && comment.userId) {
          await User.removeComment(comment.userId, commentId);
        }
      }

      return result.deletedCount;
    } catch (err) {
      console.error("Error deleting comments by post ID:", err.message);
      throw err;
    }
  }
}

export default Comment;