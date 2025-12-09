import Redis from "ioredis";
import { TTL_USERS, TTL_POSTS, TTL_COMMENTS } from './ttlconfig.js';

const redisUrl = process.env.REDIS_URL;
const users_cache_name = process.env.USERS_TABLE_NAME;
const posts_cache_name = process.env.POSTS_TABLE_NAME;
const comments_cache_name = process.env.COMMENTS_TABLE_NAME;

let redis;

async function redisClient() {
  if (redis) return redis;

  try {
    redis = new Redis(redisUrl, {
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

     redis.on("connect", () => {
      console.log("Redis connected");
    });

    redis.on("error", (err) => {
      console.error("Redis connection error:", err.message);
    });

    return redis;
  } catch (err) {
    console.error("Unable to initialize Redis:", err.message);
    return null;
  }
}

async function redisSet(key, value, ttl = null) {
  const client = await redisClient();
  if (!client) return false;

  try {
    console.log(`[CACHE SET] ${key} (ttl=${ttl || "none"})`);

    if (ttl) return await client.set(key, value, "EX", ttl);
    return await client.set(key, value);
  } catch (err) {
    console.error("Redis SET error:", err.message);
    return false;
  }
}


async function redisMSet(pairs, ttl = null) {
  const client = await redisClient();
  if (!client) return false;
  
  try {
    const entries = Object.entries(pairs);
    
    if (entries.length === 0) return true;
    
    if (ttl) {
      const pipeline = client.pipeline();
      for (const [key, value] of entries) {
        pipeline.set(key, value, "EX", ttl);
      }
      const results = await pipeline.exec();
      return results.every(([err]) => !err);
    }
    
    const flatArgs = entries.flatMap(([key, value]) => [key, value]);
    await client.mset(...flatArgs);
    return true;
  } catch (err) {
    console.error("Redis MSET error:", err.message);
    return false;
  }
}

async function redisGet(key) {
  const client = await redisClient();
  if (!client) return null;

  try {
    const value = await client.get(key);

    if (value) {
      console.log(`[CACHE HIT] ${key}`);
    } else {
      console.log(`[CACHE MISS] ${key}`);
    }

    return value;
  } catch (err) {
    console.error("Redis GET error:", err.message);
    return null;
  }
}


async function redisExists(key) {
  const client = await redisClient();
  if (!client) return false;

  try {
    return (await client.exists(key)) === 1;
  } catch (err) {
    console.error("Redis EXISTS error:", err.message);
    return false;
  }
}

async function redisDel(key) {
  const client = await redisClient();
  if (!client) return false;

  try {
    return await client.del(key);
  } catch (err) {
    console.error("Redis DEL error:", err.message);
    return false;
  }
}

async function redisClearPattern(pattern) {
  const client = await redisClient();
  if (!client) return false;

  try {
    let cursor = "0";
    let deletedCount = 0;

    do {
      const [newCursor, keys] = await client.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        100
      );
      cursor = newCursor;

      if (keys.length > 0) {
        const result = await client.del(...keys);
        deletedCount += result;
      }
    } while (cursor !== "0");

    return deletedCount;
  } catch (err) {
    console.error("Redis CLEAR error:", err.message);
    return false;
  }
}



// Users Cache Functions
async function usersCacheGet(key) {
  const data = await redisGet(`${users_cache_name}:${key}`);
  if (!data) return null;
  
  try {
    return JSON.parse(data);
  } catch (err) {
    console.error("JSON parse error in usersCacheGet:", err.message);
    return null;
  }
}

async function usersCacheSet(key, value, ttl = TTL_USERS) {
  return await redisSet(`${users_cache_name}:${key}`, JSON.stringify(value), ttl);
}

async function usersCacheMSet(pairs, ttl = TTL_USERS) {
  if (!pairs || Object.keys(pairs).length === 0) return true;
  const prefixedPairs = {};
  for (const [key, value] of Object.entries(pairs)) {
    prefixedPairs[`${users_cache_name}:${key}`] = JSON.stringify(value);
  }
  return await redisMSet(prefixedPairs, ttl);
}

async function usersCacheDel(key) {
  return await redisDel(`${users_cache_name}:${key}`);
}

async function usersCacheClearTable() {
  return await redisClearPattern(`${users_cache_name}:*`);
}

async function usersCacheExists(key) {
  return await redisExists(`${users_cache_name}:${key}`);
}

// Posts Cache Functions
async function postsCacheGet(key) {
  const data = await redisGet(`${posts_cache_name}:${key}`);
  if (!data) return null;
  
  try {
    return JSON.parse(data);
  } catch (err) {
    console.error("JSON parse error in postsCacheGet:", err.message);
    return null;
  }
}

async function postsCacheSet(key, value, ttl = TTL_POSTS) {
  return await redisSet(`${posts_cache_name}:${key}`, JSON.stringify(value), ttl);
}

async function postsCacheMSet(pairs, ttl = TTL_POSTS) {
  if (!pairs || Object.keys(pairs).length === 0) return true;
  const prefixedPairs = {};
  for (const [key, value] of Object.entries(pairs)) {
    prefixedPairs[`${posts_cache_name}:${key}`] = JSON.stringify(value);
  }
  return await redisMSet(prefixedPairs, ttl);
}

async function postsCacheDel(key) {
  return await redisDel(`${posts_cache_name}:${key}`);
}

async function postsCacheClearTable() {
  return await redisClearPattern(`${posts_cache_name}:*`);
}

async function postsCacheExists(key) {
  return await redisExists(`${posts_cache_name}:${key}`);
}

// Comments Cache Functions
async function commentsCacheGet(key) {
  const data = await redisGet(`${comments_cache_name}:${key}`);
  if (!data) return null;
  
  try {
    return JSON.parse(data);
  } catch (err) {
    console.error("JSON parse error in commentsCacheGet:", err.message);
    return null;
  }
}

async function commentsCacheSet(key, value, ttl = TTL_COMMENTS) {
  return await redisSet(`${comments_cache_name}:${key}`, JSON.stringify(value), ttl);
}

async function commentsCacheMSet(pairs, ttl = TTL_COMMENTS) {
  if (!pairs || Object.keys(pairs).length === 0) return true;
  const prefixedPairs = {};
  for (const [key, value] of Object.entries(pairs)) {
    prefixedPairs[`${comments_cache_name}:${key}`] = JSON.stringify(value);
  }
  return await redisMSet(prefixedPairs, ttl);
}

async function commentsCacheDel(key) {
  return await redisDel(`${comments_cache_name}:${key}`);
}

async function commentsCacheClearTable() {
  return await redisClearPattern(`${comments_cache_name}:*`);
}

async function commentsCacheExists(key) {
  return await redisExists(`${comments_cache_name}:${key}`);
}

// Feed Cache Functions (using Redis Lists)
async function feedCacheRange(key, start, end) {
  const client = await redisClient();
  if (!client) return null;

  try {
    const ids = await client.lrange(key, start, end);
    return ids.length > 0 ? ids : null;
  } catch (err) {
    console.error("Redis LRANGE error:", err.message);
    return null;
  }
}

async function feedCachePush(key, postIds) {
  const client = await redisClient();
  if (!client) return false;

  try {
    if (Array.isArray(postIds) && postIds.length > 0) {
      await client.rpush(key, ...postIds);
      return true;
    }
    return false;
  } catch (err) {
    console.error("Redis RPUSH error:", err.message);
    return false;
  }
}

async function feedCachePushFront(key, postId) {
  const client = await redisClient();
  if (!client) return false;

  try {
    await client.lpush(key, postId);
    return true;
  } catch (err) {
    console.error("Redis LPUSH error:", err.message);
    return false;
  }
}

async function feedCacheTrim(key, start, end) {
  const client = await redisClient();
  if (!client) return false;

  try {
    await client.ltrim(key, start, end);
    return true;
  } catch (err) {
    console.error("Redis LTRIM error:", err.message);
    return false;
  }
}

async function feedCacheClear(key) {
  const client = await redisClient();
  if (!client) return false;

  try {
    await client.del(key);
    return true;
  } catch (err) {
    console.error("Redis DEL error:", err.message);
    return false;
  }
}

async function feedCacheRemove(key, postId) {
  const client = await redisClient();
  if (!client) return false;

  try {
    // LREM removes all occurrences of postId from the list
    // count=0 means remove all occurrences
    const removed = await client.lrem(key, 0, postId);
    console.log(`[FEED CACHE] Removed ${postId} from ${key}, count: ${removed}`);
    return removed > 0;
  } catch (err) {
    console.error("Redis LREM error:", err.message);
    return false;
  }
}

async function feedCacheGetTotal(key) {
  const client = await redisClient();
  if (!client) return null;

  try {
    const total = await client.get(key);
    return total ? parseInt(total, 10) : null;
  } catch (err) {
    console.error("Redis GET total error:", err.message);
    return null;
  }
}

async function feedCacheSetTotal(key, total, ttl = 300) {
  const client = await redisClient();
  if (!client) return false;

  try {
    await client.set(key, total.toString(), "EX", ttl);
    return true;
  } catch (err) {
    console.error("Redis SET total error:", err.message);
    return false;
  }
}

export default { 
  usersCacheSet, usersCacheMSet, usersCacheGet, usersCacheDel, usersCacheClearTable, usersCacheExists,
  postsCacheSet, postsCacheMSet, postsCacheGet, postsCacheDel, postsCacheClearTable, postsCacheExists,
  commentsCacheSet, commentsCacheMSet, commentsCacheGet, commentsCacheDel, commentsCacheClearTable, commentsCacheExists,
  feedCacheRange, feedCachePush, feedCachePushFront, feedCacheTrim, feedCacheClear, feedCacheRemove, feedCacheGetTotal, feedCacheSetTotal,
  redisClient, redisClearPattern, 
};

export { redisClient, redisClearPattern };