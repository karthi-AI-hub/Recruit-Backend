# Recurite Backend — Complete API Documentation

> **Stack:** Node.js · Express.js · PostgreSQL · Prisma ORM · Socket.io · Redis  
> **Auth:** Email/Password + JWT (15min access + 7d refresh) · Guest browsing for public endpoints  
> **Base URL:** `http://localhost:3000`

---

## Table of Contents

- [Local Setup (macOS)](#prerequisites--local-setup-macos)
- [Available Scripts](#available-scripts)
- [Environment Variables](#environment-variables-env)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [Authentication](#1-authentication--apiauth)
- [Jobs](#2-jobs--apijobs)
- [Applications](#3-applications--apiapplications)
- [Profile](#4-profile--apiprofile)
- [Messages](#5-messages--apimessages)
- [Notifications](#6-notifications--apinotifications)
- [Message Templates](#7-message-templates--apitemplates)
- [Saved Jobs](#8-saved-jobs--apisaved-jobs)
- [Skills](#9-skills--apiskills)
- [Feedback](#10-feedback--apifeedback)
- [Chat](#11-chat--apichat)
- [Subscription](#12-subscription--apisubscription)
- [Recruiter Dashboard](#13-recruiter-dashboard--apirecruiter)
- [Real-Time Chat (Socket.io)](#14-real-time-chat-socketio)
- [Guest Browsing Flow](#guest-browsing-flow)
- [Error Handling](#error-response-format)
- [Pagination](#pagination-response-format)
- [File Upload](#file-upload)
- [Seed Data & Test Accounts](#seed-data--test-accounts)
- [Production Considerations](#production-considerations)
- [Testing](#testing)
- [Deployment Guide](#deployment-guide-mvp)

---

## Total API Endpoints: 77 REST + 10+ WebSocket

## Prerequisites — Local Setup (macOS)

### Step 1: Install Homebrew (if not installed)

```bash
# Check if Homebrew is installed
brew --version
# If not installed:
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### Step 2: Install & Setup PostgreSQL

```bash
# Install PostgreSQL
brew install postgresql@16

# Start PostgreSQL service (auto-starts on boot)
brew services start postgresql@16

# Verify it's running
brew services list
# → postgresql@16  started

# Connect to PostgreSQL
psql postgres

# Inside the psql shell, create the database:
CREATE DATABASE recurite_db;

# Verify it was created
\l

# Exit psql
\q
```

> **Note:** On macOS, PostgreSQL uses your system username with no password.
> `DATABASE_URL` in `.env` is `postgresql://gowtham:@localhost:5432/recurite_db` — replace `gowtham` with your username.

### Step 3: Install & Setup Redis

```bash
# Install Redis
brew install redis

# Start Redis service (auto-starts on boot)
brew services start redis

# Verify it's running
brew services list
# → redis  started

# Test Redis connection
redis-cli ping
# → PONG
```

> Redis is **optional** — the app works without it (no caching). Server logs a warning but continues.

### Step 4: Install Dependencies & Start

```bash
cd recruit-backend
npm install
npx prisma generate
npx prisma migrate dev --name init
npx prisma db seed
npm run dev
```

---

## Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `npm run dev` | `nodemon src/index.js` | Dev server with auto-restart |
| `npm start` | `node src/index.js` | Production start |
| `npm run db:migrate` | `npx prisma migrate dev` | Run migrations |
| `npm run db:seed` | `npx prisma db seed` | Seed sample data |
| `npm run db:studio` | `npx prisma studio` | Visual DB browser (port 5555) |
| `npm run db:reset` | `npx prisma migrate reset --force` | Drop & recreate DB |
| `npm run db:generate` | `npx prisma generate` | Regenerate Prisma client |
| `npm run migrate:deploy` | `npx prisma migrate deploy` | Deploy migrations (production) |
| `npm run migrate:status` | `npx prisma migrate status` | Check migration status |
| `npm test` | `jest --forceExit --detectOpenHandles` | Run test suite (19 tests) |
| `npm run test:watch` | `jest --watch ...` | Run tests in watch mode |
| `npm run expire-jobs` | `node scripts/expire-jobs.js` | Close expired jobs (cron) |

---

## Environment Variables (`.env`)

```env
# Core
DATABASE_URL="postgresql://gowtham:@localhost:5432/recurite_db"
REDIS_URL="redis://localhost:6379"
PORT=3000
NODE_ENV="development"

# JWT
JWT_SECRET="your-secret-key"
JWT_REFRESH_SECRET="your-refresh-secret"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# File Uploads
UPLOAD_DIR="./uploads"

# CORS (comma-separated origins)
CORS_ORIGINS="http://localhost:3000"

# Rate Limiting
RATE_LIMIT_GLOBAL_MAX=300      # requests per window (default: 300)
RATE_LIMIT_AUTH_MAX=10         # auth requests per window (default: 10)
RATE_LIMIT_WINDOW_MS=900000   # window in ms (default: 15min)

# SMTP (for email verification & password reset)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
SMTP_FROM="noreply@recruit.app"
```

---

## Project Structure

```
recruit-backend/
├── prisma/
│   ├── schema.prisma             # 10 models + 5 enums
│   ├── seed.js                   # Sample data seeder
│   └── migrations/               # Prisma migrations
├── scripts/
│   └── expire-jobs.js            # Cron: closes expired jobs
├── __tests__/
│   ├── setup.js                  # Test harness (mocked Prisma, Redis, etc.)
│   └── auth.test.js              # 19 auth endpoint tests (Jest + Supertest)
├── src/
│   ├── index.js                  # Express + Socket.io + async startup
│   ├── config/
│   │   ├── database.js           # Prisma client + connectDB()
│   │   ├── redis.js              # Redis client + connectRedis()
│   │   ├── env.js                # Centralized env config
│   │   └── logger.js             # Winston logger (file + console)
│   ├── middleware/
│   │   ├── auth.js               # JWT required → 401 if missing
│   │   ├── optionalAuth.js       # JWT optional → guest mode (req.user = null)
│   │   ├── roleGuard.js          # Role-based access (recruiter only, etc.)
│   │   ├── validate.js           # Joi validation wrapper
│   │   ├── upload.js             # Multer file upload config
│   │   ├── cache.middleware.js   # Redis cache middleware
│   │   └── errorHandler.js       # Global error handler
│   ├── controllers/
│   │   ├── auth.controller.js    # Register, Login, Refresh, Me, Logout, Password, Email Verify
│   │   ├── job.controller.js     # CRUD jobs + search + Redis caching
│   │   ├── application.controller.js  # Apply, status updates, withdraw
│   │   ├── profile.controller.js # Profile CRUD + file uploads
│   │   ├── message.controller.js # Send, bulk send, inbox, read
│   │   ├── notification.controller.js # List, mark read, delete
│   │   ├── template.controller.js     # CRUD message templates
│   │   ├── savedJob.controller.js     # Save/unsave/list bookmarks
│   │   ├── skill.controller.js        # Skill search/popular
│   │   ├── feedback.controller.js     # User feedback
│   │   ├── chat.controller.js         # Start/list/send chat
│   │   ├── subscription.controller.js # Plans, trial, status
│   │   └── recruiter.controller.js    # Dashboard, analytics, candidates, company, team
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── jobs.routes.js
│   │   ├── applications.routes.js
│   │   ├── profile.routes.js
│   │   ├── messages.routes.js
│   │   ├── notifications.routes.js
│   │   ├── templates.routes.js
│   │   ├── savedJobs.routes.js
│   │   ├── skills.routes.js
│   │   ├── feedback.routes.js
│   │   ├── chat.routes.js
│   │   ├── subscription.routes.js
│   │   └── recruiter.routes.js
│   ├── validators/
│   │   ├── auth.validator.js     # Register, login, refresh, password schemas
│   │   ├── job.validator.js      # Create/update job + filter schemas
│   │   └── general.validator.js  # Application, profile, template, message schemas
│   ├── socket/
│   │   └── chat.socket.js        # Real-time chat with JWT auth
│   └── utils/
│       ├── ApiError.js           # Custom error class (400/401/403/404/409)
│       ├── asyncHandler.js       # Async route wrapper (catches errors)
│       ├── pagination.js         # paginate() + paginationMeta() helpers
│       └── emailService.js       # Nodemailer SMTP service
├── uploads/                      # Local file storage
├── jest.config.js                # Jest test configuration
├── .env
└── package.json
```

---

## Database Schema

10 PostgreSQL tables managed by Prisma ORM:

```
┌───────────────────┐     ┌───────────────────┐
│      users        │────▶│    companies       │
│ (seekers/recruit) │     │ (employer profiles)│
└───────┬───────────┘     └────────┬──────────┘
        │                          │
        ▼                          ▼
┌───────────────────┐     ┌───────────────────┐
│      jobs         │◀────│    saved_jobs      │
│ (job postings)    │     │ (bookmarks)        │
└───────┬───────────┘     └───────────────────┘
        │
        ▼
┌───────────────────┐     ┌───────────────────┐
│  applications     │     │   notifications    │
│ (job applications)│     │ (in-app alerts)    │
└───────────────────┘     └───────────────────┘

┌───────────────────┐     ┌───────────────────┐
│    messages       │     │ message_templates  │
│ (recruiter→seeker)│     │ (reusable emails)  │
└───────────────────┘     └───────────────────┘

┌───────────────────┐     ┌───────────────────┐
│  conversations    │────▶│  chat_messages     │
│ (chat threads)    │     │ (real-time msgs)   │
└───────────────────┘     └───────────────────┘
```

### Enums

| Enum | Values |
|------|--------|
| `UserRole` | `job_seeker`, `recruiter`, `admin` |
| `JobStatus` | `active`, `closed`, `draft` |
| `JobType` | `full_time`, `part_time`, `contract`, `internship`, `freelance` |
| `ApplicationStatus` | `applied`, `in_review`, `shortlisted`, `interviewed`, `offered`, `rejected`, `withdrawn`, `hired` |
| `NotificationType` | `application`, `interview`, `message`, `info`, `system` |

---

## API Endpoints — Detailed Reference (77 total REST + 10+ WebSocket)

> **Headers for authenticated requests:**
> ```
> Authorization: Bearer <accessToken>
> Content-Type: application/json
> ```

---

### 1. Authentication — `/api/auth`

**Route file:** `src/routes/auth.routes.js`  
**Controller:** `src/controllers/auth.controller.js`  
**Validator:** `src/validators/auth.validator.js`

---

#### `POST /api/auth/register` — Create Account

**Auth:** Public  
**Middleware:** `validate(authValidator.register)`

**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `name` | string | ✅ | 2–100 chars, trimmed |
| `email` | string | ✅ | Valid email, lowercase |
| `password` | string | ✅ | 6–128 chars |
| `phone` | string | ✅ | Non-empty phone number |
| `role` | string | ✅ | `job_seeker` or `recruiter` |

```json
{
  "name": "Raj Kumar",
  "email": "raj@email.com",
  "password": "password123",
  "phone": "+91 98765 43212",
  "role": "job_seeker"
}
```

**Success Response (201):**

```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "user": {
      "id": "uuid",
      "name": "Raj Kumar",
      "email": "raj@email.com",
      "role": "job_seeker",
      "phone": "+91 98765 43212",
      "createdAt": "2026-02-13T06:20:44.939Z"
    },
    "accessToken": "eyJhbG...",
    "refreshToken": "eyJhbG..."
  }
}
```

**Error Responses:**  
- `400` — Validation failed (missing/invalid fields)  
- `409` — Email already registered

---

#### `POST /api/auth/login` — Login

**Auth:** Public  
**Middleware:** `validate(authValidator.login)`

**Request Body:**

| Field | Type | Required |
|-------|------|----------|
| `email` | string | ✅ |
| `password` | string | ✅ |

```json
{
  "email": "priya@techcorp.in",
  "password": "password123"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "uuid",
      "name": "Priya Sharma",
      "email": "priya@techcorp.in",
      "role": "recruiter",
      "phone": "+91 98765 43210",
      "profileImage": null,
      "headline": "Senior Recruiter at TechCorp India",
      "location": "Bangalore, India",
      "experience": 0,
      "skills": [],
      "company": {
        "id": "uuid",
        "name": "TechCorp India",
        "logo": null
      },
      "createdAt": "2026-02-13T06:20:44.939Z"
    },
    "accessToken": "eyJhbG... (expires in 15min)",
    "refreshToken": "eyJhbG... (expires in 7 days)"
  }
}
```

**Error:** `401` — Invalid email or password

---

#### `POST /api/auth/refresh-token` — Renew Access Token

**Auth:** Public  
**Middleware:** `validate(authValidator.refreshToken)`

**Request Body:**

```json
{
  "refreshToken": "eyJhbG..."
}
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbG... (new, 15min)",
    "refreshToken": "eyJhbG... (new, 7 days)"
  }
}
```

**Error:** `401` — Invalid or expired refresh token

---

#### `GET /api/auth/me` — Get Current User

**Auth:** Required (Bearer token)  
**Middleware:** `auth`

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Priya Sharma",
    "email": "priya@techcorp.in",
    "role": "recruiter",
    "phone": "+91 98765 43210",
    "profileImage": null,
    "headline": "Senior Recruiter at TechCorp India",
    "location": "Bangalore, India",
    "experience": 0,
    "skills": [],
    "resumeUrl": null,
    "currentCompany": null,
    "currentDesignation": null,
    "expectedSalary": null,
    "isAvailable": true,
    "noticePeriod": null,
    "currentCtc": null,
    "company": {
      "id": "uuid",
      "name": "TechCorp India",
      "logo": null,
      "industry": "Technology",
      "location": "Bangalore, India"
    },
    "createdAt": "2026-02-13T06:20:44.939Z"
  }
}
```

---

#### `POST /api/auth/logout` — Logout

**Auth:** Required  
**Middleware:** `auth`

**Success Response (200):**

```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

#### `POST /api/auth/forgot-password` — Request Password Reset

**Auth:** Public  
**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `email` | string | ✅ | Valid email, must be registered |

```json
{
  "email": "raj@email.com"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Password reset link sent to your email"
}
```

**Note:** Returns 200 even if email not found (security best practice)

---

#### `POST /api/auth/reset-password` — Reset Password with OTP

**Auth:** Public  
**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `email` | string | ✅ | Valid email |
| `otp` | string | ✅ | 6-digit code received via email |
| `newPassword` | string | ✅ | Min 6 chars |

```json
{
  "email": "raj@email.com",
  "otp": "482901",
  "newPassword": "myNewSecurePassword"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Password reset successful"
}
```

**Errors:**
- `400` — Invalid or expired OTP
- `400` — Missing required fields

---

#### `POST /api/auth/verify-email` — Verify Email with OTP

**Auth:** Public  
**Description:** Verifies a user's email using the 6-digit OTP sent during registration.

**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `email` | string | ✅ | Valid email |
| `otp` | string | ✅ | 6-digit code from registration email |

```json
{
  "email": "raj@email.com",
  "otp": "123456"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Email verified successfully"
}
```

**Errors:**
- `400` — Invalid verification code
- `400` — Email and OTP are required

**Note:** If email is already verified, returns `{ success: true, message: "Email already verified" }`

---

#### `POST /api/auth/resend-verification` — Resend Verification OTP

**Auth:** Public  
**Description:** Generates a new 6-digit OTP and sends it to the user's email.

**Request Body:**

| Field | Type | Required |
|-------|------|----------|
| `email` | string | ✅ |

```json
{
  "email": "raj@email.com"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "If the email exists and is unverified, a new code has been sent."
}
```

**Note:** Returns generic success message to prevent email enumeration.

---

#### `POST /api/auth/change-password` — Change Password

**Auth:** Required  
**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `oldPassword` | string | ✅ | Current password |
| `newPassword` | string | ✅ | New password (min 6 chars, must differ from old) |

```json
{
  "oldPassword": "oldPassword123",
  "newPassword": "newPassword456"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

**Errors:**
- `400` — Old password is incorrect
- `400` — New password same as old password

---

#### `DELETE /api/auth/delete-account` — Delete Account

**Auth:** Required  
**Request Body:** Empty (user confirms delete via frontend dialog)

**Success Response (200):**

```json
{
  "success": true,
  "message": "Account deleted successfully"
}
```

**Warning:** This permanently deletes the user account, all profile data, applications, and messages

---

### 2. Jobs — `/api/jobs`

**Route file:** `src/routes/jobs.routes.js`  
**Controller:** `src/controllers/job.controller.js`  
**Validator:** `src/validators/job.validator.js`  
**Caching:** Redis (5 min TTL) for job listings — auto-invalidated on create/update/delete

---

#### `GET /api/jobs` — List Jobs (Public)

**Auth:** Guest OK (uses `optionalAuth` middleware)  
**Caching:** ✅ Redis cached (key: `jobs:{queryParams}`, TTL: 300s)

**Query Parameters:**

| Param | Type | Example | Default | Description |
|-------|------|---------|---------|-------------|
| `search` | string | `flutter` | — | Searches title, description, companyName, skills |
| `location` | string | `Bangalore` | — | Case-insensitive partial match |
| `jobType` | enum | `full_time` | — | `full_time`, `part_time`, `contract`, `internship`, `freelance` |
| `isRemote` | boolean | `true` | — | Filter remote jobs |
| `minExperience` | int | `2` | — | Minimum years required |
| `maxExperience` | int | `5` | — | Maximum years required |
| `status` | enum | `active` | `active` | `active`, `closed`, `draft` |
| `sortBy` | string | `salary` | `postedDate` | `postedDate`, `salary`, `applicants` |
| `sortOrder` | string | `asc` | `desc` | `asc` or `desc` |
| `page` | int | `1` | `1` | Page number (min: 1) |
| `limit` | int | `10` | `10` | Items per page (1–100) |

**Example:** `GET /api/jobs?search=flutter&location=Bangalore&jobType=full_time&isRemote=false&page=1&limit=10`

**Success Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Senior Flutter Developer",
      "description": "We are looking for...",
      "location": "Bangalore, India",
      "salaryRange": "₹18L - ₹25L",
      "salaryMin": 1800000,
      "salaryMax": 2500000,
      "minExperience": 3,
      "maxExperience": 7,
      "skills": ["Flutter", "Dart", "REST API"],
      "requirements": ["3+ years Flutter experience"],
      "jobType": "full_time",
      "isRemote": false,
      "isHotJob": true,
      "status": "active",
      "applicants": 2,
      "views": 150,
      "companyName": "TechCorp India",
      "postedDate": "2026-02-13T06:20:44.946Z",
      "company": {
        "id": "uuid",
        "name": "TechCorp India",
        "logo": null,
        "rating": 4.5
      }
    }
  ],
  "pagination": {
    "total": 6,
    "page": 1,
    "limit": 10,
    "totalPages": 1,
    "hasMore": false
  }
}
```

---

#### `GET /api/jobs/search?q=` — Search Jobs (Public)

**Auth:** Guest OK  
**Minimum query length:** 2 characters

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `q` | string | ✅ | Search keyword (min 2 chars) |
| `page` | int | ❌ | Default: 1 |
| `limit` | int | ❌ | Default: 10 |

**Example:** `GET /api/jobs/search?q=flutter&page=1&limit=10`

**Error:** `400` — Search query must be at least 2 characters

---

#### `GET /api/jobs/:id` — Job Detail (Public)

**Auth:** Guest OK (optionalAuth — shows `isSaved`/`hasApplied` for logged-in users)  
**Side effect:** Increments `views` count by 1

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `id` | UUID | Job ID |

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Senior Flutter Developer",
    "description": "...",
    "company": { "id": "uuid", "name": "TechCorp India" },
    "postedBy": { "id": "uuid", "name": "Priya Sharma", "profileImage": null },
    "isSaved": false,
    "hasApplied": true
  }
}
```

---

#### `POST /api/jobs` — Create Job (Recruiter Only)

**Auth:** Required  
**Middleware:** `auth → roleGuard('recruiter') → validate(jobValidator.createJob)`

**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `title` | string | ✅ | 3–200 chars |
| `description` | string | ✅ | Min 10 chars |
| `location` | string | ✅ | — |
| `companyName` | string | ✅ | — |
| `salaryRange` | string | ❌ | Display string e.g. "₹18-25 LPA" |
| `salaryMin` | number | ❌ | Min 0 |
| `salaryMax` | number | ❌ | Min 0 |
| `minExperience` | int | ❌ | Default: 0 |
| `maxExperience` | int | ❌ | Default: 0 |
| `skills` | string[] | ❌ | Default: [] |
| `requirements` | string[] | ❌ | Default: [] |
| `jobType` | enum | ❌ | Default: `full_time` |
| `isRemote` | boolean | ❌ | Default: false |
| `isHotJob` | boolean | ❌ | Default: false |
| `expiresAt` | ISO date | ❌ | Job expiration date |

```json
{
  "title": "DevOps Engineer",
  "description": "Looking for a DevOps engineer with AWS experience",
  "location": "Mumbai, India",
  "companyName": "TechCorp India",
  "salaryRange": "₹18-25 LPA",
  "salaryMin": 1800000,
  "salaryMax": 2500000,
  "minExperience": 3,
  "maxExperience": 7,
  "skills": ["AWS", "Docker", "Kubernetes", "Terraform"],
  "requirements": ["3+ years DevOps experience", "AWS certified preferred"],
  "jobType": "full_time",
  "isRemote": true
}
```

**Side effect:** Invalidates all Redis `jobs:*` cache keys

---

#### `GET /api/jobs/recruiter/mine` — My Posted Jobs (Recruiter Only)

**Auth:** Required (Recruiter)  
**Middleware:** `auth → roleGuard('recruiter')`

**Query:** `?status=active&page=1&limit=10`

**Response includes:** `_count.applications` for each job

---

#### `PATCH /api/jobs/:id` — Update Job (Recruiter Only)

**Auth:** Required (Recruiter, own job only)  
**Middleware:** `auth → roleGuard('recruiter') → validate(jobValidator.updateJob)`  
**Body:** Same fields as create, all optional, minimum 1 field

---

#### `DELETE /api/jobs/:id` — Delete Job (Recruiter Only)

**Auth:** Required (Recruiter, own job only)  
**Side effect:** Invalidates Redis `jobs:*` cache

---

### 3. Applications — `/api/applications`

**Route file:** `src/routes/applications.routes.js`  
**Controller:** `src/controllers/application.controller.js`  
**Validator:** `src/validators/general.validator.js`

---

#### `POST /api/applications` — Apply for Job

**Auth:** Required (Job Seeker) — **401 triggers login modal in Flutter**  
**Middleware:** `auth → validate(generalValidator.createApplication)`

**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `jobId` | UUID | ✅ | Must be valid UUID |
| `coverLetter` | string | ❌ | Optional text |

```json
{
  "jobId": "a64102c6-1e08-4115-9a88-71f8190052fb",
  "coverLetter": "I am very excited about this Flutter role..."
}
```

**Side effects:**
- Increments `job.applicants` count
- Creates notification for the recruiter who posted the job

**Errors:**
- `401` — Not logged in (triggers Flutter login modal)
- `404` — Job not found
- `400` — Job is not active
- `409` — Already applied to this job

---

#### `GET /api/applications` — My Applications (Job Seeker)

**Auth:** Required  
**Query:** `?status=shortlisted&page=1&limit=10`

**Response includes:** Job details (title, companyName, location, salary, jobType)

---

#### `GET /api/applications/:id` — Application Detail

**Auth:** Required (own application or job owner)

---

#### `DELETE /api/applications/:id` — Withdraw Application

**Auth:** Required (own application only)  
**Updates status to:** `withdrawn`

---

#### `GET /api/applications/job/:jobId` — Applications for a Job (Recruiter)

**Auth:** Required (Recruiter, own job only)  
**Query:** `?status=applied&page=1&limit=10`  
**Response includes:** Applicant profile (name, skills, experience, resume)

---

#### `PATCH /api/applications/:id/status` — Update Application Status

**Auth:** Required (Recruiter, own job only)  
**Middleware:** `auth → roleGuard('recruiter') → validate(generalValidator.updateApplicationStatus)`

**Request Body:**

| Field | Type | Required | Valid Values |
|-------|------|----------|-------------|
| `status` | enum | ✅ | `applied`, `in_review`, `shortlisted`, `interviewed`, `offered`, `rejected`, `withdrawn`, `hired` |
| `recruiterMessage` | string | ❌ | Optional note |

```json
{
  "status": "shortlisted",
  "recruiterMessage": "Your profile looks great, moving to next round."
}
```

**Side effect:** Creates notification for the applicant

**Application Status Flow:**
```
applied → in_review → shortlisted → interviewed → offered → hired
                                                   └→ rejected
                           └→ withdrawn (by seeker)
```

---

### 4. Profile — `/api/profile`

**Route file:** `src/routes/profile.routes.js`  
**Controller:** `src/controllers/profile.controller.js`  
**Validator:** `src/validators/general.validator.js`

---

#### `GET /api/profile` — Get My Profile

**Auth:** Required

---

#### `PATCH /api/profile` — Update Profile

**Auth:** Required  
**Middleware:** `auth → validate(generalValidator.updateProfile)`

**Request Body (all optional, min 1):**

| Field | Type | Validation |
|-------|------|------------|
| `name` | string | 2–100 chars |
| `phone` | string | Optional |
| `headline` | string | Max 200 chars |
| `location` | string | — |
| `experience` | int | Min 0 |
| `skills` | string[] | — |
| `currentCompany` | string | — |
| `currentDesignation` | string | — |
| `expectedSalary` | number | Min 0 |
| `isAvailable` | boolean | — |
| `noticePeriod` | string | e.g. "30 days" |
| `currentCtc` | string | — |

```json
{
  "headline": "Lead Flutter Developer",
  "experience": 6,
  "skills": ["Flutter", "Dart", "Firebase", "REST API", "Git"],
  "expectedSalary": 2500000,
  "noticePeriod": "30 days"
}
```

---

#### `POST /api/profile/resume` — Upload Resume

**Auth:** Required  
**Content-Type:** `multipart/form-data`  
**Field:** `resume` (PDF, DOC, DOCX — max 5MB)

```bash
curl -X POST http://localhost:3000/api/profile/resume \
  -H "Authorization: Bearer $TOKEN" \
  -F "resume=@/path/to/resume.pdf"
```

---

#### `POST /api/profile/image` — Upload Profile Image

**Auth:** Required  
**Content-Type:** `multipart/form-data`  
**Field:** `profileImage` (JPEG, PNG, WebP — max 5MB)

---

#### `GET /api/profile/:userId` — Public Profile

**Auth:** Required  
**Returns:** Limited public fields (no email/phone/salary)

---

#### `PUT /api/profile/education` — Update Education

**Auth:** Required  
**Request Body:** Array of education entries (replaces existing)

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `degree` | string | ✅ | e.g., "Bachelor of Science" |
| `institution` | string | ✅ | e.g., "MIT" |
| `field` | string | ✅ | e.g., "Computer Science" |
| `startYear` | ISO date | ✅ | Start date |
| `endYear` | ISO date | ✅ | End date |
| `grade` | string | ❌ | Optional GPA/grade |
| `location` | string | ❌ | Optional location |

```json
[
  {
    "degree": "Bachelor of Science",
    "institution": "IIT Bangalore",
    "field": "Computer Science",
    "startYear": "2018-01-15",
    "endYear": "2022-06-15",
    "grade": "9.5",
    "location": "Bangalore, India"
  }
]
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Education updated",
  "data": { "count": 1 }
}
```

---

#### `PUT /api/profile/experience` — Update Work Experience

**Auth:** Required  
**Request Body:** Array of work experiences (replaces existing)

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `company` | string | ✅ | e.g., "Google" |
| `designation` | string | ✅ | e.g., "Senior Software Engineer" |
| `location` | string | ❌ | Optional location |
| `startDate` | ISO date | ✅ | Start date |
| `endDate` | ISO date | ❌ | End date (null if current) |
| `isCurrent` | boolean | ❌ | Currently working (default: false) |
| `description` | string | ❌ | Job description |

```json
[
  {
    "company": "TechCorp India",
    "designation": "Lead Flutter Developer",
    "location": "Bangalore",
    "startDate": "2022-01-15",
    "endDate": null,
    "isCurrent": true,
    "description": "Leading Flutter app development for millions of users"
  }
]
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Work experience updated",
  "data": { "count": 1 }
}
```

---

#### `GET /api/profile/preferences` — Get Profile Preferences

**Auth:** Required  
**Returns:** User's privacy and notification preferences

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "isProfileHidden": false,
    "allowRecruiterContact": true,
    "allowNotifications": true,
    "allowEmails": true
  }
}
```

---

#### `PATCH /api/profile/preferences` — Update Profile Preferences

**Auth:** Required  
**Request Body:** (all optional, min 1 field)

| Field | Type | Description |
|-------|------|-------------|
| `isProfileHidden` | boolean | Hide profile from recruiters |
| `allowRecruiterContact` | boolean | Allow contact from recruiters |
| `allowNotifications` | boolean | Allow in-app notifications |
| `allowEmails` | boolean | Allow email notifications |

```json
{
  "isProfileHidden": false,
  "allowRecruiterContact": true,
  "allowEmails": false
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Preferences updated",
  "data": { /* updated preferences */ }
}
```

---

#### `PATCH /api/profile/blocked-companies` — Update Blocked Companies

**Auth:** Required  
**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `blockedCompanies` | UUID[] | ✅ | Array of company IDs to block |

```json
{
  "blockedCompanies": ["uuid-company-1", "uuid-company-2"]
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Blocked companies updated",
  "data": {
    "blockedCompanies": ["uuid-company-1", "uuid-company-2"]
  }
}
```

---

### 5. Messages — `/api/messages`

**Route file:** `src/routes/messages.routes.js`  
**Controller:** `src/controllers/message.controller.js`  
**Validator:** `src/validators/general.validator.js`

---

#### `POST /api/messages` — Send Message (Recruiter Only)

**Auth:** Required (Recruiter)  
**Middleware:** `auth → roleGuard('recruiter') → validate(generalValidator.sendMessage)`

**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `toUserId` | UUID | ✅ | Recipient user ID |
| `subject` | string | ✅ | — |
| `body` | string | ✅ | — |
| `templateId` | UUID | ❌ | Link to template |

```json
{
  "toUserId": "4e57886f-3844-4358-bb30-4a38d43ba9c1",
  "subject": "Exciting Flutter Opportunity!",
  "body": "Hi, we have an exciting role at TechCorp India."
}
```

**Side effect:** Creates notification for recipient

---

#### `POST /api/messages/bulk` — Bulk Send (Recruiter Only)

**Auth:** Required (Recruiter)  
**Middleware:** `auth → roleGuard('recruiter') → validate(generalValidator.sendBulkMessages)`

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `toUserIds` | UUID[] | ✅ | Array of recipient IDs (min 1) |
| `subject` | string | ✅ | — |
| `body` | string | ✅ | Can contain `{{placeholder}}` |
| `templateId` | UUID | ❌ | — |
| `placeholders` | object | ❌ | Key-value pairs for `{{key}}` replacement |

```json
{
  "toUserIds": ["uuid-1", "uuid-2", "uuid-3"],
  "subject": "Job Opening at TechCorp",
  "body": "Hi {{name}}, we have a {{job_title}} position open.",
  "placeholders": { "name": "Candidate", "job_title": "Flutter Developer" }
}
```

---

#### `GET /api/messages` — Inbox (Received)

**Auth:** Required  
**Query:** `?page=1&limit=10`  
**Response includes:** Sender info (`from.name`, `from.profileImage`)

---

#### `GET /api/messages/sent` — Sent Messages

**Auth:** Required  
**Query:** `?page=1&limit=10`  
**Response includes:** Recipient info (`to.name`, `to.profileImage`)

---

#### `GET /api/messages/unread-count` — Unread Count

**Auth:** Required

```json
{ "success": true, "data": { "unreadCount": 2 } }
```

---

#### `PATCH /api/messages/:id/read` — Mark as Read

**Auth:** Required (own message only)

---

### 6. Notifications — `/api/notifications`

**Route file:** `src/routes/notifications.routes.js`  
**Controller:** `src/controllers/notification.controller.js`

---

#### `GET /api/notifications` — List Notifications

**Auth:** Required  
**Query:** `?page=1&limit=10`

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "title": "Application Shortlisted",
      "message": "Your application for Senior Flutter Developer has been shortlisted",
      "type": "application",
      "isRead": false,
      "metadata": { "jobId": "uuid" },
      "createdAt": "2026-02-13T06:20:44.961Z"
    }
  ],
  "unreadCount": 2,
  "pagination": { "total": 2, "page": 1, "limit": 10, "totalPages": 1, "hasMore": false }
}
```

---

#### `PATCH /api/notifications/:id/read` — Mark One as Read

#### `PATCH /api/notifications/read-all` — Mark All as Read

#### `DELETE /api/notifications/:id` — Delete Notification

---

### 7. Message Templates — `/api/templates`

**Route file:** `src/routes/templates.routes.js`  
**Controller:** `src/controllers/template.controller.js`  
**Validator:** `src/validators/general.validator.js`

---

#### `POST /api/templates` — Create Template (Recruiter)

**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `title` | string | ✅ | 2–200 chars |
| `body` | string | ✅ | Min 5 chars, use `{{placeholder}}` syntax |
| `placeholders` | string[] | ❌ | Default: [] |
| `category` | string | ❌ | — |
| `isDefault` | boolean | ❌ | Default: false |

```json
{
  "title": "Interview Invitation",
  "body": "Dear {{name}},\n\nWe'd like to invite you for an interview for {{job_title}}.\n\nBest,\n{{recruiter_name}}",
  "placeholders": ["name", "job_title", "recruiter_name"],
  "category": "interview"
}
```

---

#### `GET /api/templates` — List Templates

Returns own templates + default templates (seeded)

#### `GET /api/templates/:id` — Get Template

#### `PATCH /api/templates/:id` — Update Template (own only)

#### `DELETE /api/templates/:id` — Delete Template (own only)

---

### 8. Saved Jobs — `/api/saved-jobs`

**Route file:** `src/routes/savedJobs.routes.js`  
**Controller:** `src/controllers/savedJob.controller.js`

---

#### `POST /api/saved-jobs/:jobId` — Toggle Save/Unsave Job

**Auth:** Required (Job Seeker)  
**Behavior:** Toggle endpoint — checks if job is already saved:
- If saved → Deletes and returns `isSaved: false`
- If not saved → Creates and returns `isSaved: true`

**Success Response:**
- First call (save): 201 — `{ success: true, message: "Job saved", isSaved: true }`
- Second call (unsave): 200 — `{ success: true, message: "Job removed from saved", isSaved: false }`

**Errors:**
- `403` — Only job seekers can save jobs
- `404` — Job not found

---

#### `GET /api/saved-jobs` — List Saved Jobs

**Auth:** Required  
**Returns:** Full job objects with company info, ordered by savedAt desc

---

### 9. Skills — `/api/skills`

**Route file:** `src/routes/skills.routes.js`  
**Controller:** `src/controllers/skill.controller.js`

---

#### `GET /api/skills` — Search Skills

**Auth:** Required  
**Query Parameters:**

| Param | Type | Description | Example |
|-------|------|-------------|---------|
| `q` | string | Search query (partial match, case-insensitive) | `flutter` |
| `limit` | int | Max results (default: 20, max: 50) | `30` |

**Example:** `GET /api/skills?q=flutter&limit=20`

**Success Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Flutter",
      "category": "Framework",
      "usageCount": 432
    },
    {
      "id": "uuid",
      "name": "Flutter Web",
      "category": "Framework",
      "usageCount": 89
    }
  ]
}
```

---

#### `GET /api/skills/popular` — Get Popular Skills

**Auth:** Required  
**Returns:** Top 30 most-used skills in the system (no query params needed)

**Success Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Python",
      "category": "Language",
      "usageCount": 1250
    },
    {
      "id": "uuid",
      "name": "JavaScript",
      "category": "Language",
      "usageCount": 1180
    }
  ]
}
```

---

#### `POST /api/skills` — Add New Skill

**Auth:** Required  
**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `name` | string | ✅ | Skill name (trimmed, no empty) |
| `category` | string | ❌ | Optional category (e.g., "Language", "Framework") |

```json
{
  "name": "Go",
  "category": "Language"
}
```

**Success Response (201):**

```json
{
  "success": true,
  "message": "Skill added",
  "data": {
    "id": "uuid",
    "name": "Go",
    "category": "Language",
    "usageCount": 0
  }
}
```

**Error:**
- `400` — Skill name is required
- `200` (with existing data) — If skill already exists (case-insensitive)

---

### 10. Feedback — `/api/feedback`

**Route file:** `src/routes/feedback.routes.js`  
**Controller:** `src/controllers/feedback.controller.js`

---

#### `POST /api/feedback` — Submit Feedback

**Auth:** Required  
**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `category` | string | ✅ | Feedback category (e.g., "bug", "feature", "ui", "performance") |
| `rating` | int | ❌ | Rating 1-5 (optional, defaults to 0) |
| `message` | string | ✅ | Feedback message (trimmed, non-empty) |

```json
{
  "category": "feature",
  "rating": 4,
  "message": "It would be great to have bulk messaging for candidates"
}
```

**Success Response (201):**

```json
{
  "success": true,
  "message": "Thank you! Your feedback has been received.",
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "category": "feature",
    "rating": 4,
    "message": "It would be great to have bulk messaging for candidates",
    "createdAt": "2026-02-13T12:30:00.000Z"
  }
}
```

---

### 11. Chat — `/api/chat`

**Route file:** `src/routes/chat.routes.js`  
**Controller:** `src/controllers/chat.controller.js`

---

#### `POST /api/chat/start` — Start Conversation (Recruiter)

**Auth:** Required (Recruiter)  
**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `candidateId` | UUID | ✅ | ID of the candidate |
| `jobId` | UUID | ❌ | Optional job ID (to link conversation to a job) |
| `initialMessage` | string | ✅ | First message to send |

```json
{
  "candidateId": "a64102c6-1e08-4115-9a88-71f8190052fb",
  "jobId": "d74102c6-1e08-4115-9a88-71f8190052fb",
  "initialMessage": "Hi! We'd like to know more about your Flutter experience"
}
```

**Success Response (201):**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "recruiterId": "uuid",
    "candidateId": "uuid",
    "jobId": "uuid",
    "jobTitle": "Senior Flutter Developer",
    "lastMessage": "Hi! We'd like to know more about your Flutter experience",
    "lastMessageAt": "2026-02-13T12:30:00.000Z",
    "unreadCandidate": 1,
    "unreadRecruiter": 0,
    "createdAt": "2026-02-13T12:30:00.000Z"
  }
}
```

**Behavior:**
- If conversation already exists (recruiter + candidate + jobId), returns existing conversation
- If it doesn't exist, creates a new one with the initial message
- Always idempotent

---

#### `GET /api/chat` — Get Conversations

**Auth:** Required  
**Returns:** All conversations for the current user (recruiter or candidate)

**Success Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "recruiterId": "uuid",
      "recruiterName": "Priya Sharma",
      "recruiterAvatar": "https://...",
      "candidateId": "uuid",
      "candidateName": "Raj Kumar",
      "candidateAvatar": "https://...",
      "jobId": "uuid",
      "jobTitle": "Senior Flutter Developer",
      "companyName": "TechCorp India",
      "companyLogo": "https://...",
      "lastMessage": "Thanks for the opportunity!",
      "lastMessageAt": "2026-02-13T14:20:00.000Z",
      "unreadCount": 2
    }
  ]
}
```

---

#### `GET /api/chat/:conversationId/messages` — Get Message History

**Auth:** Required  
**Path Parameters:**

| Param | Type | Required |
|-------|------|----------|
| `conversationId` | UUID | ✅ |

**Success Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "senderId": "uuid",
      "senderName": "Priya Sharma",
      "text": "Hi! We'd like to know more about your Flutter experience",
      "type": "text",
      "status": "read",
      "readAt": "2026-02-13T13:00:00.000Z",
      "sentAt": "2026-02-13T12:30:00.000Z"
    }
  ]
}
```

---

#### `POST /api/chat/:conversationId/messages` — Send Message

**Auth:** Required  
**Path Parameters:**

| Param | Type | Required |
|-------|------|----------|
| `conversationId` | UUID | ✅ |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | ✅ | Message text |
| `type` | string | ❌ | Message type: `text`, `image`, `file` (default: `text`) |
| `attachmentUrl` | string | ❌ | URL of attachment (if type is image/file) |
| `attachmentName` | string | ❌ | Name of attachment |

```json
{
  "text": "Thanks for the opportunity! I'm very interested in this role.",
  "type": "text"
}
```

**Success Response (201):**

```json
{
  "success": true,
  "message": "Message sent",
  "data": {
    "id": "uuid",
    "conversationId": "uuid",
    "senderId": "uuid",
    "senderName": "Raj Kumar",
    "text": "Thanks for the opportunity! I'm very interested in this role.",
    "type": "text",
    "status": "sent",
    "sentAt": "2026-02-13T14:30:00.000Z"
  }
}
```

---

#### `PATCH /api/chat/:conversationId/read` — Mark Conversation as Read

**Auth:** Required  
**Path Parameters:**

| Param | Type | Required |
|-------|------|----------|
| `conversationId` | UUID | ✅ |

**Success Response (200):**

```json
{
  "success": true,
  "message": "Conversation marked as read"
}
```

---

### 12. Subscription — `/api/subscription`

**Route file:** `src/routes/subscription.routes.js`  
**Controller:** `src/controllers/subscription.controller.js`

---

#### `POST /api/subscription/subscribe` — Subscribe to Plan

**Auth:** Required (Recruiter with company)  
**Request Body:**

| Field | Type | Required | Valid Values |
|-------|------|----------|-------------|
| `planName` | string | ✅ | `Normal`, `Premium` |
| `isYearly` | boolean | ❌ | `true` for yearly, `false` for monthly (default: false) |

```json
{
  "planName": "Premium",
  "isYearly": true
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Successfully subscribed to Premium yearly plan (365 days)",
  "data": {
    "planName": "Premium (yearly)",
    "status": "active",
    "trialEndsAt": "2027-02-13T12:30:00.000Z",
    "durationDays": 365
  }
}
```

**Errors:**
- `400` — Invalid planName or missing required fields
- `403` — Only recruiters can subscribe
- `400` — No company profile created

---

#### `POST /api/subscription/trial` — Start Free Trial

**Auth:** Required (Recruiter with company)  
**Request Body:** Empty (no params)

**Success Response (200):**

```json
{
  "success": true,
  "message": "7-day free trial activated successfully",
  "data": {
    "planName": "Free Trial",
    "status": "trialing",
    "trialEndsAt": "2026-02-20T12:30:00.000Z",
    "durationDays": 7
  }
}
```

**Errors:**
- `403` — Only recruiters can start a trial
- `400` — No company profile | Already used trial/has active subscription

---

#### `GET /api/subscription/status` — Get Subscription Status

**Auth:** Required (Recruiter)

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "hasCompany": true,
    "status": "active",
    "planName": "Premium (yearly)",
    "trialEndsAt": "2027-02-13T12:30:00.000Z",
    "isExpired": false
  }
}
```

**If no company:**

```json
{
  "success": true,
  "data": {
    "hasCompany": false,
    "status": "inactive"
  }
}
```

---

### 13. Recruiter Dashboard — `/api/recruiter`

**Route file:** `src/routes/recruiter.routes.js`  
**Controller:** `src/controllers/recruiter.controller.js`

---

#### `GET /api/recruiter/dashboard` — Dashboard Metrics

**Auth:** Required (Recruiter)

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "metrics": {
      "totalJobs": 4,
      "activeJobs": 3,
      "totalApplications": 12,
      "statusBreakdown": {
        "applied": 5,
        "in_review": 3,
        "shortlisted": 2,
        "interviewed": 1,
        "offered": 1
      }
    },
    "recentApplications": [
      {
        "id": "uuid",
        "user": {
          "id": "uuid",
          "name": "Raj Kumar",
          "profileImage": "https://...",
          "headline": "Flutter Developer"
        },
        "job": {
          "id": "uuid",
          "title": "Senior Flutter Developer",
          "companyName": "TechCorp India"
        },
        "status": "shortlisted",
        "appliedDate": "2026-02-13T06:20:44.939Z"
      }
    ],
    "topJobs": [
      {
        "id": "uuid",
        "title": "Senior Flutter Developer",
        "applicants": 5,
        "views": 250,
        "status": "active"
      }
    ],
    "applicationTrend": [
      {
        "date": "2026-02-08T00:00:00.000Z",
        "count": 1
      },
      {
        "date": "2026-02-13T00:00:00.000Z",
        "count": 3
      }
    ]
  }
}
```

---

#### `GET /api/recruiter/analytics` — Detailed Analytics

**Auth:** Required (Recruiter)  
**Query Parameters:**

| Param | Type | Description | Example |
|-------|------|-------------|---------|
| `period` | string | Time period: `7d`, `30d`, `90d`, `365d` (default: 30d) | `7d` |

**Example:** `GET /api/recruiter/analytics?period=30d`

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "monthlyTrend": [
      {
        "date": "2026-01-15T00:00:00.000Z",
        "count": 5
      }
    ],
    "conversionRates": [
      {
        "status": "applied",
        "_count": 20
      },
      {
        "status": "shortlisted",
        "_count": 10
      }
    ],
    "topSkills": [
      {
        "skill": "Flutter",
        "count": 15
      },
      {
        "skill": "Dart",
        "count": 12
      }
    ]
  }
}
```

---

#### `GET /api/recruiter/candidates` — Search Candidates

**Auth:** Required (Recruiter)  
**Query Parameters:**

| Param | Type | Description | Example |
|-------|------|-------------|---------|
| `search` | string | Search by name, headline, designation | `flutter` |
| `skills` | string | Comma-separated skills | `Flutter,Dart` |
| `location` | string | Filter by location (partial match) | `Bangalore` |
| `minExperience` | int | Minimum years of experience | `3` |
| `maxExperience` | int | Maximum years of experience | `7` |
| `page` | int | Page number (default: 1) | `1` |
| `limit` | int | Items per page (max: 50, default: 10) | `20` |

**Example:** `GET /api/recruiter/candidates?skills=Flutter,Dart&location=Bangalore&minExperience=3&limit=20`

**Success Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Raj Kumar",
      "profileImage": "https://...",
      "headline": "Senior Flutter Developer",
      "location": "Bangalore, India",
      "experience": 6,
      "skills": ["Flutter", "Dart", "Firebase", "REST API"],
      "resumeUrl": "https://...",
      "currentCompany": "TechCorp India",
      "currentDesignation": "Lead Developer",
      "expectedSalary": 2500000,
      "isAvailable": true,
      "noticePeriod": "30 days"
    }
  ],
  "pagination": {
    "total": 42,
    "page": 1,
    "limit": 20,
    "totalPages": 3,
    "hasMore": true
  }
}
```

---

#### `PUT /api/recruiter/company` — Update Company Profile

**Auth:** Required (Recruiter)  
**Request Body:** (all optional, min 1 field)

| Field | Type | Validation |
|-------|------|------------|
| `name` | string | — |
| `industry` | string | — |
| `location` | string | — |
| `description` | string | — |
| `website` | string | Valid URL |
| `employeeCount` | int | Min 0 |

```json
{
  "name": "TechCorp India",
  "industry": "Technology",
  "location": "Bangalore, India",
  "website": "https://techcorp.in"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Company profile updated",
  "data": {
    "id": "uuid",
    "name": "TechCorp India",
    "logo": "https://...",
    "industry": "Technology",
    "location": "Bangalore, India",
    "website": "https://techcorp.in",
    "employeeCount": 50
  }
}
```

---

#### `POST /api/recruiter/company/logo` — Upload Company Logo

**Auth:** Required (Recruiter)  
**Content-Type:** `multipart/form-data`  
**Field:** `companyLogo` (JPEG, PNG, WebP, SVG — max 5MB)

```bash
curl -X POST http://localhost:3000/api/recruiter/company/logo \
  -H "Authorization: Bearer $TOKEN" \
  -F "companyLogo=@/path/to/logo.png"
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Logo uploaded",
  "data": {
    "logoUrl": "https://localhost:3000/uploads/logos/company-uuid.png"
  }
}
```

---

#### `GET /api/recruiter/company/:id` — Get Company Profile (Public)

**Auth:** Optional  
**Path Parameters:**

| Param | Type | Required |
|-------|------|----------|
| `id` | UUID | ✅ |

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "TechCorp India",
    "logo": "https://...",
    "industry": "Technology",
    "location": "Bangalore, India",
    "website": "https://techcorp.in",
    "description": "Leading tech company...",
    "employeeCount": 50,
    "rating": 4.5,
    "reviewCount": 23,
    "jobCount": 12
  }
}
```

---

#### `GET /api/recruiter/team` — Get Team Members

**Auth:** Required (Recruiter)

**Success Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Priya Sharma",
      "email": "priya@techcorp.in",
      "role": "recruiter",
      "profileImage": "https://...",
      "joinedAt": "2026-01-15T00:00:00.000Z"
    }
  ]
}
```

---

#### `POST /api/recruiter/team/invite` — Invite Team Member

**Auth:** Required (Recruiter)  
**Request Body:**

| Field | Type | Required |
|-------|------|----------|
| `email` | string | ✅ |
| `role` | string | ❌ |

```json
{
  "email": "newmember@techcorp.in",
  "role": "Recruiter"
}
```

**Success Response (201):**

```json
{
  "success": true,
  "message": "Invite sent",
  "data": {
    "id": "uuid",
    "email": "newmember@techcorp.in",
    "status": "pending"
  }
}
```

---

#### `GET /api/recruiter/team/invites` — Get Team Invites

**Auth:** Required (Recruiter)

**Success Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "email": "newmember@techcorp.in",
      "role": "Recruiter",
      "status": "pending",
      "createdAt": "2026-02-13T12:30:00.000Z"
    }
  ]
}
```

---

#### `POST /api/recruiter/team/invite/accept` — Accept Team Invite

**Auth:** Required (Recruiter)  
**Description:** Accepts a pending team invitation. The logged-in user's email must match the invite email. Adds the user to the company in a transaction.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `inviteId` | UUID | ✅ | ID of the pending invitation |

```json
{
  "inviteId": "uuid-of-invite"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Invitation accepted. You are now part of the team."
}
```

**Errors:**
- `400` — Invite ID is required
- `404` — Invitation not found or already processed
- `403` — This invitation is not for your email

---

#### `DELETE /api/recruiter/team/:memberId` — Remove Team Member

**Auth:** Required (Recruiter, same company)  
**Description:** Removes a team member from the company. Cannot remove yourself.

**Path Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `memberId` | UUID | User ID of the team member to remove |

**Success Response (200):**

```json
{
  "success": true,
  "message": "Team member removed"
}
```

**Errors:**
- `400` — No company found / Cannot remove yourself
- `404` — Member not found in your team

---

### 14. Real-Time Chat (Socket.io)

**Connection:** `ws://localhost:3000` with JWT in auth handshake  
**File:** `src/socket/chat.socket.js`

