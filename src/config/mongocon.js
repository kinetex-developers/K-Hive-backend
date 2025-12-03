const { MongoClient } = require("mongodb");

const uri = process.env.MONGO_URI;
const db_name = process.env.DB_NAME;

const users_col_name = process.env.USERS_TABLE_NAME;
const posts_col_name = process.env.POSTS_TABLE_NAME;
const comments_col_name = process.env.COMMENTS_TABLE_NAME;

let client;
let db;

async function mongoDB() {
  if (db) return db;

  try {
    if (!client) {
      client = new MongoClient(uri);
      await client.connect();
    }

    db = client.db(db_name);
    return db;

  } catch (err) {
    console.error("Unable to connect to MongoDB:", err.message);
    return null;
  }
}

async function usersCollection() {
  const db = await mongoDB();
  if (!db) 
    return null;
  return db.collection(users_col_name);
}

async function postsCollection() {
  const db = await mongoDB();
  if (!db) 
    return null;
  return db.collection(posts_col_name);
}

async function commentsCollection() {
  const db = await mongoDB();
  if (!db) 
    return null;
  return db.collection(comments_col_name);
}

module.exports = {
  usersCollection,
  postsCollection,
  commentsCollection,
};
