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
- [Recruiter Dashboard](#9-recruiter-dashboard--apirecruiter)
- [Real-Time Chat (Socket.io)](#10-real-time-chat-socketio)
- [Guest Browsing Flow](#guest-browsing-flow)
- [Error Handling](#error-response-format)
- [Pagination](#pagination-response-format)
- [File Upload](#file-upload)
- [Seed Data & Test Accounts](#seed-data--test-accounts)
- [Production Considerations](#production-considerations)

---

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

---

## Environment Variables (`.env`)

```env
DATABASE_URL="postgresql://gowtham:@localhost:5432/recurite_db"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="your-secret-key"
JWT_REFRESH_SECRET="your-refresh-secret"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
PORT=3000
UPLOAD_DIR="./uploads"
NODE_ENV="development"
```

---

## Project Structure

```
recruit-backend/
├── prisma/
│   ├── schema.prisma             # 10 models + 5 enums
│   └── seed.js                   # Sample data seeder
├── src/
│   ├── index.js                  # Express + Socket.io + async startup
│   ├── config/
│   │   ├── database.js           # Prisma client + connectDB()
│   │   ├── redis.js              # Redis client + connectRedis()
│   │   └── env.js                # Centralized env config
│   ├── middleware/
│   │   ├── auth.js               # JWT required → 401 if missing
│   │   ├── optionalAuth.js       # JWT optional → guest mode (req.user = null)
│   │   ├── roleGuard.js          # Role-based access (recruiter only, etc.)
│   │   ├── validate.js           # Joi validation wrapper
│   │   ├── upload.js             # Multer file upload config
│   │   └── errorHandler.js       # Global error handler
│   ├── controllers/
│   │   ├── auth.controller.js    # Register, Login, Refresh, Me, Logout
│   │   ├── job.controller.js     # CRUD jobs + search + Redis caching
│   │   ├── application.controller.js  # Apply, status updates, withdraw
│   │   ├── profile.controller.js # Profile CRUD + file uploads
│   │   ├── message.controller.js # Send, bulk send, inbox, read
│   │   ├── notification.controller.js # List, mark read, delete
│   │   ├── template.controller.js     # CRUD message templates
│   │   ├── savedJob.controller.js     # Save/unsave/list bookmarks
│   │   └── recruiter.controller.js    # Dashboard, analytics, candidate search
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── jobs.routes.js
│   │   ├── applications.routes.js
│   │   ├── profile.routes.js
│   │   ├── messages.routes.js
│   │   ├── notifications.routes.js
│   │   ├── templates.routes.js
│   │   ├── savedJobs.routes.js
│   │   └── recruiter.routes.js
│   ├── validators/
│   │   ├── auth.validator.js     # Register, login, refresh token schemas
│   │   ├── job.validator.js      # Create/update job + filter schemas
│   │   └── general.validator.js  # Application, profile, template, message schemas
│   ├── socket/
│   │   └── chat.socket.js        # Real-time chat with JWT auth
│   └── utils/
│       ├── ApiError.js           # Custom error class (400/401/403/404/409)
│       ├── asyncHandler.js       # Async route wrapper (catches errors)
│       └── pagination.js         # paginate() + paginationMeta() helpers
├── uploads/                      # Local file storage
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

## API Endpoints — Detailed Reference (44 total)

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
| `phone` | string | ❌ | Optional |
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

#### `POST /api/saved-jobs/:jobId` — Save/Bookmark Job

**Auth:** Required  
**Uses upsert** — safe to call multiple times (idempotent)

#### `DELETE /api/saved-jobs/:jobId` — Remove from Saved

**Auth:** Required

#### `GET /api/saved-jobs` — List Saved Jobs

**Auth:** Required  
**Returns:** Full job objects with company info, ordered by savedAt desc

---

### 9. Recruiter Dashboard — `/api/recruiter`

**Route file:** `src/routes/recruiter.routes.js`  
**Controller:** `src/controllers/recruiter.controller.js`

---

#### `GET /api/recruiter/dashboard` — Dashboard Metrics

**Auth:** Required (Recruiter)

**Response:**

```json
{
  "success": true,
  "data": {
    "metrics": {
      "totalJobs": 4,
      "activeJobs": 4,
      "totalApplications": 3,
      "statusBreakdown": { "applied": 1, "shortlisted": 1, "interviewed": 1 }
    },
    "recentApplications": [
      {
        "id": "uuid",
        "applicantName": "Raj Kumar",
        "status": "shortlisted",
        "user": { "id": "uuid", "name": "Raj Kumar", "headline": "Senior Flutter Developer" },
        "job": { "id": "uuid", "title": "Senior Flutter Developer", "companyName": "TechCorp India" }
      }
    ],
    "topJobs": [
      { "id": "uuid", "title": "Senior Flutter Developer", "applicants": 2, "views": 150, "status": "active" }
    ],
    "applicationTrend": [
      { "date": "2026-02-08T00:00:00.000Z", "count": 1 }
    ]
  }
}
```

---

#### `GET /api/recruiter/analytics` — Detailed Analytics

**Auth:** Required (Recruiter)

**Response includes:**
- `monthlyTrend` — Daily application counts (last 30 days, raw SQL)
- `conversionFunnel` — Applications grouped by status
- `topSkills` — Most requested skills across posted jobs (raw SQL with `unnest`)

---

#### `GET /api/recruiter/candidates` — Search Candidates

**Auth:** Required (Recruiter)

**Query Parameters:**

| Param | Type | Example | Description |
|-------|------|---------|-------------|
| `search` | string | `flutter` | Search name, headline, designation |
| `skills` | string | `Flutter,Dart` | Comma-separated skills |
| `location` | string | `Bangalore` | Case-insensitive |
| `minExperience` | int | `3` | — |
| `maxExperience` | int | `7` | — |
| `page` | int | `1` | Default: 1 |
| `limit` | int | `10` | Max: 50 |

**Example:** `GET /api/recruiter/candidates?skills=Flutter,Dart&location=Bangalore&minExperience=3`

---

### 10. Real-Time Chat (Socket.io)

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
- **CORS** — Configurable origin (currently `*` for dev)
- **Rate Limiting** — 100 requests per 15 minutes per IP via `express-rate-limit`
- **Bcrypt** — Passwords hashed with 12 salt rounds
- **JWT** — Short-lived access tokens (15min) + long-lived refresh tokens (7d)

### Performance
- **Redis Caching** — Job listings cached with 5min TTL, auto-invalidated on mutations
- **Pagination** — All list endpoints paginated (max 100 items per page)
- **Prisma Query Optimization** — `select` used to fetch only needed fields
- **Parallel Queries** — `Promise.all()` for dashboard/analytics (6 queries run simultaneously)
- **Lazy Redis** — `lazyConnect: true` so app doesn't crash if Redis is down

### Reliability
- **Graceful Fallbacks** — Redis failure is non-fatal; app continues without cache
- **Global Error Handler** — All errors caught and returned in consistent format
- **Async Handler** — Promise rejection auto-caught for all controllers
- **Graceful Shutdown** — SIGTERM handler closes server cleanly
