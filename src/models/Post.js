import { ObjectId } from "mongodb";
import mongocon from "../config/mongocon.js";
import rediscon from "../config/rediscon.js";
import { deleteFileByUrl } from "../config/imagekitcon.js";
import User from "./User.js"
import PrefixSearchService from '../services/prefixSearchService.js';
import Vote from "./Vote.js"

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

  // Helper: Get feed cache key based on sort options
  static getFeedCacheKey(sortBy, order) {
    return `posts:feed:${sortBy}:${order === 1 ? 'asc' : 'desc'}`;
  }

  // Helper: Rebuild feed cache from database
  static async rebuildFeedCache(sortBy = "createdAt", order = -1, limit = 50) {
    try {
      const collection = await mongocon.postsCollection();
      if (!collection) return false;

      const posts = await collection
        .find({})
        .sort({ [sortBy]: order })
        .limit(limit)
        .toArray();

      if (posts.length === 0) return true;

      const feedKey = Post.getFeedCacheKey(sortBy, order);
      
      // Use Redis pipeline for atomic operation
      await rediscon.feedCacheClear(feedKey);
      await rediscon.feedCachePush(feedKey, posts.map(p => p.postId));
      await rediscon.feedCacheTrim(feedKey, 0, limit - 1);

      // Also cache individual posts
      const cachePairs = {};
      posts.forEach((post) => {
        cachePairs[post.postId] = post;
      });
      await rediscon.postsCacheMSet(cachePairs);

      console.log(`[FEED CACHE] Rebuilt ${feedKey} with ${posts.length} posts`);
      return true;
    } catch (err) {
      console.error("Error rebuilding feed cache:", err.message);
      return false;
    }
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
        // Cache the post
        await rediscon.postsCacheSet(newPost.postId, newPost);
        
        // Add to user's posts
        await User.addPost(newPost.userId, newPost.postId);
        
        // Update feed caches (push to front, trim to size)
        const feedKey = Post.getFeedCacheKey("createdAt", -1);
        await rediscon.feedCachePushFront(feedKey, newPost.postId);
        await rediscon.feedCacheTrim(feedKey, 0, 49); // Keep 50 posts
        PrefixSearchService.indexPost(newPost);

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

  // Populate user data for posts
  static async populateUserData(posts) {
    if (!posts || posts.length === 0) return posts;
    try {
      // Get unique user IDs
      const userIds = [...new Set(posts.map(post => post.userId))];
      
      const userMap = new Map();
      const missingUserIds = [];
      
      // Check cache first
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
      
      // Fetch missing users from database
      if (missingUserIds.length > 0) {
        const collection = await mongocon.usersCollection();
        if (collection) {
          // Fetch full user documents (no projection)
          const users = await collection
            .find({ userId: { $in: missingUserIds } })
            .toArray();
          
          // Cache the full user data and add limited fields to map
          const cachePairs = {};
          users.forEach(user => {
            // Add only needed fields to response
            userMap.set(user.userId, {
              userId: user.userId,
              name: user.name,
              avatarLink: user.avatarLink,
              role: user.role
            });
            // Cache full user details
            cachePairs[user.userId] = user;
          });
          
          if (Object.keys(cachePairs).length > 0) {
            await rediscon.usersCacheMSet(cachePairs);
          }
        }
      }
      
      // Populate posts with user data
      return posts.map(post => ({
        ...post,
        user: userMap.get(post.userId) || { 
          userId: post.userId, 
          name: 'Unknown User',
          role: 'user'
        }
      }));
    } catch (err) {
      console.error("Error populating user data:", err.message);
      return posts;
    }
  }

  // Populate vote data for posts
  static async populateVoteData(posts, userId) {
    if (!posts || posts.length === 0 || !userId) {
      // If no userId, return posts with vote: 0
      return posts.map(post => ({ ...post, vote: 0 }));
    }

    try {
      // Get unique post IDs
      const postIds = [...new Set(posts.map(post => post.postId))];
      
      const voteMap = new Map();
      const missingVoteIds = [];
      
      // Check cache first
      for (const postId of postIds) {
        const voteId = Vote.getVoteKey(postId, userId);
        const cachedVote = await rediscon.postsCacheGet(`vote:${voteId}`);
        if (cachedVote) {
          voteMap.set(postId, cachedVote.vote);
        } else {
          missingVoteIds.push(postId);
        }
      }
      
      // Fetch missing votes from database
      if (missingVoteIds.length > 0) {
        const collection = await mongocon.postvoteCollection();
        if (collection) {
          const voteIds = missingVoteIds.map(postId => Vote.getVoteKey(postId, userId));
          const votes = await collection
            .find({ voteId: { $in: voteIds } })
            .toArray();
          
          // Cache the fetched votes and add to map
          for (const vote of votes) {
            voteMap.set(vote.postId, vote.vote);
            await rediscon.postsCacheSet(`vote:${vote.voteId}`, vote);
          }
        }
      }
      
      // Populate posts with vote data
      return posts.map(post => ({
        ...post,
        vote: voteMap.get(post.postId) || 0
      }));
    } catch (err) {
      console.error("Error populating vote data:", err.message);
      // Return posts with default vote: 0 on error
      return posts.map(post => ({ ...post, vote: 0 }));
    }
  }

  // Populate both user and vote data
  static async populatePostData(posts, userId = null) {
    if (!posts || posts.length === 0) return posts;

    try {
      // Populate user data
      let populatedPosts = await Post.populateUserData(posts);
      
      // Populate vote data
      populatedPosts = await Post.populateVoteData(populatedPosts, userId);
      
      return populatedPosts;
    } catch (err) {
      console.error("Error populating post data:", err.message);
      return posts;
    }
  }

  // Get all posts with pagination - OPTIMIZED VERSION
  static async getAllPosts(page = 1, limit = 10, sortBy = "createdAt", order = -1, userId = null) {
    try {
      const collection = await mongocon.postsCollection();
      if (!collection) throw new Error("Database connection failed");

      const feedKey = Post.getFeedCacheKey(sortBy, order);
      const start = (page - 1) * limit;
      const end = start + limit - 1;

      let postIds = await rediscon.feedCacheRange(feedKey, start, end);
      
      if (!postIds || postIds.length === 0) {
        console.log(`[FEED CACHE] Miss for ${feedKey}, rebuilding...`);
        await Post.rebuildFeedCache(sortBy, order, 50);
        postIds = await rediscon.feedCacheRange(feedKey, start, end);
      }

      if (!postIds || postIds.length === 0) {
        console.log(`[FEED CACHE] Fallback to DB query`);
        const result = await Post.getAllPostsFromDB(page, limit, sortBy, order, userId);
        return result;
      }

      const posts = [];
      const missingIds = [];

      for (const postId of postIds) {
        const cachedPost = await rediscon.postsCacheGet(postId);
        if (cachedPost) {
          posts.push(cachedPost);
        } else {
          missingIds.push(postId);
        }
      }

      if (missingIds.length > 0) {
        const missingPosts = await collection
          .find({ postId: { $in: missingIds } })
          .toArray();

        const cachePairs = {};
        missingPosts.forEach((post) => {
          cachePairs[post.postId] = post;
          posts.push(post);
        });
        await rediscon.postsCacheMSet(cachePairs);
      }

      const postsMap = new Map(posts.map(p => [p.postId, p]));
      const orderedPosts = postIds
        .map(id => postsMap.get(id))
        .filter(Boolean);

      // Populate user and vote data
      const populatedPosts = await Post.populatePostData(orderedPosts, userId);

      const totalKey = `posts:total:${sortBy}`;
      let total = await rediscon.feedCacheGetTotal(totalKey);
      
      if (!total) {
        total = await collection.countDocuments({});
        await rediscon.feedCacheSetTotal(totalKey, total, 300);
      }

      return {
        posts: populatedPosts,
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

// fallback func getAllPostsFromDB
static async getAllPostsFromDB(page = 1, limit = 10, sortBy = "createdAt", order = -1) {
  try {
    const collection = await mongocon.postsCollection();
    if (!collection) throw new Error("Database connection failed");

    const skip = (page - 1) * limit;

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

    // Populate user data
    const populatedPosts = await Post.populateUserData(posts);

    if (posts.length > 0) {
      const cachePairs = {};
      posts.forEach((post) => {
        cachePairs[post.postId] = post;
      });
      await rediscon.postsCacheMSet(cachePairs);
    }

    return {
      posts: populatedPosts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (err) {
    console.error("Error in getAllPostsFromDB:", err.message);
    throw err;
  }
}

  // Get posts by user ID
  static async getPostsByUserId(userId, page = 1, limit = 10) {
    try {
      // First, try to get postIds from User collection
      const userPosts = await User.getPosts(userId);
      
      if (userPosts.total > 0) {
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

        // Check cache and fetch missing
        const cacheCheckPromises = paginatedPostIds.map(async postId => ({
          postId,
          inCache: await rediscon.postsCacheExists(postId)
        }));
        const cacheChecks = await Promise.all(cacheCheckPromises);

        const cachedPostIds = cacheChecks
          .filter(check => check.inCache)
          .map(check => check.postId);
        
        const nonCachedPostIds = cacheChecks
          .filter(check => !check.inCache)
          .map(check => check.postId);

        const cachedPostsPromises = cachedPostIds.map(postId =>
          rediscon.postsCacheGet(postId)
        );
        const cachedPosts = await Promise.all(cachedPostsPromises);

        let nonCachedPosts = [];
        
        if (nonCachedPostIds.length > 0) {
          const collection = await mongocon.postsCollection();
          if (!collection) throw new Error("Database connection failed");

          nonCachedPosts = await collection
            .find({ postId: { $in: nonCachedPostIds } })
            .toArray();

          if (nonCachedPosts.length > 0) {
            const cachePairs = {};
            nonCachedPosts.forEach((post) => {
              cachePairs[post.postId] = post;
            });
            await rediscon.postsCacheMSet(cachePairs);
          }
        }

        const allPosts = [...cachedPosts, ...nonCachedPosts];
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

      // Fallback: Query posts collection directly
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
 
  // Get posts by multiple user IDs (for autocomplete)
  static async getPostsByUserIds(userIds, limit = 10) {
    try {
      const collection = await mongocon.postsCollection();
      if (!collection) throw new Error("Database connection failed");

      const posts = await collection
        .find({ userId: { $in: userIds } })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();

      return posts;
    } catch (err) {
      console.error("Error getting posts by user IDs:", err.message);
      return [];
    }
  }
  
  // Search posts by title or tags
  static async searchPosts(query, page = 1, limit = 10, sortby = "relevance") {
    try {
      const collection = await mongocon.postsCollection();
      if (!collection) throw new Error("Database connection failed");

      const skip = (page - 1) * limit;

      const pipeline = [
        { 
          $match: { 
            $text: { $search: query } 
          } 
        },
        {
          $addFields: {
            score: { $meta: "textScore" }
          }
        }
      ];

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

  // Alternative: Regex-based search
  static async searchPostsRegex(query, page = 1, limit = 10) {
    try {
      const collection = await mongocon.postsCollection();
      if (!collection) throw new Error("Database connection failed");
      
      const skip = (page - 1) * limit;

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

      //Get old post before update
      const oldPost = await Post.findByPostId(postId);
      if (!oldPost) return null;

      const allowedUpdates = {};
      if (updateData.title !== undefined) {
        allowedUpdates.title = updateData.title;
      }
      if (updateData.content !== undefined) {
        allowedUpdates.content = updateData.content;
      }

      if (Object.keys(allowedUpdates).length === 0) {
        return null;
      }

      allowedUpdates.updatedAt = new Date();

      const result = await collection.updateOne(
        { postId },
        { $set: allowedUpdates }
      );

      if (result.modifiedCount > 0) {
        await rediscon.postsCacheDel(postId);
        const updatedPost = await Post.findByPostId(postId);
        PrefixSearchService.updatePostIndex(oldPost, updatedPost);
        return updatedPost;
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
      // Update cache instead of deleting
      if (await rediscon.postsCacheExists(postId)) {
        const cachedPost = await rediscon.postsCacheGet(postId);
        if (cachedPost) {
          cachedPost.upvotes = (cachedPost.upvotes || 0) + 1;
          await rediscon.postsCacheSet(postId, cachedPost);
        }
      } else {
        // If not in cache, fetch and cache the updated post
        const updatedPost = await collection.findOne({ postId });
        if (updatedPost) {
          await rediscon.postsCacheSet(postId, updatedPost);
        }
      }
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
      // Update cache instead of deleting
      if (await rediscon.postsCacheExists(postId)) {
        const cachedPost = await rediscon.postsCacheGet(postId);
        if (cachedPost) {
          cachedPost.downvotes = (cachedPost.downvotes || 0) + 1;
          await rediscon.postsCacheSet(postId, cachedPost);
        }
      } else {
        // If not in cache, fetch and cache the updated post
        const updatedPost = await collection.findOne({ postId });
        if (updatedPost) {
          await rediscon.postsCacheSet(postId, updatedPost);
        }
      }
    }

    return result.modifiedCount > 0;
  } catch (err) {
    console.error("Error downvoting post:", err.message);
    throw err;
  }
}
  // Remove upvote (decrement upvote count)
  static async removeUpvote(postId) {
    try {
      const collection = await mongocon.postsCollection();
      if (!collection) throw new Error("Database connection failed");

      const result = await collection.updateOne(
        { postId, upvotes: { $gt: 0 } }, // Ensure upvotes don't go negative
        { $inc: { upvotes: -1 } }
      );

      if (result.modifiedCount > 0) {
        // Update cache instead of deleting
        if (await rediscon.postsCacheExists(postId)) {
          const cachedPost = await rediscon.postsCacheGet(postId);
          if (cachedPost && cachedPost.upvotes > 0) {
            cachedPost.upvotes = cachedPost.upvotes - 1;
            await rediscon.postsCacheSet(postId, cachedPost);
          }
        } else {
          // If not in cache, fetch and cache the updated post
          const updatedPost = await collection.findOne({ postId });
          if (updatedPost) {
            await rediscon.postsCacheSet(postId, updatedPost);
          }
        }
      }

      return result.modifiedCount > 0;
    } catch (err) {
      console.error("Error removing upvote from post:", err.message);
      throw err;
    }
  }

  // Remove downvote (decrement downvote count)
  static async removeDownvote(postId) {
    try {
      const collection = await mongocon.postsCollection();
      if (!collection) throw new Error("Database connection failed");

      const result = await collection.updateOne(
        { postId, downvotes: { $gt: 0 } }, // Ensure downvotes don't go negative
        { $inc: { downvotes: -1 } }
      );

      if (result.modifiedCount > 0) {
        // Update cache instead of deleting
        if (await rediscon.postsCacheExists(postId)) {
          const cachedPost = await rediscon.postsCacheGet(postId);
          if (cachedPost && cachedPost.downvotes > 0) {
            cachedPost.downvotes = cachedPost.downvotes - 1;
            await rediscon.postsCacheSet(postId, cachedPost);
          }
        } else {
          // If not in cache, fetch and cache the updated post
          const updatedPost = await collection.findOne({ postId });
          if (updatedPost) {
            await rediscon.postsCacheSet(postId, updatedPost);
          }
        }
      }

      return result.modifiedCount > 0;
    } catch (err) {
      console.error("Error removing downvote from post:", err.message);
      throw err;
    }
  }

  // Add comment
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

  // Remove comment
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

  // Toggle pin
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

  // Toggle lock
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

      const post = await collection.findOne({ postId });
      if (!post) return false;
      
      if (post && post.media && post.media.length > 0) {
        const deletePromises = post.media.map(async (mediaUrl) => {
            if(!(await deleteFileByUrl(mediaUrl)))
              console.error(`Failed to delete media: ${mediaUrl}`);
          }
        );
        await Promise.all(deletePromises);
      }

      const result = await collection.deleteOne({ postId });
      
      if (result.deletedCount > 0) {
        // Remove from individual post cache
        await rediscon.postsCacheDel(postId);
        
        // Remove from user's posts
        await User.removePost(userId, postId);
        
        // Remove from ALL feed caches (more efficient than clearing)
        await rediscon.feedCacheRemove(Post.getFeedCacheKey("createdAt", -1), postId);
        await rediscon.feedCacheRemove(Post.getFeedCacheKey("createdAt", 1), postId);
        await rediscon.feedCacheRemove(Post.getFeedCacheKey("upvotes", -1), postId);
        
        // Invalidate total count cache
        await rediscon.feedCacheClear("posts:total:createdAt");
        await rediscon.feedCacheClear("posts:total:upvotes");

        PrefixSearchService.removePostIndex(post);
        Vote.deleteVotesByPostId(postId)
      }
      
      return result.deletedCount > 0;
    } catch (err) {
      console.error("Error deleting post:", err.message);
      throw err;
    }
  }
}

export default Post;