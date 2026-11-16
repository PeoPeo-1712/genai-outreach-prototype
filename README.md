# GenAI Fund — AI & Robotics Talent Scout & Outreach Platform

A production-grade, human-in-the-loop talent intelligence and outreach system built for **GenAI Fund** to discover, evaluate, and engage AI & Robotics builders, founders, and researchers across Southeast Asia (Vietnam, Singapore, Indonesia, Thailand, Malaysia, and regional hubs) on **X (formerly Twitter)**.

---

## 1. Architecture & Safety Highlights

1. **Official X API v2 Integration (No Scraping):**
   - Built exclusively with the official `twitter-api-v2` SDK.
   - User-context **OAuth 2.0 PKCE** with 5 standard scopes: `dm.read`, `dm.write`, `users.read`, `tweet.read`, `offline.access`.
   - **Background Token Auto-Refresh**: Seamlessly rotates expiring access tokens (< 10 min window) via refresh token rotation persisted into SQLite (`XAuthConnection`).
   - **Dynamic Redirect URI**: Calculated dynamically per request from `x-forwarded-proto`/`protocol` and `x-forwarded-host`/`host` (zero dependency on a static env `X_REDIRECT_URI`).

2. **Automatic 402 Fallback & Exa Hybrid Search:**
   - Detects X API `HTTP 402 Payment Required` (credits depleted) without crashing.
   - Seamlessly switches Discovery to **Exa Search API** (`EXA_API_KEY`) to extract technical posts and verbatim quotes.
   - Supports 3 user-selectable discovery modes: `Auto: X API ➔ Exa Fallback`, `Exa Only (Free Tier)`, and `X API Only`.

3. **Multi-LLM Provider Engine with Cross-Platform Structured Outputs:**
   - Flexible provider selection via `LLM_PROVIDER`: supports **Google Gemini** (`@google/genai`), **Anthropic Claude** (`@anthropic-ai/sdk`), **xAI Grok**, and **OpenAI**.
   - Auto-detection priority: `gemini` ➔ `anthropic` ➔ `xai` ➔ `openai`.
   - Cross-provider schema compliance (omits `minimum`/`maximum`/`minLength`/`maxLength` rejected by Anthropic; enforces `additionalProperties: false` and explicit `required`).
   - Value sanitizer clamps `fitScore` (1–10) and ensures `draftMessage <= 450` characters.
   - Clear `LLM_QUOTA_EXHAUSTED` error mapping for 429 quota exhaustion.

4. **Multi-Layer Safety Gates & Operational Guardrails:**
   - **Daily Send Cap**: Enforces `DAILY_DM_LIMIT` (default 25 DMs/day) from SQLite logs with live UI counters (`Sent Today: X / 25`).
   - **Sandbox Safety Gate**: In development (`NODE_ENV !== 'production'`), outbound DMs are strictly blocked unless candidate is in `ALLOWED_TEST_HANDLES`.
   - **Zero-Duplicate Gate**: Prevents re-messaging candidates across relational message logs and DM event history.
   - **Tone Selector & Value Prop Editor**: Choose between `Warm`, `Direct`, or `Formal` tone and customize the GenAI Fund value proposition when generating or regenerating drafts.
   - **CSV Export**: 1-click export of candidates and outreach status from SQLite.

---

## 2. Prerequisites & X Developer Portal Setup

