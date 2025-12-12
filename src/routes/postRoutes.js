import express from "express";
import {
  createPost,
  getAllPosts,
  getPostById,
  getPostsByUserId,
  searchPosts,
  updatePost,
  deletePost,
  upvotePost,
  downvotePost,
} from "../controllers/postController.js";
import { isAuthenticated, attachUser } from "../middleware/authMiddleware.js";
import moderation from "../middleware/moderation.js";
import {
  postCreationRateLimit,
  postUpdateRateLimit,
  votingRateLimit
} from "../middleware/rateLimitMiddleware.js";

const router = express.Router();

// Public routes 
router.get("/", attachUser, getAllPosts);
router.get("/search", attachUser, searchPosts);
router.get("/user/:userId", attachUser, getPostsByUserId);
router.get("/:postId", attachUser, getPostById);

// Protected routes (require authentication)
router.post("/", isAuthenticated, postCreationRateLimit, moderation, createPost);
router.put("/:postId", isAuthenticated, postUpdateRateLimit, moderation, updatePost);
router.delete("/:postId", isAuthenticated, deletePost);

// Voting routes (require authentication)
router.patch("/upvote/:postId", isAuthenticated, votingRateLimit, upvotePost);
router.patch("/downvote/:postId", isAuthenticated, votingRateLimit, downvotePost);

export default router;