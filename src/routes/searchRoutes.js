// routes/searchRoutes.js
// CREATE THIS NEW FILE

import express from "express";
import {
  autocomplete,
  getTagSuggestions,
  incrementScore,
  rebuildIndex,
  getIndexStatus
} from "../controllers/searchController.js";
import { attachUser, isAuthenticated } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public routes
router.get("/autocomplete", attachUser, autocomplete);
router.get("/tags", attachUser, getTagSuggestions);
router.get("/status", getIndexStatus);

// Protected routes
router.post("/increment", isAuthenticated, incrementScore);

// Admin routes (add proper admin middleware later)
router.post("/rebuild", rebuildIndex);

export default router;