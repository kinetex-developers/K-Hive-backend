import {
  checkPostCreationLimit,
  checkPostUpdateLimit,
  checkVotingLimit,
  checkCommentCreationLimit,
  checkCommentUpdateLimit,
  checkMediaUploadLimit,
  checkLoginLimit,
  checkUserUpdateLimit,
  checkFeedbackLimit,
} from "../config/redisRateLimitHandler.js";

export async function postCreationRateLimit(req, res, next) {
  try {
    const userId = req.user?.id || req.user?._id?.toString();
    
    if (!userId) {
      return res.status(401).json({ 
        success: false,
        message: "Authentication required" 
      });
    }

    const result = await checkPostCreationLimit(userId);
    
    if (!result.allowed) {
      res.set("Retry-After", String(result.retryAfter));
      return res.status(429).json({
        success: false,
        message: "Too many posts created. Please try again later.",
        retryAfter: result.retryAfter
      });
    }

    next();
  } catch (err) {
    console.error("Post creation rate limit error:", err.message);
    // Fail open - allow the request if middleware fails
    next();
  }
}

export async function postUpdateRateLimit(req, res, next) {
  try {
    const userId = req.user?.id || req.user?._id?.toString();
    
    if (!userId) {
      return res.status(401).json({ 
        success: false,
        message: "Authentication required" 
      });
    }

    const result = await checkPostUpdateLimit(userId);
    
    if (!result.allowed) {
      res.set("Retry-After", String(result.retryAfter));
      return res.status(429).json({
        success: false,
        message: "Too many post updates. Please try again later.",
        retryAfter: result.retryAfter
      });
    }

    next();
  } catch (err) {
    console.error("Post update rate limit error:", err.message);
    // Fail open - allow the request if middleware fails
    next();
  }
}

export async function votingRateLimit(req, res, next) {
  try {
    const userId = req.user?.id || req.user?._id?.toString();
    
    if (!userId) {
      return res.status(401).json({ 
        success: false,
        message: "Authentication required" 
      });
    }

    const result = await checkVotingLimit(userId);
    
    if (!result.allowed) {
      res.set("Retry-After", String(result.retryAfter));
      return res.status(429).json({
        success: false,
        message: "Too many votes. Please slow down.",
        retryAfter: result.retryAfter
      });
    }

    next();
  } catch (err) {
    console.error("Voting rate limit error:", err.message);
    // Fail open - allow the request if middleware fails
    next();
  }
}

export async function commentCreationRateLimit(req, res, next) {
  try {
    const userId = req.user?.id || req.user?._id?.toString();
    
    if (!userId) {
      return res.status(401).json({ 
        success: false,
        message: "Authentication required" 
      });
    }

    const result = await checkCommentCreationLimit(userId);
    
    if (!result.allowed) {
      res.set("Retry-After", String(result.retryAfter));
      return res.status(429).json({
        success: false,
        message: "Too many comments created. Please try again later.",
        retryAfter: result.retryAfter
      });
    }

    next();
  } catch (err) {
    console.error("Comment creation rate limit error:", err.message);
    // Fail open - allow the request if middleware fails
    next();
  }
}

export async function commentUpdateRateLimit(req, res, next) {
  try {
    const userId = req.user?.id || req.user?._id?.toString();
    
    if (!userId) {
      return res.status(401).json({ 
        success: false,
        message: "Authentication required" 
      });
    }

    const result = await checkCommentUpdateLimit(userId);
    
    if (!result.allowed) {
      res.set("Retry-After", String(result.retryAfter));
      return res.status(429).json({
        success: false,
        message: "Too many comment updates. Please try again later.",
        retryAfter: result.retryAfter
      });
    }

    next();
  } catch (err) {
    console.error("Comment update rate limit error:", err.message);
    // Fail open - allow the request if middleware fails
    next();
  }
}

export async function mediaUploadRateLimit(req, res, next) {
  try {
    const userId = req.user?.id || req.user?._id?.toString();
    
    if (!userId) {
      return res.status(401).json({ 
        success: false,
        message: "Authentication required" 
      });
    }

    const result = await checkMediaUploadLimit(userId);
    
    if (!result.allowed) {
      res.set("Retry-After", String(result.retryAfter));
      return res.status(429).json({
        success: false,
        message: "Too many upload requests. Please try again later.",
        retryAfter: result.retryAfter
      });
    }

    next();
  } catch (err) {
    console.error("Media upload rate limit error:", err.message);
    // Fail open - allow the request if middleware fails
    next();
  }
}

export async function feedbackRateLimit(req, res, next) {
  try {
    const userId = req.user?.id || req.user?._id?.toString();
    
    if (!userId) {
      return res.status(401).json({ 
        success: false,
        message: "Authentication required" 
      });
    }

    const result = await checkFeedbackLimit(userId);
    
    if (!result.allowed) {
      res.set("Retry-After", String(result.retryAfter));
      return res.status(429).json({
        success: false,
        message: "Too many feedback requests. Please try again later.",
        retryAfter: result.retryAfter
      });
    }

    next();
  } catch (err) {
    console.error("Feedback rate limit error:", err.message);
    // Fail open - allow the request if middleware fails
    next();
  }
}

/**
 * Rate limit middleware for login attempts
 * Uses IP address or email as identifier
 */
export async function loginRateLimit(userData) {
  try {
    const identifier = userData.gmailId;
    const result = await checkLoginLimit(identifier);
    
    if (!result.allowed) {
      return {
        success: false,
        message: "Too many login attempts. Please try again later.",
        retryAfter: result.retryAfter
      };
    }
  } catch (err) {
    throw new Error("Login rate limit error:", err.message);
    // Fail open - allow the request if middleware fails
  }
  return {
        success: true,
    };
}

export async function userUpdateRateLimit(req, res, next) {
  try {
    const userId = req.user?.id || req.user?._id?.toString();
    
    if (!userId) {
      return res.status(401).json({ 
        success: false,
        message: "Authentication required" 
      });
    }

    const result = await checkUserUpdateLimit(userId);
    
    if (!result.allowed) {
      res.set("Retry-After", String(result.retryAfter));
      return res.status(429).json({
        success: false,
        message: "Too many profile updates. Please try again later.",
        retryAfter: result.retryAfter
      });
    }

    next();
  } catch (err) {
    console.error("User update rate limit error:", err.message);
    // Fail open - allow the request if middleware fails
    next();
  }
}

export default {
  postCreationRateLimit,
  postUpdateRateLimit,
  votingRateLimit,
  commentCreationRateLimit,
  commentUpdateRateLimit,
  mediaUploadRateLimit,
  loginRateLimit,
  userUpdateRateLimit,
  feedbackRateLimit,
};