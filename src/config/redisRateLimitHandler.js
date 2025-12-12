import Redis from "ioredis";
import { RateLimiter } from "@koshnic/ratelimit";
import { 
  USER_UPDATE, //per hour
  USER_LOGIN, //per hour
  MEDIA_UPLOAD, //per hour
  COMMENT_UPDATE, //per hour
  COMMENT_CREATE, //per hour
  VOTING, //per minute
  POST_UPDATE, //per hour
  POST_CREATE, //per hour
  FEEDBACK, //per hour
 } from './rlconfig.js';
const rateLimitRedisUrl = process.env.RATE_LIMIT_REDIS_URL || process.env.REDIS_URL;

let rateLimitRedis;
let limiter;

async function getRateLimitRedis() {
  if (rateLimitRedis) return rateLimitRedis;

  try {
    rateLimitRedis = new Redis(rateLimitRedisUrl, {
      retryStrategy(times) {
        const delay = Math.min(times * 500, 3000);
        return delay;
      },
      reconnectOnError(err) {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true;
        }
        return false;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      lazyConnect: false,
    });

    rateLimitRedis.on("connect", () => {
      console.log("Rate Limit Redis connected");
    });

    rateLimitRedis.on("error", (err) => {
      console.error("Rate Limit Redis error:", err.message);
    });

    return rateLimitRedis;
  } catch (err) {
    console.error("Unable to initialize Rate Limit Redis:", err.message);
    return null;
  }
}

async function getRateLimiter() {
  if (limiter) return limiter;

  const redis = await getRateLimitRedis();
  if (!redis) {
    throw new Error("Rate Limit Redis not available");
  }

  limiter = new RateLimiter(redis);
  return limiter;
}

function rateKey(userId, routeId) {
  return `user:${userId}:${routeId}`;
}

async function checkPostCreationLimit(userId) {
  try {
    const limiter = await getRateLimiter();
    const key = rateKey(userId, "post:create");
    
    const result = await limiter.allowPerHour(key, POST_CREATE);
    
    if (!result.allowed) {
      console.log(`[RATE LIMIT] Post creation blocked for user ${userId}, retry after ${result.retryAfter}s`);
    }
    
    return result;
  } catch (err) {
    console.error("Rate limit check error (post creation):", err.message);
    // Fail open - allow the request if rate limiter fails
    return { allowed: true, retryAfter: 0 };
  }
}

async function checkPostUpdateLimit(userId) {
  try {
    const limiter = await getRateLimiter();
    const key = rateKey(userId, "post:update");
    
    const result = await limiter.allowPerHour(key, POST_UPDATE);
    
    if (!result.allowed) {
      console.log(`[RATE LIMIT] Post update blocked for user ${userId}, retry after ${result.retryAfter}s`);
    }
    
    return result;
  } catch (err) {
    console.error("Rate limit check error (post update):", err.message);
    // Fail open - allow the request if rate limiter fails
    return { allowed: true, retryAfter: 0 };
  }
}

async function checkVotingLimit(userId) {
  try {
    const limiter = await getRateLimiter();
    const key = rateKey(userId, "post:vote");
    
    const result = await limiter.allowPerMinute(key,VOTING);
    
    if (!result.allowed) {
      console.log(`[RATE LIMIT] Voting blocked for user ${userId}, retry after ${result.retryAfter}s`);
    }
    
    return result;
  } catch (err) {
    console.error("Rate limit check error (voting):", err.message);
    // Fail open - allow the request if rate limiter fails
    return { allowed: true, retryAfter: 0 };
  }
}

async function checkCommentCreationLimit(userId) {
  try {
    const limiter = await getRateLimiter();
    const key = rateKey(userId, "comment:create");
    
    const result = await limiter.allowPerHour(key, COMMENT_CREATE);
    
    if (!result.allowed) {
      console.log(`[RATE LIMIT] Comment creation blocked for user ${userId}, retry after ${result.retryAfter}s`);
    }
    
    return result;
  } catch (err) {
    console.error("Rate limit check error (comment creation):", err.message);
    // Fail open - allow the request if rate limiter fails
    return { allowed: true, retryAfter: 0 };
  }
}

async function checkCommentUpdateLimit(userId) {
  try {
    const limiter = await getRateLimiter();
    const key = rateKey(userId, "comment:update");
    
    const result = await limiter.allowPerHour(key, COMMENT_UPDATE);
    
    if (!result.allowed) {
      console.log(`[RATE LIMIT] Comment update blocked for user ${userId}, retry after ${result.retryAfter}s`);
    }
    
    return result;
  } catch (err) {
    console.error("Rate limit check error (comment update):", err.message);
    // Fail open - allow the request if rate limiter fails
    return { allowed: true, retryAfter: 0 };
  }
}

