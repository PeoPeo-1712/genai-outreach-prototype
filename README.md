# GenAI Fund — AI & Robotics Talent Scout & Outreach Platform

A production-grade, human-in-the-loop talent intelligence and outreach system built for **GenAI Fund** to discover, evaluate, and engage AI & Robotics builders, founders, and researchers across Southeast Asia (Vietnam, Singapore, Indonesia, Thailand, Malaysia, and regional hubs) on **X (formerly Twitter)**.

---

## 1. Architecture & Safety Highlights

### 1. Official X API v2 Integration (No Scraping)
- **Official SDK Only:** Built exclusively with the official `twitter-api-v2` SDK. Zero browser automation, zero cookie injection, and zero unauthorized web scraping.
- **OAuth 2.0 with PKCE:** User-context authentication with 5 standard scoped permissions: `dm.read`, `dm.write`, `users.read`, `tweet.read`, `offline.access`.
- **Background Token Auto-Refresh:** Automatically refreshes expiring access tokens (< 10 min window) via refresh token rotation persisted into SQLite (`XAuthConnection`).
- **Dynamic Redirect URI:** Calculated dynamically per request from `x-forwarded-proto`/`protocol` and `x-forwarded-host`/`host` (zero dependency on a static env `X_REDIRECT_URI`).