```javascript
// Flutter/Client connection
const socket = io('http://localhost:3000', {
  auth: { token: 'your-jwt-token' }
});
```

### Events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `join_conversation` | Client → Server | `conversationId` | Join a chat room |
| `leave_conversation` | Client → Server | `conversationId` | Leave a chat room |
| `send_message` | Client → Server | `{ conversationId, text, type }` | Send message |
| `new_message` | Server → Room | `ChatMessage` | Broadcast to room |
| `typing` | Client → Server | `{ conversationId, isTyping }` | Typing indicator |
| `user_typing` | Server → Room | `{ userId, isTyping }` | Broadcast typing |
| `mark_read` | Client → Server | `conversationId` | Mark as read |
| `get_conversations` | Client → Server | — | Get conversation list |
| `start_conversation` | Client → Server | `{ candidateId, jobId, jobTitle, initialMessage }` | New chat (recruiter) |
| `message_notification` | Server → User | `{ conversationId, message, senderName }` | Push notification |

---

## Guest Browsing Flow

```
App Opens → "Continue as Guest?" 
  → YES → Browse Jobs (no token needed)
       → Clicks "Apply" → API returns 401 
       → Flutter shows Login Modal → Login → JWT issued → Full access
  → NO → Login/Register → JWT issued → Full access
```

