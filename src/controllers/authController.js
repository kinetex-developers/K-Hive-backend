import passport from "../config/passport.js";
import {
  generateToken,
  generateRefreshToken,
  setTokenCookie,
  setRefreshTokenCookie,
  clearTokenCookies,
  verifyRefreshToken,
} from "../utils/jwtUtils.js";
import User from "../models/User.js";

// Google authentication callback handler
export const googleCallback = (req, res) => {
  try {
    // Generate JWT tokens
    const accessToken = generateToken(req.user);
    const refreshToken = generateRefreshToken(req.user);

    // Set tokens in HTTP-only cookies
    setTokenCookie(res, accessToken);
    setRefreshTokenCookie(res, refreshToken);

    // Redirect to frontend with success
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    res.redirect(`${frontendUrl}/auth/success`);
  } catch (err) {
    console.error("Google callback error:", err.message);
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    res.redirect(`${frontendUrl}/login?error=auth_failed`);
  }
};

// Get current user
export const getCurrentUser = (req, res) => {
  res.status(200).json({
    success: true,
    user: {
      userId: req.user.userId,
      name: req.user.name,
      role: req.user.role,
      gmailId: req.user.gmailId,
      avatarLink: req.user.avatarLink,
      joinDate: req.user.joinDate,
      postIds: req.user.postIds,
      commentIds: req.user.commentIds,
    },
  });
};

// Logout
export const logout = (req, res) => {
  try {
    clearTokenCookies(res);
    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (err) {
    console.error("Logout error:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to logout",
    });
  }
};

// Check authentication status
export const checkAuth = (req, res) => {
  // Try to authenticate with JWT
  passport.authenticate("jwt", { session: false }, (err, user) => {
    if (err || !user) {
      return res.status(200).json({
        success: true,
        authenticated: false,
        user: null,
      });
    }

    res.status(200).json({
      success: true,
      authenticated: true,
      user: {
        userId: user.userId,
        name: user.name,
        gmailId: user.gmailId,
        avatarLink: user.avatarLink,
      },
    });
  })(req, res);
};

// Refresh access token using refresh token
export const refreshToken = async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: "No refresh token provided",
      });
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired refresh token",
      });
    }

    // Get user from database
    const user = await User.findByUserId(decoded.userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    // Generate new access token
    const newAccessToken = generateToken(user);
    setTokenCookie(res, newAccessToken);

    res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
    });
  } catch (err) {
    console.error("Refresh token error:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to refresh token",
    });
  }
};

// Update user (only name)
export const updateUser = async (req, res) => {
  try {
    const { name } = req.body;
    const userId = req.user.userId; // Get userId from authenticated user

    // Validate that name is provided
    if (name === undefined) {
      return res.status(400).json({
        success: false,
        message: "No valid fields to update",
      });
    }

    // Validate name
    if (typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Name must be at least 2 characters",
      });
    }

    if (name.trim().length > 100) {
      return res.status(400).json({
        success: false,
        message: "Name must not exceed 100 characters",
      });
    }

    // Update user
    const updateData = {
      name: name.trim()
    };

    const updatedUser = await User.updateUser(userId, updateData);

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found or update failed",
      });
    }

    res.status(200).json({
      success: true,
      message: "User updated successfully",
      user: {
        userId: updatedUser.userId,
        name: updatedUser.name,
        gmailId: updatedUser.gmailId,
        avatarLink: updatedUser.avatarLink,
        joinDate: updatedUser.joinDate,
      },
    });
  } catch (err) {
    console.error("Error in updateUser:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to update user",
      error: err.message,
    });
  }
};