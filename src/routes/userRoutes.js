import express from "express";
import { getUserProfile } from "../controllers/userController.js";

const router = express.Router();

// Public route - no authentication required
router.get("/:userId", getUserProfile);

export default router;