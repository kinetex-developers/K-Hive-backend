import { ObjectId } from "mongodb";
import mongocon from "../config/mongocon.js";
import rediscon from "../config/rediscon.js";
import { deleteFileByUrl } from "../config/imagekitcon.js";
import User from "./User.js"

class Post {
  constructor(data) {
    this.postId = data.postId || new ObjectId().toString();
    this.userId = data.userId;
    this.title = data.title;
    this.content = data.content;
    this.tags = data.tags || [];
    this.upvotes = data.upvotes || 0;
    this.downvotes = data.downvotes || 0;
    this.commentIds = data.commentIds || [];
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
    this.isPinned = data.isPinned || false;
    this.isLocked = data.isLocked || false;
    this.viewCount = data.viewCount || 0;
    this.media = data.media || []
  }

  // Create a new post
  static async create(postData) {
    try {
      const collection = await mongocon.postsCollection();
      if (!collection) throw new Error("Database connection failed");

      const newPost = new Post(postData);
      const result = await collection.insertOne({
        _id: newPost.postId,
        postId: newPost.postId,
        userId: newPost.userId,
        title: newPost.title,
        content: newPost.content,
        tags: newPost.tags,
        upvotes: newPost.upvotes,
        downvotes: newPost.downvotes,
        commentIds: newPost.commentIds,
        createdAt: newPost.createdAt,
        updatedAt: newPost.updatedAt,
        isPinned: newPost.isPinned,
        isLocked: newPost.isLocked,
        viewCount: newPost.viewCount,
        media: newPost.media
      });

      if (result.acknowledged) {
        rediscon.postsCacheSet(newPost.postId, newPost);
        User.addPost(newPost.userId,newPost.postId)
        return newPost;
      }
      throw new Error("Failed to create post");
    } catch (err) {
      console.error("Error creating post:", err.message);
      throw err;
    }
  }

  // Find post by Post ID
  static async findByPostId(postId) {
    const redisPost = await rediscon.postsCacheGet(postId);
    if (redisPost) return redisPost;

    try {
      const collection = await mongocon.postsCollection();
      if (!collection) throw new Error("Database connection failed");

      const post = await collection.findOne({ postId });
      if (post) await rediscon.postsCacheSet(postId, post);

      return post;
    } catch (err) {
      console.error("Error finding post by Post ID:", err.message);
      throw err;
    }
  }

