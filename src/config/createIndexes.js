import mongocon from "./mongocon.js";

async function createSearchIndexes() {
  try {
    const postsCollection = await mongocon.postsCollection();
    
    // Create text index on title and content
    await postsCollection.createIndex(
      { 
        title: "text", 
        content: "text",
        tags: "text"
      },
      {
        weights: {
          title: 10,      // Title matches are most important
          tags: 5,        // Tags are moderately important
          content: 1      // Content is least important (but still searched)
        },
        name: "post_text_search"
      }
    );
    
    console.log("Search indexes created successfully");
  } catch (err) {
    console.error("Error creating indexes:", err);
  }
}

export default createSearchIndexes;