**Public endpoints** (no token): `GET /api/jobs`, `GET /api/jobs/:id`, `GET /api/jobs/search`  
**Auth-gated** (token needed): Everything else → 401 for guests

---

## Error Response Format

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "email", "message": "email is required" },
    { "field": "password", "message": "password must be at least 6 characters" }
  ]
}
```

| Status | Meaning |
|--------|---------|
| `400` | Validation error / Bad request |
| `401` | Not authenticated (no/invalid token) |
| `403` | Forbidden (wrong role or not owner) |
| `404` | Resource not found |
| `409` | Conflict (duplicate email, already applied) |
| `429` | Rate limited (100 req/15min window) |
| `500` | Internal server error |

---

## Pagination Response Format

All paginated endpoints accept `?page=1&limit=10` and return:

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 42,
    "page": 1,
    "limit": 10,
    "totalPages": 5,
    "hasMore": true
  }
}
```

**Defaults:** `page=1`, `limit=10` (max: 100)

---

## File Upload

| Field Name | Allowed Types | Max Size | Storage Path | Served At |
|------------|--------------|----------|-------------|-----------|
| `resume` | PDF, DOC, DOCX | 5MB | `uploads/resumes/` | `/uploads/resumes/{filename}` |
| `profileImage` | JPEG, PNG, WebP | 5MB | `uploads/profiles/` | `/uploads/profiles/{filename}` |
| `companyLogo` | JPEG, PNG, WebP, SVG | 5MB | `uploads/logos/` | `/uploads/logos/{filename}` |

