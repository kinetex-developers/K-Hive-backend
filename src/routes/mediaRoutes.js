import express from "express";
import { getUploadCredentials } from "../controllers/mediaController.js";
import { isAuthenticated } from "../middleware/authMiddleware.js";
import {mediaUploadRateLimit } from "../middleware/rateLimitMiddleware.js";
const router = express.Router();

// Protected route (require authentication)
router.get("/uploadlink", isAuthenticated, mediaUploadRateLimit, getUploadCredentials);

export default router;