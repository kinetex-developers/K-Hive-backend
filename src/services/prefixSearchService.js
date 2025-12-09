// services/prefixSearchService.js
// OPTIMIZED: All fixes applied

import { postsTree, usersTree, tagsTree } from '../config/prefixTree.js';
import Post from '../models/Post.js';
import User from '../models/User.js';

class PrefixSearchService {
  
  static isIndexReady = false;
  static isRebuilding = false; // Prevent concurrent rebuilds
  static rebuildError = null;
  
  // Content length limits to prevent memory issues
  static MAX_CONTENT_LENGTH = 500; // Index only first 500 chars of content
  static MAX_TITLE_LENGTH = 200;   // Limit title length

  static initializeIndexIfNeeded() {
    (async () => {
      try {
        const isInitialized = await this.checkIfInitialized();
        
        if (isInitialized) {
          console.log('[PREFIX SEARCH] Index already exists, using existing data');
          this.isIndexReady = true;
        } else {
          console.log('[PREFIX SEARCH] Building search index in background...');
          await this.rebuildIndex();
          this.isIndexReady = true;
        }
      } catch (err) {
        console.error('[PREFIX SEARCH] Error initializing index:', err.message);
        this.rebuildError = err.message;
        this.isIndexReady = false;
      }
    })();
  }

  static async checkIfInitialized() {
    try {
      const postsEmpty = await postsTree.isEmpty();
      return !postsEmpty;
    } catch (err) {
      return false;
    }
  }

  static async indexPost(post) {
    try {
      // Limit content length to prevent memory overflow
      const title = post.title 
        ? post.title.substring(0, this.MAX_TITLE_LENGTH) 
        : '';
      
      const contentPreview = post.content 
        ? post.content.substring(0, this.MAX_CONTENT_LENGTH) 
        : '';
      
      // Combine title and limited content
      const searchableText = `${title} ${contentPreview}`.trim();
      
      if (searchableText.length === 0) {
        console.warn(`Post ${post.postId} has no searchable content`);
        return false;
      }

      await postsTree.add(searchableText, {
        type: 'post',
        postId: post.postId,
        title: post.title,
        content: post.content ? post.content.substring(0, 100) : '', // Store short preview
        userId: post.userId,
        upvotes: post.upvotes,
        createdAt: post.createdAt
      });

      // Index tags separately
      if (post.tags && post.tags.length > 0) {
        for (const tag of post.tags) {
          await tagsTree.add(tag, {
            type: 'tag',
            tag,
            postId: post.postId
          });
        }
      }

      return true;
    } catch (err) {
      console.error("Error indexing post:", err.message);
      return false;
    }
  }

  static async indexUser(user) {
    try {
      if (!user.name || user.name.trim().length === 0) {
        console.warn(`User ${user.userId} has no valid name`);
        return false;
      }

      await usersTree.add(user.name, {
        type: 'user',
        userId: user.userId,
        name: user.name,
        avatarLink: user.avatarLink,
        joinDate: user.joinDate
      });

      return true;
    } catch (err) {
      console.error("Error indexing user:", err.message);
      return false;
    }
  }

  static async updatePostIndex(oldPost, newPost) {
    try {
      // Remove old entry with old searchable text
      const oldTitle = oldPost.title 
        ? oldPost.title.substring(0, this.MAX_TITLE_LENGTH) 
        : '';
      const oldContentPreview = oldPost.content 
        ? oldPost.content.substring(0, this.MAX_CONTENT_LENGTH) 
        : '';
      const oldSearchableText = `${oldTitle} ${oldContentPreview}`.trim();
      
      await postsTree.remove(oldSearchableText);
      
      if (oldPost.tags && oldPost.tags.length > 0) {
        for (const tag of oldPost.tags) {
          await tagsTree.remove(tag);
        }
      }

      // Add new entry
      await this.indexPost(newPost);
      return true;
    } catch (err) {
      console.error("Error updating post index:", err.message);
      return false;
    }
  }

  static async updateUserIndex(oldUser, newUser) {
    try {
      await usersTree.remove(oldUser.name);

      await usersTree.add(newUser.name, {
        type: 'user',
        userId: newUser.userId,
        name: newUser.name,
        avatarLink: newUser.avatarLink,
        joinDate: newUser.joinDate
      });

      return true;
    } catch (err) {
      console.error("Error updating user index:", err.message);
      return false;
    }
  }

