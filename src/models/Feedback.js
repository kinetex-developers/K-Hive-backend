import { ObjectId } from "mongodb";
import mongocon from "../config/mongocon.js";

class Feedback {
  constructor(data) {
    this.feedbackId = data.feedbackId || new ObjectId().toString();
    this.userId = data.userId;
    this.content = data.content;
    this.createdAt = data.createdAt || new Date();
  }

  // Create a new feedback
  static async create(feedbackData) {
    try {
      const collection = await mongocon.feedbackCollection();
      if (!collection) throw new Error("Database connection failed");

      const newFeedback = new Feedback(feedbackData);
      const result = await collection.insertOne({
        _id: newFeedback.feedbackId,
        feedbackId: newFeedback.feedbackId,
        userId: newFeedback.userId,
        content: newFeedback.content,
        createdAt: newFeedback.createdAt,
      });

      if (result.acknowledged) {
        return newFeedback;
      }
      throw new Error("Failed to create feedback");
    } catch (err) {
      console.error("Error creating feedback:", err.message);
      throw err;
    }
  }

  // Find feedback by Feedback ID
  static async findByFeedbackId(feedbackId) {
    try {
      const collection = await mongocon.feedbackCollection();
      if (!collection) throw new Error("Database connection failed");

      const feedback = await collection.findOne({ feedbackId });

      return feedback;
    } catch (err) {
      console.error("Error finding feedback by Feedback ID:", err.message);
      throw err;
    }
  }

  // Get all feedback with pagination
  static async getAllFeedback(page = 1, limit = 10, sortBy = "createdAt", order = -1) {
    try {
      const collection = await mongocon.feedbackCollection();
      if (!collection) throw new Error("Database connection failed");

      const skip = (page - 1) * limit;

      // Use aggregation pipeline with $facet to get feedback and count in one query
      const result = await collection.aggregate([
        {
          $facet: {
            feedback: [
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

      const feedback = result[0].feedback;
      const total = result[0].totalCount[0]?.count || 0;

      return {
        feedback,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (err) {
      console.error("Error getting all feedback:", err.message);
      throw err;
    }
  }

  // Get feedback by time range with pagination
  static async getFeedbackByTimeRange(startDate, endDate, page = 1, limit = 10, sortBy = "createdAt", order = -1) {
    try {
      const collection = await mongocon.feedbackCollection();
      if (!collection) throw new Error("Database connection failed");

      const skip = (page - 1) * limit;

      // Build date filter
      const dateFilter = {};
      if (startDate) {
        dateFilter.$gte = new Date(startDate);
      }
      if (endDate) {
        dateFilter.$lte = new Date(endDate);
      }

      const matchStage = Object.keys(dateFilter).length > 0 
        ? { createdAt: dateFilter }
        : {};

      // Use aggregation pipeline with $facet
      const result = await collection.aggregate([
        { $match: matchStage },
        {
          $facet: {
            feedback: [
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

      const feedback = result[0].feedback;
      const total = result[0].totalCount[0]?.count || 0;

      return {
        feedback,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (err) {
      console.error("Error getting feedback by time range:", err.message);
      throw err;
    }
  }

  // Get feedback by user ID with pagination
  static async getFeedbackByUserId(userId, page = 1, limit = 20) {
    try {
      const collection = await mongocon.feedbackCollection();
      if (!collection) throw new Error("Database connection failed");

      const skip = (page - 1) * limit;

      const result = await collection.aggregate([
        {
          $match: { userId }
        },
        {
          $facet: {
            feedback: [
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

      const feedback = result[0].feedback;
      const total = result[0].totalCount[0]?.count || 0;

      return {
        feedback,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (err) {
      console.error("Error getting feedback by user ID:", err.message);
      throw err;
    }
  }

  // Delete feedback
  static async deleteFeedback(feedbackId) {
    try {
      const collection = await mongocon.feedbackCollection();
      if (!collection) throw new Error("Database connection failed");

      const result = await collection.deleteOne({ feedbackId });
      
      return result.deletedCount > 0;
    } catch (err) {
      console.error("Error deleting feedback:", err.message);
      throw err;
    }
  }
}

export default Feedback;