async function checkMediaUploadLimit(userId) {
  try {
    const limiter = await getRateLimiter();
    const key = rateKey(userId, "media:upload");
    
    const result = await limiter.allowPerHour(key, MEDIA_UPLOAD);
    
    if (!result.allowed) {
      console.log(`[RATE LIMIT] Media upload blocked for user ${userId}, retry after ${result.retryAfter}s`);
    }
    
    return result;
  } catch (err) {
    console.error("Rate limit check error (media upload):", err.message);
    // Fail open - allow the request if rate limiter fails
    return { allowed: true, retryAfter: 0 };
  }
}

async function checkFeedbackLimit(userId) {
  try {
    const limiter = await getRateLimiter();
    const key = rateKey(userId, "feedback");
    
    const result = await limiter.allowPerHour(key, FEEDBACK);
    
    if (!result.allowed) {
      console.log(`[RATE LIMIT] Feedback blocked for user ${userId}, retry after ${result.retryAfter}s`);
    }
    
    return result;
  } catch (err) {
    console.error("Rate limit check error (feedback):", err.message);
    // Fail open - allow the request if rate limiter fails
    return { allowed: true, retryAfter: 0 };
  }
}

async function checkLoginLimit(identifier) {
  try {
    const limiter = await getRateLimiter();
    const key = rateKey(identifier, "auth:login");
    
    const result = await limiter.allowPerHour(key, USER_LOGIN);
    
    if (!result.allowed) {
      console.log(`[RATE LIMIT] Login blocked for ${identifier}, retry after ${result.retryAfter}s`);
    }
    
    return result;
  } catch (err) {
    console.error("Rate limit check error (login):", err.message);
    // Fail open - allow the request if rate limiter fails
    return { allowed: true, retryAfter: 0 };
  }
}

async function checkUserUpdateLimit(userId) {
  try {
    const limiter = await getRateLimiter();
    const key = rateKey(userId, "user:update");
    
    const result = await limiter.allowPerHour(key, USER_UPDATE);
    
    if (!result.allowed) {
      console.log(`[RATE LIMIT] User update blocked for user ${userId}, retry after ${result.retryAfter}s`);
    }
    
    return result;
  } catch (err) {
    console.error("Rate limit check error (user update):", err.message);
    // Fail open - allow the request if rate limiter fails
    return { allowed: true, retryAfter: 0 };
  }
}

async function checkCustomLimit(userId, routeId, options) {
  try {
    const limiter = await getRateLimiter();
    const key = rateKey(userId, routeId);
    
    const result = await limiter.allow(key, {
      burst: options.burst,
      ratePerPeriod: options.ratePerPeriod,
      period: options.period,
      cost: options.cost || 1
    });
    
    if (!result.allowed) {
      console.log(`[RATE LIMIT] Custom limit blocked for user ${userId} on ${routeId}, retry after ${result.retryAfter}s`);
    }
    
    return result;
  } catch (err) {
    console.error(`Rate limit check error (${routeId}):`, err.message);
    // Fail open - allow the request if rate limiter fails
    return { allowed: true, retryAfter: 0 };
  }
}

async function resetRateLimit(userId, routeId) {
  try {
    const redis = await getRateLimitRedis();
    if (!redis) return false;
    
    const key = `rate_limit:${rateKey(userId, routeId)}`;
    await redis.del(key);
    console.log(`[RATE LIMIT] Reset limit for ${key}`);
    return true;
  } catch (err) {
    console.error("Reset rate limit error:", err.message);
    return false;
  }
}

export default {
  getRateLimitRedis,
  getRateLimiter,
  checkLoginLimit,
  checkUserUpdateLimit,
  checkPostCreationLimit,
  checkPostUpdateLimit,
  checkCommentCreationLimit,
  checkCommentUpdateLimit,
  checkVotingLimit,
  checkMediaUploadLimit,
  checkCustomLimit,
  resetRateLimit,
  checkFeedbackLimit,
};

export {
  getRateLimitRedis,
  getRateLimiter,
  checkLoginLimit,
  checkUserUpdateLimit,
  checkPostCreationLimit,
  checkPostUpdateLimit,
  checkCommentCreationLimit,
  checkCommentUpdateLimit,
  checkVotingLimit,
  checkMediaUploadLimit,
  checkCustomLimit,
  resetRateLimit,
  checkFeedbackLimit,
};