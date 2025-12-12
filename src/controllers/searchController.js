// controllers/searchController.js
import PrefixSearchService from '../services/prefixSearchService.js';

// Autocomplete search
export const autocomplete = async (req, res) => {
  try {
    const { q, type = 'all', limit = 10 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Query must be at least 2 characters"
      });
    }

    const validTypes = ['all', 'post', 'user', 'tag'];
    const searchType = validTypes.includes(type) ? type : 'all';

    const results = await PrefixSearchService.autocomplete(
      q.trim(), 
      searchType, 
      parseInt(limit)
    );
    
    res.status(200).json(results);
  } catch (err) {
    console.error("Error in autocomplete:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to get autocomplete suggestions",
      error: err.message
    });
  }
};

// Get tag suggestions
export const getTagSuggestions = async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || q.trim().length < 1) {
      return res.status(400).json({
        success: false,
        message: "Query is required"
      });
    }

    const tags = await PrefixSearchService.getTagSuggestions(
      q.trim(), 
      parseInt(limit)
    );

    res.status(200).json({
      success: true,
      query: q.trim(),
      tags
    });
  } catch (err) {
    console.error("Error in getTagSuggestions:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to get tag suggestions",
      error: err.message
    });
  }
};

// Increment score (called when user selects a suggestion)
export const incrementScore = async (req, res) => {
  try {
    const { text, type } = req.body;

    if (!text || !type) {
      return res.status(400).json({
        success: false,
        message: "Text and type are required"
      });
    }

    let success = false;
    if (type === 'post') {
      success = await PrefixSearchService.incrementPostScore(text);
    } else if (type === 'tag') {
      success = await PrefixSearchService.incrementTagScore(text);
    }

    res.status(200).json({
      success,
      message: success ? "Score incremented successfully" : "Failed to increment score"
    });
  } catch (err) {
    console.error("Error in incrementScore:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to increment score",
      error: err.message
    });
  }
};

// Check index status with memory stats
export const getIndexStatus = async (req, res) => {
  try {
    const stats = await PrefixSearchService.getIndexStats();
    res.status(200).json({
      success: true,
      stats
    });
  } catch (err) {
    console.error("Error in getIndexStatus:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to get index status",
      error: err.message
    });
  }
};

// Rebuild search index (admin only)
export const rebuildIndex = async (req, res) => {
  try {
    console.log("[REBUILD] Starting index rebuild...");
    const startTime = Date.now();
    
    const result = await PrefixSearchService.rebuildIndex();
    
    const duration = Date.now() - startTime;
    
    res.status(200).json({
      success: true,
      message: "Search index rebuilt successfully",
      data: {
        ...result,
        durationMs: duration,
        durationSeconds: (duration / 1000).toFixed(2)
      }
    });
  } catch (err) {
    console.error("Error in rebuildIndex:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to rebuild search index",
      error: err.message
    });
  }
};