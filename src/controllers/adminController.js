import Post from "../models/Post.js";
import User from "../models/User.js";

// Toggle pin status for a post
export const togglePinPost = async (req, res) => {
  try {
    const { postId } = req.params;

    // Check if post exists
    const post = await Post.findByPostId(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    const toggled = await Post.togglePin(postId);

    if (toggled) {
      const updatedPost = await Post.findByPostId(postId);
      res.status(200).json({
        success: true,
        message: `Post ${updatedPost.isPinned ? "pinned" : "unpinned"} successfully`,
        data: {
          postId,
          isPinned: updatedPost.isPinned,
        },
      });
    } else {
      throw new Error("Failed to toggle pin status");
    }
  } catch (err) {
    console.error("Error in togglePinPost:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to toggle pin status",
      error: err.message,
    });
  }
};

// Toggle lock status for a post
export const toggleLockPost = async (req, res) => {
  try {
    const { postId } = req.params;

    // Check if post exists
    const post = await Post.findByPostId(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    const toggled = await Post.toggleLock(postId);

    if (toggled) {
      const updatedPost = await Post.findByPostId(postId);
      res.status(200).json({
        success: true,
        message: `Post ${updatedPost.isLocked ? "locked" : "unlocked"} successfully`,
        data: {
          postId,
          isLocked: updatedPost.isLocked,
        },
      });
    } else {
      throw new Error("Failed to toggle lock status");
    }
  } catch (err) {
    console.error("Error in toggleLockPost:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to toggle lock status",
      error: err.message,
    });
  }
};

// Delete any post (admin override)
export const deleteAnyPost = async (req, res) => {
  try {
    const { postId } = req.params;

    // Check if post exists
    const post = await Post.findByPostId(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    // Delete the post (admin can delete any post)
    const deleted = await Post.deletePost(postId, post.userId);

    if (deleted) {
      res.status(200).json({
        success: true,
        message: "Post deleted successfully by admin",
      });
    } else {
      throw new Error("Failed to delete post");
    }
  } catch (err) {
    console.error("Error in deleteAnyPost:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to delete post",
      error: err.message,
    });
  }
};

// Ban/Unban a user
// export const toggleBanUser = async (req, res) => {
//   try {
//     const { userId } = req.params;

//     // Prevent self-ban
//     if (req.user.userId === userId) {
//       return res.status(400).json({
//         success: false,
//         message: "You cannot ban yourself",
//       });
//     }

//     // Check if user exists
//     const user = await User.findByUserId(userId);
//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         message: "User not found",
//       });
//     }

//     // Prevent banning other admins
//     if (user.role === "admin") {
//       return res.status(403).json({
//         success: false,
//         message: "Cannot ban another admin",
//       });
//     }

//     // Toggle ban status
//     const newBanStatus = !user.isBanned;
//     const updatedUser = await User.updateUser(userId, {
//       isBanned: newBanStatus,
//       bannedAt: newBanStatus ? new Date() : null,
//     });

//     if (updatedUser) {
//       res.status(200).json({
//         success: true,
//         message: `User ${newBanStatus ? "banned" : "unbanned"} successfully`,
//         data: {
//           userId: updatedUser.userId,
//           isBanned: updatedUser.isBanned,
//           bannedAt: updatedUser.bannedAt,
//         },
//       });
//     } else {
//       throw new Error("Failed to update user ban status");
//     }
//   } catch (err) {
//     console.error("Error in toggleBanUser:", err.message);
//     res.status(500).json({
//       success: false,
//       message: "Failed to ban/unban user",
//       error: err.message,
//     });
//   }
// };

// Get all users (admin view with additional info)
// export const getAllUsers = async (req, res) => {
//   try {
//     const users = await User.getAllUsers();

//     // Return user info without sensitive data
//     const sanitizedUsers = users.map(user => ({
//       userId: user.userId,
//       name: user.name,
//       gmailId: user.gmailId,
//       avatarLink: user.avatarLink,
//       joinDate: user.joinDate,
//       role: user.role,
//       isBanned: user.isBanned || false,
//       bannedAt: user.bannedAt || null,
//       postCount: user.postIds?.length || 0,
//       commentCount: user.commentIds?.length || 0,
//     }));

//     res.status(200).json({
//       success: true,
//       message: "Users retrieved successfully",
//       data: sanitizedUsers,
//     });
//   } catch (err) {
//     console.error("Error in getAllUsers:", err.message);
//     res.status(500).json({
//       success: false,
//       message: "Failed to retrieve users",
//       error: err.message,
//     });
//   }
// };

// Get admin dashboard stats
export const getDashboardStats = async (req, res) => {
  try {
    const users = await User.getAllUsers();
    const totalUsers = users.length;
    const bannedUsers = users.filter(u => u.isBanned).length;
    const adminUsers = users.filter(u => u.role === "admin").length;

    // You can extend this with more stats from Post model
    res.status(200).json({
      success: true,
      message: "Dashboard stats retrieved successfully",
      data: {
        totalUsers,
        bannedUsers,
        adminUsers,
        activeUsers: totalUsers - bannedUsers,
      },
    });
  } catch (err) {
    console.error("Error in getDashboardStats:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve dashboard stats",
      error: err.message,
    });
  }
};