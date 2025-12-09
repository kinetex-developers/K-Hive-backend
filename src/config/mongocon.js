// mongocon.js
import { MongoClient } from "mongodb";

const uri = process.env.MONGO_URI;
const dbName = process.env.DB_NAME;

let client;
let db;

async function connectDB() {
  try {
    // If DB already initialized → reuse it
    if (db) return db;

    // If no client, create one
    if (!client) {
      client = new MongoClient(uri, {
        maxPoolSize: 10,
        connectTimeoutMS: 20000,
      });

      await client.connect();
      console.log("MongoDB connected");
    }

    db = client.db(dbName);
    return db;

  } catch (err) {
    console.error("MongoDB connection error:", err);
    throw err;
  }
}

async function usersCollection() {
  const database = await connectDB();
  return database.collection(process.env.USERS_TABLE_NAME);
}

async function postsCollection() {
  const database = await connectDB();
  return database.collection(process.env.POSTS_TABLE_NAME);
}

async function commentsCollection() {
  const database = await connectDB();
  return database.collection(process.env.COMMENTS_TABLE_NAME);
}

async function postvoteCollection() {
  const database = await connectDB();
  return database.collection(process.env.POSTVOTE_TABLE_NAME);
}

export default { connectDB, usersCollection, postsCollection, commentsCollection, postvoteCollection };
