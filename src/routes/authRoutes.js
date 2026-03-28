import express from "express";
import passport from "../config/passport.js";
import { isAuthenticated, isNotAuthenticated } from "../middleware/authMiddleware.js";
import {
  googleCallback,
  getCurrentUser,
  logout,
  checkAuth,
  refreshToken,
  updateUser,
  deleteUser,
} from "../controllers/authController.js";
import {
  userUpdateRateLimit
} from "../middleware/rateLimitMiddleware.js";

const router = express.Router();

//Login/Sign-up ratelimiting handled inside passport.authenticate
router.get(
  "/google",
  isNotAuthenticated,
  (req, res, next) => {
    const isMobile = req.query.source === "mobile";

    const options = {
      scope: ["profile", "email"],
      session: false,
      prompt: req.query.prompt
    };

    if (isMobile) {
      options.state = true;
    }

    passport.authenticate("google", options)(req, res, next);
  }
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=auth_failed`,
    session: false,
  }),
  googleCallback
);

router.get("/user", isAuthenticated, getCurrentUser);

router.delete("/user", isAuthenticated, deleteUser);

router.put("/user", isAuthenticated, userUpdateRateLimit, updateUser);

router.get("/check", checkAuth);

router.post("/refresh", refreshToken);

router.post("/logout", isAuthenticated, logout);

export default router;