  static async removePostIndex(post) {
    try {
      const title = post.title 
        ? post.title.substring(0, this.MAX_TITLE_LENGTH) 
        : '';
      const contentPreview = post.content 
        ? post.content.substring(0, this.MAX_CONTENT_LENGTH) 
        : '';
      const searchableText = `${title} ${contentPreview}`.trim();
      
      await postsTree.remove(searchableText);
      
      if (post.tags && post.tags.length > 0) {
        for (const tag of post.tags) {
          await tagsTree.remove(tag);
        }
      }
      
      return true;
    } catch (err) {
      console.error("Error removing post from index:", err.message);
      return false;
    }
  }

  static async removeUserIndex(user) {
    try {
      await usersTree.remove(user.name);
      return true;
    } catch (err) {
      console.error("Error removing user from index:", err.message);
      return false;
    }
  }

  static async incrementPostScore(title) {
    try {
      await postsTree.incrementScore(title, 1);
      return true;
    } catch (err) {
      console.error("Error incrementing post score:", err.message);
      return false;
    }
  }

  static async incrementTagScore(tag) {
    try {
      await tagsTree.incrementScore(tag, 1);
      return true;
    } catch (err) {
      console.error("Error incrementing tag score:", err.message);
      return false;
    }
  }

  static async autocomplete(query, type = 'all', limit = 10) {
    try {
      if (!this.isIndexReady) {
        return {
          success: false,
          indexReady: false,
          isBuilding: this.isRebuilding,
          message: this.isRebuilding 
            ? "Search index is building, please wait..." 
            : "Search index not ready, use fallback search",
          error: this.rebuildError
        };
      }

      if (!query || query.length < 2) {
        return {
          success: true,
          indexReady: true,
          query,
          results: {
            posts: [],
            users: [],
            tags: [],
            total: 0
          },
          message: "Query too short"
        };
      }

      let posts = [];
      let users = [];
      let tags = [];

      // Search for posts (includes posts mentioning the query in title/content)
      if (type === 'all' || type === 'post') {
        const postResults = await postsTree.search(query, limit * 2); // Get more for filtering
        const uniquePosts = new Map();
        postResults.forEach(result => {
          if (!uniquePosts.has(result.metadata.postId)) {
            uniquePosts.set(result.metadata.postId, result.metadata);
          }
        });
        posts = Array.from(uniquePosts.values());
      }

      // Search for users
      if (type === 'all' || type === 'user') {
        const userResults = await usersTree.search(query, limit);
        users = userResults.map(r => r.metadata);

        // ENHANCED: If we found matching users, also find their posts
        if (users.length > 0 && (type === 'all' || type === 'post')) {
          const userIds = users.map(u => u.userId);
          
          // Get posts created by these users from database
          const userPosts = await Post.getPostsByUserIds(userIds, limit);
          
          // Merge with existing posts (avoid duplicates)
          const existingPostIds = new Set(posts.map(p => p.postId));
          userPosts.forEach(post => {
            if (!existingPostIds.has(post.postId)) {
              posts.push({
                type: 'post',
                postId: post.postId,
                title: post.title,
                content: post.content ? post.content.substring(0, 100) : '',
                userId: post.userId,
                upvotes: post.upvotes,
                createdAt: post.createdAt,
                matchedBy: 'author' // Indicate this was matched by author search
              });
              existingPostIds.add(post.postId);
            }
          });
        }
      }

      if (type === 'all' || type === 'tag') {
        const tagResults = await tagsTree.search(query, limit);
        const uniqueTags = new Set();
        tagResults.forEach(result => {
          uniqueTags.add(result.metadata.tag);
        });
        tags = Array.from(uniqueTags);
      }

      // Sort posts: prioritize exact matches and higher upvotes
      posts.sort((a, b) => {
        // Prioritize posts mentioning the query in title
        const aInTitle = a.title.toLowerCase().includes(query.toLowerCase());
        const bInTitle = b.title.toLowerCase().includes(query.toLowerCase());
        
        if (aInTitle && !bInTitle) return -1;
        if (!aInTitle && bInTitle) return 1;
        
        // Then by upvotes
        return (b.upvotes || 0) - (a.upvotes || 0);
      });

      return {
        success: true,
        indexReady: true,
        query,
        results: {
          posts: posts.slice(0, limit * 2), // Return more posts since we're combining sources
          users: users.slice(0, limit),
          tags: tags.slice(0, limit),
          total: posts.length + users.length + tags.length
        }
      };
    } catch (err) {
      console.error("Error in autocomplete:", err.message);
      return {
        success: false,
        indexReady: this.isIndexReady,
        query,
        results: { posts: [], users: [], tags: [], total: 0 },
        error: err.message
      };
    }
  }