To send and sync DMs via X API v2:
1. Log in to the [X Developer Portal](https://developer.x.com).
2. Create or navigate to your **Project** (your App must live inside a Project).
3. Ensure your App environment is set to **Production** (Pay-per-use or Pro tier).
4. Under **User authentication settings**, click **Set up** (or **Edit**):
   - **App permissions**: `Read and write and Direct message`
   - **Type of App**: `Web App, Automated App or Bot` (Confidential Client)
   - **Callback URI / Redirect URL** (register both for local dev):
     ```
     http://localhost:3000/api/auth/x/callback
     http://127.0.0.1:3000/api/auth/x/callback
     ```
   - **Website URL**: `http://localhost:3000` (or your company domain)
   - **Terms of Service**: `http://localhost:3000/tos`
5. Save changes and copy your **Client ID** and **Client Secret**.

---

## 3. 15-Minute Local Setup

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Configure your keys:
```env
DATABASE_URL="file:./dev.db"

# Google Gemini API
GEMINI_API_KEY="AIzaSy..."

# Optional Free-Tier Search Fallback
EXA_API_KEY="your_exa_api_key"

# X Developer App
X_CLIENT_ID="your_oauth2_client_id"
X_CLIENT_SECRET="your_oauth2_client_secret"

# Sandbox test handle (leave empty for production outreach)
ALLOWED_TEST_HANDLES="your_test_handle"
DAILY_DM_LIMIT="25"
```

### Step 3: Initialize SQLite Database
```bash
npx prisma db push
npx prisma generate
```

### Step 4: Run Smoke Tests (Zero API Credits Used)
```bash
npx tsx src/scripts/test-run.ts --mock-ai
```

### Step 5: Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) and click **"Connect X Account"** in the top navigation bar to complete OAuth 2.0 PKCE.

---

## 4. Estimated Operating Costs

Estimated monthly operating expenses for scouting ~200 candidates and sending ~50 approved DMs per month:

| Service / Resource | Usage Tier | Estimated Cost |
| :--- | :--- | :--- |
| **X API v2** | Pay-per-use / Basic Tier | ~$100 / mo |
| **Google Gemini (`gemini-2.5-flash`)** | ~200 evaluations (~150k tokens) | **Free Tier ($0)** / < $0.05 |
| **Anthropic Claude (Optional fallback)** | ~200 evaluations with Claude 3.5 | < $0.50 / mo |
| **Exa AI Search** | 200 searches (1,000 free searches/month) | **Free Tier ($0)** |
| **Database & Hosting** | Local SQLite / Fly.io / Vercel | **$0 / mo** |
| **Total Estimated Cost** | — | **~$100 / mo** |

---

## 5. Project Structure

```
├── prisma/
│   └── schema.prisma            # SQLite models (Candidate, Message, RateLimitLog, XAuthConnection)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/x/          # OAuth 2.0 connect, callback, and status routes
│   │   │   ├── candidates/      # GET candidates, PATCH drafts, /export CSV, /regenerate draft
│   │   │   ├── discovery/       # POST discovery (Segment, Seeds, Exa 402 Fallback)
│   │   │   └── outreach/        # POST /send (safe DM dispatch), POST /sync (reply sync)
│   │   ├── dashboard/           # Main talent scout & review interface
│   │   ├── inbox/               # Bi-directional reply feed (Needs Attention & Sent History)
│   │   ├── layout.tsx           # Global shell with live HeaderNav & RateLimitBadge
│   │   └── page.tsx             # Hub Portal with quick launch and safety overview
│   ├── components/
│   │   ├── CandidateCard.tsx    # Candidate card with evidence quote & 403 banner
│   │   ├── HeaderNav.tsx        # Navigation with live X connection pill & unread counter
│   │   ├── MessageDraftEditor.tsx # 450-char draft editor with tone & value prop controls
│   │   ├── RateLimitBadge.tsx   # Live API quota counter & Daily Send Cap monitor
│   │   └── ReplyFeed.tsx        # Conversation thread with 1-click Mark Resolved
│   ├── lib/
│   │   ├── prisma.ts            # Prisma client singleton
│   │   ├── utils.ts             # Tailwind class merger
│   │   └── x-client.ts          # Authenticated X client resolver & rate limit recorder
│   ├── scripts/
│   │   └── test-run.ts          # Automated test suite
│   ├── services/
│   │   ├── AIScoringService.ts  # Multi-LLM provider engine (Gemini, Claude, Grok, OpenAI)
│   │   ├── DiscoveryService.ts  # Hybrid discovery with automatic 402 Exa fallback
│   │   └── OutreachService.ts   # Safe DM dispatch with daily cap, deduplication, 402/403/429 handling
│   └── types/
│       └── index.ts             # Unified TypeScript DTOs & interfaces
```