---

## Seed Data — Test Accounts

| Role | Email | Password |
|------|-------|----------|
| Recruiter | `priya@techcorp.in` | `password123` |
| Recruiter | `vikram@startupxyz.in` | `password123` |
| Job Seeker | `raj@email.com` | `password123` |
| Job Seeker | `anita@email.com` | `password123` |
| Job Seeker | `sneha@email.com` | `password123` |

**Seed includes:** 4 companies, 5 jobs, 4 applications, 5 templates, 2 messages, 3 notifications, 1 conversation with 4 chat messages, 3 saved jobs.

---

## Production Considerations

### Security
- **Helmet** — HTTP security headers (XSS, HSTS, CSP, etc.)
- **CORS** — Configurable origins via `CORS_ORIGINS` env var
- **Rate Limiting** — Configurable global (300/15min) + auth-specific (10/15min) limits
- **Bcrypt** — Passwords hashed with 12 salt rounds
- **JWT** — Short-lived access tokens (15min) + long-lived refresh tokens (7d)
- **Input Sanitization** — Joi validation on all mutation endpoints
- **Email Verification** — 6-digit OTP sent on registration; generic error messages prevent enumeration
- **Password Reset** — OTP-based, bcrypt-hashed tokens with 10min expiry

### Performance
- **Redis Caching** — Job listings cached with 5min TTL, auto-invalidated on mutations
- **Pagination** — All list endpoints paginated (max 100 items per page)
- **Prisma Query Optimization** — `select` used to fetch only needed fields
- **Parallel Queries** — `Promise.all()` for dashboard/analytics (6 queries run simultaneously)
- **Lazy Redis** — `lazyConnect: true` so app doesn't crash if Redis is down
- **Compression** — gzip response compression via `compression` middleware

