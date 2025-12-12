import mongocon from "../config/mongocon.js";
import rediscon from "../config/rediscon.js";
import Post from "./Post.js";

class Vote {
  constructor(data) {
    this.voteId = `${data.postId}_${data.userId}`; // Composite key
    this.postId = data.postId;
    this.userId = data.userId;
    this.vote = data.vote || 0; // -1 (downvote), 0 (no vote), 1 (upvote)
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  // Helper: Get cache key for a vote
  static getVoteKey(postId, userId) {
    return `${postId}_${userId}`;
  }

  // Find vote by postId and userId
  static async findVote(postId, userId) {
    const voteId = Vote.getVoteKey(postId, userId);
    
    // Check Redis cache first
    const cachedVote = await rediscon.postsCacheGet(`vote:${voteId}`);
    if (cachedVote) return cachedVote;

    try {
      const collection = await mongocon.postvoteCollection();
      if (!collection) throw new Error("Database connection failed");

      const vote = await collection.findOne({ voteId });
      
      // Cache if found
      if (vote) {
        await rediscon.postsCacheSet(`vote:${voteId}`, vote);
      }
      
      return vote;
    } catch (err) {
      console.error("Error finding vote:", err.message);
      throw err;
    }
  }

  // Handle upvote
  static async handleUpvote(postId, userId) {
    try {
      const collection = await mongocon.postvoteCollection();
      if (!collection) throw new Error("Database connection failed");

      const voteId = Vote.getVoteKey(postId, userId);
      const existingVote = await Vote.findVote(postId, userId);

      if (!existingVote) {
        // No previous vote - create new upvote
        const newVote = new Vote({
          postId,
          userId,
          vote: 1,
        });

        await collection.insertOne({
          _id: newVote.voteId,
          voteId: newVote.voteId,
          postId: newVote.postId,
          userId: newVote.userId,
          vote: newVote.vote,
          createdAt: newVote.createdAt,
          updatedAt: newVote.updatedAt,
        });

        // Cache the new vote
        await rediscon.postsCacheSet(`vote:${voteId}`, newVote);

        // Increment post upvotes
        await Post.upvote(postId);

        return { success: true, action: "upvoted", previousVote: 0, newVote: 1 };
      }

      // User already upvoted - toggle to no vote
      if (existingVote.vote === 1) {
        await collection.updateOne(
          { voteId },
          {
            $set: {
              vote: 0,
              updatedAt: new Date(),
            },
          }
        );

        // Update cache
        existingVote.vote = 0;
        existingVote.updatedAt = new Date();
        await rediscon.postsCacheSet(`vote:${voteId}`, existingVote);

        // Remove upvote from post
        await Post.removeUpvote(postId);

        return { success: true, action: "removed_upvote", previousVote: 1, newVote: 0 };
      }

      // User previously downvoted - change to upvote
      if (existingVote.vote === -1) {
        await collection.updateOne(
          { voteId },
          {
            $set: {
              vote: 1,
              updatedAt: new Date(),
            },
          }
        );

        // Update cache
        existingVote.vote = 1;
        existingVote.updatedAt = new Date();
        await rediscon.postsCacheSet(`vote:${voteId}`, existingVote);

        // Update post: remove downvote, add upvote
        await Post.removeDownvote(postId);
        await Post.upvote(postId);

        return { success: true, action: "changed_to_upvote", previousVote: -1, newVote: 1 };
      }

      // User previously had no vote (vote = 0) - change to upvote
      if (existingVote.vote === 0) {
        await collection.updateOne(
          { voteId },
          {
            $set: {
              vote: 1,
              updatedAt: new Date(),
            },
          }
        );

        // Update cache
        existingVote.vote = 1;
        existingVote.updatedAt = new Date();
        await rediscon.postsCacheSet(`vote:${voteId}`, existingVote);

        // Increment post upvotes
        await Post.upvote(postId);

        return { success: true, action: "upvoted", previousVote: 0, newVote: 1 };
      }
    } catch (err) {
      console.error("Error handling upvote:", err.message);
      throw err;
    }
  }

  // Handle downvote
  static async handleDownvote(postId, userId) {
    try {
      const collection = await mongocon.postvoteCollection();
      if (!collection) throw new Error("Database connection failed");

      const voteId = Vote.getVoteKey(postId, userId);
      const existingVote = await Vote.findVote(postId, userId);

      if (!existingVote) {
        // No previous vote - create new downvote
        const newVote = new Vote({
          postId,
          userId,
          vote: -1,
        });

        await collection.insertOne({
          _id: newVote.voteId,
          voteId: newVote.voteId,
          postId: newVote.postId,
          userId: newVote.userId,
          vote: newVote.vote,
          createdAt: newVote.createdAt,
          updatedAt: newVote.updatedAt,
        });

        // Cache the new vote
        await rediscon.postsCacheSet(`vote:${voteId}`, newVote);

        // Increment post downvotes
        await Post.downvote(postId);

        return { success: true, action: "downvoted", previousVote: 0, newVote: -1 };
      }

      // User already downvoted - toggle to no vote
      if (existingVote.vote === -1) {
        await collection.updateOne(
          { voteId },
          {
            $set: {
              vote: 0,
              updatedAt: new Date(),
            },
          }
        );

        // Update cache
        existingVote.vote = 0;
        existingVote.updatedAt = new Date();
        await rediscon.postsCacheSet(`vote:${voteId}`, existingVote);

        // Remove downvote from post
        await Post.removeDownvote(postId);

        return { success: true, action: "removed_downvote", previousVote: -1, newVote: 0 };
      }

      // User previously upvoted - change to downvote
      if (existingVote.vote === 1) {
        await collection.updateOne(
          { voteId },
          {
            $set: {
              vote: -1,
              updatedAt: new Date(),
            },
          }
        );

        // Update cache
        existingVote.vote = -1;
        existingVote.updatedAt = new Date();
        await rediscon.postsCacheSet(`vote:${voteId}`, existingVote);

        // Update post: remove upvote, add downvote
        await Post.removeUpvote(postId);
        await Post.downvote(postId);

        return { success: true, action: "changed_to_downvote", previousVote: 1, newVote: -1 };
      }

      // User previously had no vote (vote = 0) - change to downvote
      if (existingVote.vote === 0) {
        await collection.updateOne(
          { voteId },
          {
            $set: {
              vote: -1,
              updatedAt: new Date(),
            },
          }
        );

        // Update cache
        existingVote.vote = -1;
        existingVote.updatedAt = new Date();
        await rediscon.postsCacheSet(`vote:${voteId}`, existingVote);

        // Increment post downvotes
        await Post.downvote(postId);

        return { success: true, action: "downvoted", previousVote: 0, newVote: -1 };
      }
    } catch (err) {
      console.error("Error handling downvote:", err.message);
      throw err;
    }
  }

  // Remove vote (set to neutral)
  static async removeVote(postId, userId) {
  try {
    const collection = await mongocon.postvoteCollection();
    if (!collection) throw new Error("Database connection failed");

    const voteId = Vote.getVoteKey(postId, userId);
    const existingVote = await Vote.findVote(postId, userId);

    if (!existingVote || existingVote.vote === 0) {
      return { success: true, action: "no_change", previousVote: 0, newVote: 0 };
    }

    const previousVote = existingVote.vote;

    // Delete the vote entry instead of setting to 0
    await collection.deleteOne({ voteId });

    // Clear cache
    await rediscon.postsCacheDel(`vote:${voteId}`);

    // Update post counts
    if (previousVote === 1) {
      await Post.removeUpvote(postId);
    } else if (previousVote === -1) {
      await Post.removeDownvote(postId);
    }

    return { success: true, action: "removed_vote", previousVote, newVote: 0 };
  } catch (err) {
    console.error("Error removing vote:", err.message);
    throw err;
  }
}

  // Get user's vote on a post
  static async getUserVote(postId, userId) {
    try {
      const vote = await Vote.findVote(postId, userId);
      return vote ? vote.vote : 0;
    } catch (err) {
      console.error("Error getting user vote:", err.message);
      return 0;
    }
  }

  // Get all votes by a user
  static async getVotesByUserId(userId, page = 1, limit = 20) {
    try {
      const collection = await mongocon.postvoteCollection();
      if (!collection) throw new Error("Database connection failed");

      const skip = (page - 1) * limit;

      const result = await collection.aggregate([
        {
          $match: { userId, vote: { $ne: 0 } }
        },
        {
          $facet: {
            votes: [
              { $sort: { updatedAt: -1 } },
              { $skip: skip },
              { $limit: limit }
            ],
            totalCount: [
              { $count: "count" }
            ]
          }
        }
      ]).toArray();

      const votes = result[0].votes;
      const total = result[0].totalCount[0]?.count || 0;

      return {
        votes,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (err) {
      console.error("Error getting votes by user ID:", err.message);
      throw err;
    }
  }

  // Get all votes on a post
  static async getVotesByPostId(postId, page = 1, limit = 50) {
    try {
      const collection = await mongocon.postvoteCollection();
      if (!collection) throw new Error("Database connection failed");

      const skip = (page - 1) * limit;

      const result = await collection.aggregate([
        {
          $match: { postId, vote: { $ne: 0 } }
        },
        {
          $facet: {
            votes: [
              { $sort: { updatedAt: -1 } },
              { $skip: skip },
              { $limit: limit }
            ],
            totalCount: [
              { $count: "count" }
            ]
          }
        }
      ]).toArray();

      const votes = result[0].votes;
      const total = result[0].totalCount[0]?.count || 0;

      return {
        votes,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (err) {
      console.error("Error getting votes by post ID:", err.message);
      throw err;
    }
  }

  // Delete all votes for a post (cascade delete)
  static async deleteVotesByPostId(postId) {
    try {
      const collection = await mongocon.postvoteCollection();
      if (!collection) throw new Error("Database connection failed");

      // Get all vote IDs first to clear cache
      const votes = await collection.find({ postId }).toArray();
      const voteIds = votes.map((v) => v.voteId);

      // Delete from database
      const result = await collection.deleteMany({ postId });

      // Clear cache for all deleted votes
      for (const voteId of voteIds) {
        await rediscon.postsCacheDel(`vote:${voteId}`);
      }

      return result.deletedCount;
    } catch (err) {
      console.error("Error deleting votes by post ID:", err.message);
      throw err;
    }
  }
}

export default Vote;