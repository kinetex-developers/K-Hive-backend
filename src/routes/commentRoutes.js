import express from "express";
import {
  createComment,
  getCommentsByPostId,
  getRepliesByCommentId,
  getCommentsByUserId,
  getCommentById,
  updateComment,
  softDeleteComment,
  hardDeleteComment,
  upvoteComment,
  downvoteComment,
  getCommentCount,
  getReplyCount,
  reportComment,
} from "../controllers/commentController.js";
import { isAuthenticated, attachUser } from "../middleware/authMiddleware.js";
import moderation from "../middleware/moderation.js";
import {
  commentCreationRateLimit,
  commentUpdateRateLimit,
  reportRateLimit,
} from "../middleware/rateLimitMiddleware.js";

const router = express.Router();

// Public routes
router.get("/post/:postId", attachUser, getCommentsByPostId);
router.get("/post/:postId/count", attachUser, getCommentCount);
router.get("/user/:userId", attachUser, getCommentsByUserId);
router.get("/:commentId", attachUser, getCommentById);
router.get("/:commentId/replies", attachUser, getRepliesByCommentId);
router.get("/:commentId/replycount", attachUser, getReplyCount);

// Protected routes (require authentication)
router.post("/", isAuthenticated, commentCreationRateLimit, moderation, createComment);
router.put("/:commentId", isAuthenticated, commentUpdateRateLimit, moderation, updateComment);
router.delete("/:commentId", isAuthenticated, hardDeleteComment);
router.get("/:commentId/report", isAuthenticated, reportRateLimit, reportComment);

// Voting routes (require authentication)
//router.post("/:commentId/upvote", isAuthenticated, upvoteComment);
//router.post("/:commentId/downvote", isAuthenticated, downvoteComment);

export default router;