# K-Hive Backend

> A production-ready RESTful API backend for the K-Hive university forum platform — built for KIIT University. Features Google OAuth, threaded discussions, AI-powered content moderation, NLP-driven search, Redis caching, and a full admin system.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Features](#features)
- [Project Structure](#project-structure)
- [Data Models](#data-models)
- [API Reference](#api-reference)
- [Content Moderation Pipeline](#content-moderation-pipeline)
- [Search System](#search-system)
- [Caching Strategy](#caching-strategy)
- [Rate Limiting](#rate-limiting)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)
- [Deployment](#deployment)
- [License](#license)

---

## Overview

K-Hive is a community forum backend designed specifically for university students. It provides a complete API for creating, discovering, and moderating content — with strong performance characteristics via multi-layer Redis caching, and safety built in through a 4-stage AI + rule-based content moderation pipeline.

The server is deployed on **Vercel** as a serverless function and is connected to **MongoDB Atlas** and a managed **Redis** instance.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (ES Modules) |
| Framework | Express.js v5 |
| Database | MongoDB (native driver) |
| Cache | Redis (ioredis) |
| Authentication | Google OAuth 2.0 + Passport.js + JWT |
| Media Storage | ImageKit |
| AI Moderation | Perplexity AI (primary), Google Gemini 2.5 Flash (fallback) |
| NLP / Search | Natural.js, FuzzySet.js, WordNet, AFINN |
| Profanity Filter | Obscenity |
| Security | Helmet, CORS, Per-user Redis rate limiting |
| Deployment | Vercel (serverless) |

---

## Architecture

```
Client
  │
  ▼
Express App (src/index.js)
  │
  ├── Middleware Stack
  │     ├── Helmet (security headers)
  │     ├── CORS (allowlist-based)
  │     ├── Body Parser (JSON + URL-encoded, 10MB limit)
  │     ├── Cookie Parser
  │     ├── Passport (JWT strategy)
  │     └── Morgan (dev logging)
  │
  ├── Routes
  │     ├── /api/auth        → Google OAuth, JWT lifecycle
  │     ├── /api/post        → Post CRUD + voting + reporting
  │     ├── /api/comment     → Threaded comments + replies
  │     ├── /api/search      → Full-text + prefix autocomplete
  │     ├── /api/users       → Public user profiles
  │     ├── /api/media       → ImageKit signed upload credentials
  │     ├── /api/feedback    → User feedback submission
  │     └── /api/admin       → Admin-only management panel
  │
  ├── Data Layer
  │     ├── MongoDB (primary store)
  │     └── Redis  (cache + feed lists + rate limit counters)
  │
  └── Services
        ├── PrefixSearchService  (trie-based autocomplete index)
        ├── SentimentAnalysisService (NLP query expansion)
        └── Content Moderation (profanity → AI → URL → image)
```

---

## Features

### Authentication
- Google OAuth 2.0 sign-in (Passport.js strategy)
- Stateless JWT stored in HTTP-only cookies
- Token refresh endpoint
- Rate-limited login attempts (per Gmail ID)
- Banned user detection on every authenticated request

### Posts
- Create, read, update, delete posts
- Rich content with title, body, tags (up to 5), and media attachments
- Upvote / downvote with toggle semantics (switch sides without double-voting)
- View count tracking
- Pin and lock controls (admin only)
- Report system for community flagging
- Paginated feed sorted by `createdAt` (newest), `upvotes` (popular), or custom order
- Separate pinned post feed

### Comments & Replies
- Threaded comments with one level of nested replies
- Soft delete (content replaced with `[deleted]`, structure preserved)
- Hard delete (permanent removal)
- Edit tracking (`isEdited` flag)
- Paginated comment and reply listings
- Report system mirrored on comments

### Search
- **Full-text search** via MongoDB `$text` index (relevance, recent, popular sort modes)
- **Prefix / autocomplete search** via an in-memory trie index (posts, users, tags)
- **Enhanced NLP search** — expands the query using spell correction, manual synonym dictionaries, and WordNet before running a regex search across posts and comments
- **Tag suggestions** ranked by frequency
- Admin endpoint to rebuild or inspect the search index

### Content Moderation (4-layer pipeline)
See [Content Moderation Pipeline](#content-moderation-pipeline) below.

### Media
- Backend generates short-lived ImageKit authentication tokens
- Client uploads directly to ImageKit CDN (no file data touches this server)
- On post/comment delete, associated media files are purged from ImageKit

### Admin Panel
- Toggle pin / lock on any post
- Delete any post regardless of ownership
- Toggle ban on any non-admin user (role suffix `-ban`)
- Dashboard statistics
- Feedback inbox with time-range filtering
- Search index status, rebuild trigger, and score increment

### Feedback
- Authenticated users can submit feedback (rate-limited to 1/hour)
- Goes through the same moderation pipeline as posts

---

## Project Structure

```
K-Hive-backend/
├── api/
│   └── index.js                  # Vercel serverless entry point
├── src/
│   ├── index.js                  # App bootstrap, middleware, route wiring
│   ├── config/
│   │   ├── mongocon.js           # MongoDB connection + collection accessors
│   │   ├── rediscon.js           # Redis client + typed cache helpers
│   │   ├── passport.js           # Google OAuth + JWT Passport strategies
│   │   ├── imagekitcon.js        # ImageKit SDK configuration
│   │   ├── prefixTree.js         # Trie tree instances (posts, users, tags)
│   │   ├── createIndexes.js      # MongoDB index creation on startup
│   │   ├── redisRateLimitHandler.js # Per-action rate limit logic
│   │   ├── rlconfig.js           # Rate limit thresholds (constants)
│   │   └── ttlconfig.js          # Redis TTL values (constants)
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── postController.js
│   │   ├── commentController.js
│   │   ├── searchController.js
│   │   ├── userController.js
│   │   ├── mediaController.js
│   │   ├── feedbackController.js
│   │   └── adminController.js
│   ├── middleware/
│   │   ├── authMiddleware.js     # isAuthenticated, attachUser, isNotAuthenticated
│   │   ├── adminMiddleware.js    # isAdmin role check
│   │   ├── moderation.js         # 4-layer content moderation pipeline
│   │   ├── rateLimitMiddleware.js# Per-route rate limit wrappers
│   │   └── errorHandler.js       # Global error handler
│   ├── models/
│   │   ├── User.js
│   │   ├── Post.js
│   │   ├── Comment.js
│   │   ├── Vote.js
│   │   ├── Report.js
│   │   └── Feedback.js
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── postRoutes.js
│   │   ├── commentRoutes.js
│   │   ├── searchRoutes.js
│   │   ├── userRoutes.js
│   │   ├── mediaRoutes.js
│   │   ├── feedbackRoutes.js
│   │   └── adminRoutes.js
│   ├── services/
│   │   ├── prefixSearchService.js  # Trie index management + autocomplete
│   │   └── urlModerationService.js # Explicit URL detection
│   └── utils/
│       ├── ImageModeration.js    # AI image safety check
│       ├── jwtUtils.js           # JWT sign / verify helpers
│       ├── sentimentAnalyzer.js  # NLP sentiment + query expansion
│       └── username.js           # Username generation utilities
├── vercel.json                   # Vercel rewrite rules
├── package.json
├── .gitignore
└── LICENSE.md
```

---

## Data Models

### User
| Field | Type | Description |
|---|---|---|
| `userId` | String | Primary key (ObjectId string) |
| `name` | String | Display name |
| `gmailId` | String | Google account email (unique) |
| `joinDate` | Date | Account creation timestamp |
| `avatarLink` | String \| null | Profile image URL |
| `postIds` | String[] | IDs of posts created by this user |
| `commentIds` | String[] | IDs of comments created by this user |
| `role` | String | `user`, `admin`, `user-ban`, etc. |

### Post
| Field | Type | Description |
|---|---|---|
| `postId` | String | Primary key |
| `userId` | String | Author reference |
| `title` | String | Post title |
| `content` | String | Post body |
| `tags` | String[] | Up to 5 tags (2–20 chars each) |
| `upvotes` | Number | Upvote count |
| `downvotes` | Number | Downvote count |
| `commentIds` | String[] | Comment references |
| `createdAt` / `updatedAt` | Date | Timestamps |
| `isPinned` | Boolean | Admin-pinned flag |
| `isLocked` | Boolean | Admin-locked flag (disables new comments) |
| `viewCount` | Number | Total view count |
| `media` | String[] | ImageKit media URLs |

### Comment
| Field | Type | Description |
|---|---|---|
| `commentId` | String | Primary key |
| `postId` | String | Parent post reference |
| `userId` | String | Author reference |
| `content` | String | Comment body |
| `parentCommentId` | String \| null | Non-null for nested replies |
| `upvotes` / `downvotes` | Number | Vote counts |
| `createdAt` / `updatedAt` | Date | Timestamps |
| `isEdited` | Boolean | Edited flag |
| `isDeleted` | Boolean | Soft-delete flag |

### Vote
| Field | Type | Description |
|---|---|---|
| `voteId` | String | Composite key: `postId_userId` |
| `postId` | String | Post reference |
| `userId` | String | Voter reference |
| `vote` | Number | `1` (upvote), `-1` (downvote), `0` (neutral) |

---

## API Reference

### Health

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/health` | None | Server health check |

---

### Auth — `/api/auth`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/google` | None | Initiate Google OAuth flow |
| GET | `/google/callback` | None | OAuth redirect handler |
| GET | `/user` | Required | Get current authenticated user |
| PUT | `/user` | Required | Update profile (name, avatar) |
| DELETE | `/user` | Required | Delete account |
| GET | `/check` | None | Check if a valid session exists |
| POST | `/refresh` | None | Refresh JWT access token |
| POST | `/logout` | Required | Invalidate session |

---

### Posts — `/api/post`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/` | Optional | List posts (paginated, sortable) |
| GET | `/pinned` | Optional | List pinned posts |
| GET | `/user/:userId` | Optional | Get posts by a specific user |
| GET | `/:postId` | Optional | Get a single post |
| POST | `/` | Required | Create a post (moderated) |
| PUT | `/:postId` | Required | Edit a post (moderated, owner only) |
| DELETE | `/:postId` | Required | Delete a post (owner only) |
| PATCH | `/upvote/:postId` | Required | Toggle upvote |
| PATCH | `/downvote/:postId` | Required | Toggle downvote |
| POST | `/:postId/report` | Required | Report a post |

**Query params for `GET /`:**
- `page` (default: 1), `limit` (default: 10)
- `sortBy`: `createdAt` (default) or `upvotes`
- `order`: `asc` or `desc` (default: desc)

---

### Comments — `/api/comment`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/post/:postId` | Optional | Get top-level comments for a post |
| GET | `/post/:postId/count` | Optional | Get comment count |
| GET | `/user/:userId` | Optional | Get comments by a user |
| GET | `/:commentId` | Optional | Get a single comment |
| GET | `/:commentId/replies` | Optional | Get replies to a comment |
| GET | `/:commentId/replycount` | Optional | Get reply count |
| POST | `/` | Required | Create a comment or reply (moderated) |
| PUT | `/:commentId` | Required | Edit a comment (moderated) |
| DELETE | `/:commentId` | Required | Hard delete a comment |
| GET | `/:commentId/report` | Required | Report a comment |

**Request body for `POST /`:**
```json
{
  "postId": "<postId>",
  "content": "Comment text",
  "parentCommentId": "<commentId or null>"
}
```

---

### Search — `/api/search`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/` | Optional | Full-text post search |
| GET | `/autocomplete` | Optional | Prefix autocomplete (posts, users, tags) |
| GET | `/tags` | Optional | Tag suggestions |

**Query params for `GET /`:**
- `q` — search query string
- `page`, `limit`
- `sortby`: `relevance` (default), `recent`, `popular`
- `mode`: `text` (MongoDB full-text), `enhanced` (NLP-expanded regex)

**Query params for `GET /autocomplete`:**
- `q` — query string (min 2 chars)
- `type`: `all` (default), `post`, `user`, `tag`
- `limit` (default: 10)

---

### Users — `/api/users`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/:userId` | None | Get public user profile |

---

### Media — `/api/media`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/uploadlink` | Required | Get ImageKit signed upload token |

---

### Feedback — `/api/feedback`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/` | Required | Submit feedback (moderated, 1/hour limit) |

---

### Admin — `/api/admin` *(all routes require admin role)*

| Method | Endpoint | Description |
|---|---|---|
| PATCH | `/posts/:postId/pin` | Toggle pin on a post |
| PATCH | `/posts/:postId/lock` | Toggle lock on a post |
| DELETE | `/posts/:postId` | Force-delete any post |
| PUT | `/users/:userId/toggleban` | Ban or unban a user |
| GET | `/dashboard/stats` | Dashboard statistics |
| GET | `/search-index/status` | Prefix tree index status |
| POST | `/search-index/rebuild` | Rebuild prefix tree index |
| POST | `/search-index/increment` | Increment score for a term |
| GET | `/feedback/get-all` | List all feedback |
| GET | `/feedback/time-range` | Filter feedback by date range |
| GET | `/feedback/user/:userId` | Feedback from a specific user |
| GET | `/feedback/:feedbackId` | Single feedback item |
| DELETE | `/feedback/:feedbackId` | Delete a feedback item |

---

## Content Moderation Pipeline

Every `POST` / `PUT` for posts, comments, and feedback passes through a 4-stage middleware pipeline before reaching the controller:

```
Request
  │
  ▼
Stage 1: Tag Validation
  └─ Max 5 tags, each 2–20 chars
  └─ Profanity check on each tag (Obscenity)
  │
  ▼
Stage 2: Profanity Filter
  └─ Obscenity RegExpMatcher on combined title + content
  │
  ▼
Stage 3: AI Text Moderation  (if USE_AI_MODERATION=true)
  └─ Primary:  Perplexity AI (sonar model)
  └─ Fallback: Google Gemini 2.5 Flash
  └─ Categories: Sexual, Hate, Harassment, Dangerous, Toxic, Violent, Profanity
  │
  ▼
Stage 4a: URL Moderation
  └─ Checks all links in the content against explicit URL blocklist/AI
  │
  ▼
Stage 4b: Image Moderation
  └─ Each ImageKit URL is checked via AI safety classifier
  │
  ▼
Controller
```

If any stage fails, the uploaded media is cleaned up from ImageKit before returning the rejection response.

---

## Search System

K-Hive implements three search modes:

### 1. MongoDB Full-Text Search
Uses a `$text` index on post `title`, `content`, and `tags`. Supports relevance scoring via `$meta: "textScore"`. Sort modes: `relevance`, `recent`, `popular`.

### 2. Prefix Tree Autocomplete
An in-memory trie (prefix tree) is built at startup from all posts and users. It supports:
- Post autocomplete by title/content prefix
- User autocomplete by name prefix
- Tag autocomplete
- Score-based ranking (scores can be incremented via admin endpoint)

The index auto-rebuilds on startup if empty, and updates incrementally on every create/update/delete operation.

### 3. Enhanced NLP Search
Expands the user query through a pipeline before executing a regex search:
1. **Spell correction** — FuzzySet matching + Levenshtein distance
2. **Manual synonyms** — curated dictionary for common university terms (hostel → dormitory, class → classroom, etc.)
3. **WordNet synonyms** — live lookup with 3 s timeout fallback
4. **Porter stemming** — reduces words to their root form

Results from both posts and comments are scored using title-weight × 10 + content-weight × 3 + tag-weight × 5 + upvote bonus, then sorted by relevance.

---

## Caching Strategy

Redis is used as a multi-tier cache with the following TTLs:

| Cache Type | TTL | Description |
|---|---|---|
| Users | 300 s (5 min) | Individual user documents |
| Posts | 1800 s (30 min) | Individual post documents |
| Comments | 1800 s (30 min) | Individual comment documents |
| Feed | No TTL (list keys) | Ordered Redis lists of post IDs per sort mode |
| Vote | TTL_POSTS | Per-user vote state for each post |
| Feed total count | 300 s | Cached `countDocuments` result |

**Feed cache** uses Redis `LPUSH` / `RPUSH` / `LRANGE` / `LREM` / `LTRIM` to maintain sorted lists of post IDs for each feed variant (`createdAt:desc`, `upvotes:desc`, `pinned:desc`). On a cache miss, the list is rebuilt from MongoDB and individual posts are bulk-cached with `MSET`.

**Cache invalidation** is surgical — only the affected document is deleted (`DEL`) on update, and feed lists are updated in-place rather than flushed entirely.

---

## Rate Limiting

Rate limits are enforced per `userId` (or `gmailId` for login) using Redis counters with sliding windows.

| Action | Limit |
|---|---|
| Login | 5 / hour |
| Profile update | 5 / hour |
| Post create | 10 / hour |
| Post update | 10 / hour |
| Comment create | 20 / hour |
| Comment update | 20 / hour |
| Media upload | 10 / hour |
| Voting | 10 / minute |
| Feedback submit | 1 / hour |
| Report | 3 / hour |

All rate limit middleware **fails open** — if Redis is unreachable, the request is allowed through to avoid service disruption.

Responses on limit breach:
```json
HTTP 429 Too Many Requests
Retry-After: <seconds>

{
  "success": false,
  "message": "Too many posts created. Please try again later.",
  "retryAfter": 3541
}
```

---

## Environment Variables

Create a `.env` file in the project root:

```env
# Server
PORT=5000
NODE_ENV=development          # or production
FRONTEND_URL=http://localhost:3000

# MongoDB
MONGO_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/
DB_NAME=khive

# Collection names
USERS_TABLE_NAME=users
POSTS_TABLE_NAME=posts
COMMENTS_TABLE_NAME=comments
FEEDBACKS_TABLE_NAME=feedbacks
POSTVOTE_TABLE_NAME=postvotes
REPORT_TABLE_NAME=reports

# Redis
REDIS_URL=redis://:<password>@<host>:<port>

# JWT
JWT_SECRET=your_jwt_secret_here
JWT_REFRESH_SECRET=your_refresh_secret_here

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback

# ImageKit
IMAGEKIT_PUBLIC_KEY=your_public_key
IMAGEKIT_PRIVATE_KEY=your_private_key
IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/your_id

# AI Moderation
USE_AI_MODERATION=true
GEMINI_API_KEY=your_gemini_api_key
PERPLEXITY_API_KEY=your_perplexity_api_key
```

---

## Getting Started

### Prerequisites
- Node.js >= 18
- A running MongoDB instance (Atlas recommended)
- A running Redis instance
- Google Cloud project with OAuth 2.0 credentials
- ImageKit account

### Installation

```bash
git clone https://github.com/your-org/K-Hive-backend.git
cd K-Hive-backend
npm install
```

### Running Locally

```bash
# Development (with nodemon auto-reload)
npm run dev

# Production
npm start
```

The server starts on `http://localhost:5000` by default.

### Health Check

```bash
curl http://localhost:5000/health
# {"status":"OK","message":"KIIT Forum API is running"}
```

---

## Deployment

The project is pre-configured for **Vercel** serverless deployment.

`vercel.json` rewrites all incoming requests to `/api`, which re-exports the Express app:

```json
{
  "version": 2,
  "rewrites": [
    { "source": "/(.*)", "destination": "/api" }
  ]
}
```

Deploy with:

```bash
vercel --prod
```

> **Note:** In production, `console.log` is suppressed automatically. Only `console.error` calls remain active.

---

## License

This project is licensed under the **Kinetex Labs Personal Use Source License (KL-PUSL) v1.0**.

- You may view, study, and modify the source code for personal use only.
- Commercial use, distribution, deployment in production environments, and use as part of any service or platform are **prohibited without prior written permission** from Kinetex Labs.

For permission requests, contact: **kinetex.society@gmail.com**

Copyright © 2025 Kinetex Labs and the original authors. All rights reserved.
