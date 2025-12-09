import express from "express";
import {
  togglePinPost,
  toggleLockPost,
  deleteAnyPost,
  getDashboardStats,
} from "../controllers/adminController.js";
import { isAdmin } from "../middleware/adminMiddleware.js";

const router = express.Router();

// All routes require admin authentication
router.use(isAdmin);

// Post management routes
router.patch("/posts/:postId/pin", togglePinPost);
router.patch("/posts/:postId/lock", toggleLockPost);
router.delete("/posts/:postId", deleteAnyPost);

// User management routes
// router.get("/users", getAllUsers);
// router.patch("/users/:userId/ban", toggleBanUser);

// Dashboard routes
router.get("/dashboard/stats", getDashboardStats);

export default router;