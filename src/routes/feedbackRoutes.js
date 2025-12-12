import express from "express";
import {
  createFeedback,
  getAllFeedback,
  getFeedbackByTimeRange,
  getFeedbackByUserId,
  getFeedbackById,
  deleteFeedback,
} from "../controllers/feedbackController.js";
import { isAuthenticated, attachUser } from "../middleware/authMiddleware.js";
import moderation from "../middleware/moderation.js";

const router = express.Router();

// Public routes
router.get("/", attachUser, getAllFeedback);
router.get("/time-range", attachUser, getFeedbackByTimeRange);
router.get("/user/:userId", attachUser, getFeedbackByUserId);
router.get("/:feedbackId", attachUser, getFeedbackById);

// Protected routes (require authentication)
router.post("/", isAuthenticated, moderation, createFeedback);
router.delete("/:feedbackId", isAuthenticated, deleteFeedback);

export default router;