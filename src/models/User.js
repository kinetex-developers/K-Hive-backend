import { ObjectId } from "mongodb";
import mongocon from "../config/mongocon.js";
import rediscon from "../config/rediscon.js";
import PrefixSearchService from '../services/prefixSearchService.js';

class User {
  constructor(data) {
    this.userId = data.userId || new ObjectId().toString();
    this.name = data.name;
    this.gmailId = data.gmailId;
    this.joinDate = data.joinDate || new Date();
    this.avatarLink = data.avatarLink || null;
    this.postIds = data.postIds || [];
    this.commentIds = data.commentIds || [];
    this.role = data.role || "user"
  }

  // Create a new user
  static async create(userData) {
    try {
      const collection = await mongocon.usersCollection();
      if (!collection) throw new Error("Database connection failed");

      // Check if user already exists
      const existingUser = await collection.findOne({
        gmailId: userData.gmailId,
      });
      if (existingUser) {
        rediscon.usersCacheSet(existingUser._id, existingUser);
        return existingUser;
      }

      const newUser = new User(userData);
      const result = await collection.insertOne({
        _id: newUser.userId,
        userId: newUser.userId,
        name: newUser.name,
        gmailId: newUser.gmailId,
        joinDate: newUser.joinDate,
        avatarLink: newUser.avatarLink,
        postIds: newUser.postIds,
        commentIds: newUser.commentIds,
        role: "user"
      });

      if (result.acknowledged) {
        rediscon.usersCacheSet(newUser.userId, newUser);
        PrefixSearchService.indexUser(newUser);
        return newUser;
      }
      throw new Error("Failed to create user");
    } catch (err) {
      console.error("Error creating user:", err.message);
      throw err;
    }
  }

  // Find user by Gmail ID
  static async findByGmailId(gmailId) {
    try {
      const collection = await mongocon.usersCollection();
      if (!collection) throw new Error("Database connection failed");

      const user = await collection.findOne({ gmailId });
      return user;
    } catch (err) {
      console.error("Error finding user by Gmail ID:", err.message);
      throw err;
    }
  }

  // Find user by User ID
  static async findByUserId(userId) {
    const redisUser = await rediscon.usersCacheGet(userId);
    if (redisUser) return redisUser;

    try {
      const collection = await mongocon.usersCollection();
      if (!collection) throw new Error("Database connection failed");

      const user = await collection.findOne({ userId });
      if (user) rediscon.usersCacheSet(userId, user);

      return user;
    } catch (err) {
      console.error("Error finding user by User ID:", err.message);
      throw err;
    }
  }

  // Update user
  static async updateUser(userId, updateData) {
    try {
      const collection = await mongocon.usersCollection();
      if (!collection) throw new Error("Database connection failed");

      //Get old user before update
      const oldUser = await User.findByUserId(userId);
      if (!oldUser) return null;

      const result = await collection.updateOne(
        { userId },
        { $set: updateData }
      );

      if (result.modifiedCount > 0) {
        // Invalidate cache Before fetching updated user
        await rediscon.usersCacheDel(userId);
        
        // Fetch fresh data from DB and update cache
        const updatedUser = await User.findByUserId(userId);

        if (updateData.name && oldUser.name !== updateData.name) {
          PrefixSearchService.updateUserIndex(oldUser, updatedUser);
        }

        return updatedUser;
      }
      
      return null;
    } catch (err) {
      console.error("Error updating user:", err.message);
      throw err;
    }
  }

  // Update user's avatar link
  static async updateAvatarLink(userId, avatarLink) {
    try {
      const collection = await mongocon.usersCollection();
      if (!collection) throw new Error("Database connection failed");

      const result = await collection.updateOne(
        { userId },
        { $set: { avatarLink } }
      );

      if (result.modifiedCount > 0) {
        // Invalidate cache before fetching updated user
        await rediscon.usersCacheDel(userId);
        
        // Fetch fresh data from DB and update cache
        const updatedUser = await User.findByUserId(userId);
        return updatedUser;
      }
      
      return null;
    } catch (err) {
      console.error("Error updating avatar link:", err.message);
      throw err;
    }
  }

  // Add post ID to user's postIds array
  static async addPost(userId, postId) {
    try {
      const collection = await mongocon.usersCollection();
      if (!collection) throw new Error("Database connection failed");

      const result = await collection.updateOne(
        { userId },
        { $addToSet: { postIds: postId } }
      );

      if (result.modifiedCount > 0) {
        // Invalidate cache to ensure fresh data
        await rediscon.usersCacheDel(userId);
      }

      return result.modifiedCount > 0;
    } catch (err) {
      console.error("Error adding post to user:", err.message);
      throw err;
    }
  }