### 2. Resilient Hybrid Discovery & Automatic 402 Fallback
- **Target Segment & Seed Accounts:** Supports searching by target technology domain or expanding outward from seed `@handle` builders.
- **Resilient Fallback Engine:** Detects X API `HTTP 402 Payment Required` (credits depleted) or rate limits without crashing the session.
- **Exa Search API Integration:** Seamlessly switches Discovery to **Exa Search API** (`EXA_API_KEY`) to extract genuine public technical posts and verifiable profile handles.
- **3 User-Selectable Discovery Modes:**
  1. `Auto: X API ➔ Exa Fallback` (Recommended for production continuity)
  2. `Exa Only (Free Tier)` (Cost-free search using Exa's 1,000 monthly free searches)
  3. `X API Only` (Direct X API tweet search)

### 3. Evidence-Grounded Multi-LLM Engine & Tailored Drafting
- **Strict Structured JSON Outputs:** Evaluates each profile using **Google Gemini 3.5 Flash** (`gemini-3.5-flash` with fallback to `gemini-3.5-flash-lite` via `@google/genai` v1beta) or optional providers (Anthropic Claude, xAI Grok, OpenAI).
- **Zero Hallucination Guarantee:** Assigns an objective Fit Score (1–10) and mandates a verbatim `evidenceQuote` directly from the candidate's public technical posts, complete with a clickable source URL.
- **Tailored Outreach Drafting:** Generates an authentic direct message strictly capped at $\le 450$ characters.
- **Tone Selector & Value Prop Editor:** Operators can switch between `Warm`, `Direct`, and `Formal` tones, customize the GenAI Fund value proposition (e.g., highlighting GPU compute grants or seed funding), and hit **Regenerate Draft** in 1 click.

### 4. Multi-Layer Safety Gates & Operational Guardrails
- **Daily Send Cap (`DAILY_DM_LIMIT`):** Enforces a conservative daily outbound message limit (default 25 DMs/day) tracked against SQLite message logs, complete with a live UI counter badge (`API Quota: X/300`).
- **Sandbox Safety Gate (`ALLOWED_TEST_HANDLES`):** In development mode (`NODE_ENV !== 'production'`), outbound DMs are strictly blocked unless the recipient is explicitly declared in the sandbox whitelist.
- **Zero-Duplicate Gate:** Cross-references database candidate status, message logs (`SENT`), and live X conversation history to guarantee no candidate ever receives a redundant message.
- **Attention Inbox (`/inbox`):** Synchronizes incoming DM replies, flags conversations with a `Needs Attention` badge for immediate partner intervention, provides 1-click `Mark as Resolved`, and enables 1-click **Export CSV** for CRM integration.

---

## 2. Platform Boundaries & Known Limitations

In direct alignment with the assignment guidelines (*"Make limitations and blocked actions clear. A narrow, reliable version is better than a broad, unfinished one."*), the following boundaries apply to this prototype:

1. **Live DM Sending requires Paid X API Credits (HTTP 402 Boundary):**
   - All dispatch logic, OAuth 2.0 PKCE authentication, token auto-refresh, and deduplication gates are 100% written, wired, and verified via our offline test suite (`npm run test:run`).
   - On personal developer accounts with \$0 Pay-per-use credits, calling X API's `POST /2/dm_conversations/with/:participant_id/messages` returns `HTTP 402 Payment Required: credits depleted`.
   - The system captures this gracefully and displays an informative alert. Connecting an X Developer App with active Pay-per-use credits immediately enables live DM dispatch without any code changes.
2. **Polling-based DM Synchronization:**
   - Incoming replies in `/inbox` are fetched on demand via the *"Sync Replies"* button (`GET /2/dm_events`). Real-time push webhooks (X Account Activity API) require an Enterprise subscription and a public HTTPS endpoint.
3. **Single Authenticated Account Scope:**
   - The current prototype supports one authenticated X account at a time. Multi-account rotation to distribute daily limits across multiple fund partners is reserved for the next iteration.
4. **Intentional Anti-Spam Guardrail (No Automated Drip Sequences):**
   - Automated multi-message drip sequences are intentionally omitted to uphold GenAI Fund's reputation, prevent account flags, and keep all follow-up decisions human-in-the-loop.

---

## 3. 15-Minute Local Setup Guide

The prototype is completely self-contained and runs with a single command. No external services or Docker containers are required.

### Prerequisites
- Node.js 20+ (LTS recommended)
- npm or pnpm

### Step 1: Clone Repository & Install Dependencies
```bash
git clone https://github.com/PeoPeo-1712/genai-outreach-prototype.git
cd genai-outreach-prototype
npm install
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Open `.env` and fill in your keys:
```env
# Database (SQLite local file)
DATABASE_URL="file:./dev.db"

# Google Gemini API (Free tier at https://aistudio.google.com)
GEMINI_API_KEY="AIzaSy..."

# Exa.ai API Key (Optional: 1,000 free searches/month at https://exa.ai)
EXA_API_KEY="your_exa_api_key"

# X (Twitter) Developer App (OAuth 2.0 User-Context)
X_CLIENT_ID="your_oauth2_client_id"
X_CLIENT_SECRET="your_oauth2_client_secret"

# Sandbox Safety Gate (Comma-separated test handles; leave empty for production)
ALLOWED_TEST_HANDLES="shinozshin"

# Daily Outbound DM Limit
DAILY_DM_LIMIT="25"
```

### Step 3: Initialize SQLite Database
```bash
npx prisma db push
npx prisma generate
```

### Step 4: Run Smoke Tests (Zero API Credits Used)
Verify all scoring heuristics, sandbox gates, and deduplication logic offline:
```bash
npm run test:run
```
*(All 4 verification checks should pass immediately).*

### Step 5: Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser:
1. Click **"Connect X (Twitter)"** on the top navigation bar to authenticate via OAuth 2.0 PKCE.
2. Navigate to **Dashboard** (`/dashboard`) to run candidate scouting.
3. Navigate to **Inbox** (`/inbox`) to sync incoming replies and manage outreach threads.

### Maintenance Utilities
- **Reset/Clean Database:** `npm run db:clean` (Cleans candidate and message tables while preserving active X OAuth tokens).
- **Prisma Studio:** `npm run db:studio` (Visual database inspector at `http://localhost:5555`).

---

## 4. X Developer Portal Configuration

To connect your X account and enable DM read/write permissions:

1. Log in to the [X Developer Portal](https://developer.x.com).
2. Create a **Project** and an **App** inside it.
3. Under **User authentication settings**, click **Set up** (or **Edit**):
   - **App permissions:** `Read and write and Direct message`
   - **Type of App:** `Web App, Automated App or Bot` (Confidential Client)
   - **Callback URI / Redirect URL** (register both for local development):
     ```
     http://localhost:3000/api/auth/x/callback
     http://127.0.0.1:3000/api/auth/x/callback
     ```
   - **Website URL:** `http://localhost:3000` (or your company URL)
4. Save settings and copy your **Client ID** and **Client Secret** into `.env`.

---

## 5. Estimated Operating Costs

Estimated monthly expenses to discover ~200 candidates and conduct ~50 approved outreach conversations per month:

| Service / Component | Usage Tier | Estimated Monthly Cost |
| :--- | :--- | :--- |
| **X API v2** | Pay-per-use / Basic Tier | ~$100.00 / month |
| **Google Gemini (`gemini-3.5-flash`)** | ~200 evaluations (~150k tokens) | **Free Tier ($0.00)** / < $0.05 |
| **Exa Search API** | 200 hybrid searches (1,000 free/month) | **Free Tier ($0.00)** |
| **Database & Hosting** | Local SQLite / Next.js Vercel/Fly.io | **$0.00 / month** |
| **Total Estimated Operating Cost** | — | **~$100.00 / month** |

---

## 6. Project Structure

```
genai-outreach-prototype/
├── prisma/
│   └── schema.prisma              # SQLite schema (Candidate, Message, RateLimitLog, XAuthConnection)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/x/            # OAuth 2.0 PKCE connect, callback, and status routes
│   │   │   ├── candidates/        # List, patch drafts, /export CSV, /regenerate draft
│   │   │   ├── discovery/         # Target Segment, Seed expansion, and Exa 402 fallback
│   │   │   └── outreach/          # POST /send (safe dispatch) and POST /sync (reply sync)
│   │   ├── dashboard/             # Main scout, evaluation, and draft review UI
│   │   ├── inbox/                 # Attention inbox, reply feed, and resolution management
│   │   ├── layout.tsx             # Root layout with HeaderNav and live rate limit badges
│   │   └── page.tsx               # Entry portal with architecture & safety overview
│   ├── components/
│   │   ├── CandidateCard.tsx      # Candidate evaluation card with evidence quotes & X profile link
│   │   ├── HeaderNav.tsx          # Navigation bar with connection pill & sandbox indicators
│   │   ├── MessageDraftEditor.tsx # 450-char draft editor with tone & value prop controls
│   │   ├── RateLimitBadge.tsx     # Live API quota and daily DM cap tracker
│   │   └── ReplyFeed.tsx          # Conversational thread view with 1-click Mark Resolved
│   ├── lib/
│   │   ├── prisma.ts              # Prisma Client singleton
│   │   ├── utils.ts               # Tailwind CSS class helper
│   │   └── x-client.ts            # Authenticated TwitterApi client & token refresh resolver
│   ├── scripts/
│   │   ├── clean-db.ts            # Database purge script (preserves OAuth token)
│   │   └── test-run.ts            # Automated offline smoke test suite
│   ├── services/
│   │   ├── AIScoringService.ts    # Multi-LLM scoring engine with structured JSON schema
│   │   ├── DiscoveryService.ts    # Hybrid scout engine with automatic 402 Exa fallback
│   │   └── OutreachService.ts     # DM dispatch with deduplication, daily cap & 402/403/429 handling
│   └── types/
│       └── index.ts               # Core TypeScript DTOs & data interfaces
├── .env.example                   # Complete configuration template (zero secrets)
├── package.json                   # Scripts (dev, build, test:run, db:clean, db:studio)
└── README.md                      # Comprehensive system documentation
```

---

## 7. Automated Test Suite

To run the offline test suite and verify system safety without consuming live API credits or sending messages:

```bash
npm run test:run
```

**Verified Test Suites:**
- **Test 1 (Evidence-Grounded AI Scoring):** Validates structured JSON schema output, Fit Score calculation (1–10), and verbatim evidence extraction.
- **Test 2 (Sandbox Safety Gate):** Confirms that outbound messages to unauthorized test handles are blocked.
- **Test 3 (Deduplication Gate):** Confirms that duplicate messages to already-contacted candidates are halted.
- **Test 4 (Database Cleanup):** Cleans up ephemeral test records upon completion.

---

## 8. License

MIT License. Developed for the GenAI Fund Forward Deployed Engineer (FDE) Evaluation.
