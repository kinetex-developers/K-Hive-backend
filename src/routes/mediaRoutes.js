import express from "express";
import { getUploadCredentials } from "../controllers/mediaController.js";
import { isAuthenticated } from "../middleware/authMiddleware.js";

const router = express.Router();

// Protected route (require authentication)
router.get("/uploadlink", isAuthenticated, getUploadCredentials);

export default router;