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

const router = express.Router();

// Public routes 
router.get("/", attachUser, getAllPosts);
router.get("/search", attachUser, searchPosts);
router.get("/user/:userId", attachUser, getPostsByUserId);
router.get("/:postId", attachUser, getPostById);

// Protected routes (require authentication)
router.post("/", isAuthenticated, moderation, createPost);
router.put("/:postId", isAuthenticated, moderation, updatePost);
router.delete("/:postId", isAuthenticated, deletePost);

// Voting routes (require authentication)
router.patch("/upvote/:postId", isAuthenticated, upvotePost);
router.patch("/downvote/:postId", isAuthenticated, downvotePost);

export default router;