  static async getPosts(userId) {
    try {
      const collection = await mongocon.usersCollection();
      if (!collection) throw new Error("Database connection failed");

      const user = await collection.findOne(
        { _id: ObjectId.createFromHexString(userId) },
        { projection: { postIds: 1, _id: 0 } }
      );

      if (!user) {
        return {
          posts: [],
          total: 0
        };
      }

      return {
        posts: user.postIds || [],
        total: user.postIds ? user.postIds.length : 0
      };
    } catch (err) {
      console.error("Error getting posts from user:", err.message);
      throw err;
    }
  }

  // Toggle ban status for user
  static async toggleBanUser(userId) {
    try {
      const collection = await mongocon.usersCollection();
      if (!collection) throw new Error("Database connection failed");

      const user = await User.findByUserId(userId);
      if (!user) throw new Error("User Does not Exists");

      // Prevent banning admin users
      if (user.role === "admin") {
        throw new Error("Cannot ban admin users");
      }
      
      let newRole;
      if (user.role.endsWith("-ban")) {
        // If currently banned, restore to original role
        newRole = user.role.replace("-ban", "");
      } else {
        // If not banned, append -ban to current role
        newRole = `${user.role}-ban`;
      }

      const result = await collection.updateOne(
        { userId },
        { $set: { role: newRole } }
      );

      if (result.modifiedCount > 0) {
        // Invalidate cache and fetch updated user
        await rediscon.usersCacheDel(userId);
        const updatedUser = await User.findByUserId(userId);
        return updatedUser;
      }

      return null;
    } catch (err) {
      console.error("Error toggling ban status:", err.message);
      throw err;
    }
  }

  // Add comment ID to user's commentIds array
  static async addComment(userId, commentId) {
    try {
      const collection = await mongocon.usersCollection();
      if (!collection) throw new Error("Database connection failed");

      const result = await collection.updateOne(
        { userId },
        { $addToSet: { commentIds: commentId } }
      );

      if (result.modifiedCount > 0) {
        // Invalidate cache to ensure fresh data
        await rediscon.usersCacheDel(userId);
      }

      return result.modifiedCount > 0;
    } catch (err) {
      console.error("Error adding comment to user:", err.message);
      throw err;
    }
  }

  // Remove post ID from user's postIds array
  static async removePost(userId, postId) {
    try {
      const collection = await mongocon.usersCollection();
      if (!collection) throw new Error("Database connection failed");

      const result = await collection.updateOne(
        { userId },
        { $pull: { postIds: postId } }
      );

      if (result.modifiedCount > 0) {
        // Invalidate cache to ensure fresh data
        await rediscon.usersCacheDel(userId);
      }

      return result.modifiedCount > 0;
    } catch (err) {
      console.error("Error removing post from user:", err.message);
      throw err;
    }
  }

  // Remove comment ID from user's commentIds array
  static async removeComment(userId, commentId) {
    try {
      const collection = await mongocon.usersCollection();
      if (!collection) throw new Error("Database connection failed");

      const result = await collection.updateOne(
        { userId },
        { $pull: { commentIds: commentId } }
      );

      if (result.modifiedCount > 0) {
        // Invalidate cache to ensure fresh data
        await rediscon.usersCacheDel(userId);
      }

      return result.modifiedCount > 0;
    } catch (err) {
      console.error("Error removing comment from user:", err.message);
      throw err;
    }
  }

  // Get all users
  static async getAllUsers() {
    try {
      const collection = await mongocon.usersCollection();
      if (!collection) throw new Error("Database connection failed");

      const users = await collection.find({}).toArray();
      return users;
    } catch (err) {
      console.error("Error getting all users:", err.message);
      throw err;
    }
  }

  // Delete user
  static async deleteUser(userId) {
    try {
      const collection = await mongocon.usersCollection();
      if (!collection) throw new Error("Database connection failed");

      const user = await User.findByUserId(userId);
      if (!user) return false;

      const result = await collection.deleteOne({ userId });
      await rediscon.usersCacheDel(userId);
      PrefixSearchService.removeUserIndex(user);
      return result.deletedCount > 0;
    } catch (err) {
      console.error("Error deleting user:", err.message);
      throw err;
    }
  }
}



export default User;