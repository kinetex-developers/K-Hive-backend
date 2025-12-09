import User from "../models/User.js";

// Get any user's public profile by userId
export const getUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const user = await User.findByUserId(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Return only public-safe data
    res.status(200).json({
      success: true,
      user: {
        userId: user.userId,
        name: user.name,
        avatarLink: user.avatarLink,
        joinDate: user.joinDate,
        role: user.role,
        postIds: user.postIds,
        commentIds: user.commentIds,
      },
    });
  } catch (err) {
    console.error("Error fetching user profile:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user profile",
    });
  }
};