### Reliability
- **Graceful Fallbacks** — Redis failure is non-fatal; app continues without cache
- **Global Error Handler** — All errors caught and returned in consistent format
- **Async Handler** — Promise rejection auto-caught for all controllers
- **Graceful Shutdown** — SIGTERM handler closes server cleanly
- **Winston Logging** — Structured JSON logs to file + console (error + combined)

### Scheduled Tasks
- **Job Expiry Cron** — `scripts/expire-jobs.js` closes active jobs past their `expiresAt` date
  - Run manually: `npm run expire-jobs`
  - Schedule with cron: `0 0 * * * cd /path/to/recruit-backend && node scripts/expire-jobs.js`

---

## Testing

### Backend Tests (Jest + Supertest)

Run: `npm test`

**19 auth endpoint tests** covering:
- **Register:** New user, duplicate email, missing fields, invalid email, short password, invalid role
- **Login:** Valid credentials, wrong password, non-existent user, missing fields
- **Forgot Password:** Non-existent email (returns 200), existing user OTP generation, missing email
- **Reset Password:** Invalid OTP format, missing fields, no record, valid OTP
- **Validation Edge Cases:** Email trim/lowercase, password max length

Test setup uses mocked dependencies (Prisma, Redis, Logger, EmailService, Firebase) — no real database needed.

### Flutter Tests (bloc_test + mocktail)

Run: `cd ../recruit && flutter test`

**8 auth bloc tests** covering:
- Login success/error, Register success/error
- Forgot password success/error, Reset password success
- Logout

---

## Deployment Guide (MVP)

### Prerequisites
- Node.js 18+ on the server
- PostgreSQL 15+ database
- Redis (optional, recommended for caching)
- SMTP credentials (for email verification)

### Steps

```bash
# 1. Clone & install
git clone <repo-url> && cd recruit-backend
npm install --production

# 2. Configure environment
cp .env.example .env
# Edit .env with production values (DB, JWT secrets, SMTP, etc.)

# 3. Run migrations
npx prisma migrate deploy

# 4. Seed data (optional for production)
npx prisma db seed

# 5. Start server
NODE_ENV=production node src/index.js

# 6. (Optional) Schedule job expiry cron
crontab -e
# Add: 0 0 * * * cd /path/to/recruit-backend && node scripts/expire-jobs.js >> /var/log/expire-jobs.log 2>&1
```

### Flutter Build

```bash
cd recruit

# Debug APK
flutter build apk --debug

# Release APK (requires key.properties)
flutter build apk --release \
  --dart-define=API_BASE_URL=https://your-api-domain.com/api
```
