// config/prefixTree.js
// OPTIMIZED: Redis Pipeline Batching + All fixes applied

import rediscon from './rediscon.js';

class PrefixTree {
  constructor(namespace) {
    this.namespace = namespace;
    // Common English stopwords to filter out
    this.STOPWORDS = new Set([
      'the', 'is', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 
      'for', 'of', 'with', 'by', 'from', 'as', 'be', 'are', 'was', 'were',
      'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'should', 'could', 'can', 'may', 'might', 'must', 'shall', 'this',
      'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
      'my', 'your', 'his', 'her', 'its', 'our', 'their'
    ]);
    // Maximum prefix length to limit memory usage
    this.MAX_PREFIX_LENGTH = 10;
  }

  getKey(prefix) {
    return `prefixy:${this.namespace}:${prefix.toLowerCase()}`;
  }

  // Improved tokenization with stopwords filtering and unicode normalization
  tokenize(text) {
    return text
      .toLowerCase()
      .normalize('NFD') // Normalize unicode (e.g., José → Jose)
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^\w\s]/g, ' ') // Replace special chars with space
      .split(/\s+/)
      .filter(word => 
        word.length > 2 && // Min 3 characters
        !this.STOPWORDS.has(word) // Not a stopword
      );
  }

  async isEmpty() {
    try {
      const pattern = `prefixy:${this.namespace}:*`;
      const keys = await this._keys(pattern);
      return keys.length === 0;
    } catch (err) {
      console.error(`Error checking if ${this.namespace} tree is empty:`, err.message);
      return true;
    }
  }

  // OPTIMIZED: Using Redis Pipeline with prefix length limit
  async add(text, metadata = {}) {
    try {
      const completionData = JSON.stringify({
        text,
        metadata,
        score: 1,
        timestamp: Date.now()
      });

      const words = this.tokenize(text);
      const client = await rediscon.redisClient();
      if (!client) return false;
      
      const pipeline = client.pipeline();
      
      for (const word of words) {
        // Limit prefix length to reduce memory usage
        const maxLen = Math.min(word.length, this.MAX_PREFIX_LENGTH);
        
        for (let i = 1; i <= maxLen; i++) {
          const prefix = word.substring(0, i);
          const key = this.getKey(prefix);
          pipeline.zadd(key, 1, completionData);
        }
      }

      await pipeline.exec();
      return true;
    } catch (err) {
      console.error('Error adding to prefix tree:', err.message);
      return false;
    }
  }

  // OPTIMIZED: Using Redis Pipeline with better matching
  async incrementScore(text, increment = 1) {
    try {
      const words = this.tokenize(text);
      const client = await rediscon.redisClient();
      if (!client) return false;

      for (const word of words) {
        const pipeline = client.pipeline();
        const maxLen = Math.min(word.length, this.MAX_PREFIX_LENGTH);
        
        for (let i = 1; i <= maxLen; i++) {
          const prefix = word.substring(0, i);
          const key = this.getKey(prefix);
          const completions = await client.zrange(key, 0, -1);
          
          for (const comp of completions) {
            try {
              const data = JSON.parse(comp);
              // Better text matching with trim and normalization
              const normalizedText = text.trim().toLowerCase();
              const normalizedDataText = data.text.trim().toLowerCase();
              
              if (normalizedDataText === normalizedText) {
                pipeline.zincrby(key, increment, comp);
              }
            } catch (parseErr) {
              console.error('Error parsing completion data:', parseErr.message);
            }
          }
        }
        
        await pipeline.exec();
      }

      return true;
    } catch (err) {
      console.error('Error incrementing score:', err.message);
      return false;
    }
  }

  async search(prefix, limit = 10) {
    try {
      if (!prefix || prefix.length < 1) return [];

      const key = this.getKey(prefix.toLowerCase());
      const results = await this._zrevrange(key, 0, limit * 3 - 1);
      
      const seen = new Set();
      const uniqueResults = [];
      
      for (const result of results) {
        try {
          const parsed = JSON.parse(result);
          const identifier = parsed.text.trim().toLowerCase();
          
          if (!seen.has(identifier)) {
            seen.add(identifier);
            uniqueResults.push(parsed);
            
            if (uniqueResults.length >= limit) break;
          }
        } catch (parseErr) {
          console.error('Error parsing search result:', parseErr.message);
        }
      }
      
      return uniqueResults;
    } catch (err) {
      console.error('Error searching prefix tree:', err.message);
      return [];
    }
  }

  // OPTIMIZED: Using Redis Pipeline with better matching
  async remove(text) {
    try {
      const words = this.tokenize(text);
      const client = await rediscon.redisClient();
      if (!client) return false;

      const pipeline = client.pipeline();

      for (const word of words) {
        const maxLen = Math.min(word.length, this.MAX_PREFIX_LENGTH);
        
        for (let i = 1; i <= maxLen; i++) {
          const prefix = word.substring(0, i);
          const key = this.getKey(prefix);
          const completions = await client.zrange(key, 0, -1);
          
          for (const comp of completions) {
            try {
              const data = JSON.parse(comp);
              const normalizedText = text.trim().toLowerCase();
              const normalizedDataText = data.text.trim().toLowerCase();
              
              if (normalizedDataText === normalizedText) {
                pipeline.zrem(key, comp);
              }
            } catch (parseErr) {
              console.error('Error parsing completion data:', parseErr.message);
            }
          }
        }
      }

      await pipeline.exec();
      return true;
    } catch (err) {
      console.error('Error removing from prefix tree:', err.message);
      return false;
    }
  }

  async clear() {
    try {
      const pattern = `prefixy:${this.namespace}:*`;
      await rediscon.redisClearPattern(pattern);
      return true;
    } catch (err) {
      console.error('Error clearing prefix tree:', err.message);
      return false;
    }
  }

  async _zrevrange(key, start, stop) {
    const client = await rediscon.redisClient();
    if (!client) return [];
    return await client.zrevrange(key, start, stop);
  }

  async _keys(pattern) {
    const client = await rediscon.redisClient();
    if (!client) return [];
    return await client.keys(pattern);
  }

  // Get memory usage stats for this namespace
  async getStats() {
    try {
      const pattern = `prefixy:${this.namespace}:*`;
      const keys = await this._keys(pattern);
      return {
        namespace: this.namespace,
        totalKeys: keys.length,
        estimatedMemoryMB: (keys.length * 0.001).toFixed(2) // Rough estimate
      };
    } catch (err) {
      console.error('Error getting stats:', err.message);
      return null;
    }
  }
}

const postsTree = new PrefixTree('posts');
const usersTree = new PrefixTree('users');
const tagsTree = new PrefixTree('tags');

export { postsTree, usersTree, tagsTree, PrefixTree };
export default { postsTree, usersTree, tagsTree };