  // Get all posts with pagination
  static async getAllPosts(page = 1, limit = 10, sortBy = "createdAt", order = -1) {
    try {
      const collection = await mongocon.postsCollection();
      if (!collection) throw new Error("Database connection failed");

      const skip = (page - 1) * limit;

      // Use aggregation pipeline with $facet to get posts and count in one query
      const result = await collection.aggregate([
        {
          $facet: {
            posts: [
              { $sort: { [sortBy]: order } },
              { $skip: skip },
              { $limit: limit }
            ],
            totalCount: [
              { $count: "count" }
            ]
          }
        }
      ]).toArray();

      const posts = result[0].posts;
      const total = result[0].totalCount[0]?.count || 0;

      // Cache fetched posts (this still happens on your server, but unavoidable for caching)
      if (posts.length > 0) {
        const cachePairs = {};
        posts.forEach((post) => {
          cachePairs[post.postId] = post;
        });
        await rediscon.postsCacheMSet(cachePairs);
      }

      return {
        posts,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (err) {
      console.error("Error getting all posts:", err.message);
      throw err;
    }
  }

  // Get posts by user ID
  static async getPostsByUserId(userId, page = 1, limit = 10) {
    try {
      // First, try to get postIds from User collection
      const userPosts = await User.getPosts(userId);
      
      if (userPosts.total > 0) {
        // User exists and has posts in their postIds array
        const skip = (page - 1) * limit;
        const paginatedPostIds = userPosts.posts.slice(skip, skip + limit);

        if (paginatedPostIds.length === 0) {
          return {
            posts: [],
            pagination: {
              page,
              limit,
              total: userPosts.total,
              totalPages: Math.ceil(userPosts.total / limit),
            },
          };
        }

        // Check which posts exist in Redis cache
        const cacheCheckPromises = paginatedPostIds.map(async postId => ({
          postId,
          inCache: await rediscon.postsCacheExists(postId)
        }));
        const cacheChecks = await Promise.all(cacheCheckPromises);

        // Separate cached and non-cached post IDs
        const cachedPostIds = cacheChecks
          .filter(check => check.inCache)
          .map(check => check.postId);
        
        const nonCachedPostIds = cacheChecks
          .filter(check => !check.inCache)
          .map(check => check.postId);

        // Fetch cached posts from Redis
        const cachedPostsPromises = cachedPostIds.map(postId =>
          rediscon.postsCacheGet(postId)
        );
        const cachedPosts = await Promise.all(cachedPostsPromises);

        let nonCachedPosts = [];
        
        // Fetch non-cached posts from MongoDB
        if (nonCachedPostIds.length > 0) {
          const collection = await mongocon.postsCollection();
          if (!collection) throw new Error("Database connection failed");

          nonCachedPosts = await collection
            .find({ postId: { $in: nonCachedPostIds } })
            .toArray();

          // Cache the newly fetched posts
          if (nonCachedPosts.length > 0) {
            const cachePairs = {};
            nonCachedPosts.forEach((post) => {
              cachePairs[post.postId] = post;
            });
            await rediscon.postsCacheMSet(cachePairs);
          }
        }

        // Combine cached and non-cached posts
        const allPosts = [...cachedPosts, ...nonCachedPosts];

        // Sort posts in the same order as paginatedPostIds
        const postsMap = new Map(allPosts.map(post => [post.postId, post]));
        const orderedPosts = paginatedPostIds
          .map(id => postsMap.get(id))
          .filter(Boolean);

        return {
          posts: orderedPosts,
          pagination: {
            page,
            limit,
            total: userPosts.total,
            totalPages: Math.ceil(userPosts.total / limit),
          },
        };
      }

      // Fallback: User doesn't exist or postIds array is empty
      // Query posts collection directly
      const collection = await mongocon.postsCollection();
      if (!collection) throw new Error("Database connection failed");

      const skip = (page - 1) * limit;

      const result = await collection.aggregate([
        {
          $match: { userId }
        },
        {
          $facet: {
            posts: [
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

      const posts = result[0].posts;
      const total = result[0].totalCount[0]?.count || 0;

      // Cache fetched posts
      if (posts.length > 0) {
        const cachePairs = {};
        posts.forEach((post) => {
          cachePairs[post.postId] = post;
        });
        await rediscon.postsCacheMSet(cachePairs);
      }

      return {
        posts,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (err) {
      console.error("Error getting posts by user ID:", err.message);
      throw err;
    }
  }
 
  // Search posts by title or tags
  static async searchPosts(query, page = 1, limit = 10, sortby = "relevance") {
    try {
      const collection = await mongocon.postsCollection();
      if (!collection) throw new Error("Database connection failed");

      const skip = (page - 1) * limit;

      // Build the search pipeline
      const pipeline = [
        { 
          // Text search stage
          $match: { 
            $text: { $search: query } 
          } 
        },
        {
          // Add relevance score
          $addFields: {
            score: { $meta: "textScore" }
          }
        }
      ];

      // Sorting logic
      let sortStage;
      if (sortby === "relevance") {
        sortStage = { $sort: { score: -1 , createdAt: -1} };
      } else if (sortby === "recent") {
        sortStage = { $sort: { createdAt: -1 } };
      } else if (sortby === "popular") {
        sortStage = { $sort: { upvotes: -1, createdAt: -1 } };
      } else {
        sortStage = { $sort: { score: -1, createdAt: -1 } };
      }
      pipeline.push(sortStage);

      // Use $facet to get results and count in one query
      pipeline.push({
        $facet: {
          posts: [
            { $skip: skip },
            { $limit: limit }
          ],
          totalCount: [
            { $count: "count" }
          ]
        }
      });

      const result = await collection.aggregate(pipeline).toArray();

      const posts = result[0].posts;
      const total = result[0].totalCount[0]?.count || 0;

      // Cache the results
      if (posts.length > 0) {
        const cachePairs = {};
        posts.forEach((post) => {
          cachePairs[post.postId] = post;
        });
        await rediscon.postsCacheMSet(cachePairs);
      }

      return {
        posts,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (err) {
      console.error("Error searching posts:", err.message);
      throw err;
    }
  }

  // Alternative: Regex-based search (fallback if text index is not created)
  static async searchPostsRegex(query, page = 1, limit = 10) {
    try {
      const collection = await mongocon.postsCollection();
      if (!collection) throw new Error("Database connection failed");
      
      const skip = (page - 1) * limit;

      // Case-insensitive regex search
      const searchFilter = {
        $or: [
          { title: { $regex: query, $options: "i" } },
          { content: { $regex: query, $options: "i" } },
          { tags: { $regex: query, $options: "i" } }
        ],
      };

      const result = await collection.aggregate([
        { $match: searchFilter },
        {
          $facet: {
            posts: [
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

      const posts = result[0].posts;
      const total = result[0].totalCount[0]?.count || 0;

      return {
        posts,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (err) {
      console.error("Error searching posts with regex:", err.message);
      throw err;
    }
  }
  // Update post
  static async updatePost(postId, updateData) {
  try {
    const collection = await mongocon.postsCollection();
    if (!collection) throw new Error("Database connection failed");

    // Only allow title and content to be updated
    const allowedUpdates = {};
    if (updateData.title !== undefined) {
      allowedUpdates.title = updateData.title;
    }
    if (updateData.content !== undefined) {
      allowedUpdates.content = updateData.content;
    }

    // If no valid fields to update, return null
    if (Object.keys(allowedUpdates).length === 0) {
      return null;
    }

    // Always set updatedAt when making changes
    allowedUpdates.updatedAt = new Date();

    const result = await collection.updateOne(
      { postId },
      { $set: allowedUpdates }
    );

    if (result.modifiedCount > 0) {
      await rediscon.postsCacheDel(postId);
      return await Post.findByPostId(postId);
    }

    return null;
  } catch (err) {
    console.error("Error updating post:", err.message);
    throw err;
  }
}

  // Increment view count
  static async incrementViewCount(postId) {
    try {
      const collection = await mongocon.postsCollection();
      if (!collection) throw new Error("Database connection failed");

      const result = await collection.updateOne(
        { postId },
        { $inc: { viewCount: 1 } }
      );

      if (result.modifiedCount > 0) {
        if (await rediscon.postsCacheExists(postId)) {
          const cachedPost = await rediscon.postsCacheGet(postId);
          if (cachedPost) {
            cachedPost.viewCount = (cachedPost.viewCount || 0) + 1;
            await rediscon.postsCacheSet(postId, cachedPost);
          }
        }
      }

      return result.modifiedCount > 0;
    } catch (err) {
      console.error("Error incrementing view count:", err.message);
      throw err;
    }
  }

  // Add upvote
  static async upvote(postId) {
    try {
      const collection = await mongocon.postsCollection();
      if (!collection) throw new Error("Database connection failed");

      const result = await collection.updateOne(
        { postId },
        { $inc: { upvotes: 1 } }
      );

      if (result.modifiedCount > 0) {
        await rediscon.postsCacheDel(postId);
      }

      return result.modifiedCount > 0;
    } catch (err) {
      console.error("Error upvoting post:", err.message);
      throw err;
    }
  }

  // Add downvote
  static async downvote(postId) {
    try {
      const collection = await mongocon.postsCollection();
      if (!collection) throw new Error("Database connection failed");

      const result = await collection.updateOne(
        { postId },
        { $inc: { downvotes: 1 } }
      );

      if (result.modifiedCount > 0) {
        await rediscon.postsCacheDel(postId);
      }

      return result.modifiedCount > 0;
    } catch (err) {
      console.error("Error downvoting post:", err.message);
      throw err;
    }
  }

  // Add comment ID to post's commentIds array
  static async addComment(postId, commentId) {
    try {
      const collection = await mongocon.postsCollection();
      if (!collection) throw new Error("Database connection failed");

      const result = await collection.updateOne(
        { postId },
        { $addToSet: { commentIds: commentId } }
      );

      if (result.modifiedCount > 0) {
        if (await rediscon.postsCacheExists(postId)) {
          const cachedPost = await rediscon.postsCacheGet(postId);
          if (cachedPost && !cachedPost.commentIds.includes(commentId)) {
            cachedPost.commentIds.push(commentId);
            await rediscon.postsCacheSet(postId, cachedPost);
          }
        }
      }

      return result.modifiedCount > 0;
    } catch (err) {
      console.error("Error adding comment to post:", err.message);
      throw err;
    }
  }

  // Remove comment ID from post's commentIds array
  static async removeComment(postId, commentId) {
    try {
      const collection = await mongocon.postsCollection();
      if (!collection) throw new Error("Database connection failed");

      const result = await collection.updateOne(
        { postId },
        { $pull: { commentIds: commentId } }
      );

      if (result.modifiedCount > 0) {
        if (await rediscon.postsCacheExists(postId)) {
          const cachedPost = await rediscon.postsCacheGet(postId);
          if (cachedPost && cachedPost.commentIds) {
            const index = cachedPost.commentIds.indexOf(commentId);
            if (index > -1) {
              cachedPost.commentIds.splice(index, 1);
            }
            await rediscon.postsCacheSet(postId, cachedPost);
          }
        }
      }

      return result.modifiedCount > 0;
    } catch (err) {
      console.error("Error removing comment from post:", err.message);
      throw err;
    }
  }

  // Toggle pin status
  static async togglePin(postId) {
    try {
      const collection = await mongocon.postsCollection();
      if (!collection) throw new Error("Database connection failed");

      const post = await collection.findOne({ postId });
      if (!post) throw new Error("Post not found");

      const result = await collection.updateOne(
        { postId },
        { $set: { isPinned: !post.isPinned } }
      );

      if (result.modifiedCount > 0) {
        await rediscon.postsCacheDel(postId);
      }

      return result.modifiedCount > 0;
    } catch (err) {
      console.error("Error toggling pin status:", err.message);
      throw err;
    }
  }

  // Toggle lock status
  static async toggleLock(postId) {
    try {
      const collection = await mongocon.postsCollection();
      if (!collection) throw new Error("Database connection failed");

      const post = await collection.findOne({ postId });
      if (!post) throw new Error("Post not found");

      const result = await collection.updateOne(
        { postId },
        { $set: { isLocked: !post.isLocked } }
      );

      if (result.modifiedCount > 0) {
        await rediscon.postsCacheDel(postId);
      }

      return result.modifiedCount > 0;
    } catch (err) {
      console.error("Error toggling lock status:", err.message);
      throw err;
    }
  }

  // Delete post
  static async deletePost(postId, userId) {
    try {
      const collection = await mongocon.postsCollection();
      if (!collection) throw new Error("Database connection failed");

      // Get the post first to access media URLs
      const post = await collection.findOne({ postId });
      
      if (post && post.media && post.media.length > 0) {
        // Delete all media files from ImageKit
        const deletePromises = post.media.map(async (mediaUrl) => {
            if(!(await deleteFileByUrl(mediaUrl)))
              console.error(`Failed to delete media: ${mediaUrl}`);
          }
        );
        await Promise.all(deletePromises);
      }

      const result = await collection.deleteOne({ postId });
      await rediscon.postsCacheDel(postId);
      await User.removePost(userId, postId);
      
      return result.deletedCount > 0;
    } catch (err) {
      console.error("Error deleting post:", err.message);
      throw err;
    }
  }
}

export default Post;