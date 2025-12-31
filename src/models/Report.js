import mongocon from "../config/mongocon.js";
import Post from "./Post.js";
import Comment from "./Comment.js";

class Report {
  constructor(data) {
    this.reportId = `${data.dataId}_${data.userId}`; // Composite key
    this.dataId = data.dataId; // postId or commentId
    this.type = data.type; // "post" or "comment"
    this.userId = data.userId;
    this.createdAt = data.createdAt || new Date();
  }

  // Helper: Get report key
  static getReportKey(dataId, userId) {
    return `${dataId}_${userId}`;
  }

  // Find report by dataId and userId
  static async findReport(dataId, userId) {
    try {
      const collection = await mongocon.reportsCollection();
      if (!collection) throw new Error("Database connection failed");

      const reportId = Report.getReportKey(dataId, userId);
      const report = await collection.findOne({ reportId });
      
      return report;
    } catch (err) {
      console.error("Error finding report:", err.message);
      throw err;
    }
  }

  // Verify if dataId is valid based on type
  static async verifyDataId(type, dataId) {
    try {
      if (type === "post") {
        const post = await Post.findByPostId(dataId);
        return post !== null;
      } else if (type === "comment") {
        const comment = await Comment.findByCommentId(dataId);
        return comment !== null;
      }
      return false;
    } catch (err) {
      console.error("Error verifying data ID:", err.message);
      return false;
    }
  }

  // Create a new report
  static async createReport(type, dataId, userId) {
    try {
      // Validate type
      if (type !== "post" && type !== "comment") {
        return { 
          success: false, 
          message: "Invalid type. Must be 'post' or 'comment'." 
        };
      }

      // Verify dataId exists
      const isValid = await Report.verifyDataId(type, dataId);
      if (!isValid) {
        return {
          success: false,
          message: `Invalid ${type} ID. The ${type} does not exist.`
        };
      }

      const collection = await mongocon.reportsCollection();
      if (!collection) throw new Error("Database connection failed");

      // Check if report already exists
      const existingReport = await Report.findReport(dataId, userId);
      
      if (existingReport) {
        return { 
          success: false, 
          message: "Already reported",
          reportId: existingReport.reportId
        };
      }

      // Create new report
      const newReport = new Report({
        dataId,
        type,
        userId,
      });

      await collection.insertOne({
        _id: newReport.reportId,
        reportId: newReport.reportId,
        dataId: newReport.dataId,
        type: newReport.type,
        userId: newReport.userId,
        createdAt: newReport.createdAt,
      });

      return { 
        success: true, 
        message: "Report created successfully",
        report: newReport
      };
    } catch (err) {
      console.error("Error creating report:", err.message);
      throw err;
    }
  }

  // Get all reports for a specific data item (post or comment)
  static async getReportsByDataId(dataId, page = 1, limit = 20) {
    try {
      const collection = await mongocon.reportsCollection();
      if (!collection) throw new Error("Database connection failed");

      const skip = (page - 1) * limit;

      const result = await collection.aggregate([
        {
          $match: { dataId }
        },
        {
          $facet: {
            reports: [
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

      const reports = result[0].reports;
      const total = result[0].totalCount[0]?.count || 0;

      return {
        reports,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (err) {
      console.error("Error getting reports by data ID:", err.message);
      throw err;
    }
  }

  // Get all reports by a user
  static async getReportsByUserId(userId, page = 1, limit = 20) {
    try {
      const collection = await mongocon.reportsCollection();
      if (!collection) throw new Error("Database connection failed");

      const skip = (page - 1) * limit;

      const result = await collection.aggregate([
        {
          $match: { userId }
        },
        {
          $facet: {
            reports: [
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

      const reports = result[0].reports;
      const total = result[0].totalCount[0]?.count || 0;

      return {
        reports,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (err) {
      console.error("Error getting reports by user ID:", err.message);
      throw err;
    }
  }

  // Get all reports by type (post or comment)
  static async getReportsByType(type, page = 1, limit = 20) {
    try {
      const collection = await mongocon.reportsCollection();
      if (!collection) throw new Error("Database connection failed");

      const skip = (page - 1) * limit;

      const result = await collection.aggregate([
        {
          $match: { type }
        },
        {
          $facet: {
            reports: [
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

      const reports = result[0].reports;
      const total = result[0].totalCount[0]?.count || 0;

      return {
        reports,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (err) {
      console.error("Error getting reports by type:", err.message);
      throw err;
    }
  }

  // Get report count for a specific data item
  static async getReportCountByDataId(dataId) {
    try {
      const collection = await mongocon.reportsCollection();
      if (!collection) throw new Error("Database connection failed");

      const count = await collection.countDocuments({ dataId });
      return count;
    } catch (err) {
      console.error("Error getting report count:", err.message);
      throw err;
    }
  }

  // Delete all reports for a specific data item (cascade delete when post/comment is deleted)
  static async deleteReportsByDataId(dataId) {
    try {
      const collection = await mongocon.reportsCollection();
      if (!collection) throw new Error("Database connection failed");

      const result = await collection.deleteMany({ dataId });
      return result.deletedCount;
    } catch (err) {
      console.error("Error deleting reports by data ID:", err.message);
      throw err;
    }
  }

  // Check if user has reported a specific data item
  static async hasUserReported(dataId, userId) {
    try {
      const report = await Report.findReport(dataId, userId);
      return report !== null;
    } catch (err) {
      console.error("Error checking if user has reported:", err.message);
      return false;
    }
  }
}

export default Report;