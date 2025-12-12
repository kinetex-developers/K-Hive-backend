import express from "express";
import {
  autocomplete,
  getTagSuggestions,
  incrementScore,
  rebuildIndex,
  getIndexStatus
} from "../controllers/searchController.js";
import { attachUser, isAuthenticated } from "../middleware/authMiddleware.js";
import { isAdmin } from "../middleware/adminMiddleware.js";

const router = express.Router();

// Public routes
router.get("/autocomplete", attachUser, autocomplete);
router.get("/tags", attachUser, getTagSuggestions);
router.get("/status", getIndexStatus);

// Admin routes
router.post("/rebuild", isAdmin, rebuildIndex);
router.post("/increment", isAdmin, incrementScore);

export default router;