  static async getTagSuggestions(query, limit = 10) {
    try {
      if (!this.isIndexReady) {
        return [];
      }

      if (!query || query.length < 1) {
        return [];
      }

      const tagResults = await tagsTree.search(query, limit * 2);
      
      const tagCount = {};
      tagResults.forEach(result => {
        const tag = result.metadata.tag;
        tagCount[tag] = (tagCount[tag] || 0) + 1;
      });

      return Object.entries(tagCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([tag, count]) => ({ tag, count }));
    } catch (err) {
      console.error("Error getting tag suggestions:", err.message);
      return [];
    }
  }

  // Get index statistics
  static async getIndexStats() {
    try {
      const [postsStats, usersStats, tagsStats] = await Promise.all([
        postsTree.getStats(),
        usersTree.getStats(),
        tagsTree.getStats()
      ]);

      return {
        isReady: this.isIndexReady,
        isRebuilding: this.isRebuilding,
        error: this.rebuildError,
        posts: postsStats,
        users: usersStats,
        tags: tagsStats,
        totalKeys: (postsStats?.totalKeys || 0) + (usersStats?.totalKeys || 0) + (tagsStats?.totalKeys || 0),
        estimatedMemoryMB: (
          parseFloat(postsStats?.estimatedMemoryMB || 0) +
          parseFloat(usersStats?.estimatedMemoryMB || 0) +
          parseFloat(tagsStats?.estimatedMemoryMB || 0)
        ).toFixed(2)
      };
    } catch (err) {
      console.error("Error getting index stats:", err.message);
      return null;
    }
  }

  // OPTIMIZED: Parallel Processing with rebuild lock
  static async rebuildIndex() {
    // Prevent concurrent rebuilds
    if (this.isRebuilding) {
      console.log('[PREFIX SEARCH] Rebuild already in progress, skipping...');
      return {
        success: false,
        message: 'Rebuild already in progress'
      };
    }

    this.isRebuilding = true;
    this.isIndexReady = false;
    this.rebuildError = null;

    try {
      console.log("[PREFIX SEARCH] Rebuilding index...");
      const startTime = Date.now();
      
      // Step 1: Clear all trees in parallel
      await Promise.all([
        postsTree.clear(),
        usersTree.clear(),
        tagsTree.clear()
      ]);

      // Step 2: Fetch data in parallel
      const [posts, users] = await Promise.all([
        Post.getAllPostsFromDB(1, 1000, "createdAt", -1),
        User.getAllUsers()
      ]);

      // Step 3: Index all items in parallel with error handling
      const indexResults = await Promise.allSettled([
        ...posts.posts.map(post => this.indexPost(post)),
        ...users.map(user => this.indexUser(user))
      ]);

      // Count successes and failures
      const successful = indexResults.filter(r => r.status === 'fulfilled' && r.value === true).length;
      const failed = indexResults.filter(r => r.status === 'rejected' || r.value === false).length;

      const duration = Date.now() - startTime;
      console.log(`[PREFIX SEARCH] Index rebuilt in ${duration}ms: ${posts.posts.length} posts, ${users.length} users (${successful} succeeded, ${failed} failed)`);
      
      this.isIndexReady = true;

      return {
        success: true,
        postsIndexed: posts.posts.length,
        usersIndexed: users.length,
        successful,
        failed,
        durationMs: duration,
        durationSeconds: (duration / 1000).toFixed(2)
      };
    } catch (err) {
      console.error("Error rebuilding index:", err.message);
      this.rebuildError = err.message;
      this.isIndexReady = false;
      throw err;
    } finally {
      this.isRebuilding = false;
    }
  }
}

export default PrefixSearchService;