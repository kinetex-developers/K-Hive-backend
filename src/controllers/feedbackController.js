import Feedback from "../models/Feedback.js";
import User from "../models/User.js";

// Create a new feedback
export const createFeedback = async (req, res) => {
  try {
    const { content } = req.body;
    const userId = req.user.userId;

    // Validation
    if (!content) {
      return res.status(400).json({
        success: false,
        message: "Content is required",
      });
    }

    const user = await User.findByUserId(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (content.length < 10 || content.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Content must be between 10 and 2000 characters",
      });
    }

    // Create feedback
    const feedbackData = {
      userId,
      content: content.trim(),
    };

    const newFeedback = await Feedback.create(feedbackData);

    res.status(201).json({
      success: true,
      message: "Feedback submitted successfully",
      data: newFeedback,
    });
  } catch (err) {
    console.error("Error in createFeedback:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to submit feedback",
      error: err.message,
    });
  }
};

// Get all feedback with pagination
export const getAllFeedback = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const sortBy = req.query.sortBy || "createdAt";
    const order = req.query.order === "asc" ? 1 : -1;

    // Validate pagination
    if (page < 1 || limit < 1 || limit > 100) {
      return res.status(400).json({
        success: false,
        message: "Invalid pagination parameters",
      });
    }

    const result = await Feedback.getAllFeedback(page, limit, sortBy, order);

    res.status(200).json({
      success: true,
      message: "Feedback retrieved successfully",
      data: result.feedback,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error("Error in getAllFeedback:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve feedback",
      error: err.message,
    });
  }
};

// Get feedback by time range
export const getFeedbackByTimeRange = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const sortBy = req.query.sortBy || "createdAt";
    const order = req.query.order === "asc" ? 1 : -1;

    // Validate pagination
    if (page < 1 || limit < 1 || limit > 100) {
      return res.status(400).json({
        success: false,
        message: "Invalid pagination parameters",
      });
    }

    // Validate dates if provided
    if (startDate && isNaN(Date.parse(startDate))) {
      return res.status(400).json({
        success: false,
        message: "Invalid start date format",
      });
    }

    if (endDate && isNaN(Date.parse(endDate))) {
      return res.status(400).json({
        success: false,
        message: "Invalid end date format",
      });
    }

    // Check if start date is before end date
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({
        success: false,
        message: "Start date must be before end date",
      });
    }

    const result = await Feedback.getFeedbackByTimeRange(
      startDate,
      endDate,
      page,
      limit,
      sortBy,
      order
    );

    res.status(200).json({
      success: true,
      message: "Feedback retrieved successfully",
      data: result.feedback,
      pagination: result.pagination,
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
      },
    });
  } catch (err) {
    console.error("Error in getFeedbackByTimeRange:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve feedback by time range",
      error: err.message,
    });
  }
};

// Get feedback by user ID
export const getFeedbackByUserId = async (req, res) => {
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

    const result = await Feedback.getFeedbackByUserId(userId, page, limit);

    res.status(200).json({
      success: true,
      message: "User feedback retrieved successfully",
      data: result.feedback,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error("Error in getFeedbackByUserId:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve user feedback",
      error: err.message,
    });
  }
};

// Get a single feedback by ID
export const getFeedbackById = async (req, res) => {
  try {
    const { feedbackId } = req.params;

    const feedback = await Feedback.findByFeedbackId(feedbackId);

    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: "Feedback not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Feedback retrieved successfully",
      data: feedback,
    });
  } catch (err) {
    console.error("Error in getFeedbackById:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve feedback",
      error: err.message,
    });
  }
};

// Delete feedback
export const deleteFeedback = async (req, res) => {
  try {
    const { feedbackId } = req.params;
    const userId = req.user.userId;

    // Check if feedback exists
    const feedback = await Feedback.findByFeedbackId(feedbackId);
    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: "Feedback not found",
      });
    }

    // Check if user owns the feedback
    if (feedback.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to delete this feedback",
      });
    }

    const deleted = await Feedback.deleteFeedback(feedbackId, userId);

    if (deleted) {
      res.status(200).json({
        success: true,
        message: "Feedback deleted successfully",
      });
    } else {
      throw new Error("Failed to delete feedback");
    }
  } catch (err) {
    console.error("Error in deleteFeedback:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to delete feedback",
      error: err.message,
    });
  }
};