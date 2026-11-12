<div align="left">

# PayPal AI

### Describe your business. Let AI build the store and the automations, all on PayPal.

![App Preview](App_preview/Screenshot_2026-11-12-12-27-36-190_com.android.chrome.png)


An AI-native commerce studio built on the **PayPal Developer Platform**: generate a hosted PayPal-checkout web store from a chat, and wire up post-purchase automations with a visual workflow builder.

[![PayPal AI Hackathon 2026](https://img.shields.io/badge/PayPal%20AI%20Hackathon-2026-0070BA?style=for-the-badge&logo=paypal&logoColor=white)](https://paypalaihackathon.devpost.com/)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg?style=for-the-badge)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A518-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Deployed on Render](https://img.shields.io/badge/Backend-Render-46E3B7?style=for-the-badge&logo=render&logoColor=white)](https://render.com/)

![PayPal](https://img.shields.io/badge/PayPal-Orders%20v2%20%7C%20Webhooks-003087?logo=paypal&logoColor=white)
![Groq](https://img.shields.io/badge/AI-Groq%20%C2%B7%20gpt--oss--120b-F55036)
![Cloudinary](https://img.shields.io/badge/Images-Cloudinary-3448C5?logo=cloudinary&logoColor=white)
![Supabase](https://img.shields.io/badge/Database-Supabase-3FCF8E?logo=supabase&logoColor=white)
![Firebase](https://img.shields.io/badge/Auth-Firebase-FFCA28?logo=firebase&logoColor=black)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)

[**Live Demo**](https://paypal-ai-gilt.vercel.app/) · [**Demo Video**](https://youtu.be/4BLro144avc?si=NgpWxviou1LUIUTU). [**Report a Bug**](../../issues)

</div>

> **Note for judges:** everything runs against the **PayPal Sandbox**. No real money moves. The backend hard-codes `https://api-m.sandbox.paypal.com`, so live credentials can never be used by mistake.

---

## Table of Contents

1. [Overview](#overview)
2. [The Problem](#the-problem)
3. [Our Solution](#our-solution)
4. [Features](#features)
5. [How It Works](#how-it-works)
6. [Architecture](#architecture)
7. [Tech Stack & Integrations](#tech-stack--integrations)
8. [Hackathon Alignment](#hackathon-alignment)
9. [Getting Started](#getting-started)
10. [Environment Variables](#environment-variables)
11. [Deployment](#deployment)
12. [API Reference](#api-reference)
13. [Security](#security)
14. [Project Structure](#project-structure)
15. [Roadmap](#roadmap)
16. [Contributing](#contributing)
17. [License](#license)
18. [Acknowledgements](#acknowledgements)

---

## Overview

**PayPal AI** is a single web app with three connected modules that cover the full life of a small online business:

| # | Module | What it does |
|---|--------|--------------|
| 1 | **Web Store Builder + Site Agent** | Chat with an AI agent to generate, edit and publish a real store with PayPal checkout. |
| 2 | **Workflow Builder + Flow Assistant** | Drag-and-drop automations that fire on PayPal events, with an AI assistant that builds the flow for you. |
| 3 | **Store Manager** | A ledger and activity view of money in and out (B2B, B2C, C2B, G2C) fed by your automations. |

It was built for the **[PayPal AI Hackathon 2026 — "Build What's Next with PayPal and AI"](https://paypalaihackathon.devpost.com/)**, where the one hard requirement is that a project **meaningfully uses both PayPal and AI**. Here, PayPal is not a bolt-on: it is the payment rail, the event source and the data the AI reasons over.

---

## The Problem

Small merchants and solo founders lose time on two things that PayPal alone does not automate:

- **Getting online.** Building a store, writing copy, hosting it and wiring checkout takes days.
- **Reacting to payments.** Receipts, refunds, fraud checks, team alerts and bookkeeping are manual copy-paste work across five tools.

## Our Solution

PayPal AI puts an **agent in front of PayPal**. You describe what you want in plain language; the agent edits a *private copy* of your store or workflow through **validated tools**, shows you every step it took, and asks for your **explicit approval** before anything is published or any money moves.

---

## Features

### 1. Web Store Builder & Site Agent ("Build with AI")

- **One-prompt store generation.** Describe a business and the agent writes the whole site: brand, tagline, announcement bar, hero, 3-4 feature highlights, 6-8 products, About, FAQs and footer.
- **Conversational editing.** "Make it darker", "add a candle for $18", "switch to euros", "turn on the wishlist". The agent calls typed tools such as `set_theme`, `upsert_product`, `set_commerce` and `set_plugins`.
- **Transparent agent.** The chat streams the agent's one-line plan, each tool call with its inputs, and what each call changed. Every turn is applied with **one-click Undo**.
- **Hosted storefronts.** Each published store is served from `/s/:id` with server-side rendered, escaped HTML.
- **Real PayPal checkout.** Orders are created and captured through **PayPal Orders v2** entirely in the backend, with a return URL flow back to the store.
- **Per-store payment gateway.** A merchant can connect their own sandbox app. Credentials are encrypted at rest (AES-256-GCM).
- **Store plugins** you can toggle by chat: sidebar menu, wishlist, app-style navigator, PayPal buttons, Pay Later, card button and QR code.
- **Photo upload with Cloudinary.** Merchants upload up to 4 product photos at a time; images are optimised automatically (see [Cloudinary](#cloudinary--product-image-storage-and-delivery)).
- **Safe by design.** Every tool result passes through `sanitizeSpec()`, so the output is always a valid, escaped, renderable store. The agent cannot publish by itself (it can only *request* approval).

### 2. Workflow Builder & Flow Assistant

- **35 node types** across triggers, AI, logic and actions.
- **Triggers:** Web Store Order, Payment Received, Refund Issued, Dispute Opened, Subscription Paid, Scheduled (cron).
- **AI nodes:** Risk Score, Fraud Detection, Document Verification, Customer Segmentation, Data Extraction, AI Email Draft.
- **Logic:** Condition (Yes/No branches) and Delay.
- **PayPal API actions:** Capture Payment, Issue Refund, Fetch Balance, Get Order Details, Get Capture Details, Create Order, Transaction Search, Dispute Details.
- **Notification actions:** Telegram, Slack, Discord and Email.
- **Documents:** Receipt Generator (server-built **PDF invoice**), Telegram: Send Receipt, Email Receipt.
- **Bookkeeping:** Database Log, Record in Store Manager, Update Customer, Manual Review, Flag Transaction, Set Field (reusable `{{variables}}`).
- **Flow Assistant.** A tool-calling agent that builds and edits your workflow from a sentence. It **never moves money** (test runs are dry runs) and **never sees pasted bot tokens**: Telegram tokens are verified and sealed on the server *before* the model is called.
- **Durable automations.** Workflows and receipts are saved to Supabase and restored on server start, so a Render restart never silently deletes your automation.

### 3. Store Manager

A AI powered ledger and activity view of your business. Workflow runs write their payments here as money in or out, tagged **B2B / B2C / C2B / G2C**. Test runs never write to your books with chat feature for asking questions about your business sales and revenue etc.

### 4. Production Features

- PayPal **webhook signature verification** for incoming events.
- **Rate limiting** on sensitive endpoints (connect, upload, email tests, Telegram).
- **Secret scrubbing** (API keys and bot tokens are redacted from chat before they reach any model or log).
- **Model fallback chain and key rotation** for AI calls, so a rate limit on one model does not break the app.
- **Full audit trail** of every Site Agent turn (request, tool calls, store before/after hashes, generated artifact).

---

## How It Works

```mermaid
sequenceDiagram
    autonumber
    actor M as Merchant
    participant UI as Web App
    participant AG as Site Agent (Groq)
    participant API as Express API (Render)
    participant PP as PayPal Sandbox
    actor S as Shopper

    M->>UI: "Build me a candle shop, prices in USD"
    UI->>API: POST /api/sa/chat (streamed)
    API->>AG: tool-calling loop on a COPY of the store
    AG-->>API: replace_site, set_theme, upsert_product...
    API-->>UI: live steps + final store (Undo available)
    M->>UI: Approve & publish
    UI->>API: POST /api/store/publish
    API-->>M: Hosted store at /s/:id
    S->>API: Checkout
    API->>PP: Create order (Orders v2)
    PP-->>S: Approve payment
    S->>API: Return URL → capture
    PP-->>API: PAYMENT.CAPTURE.COMPLETED webhook
    API->>API: Run automation (receipt PDF, email, Telegram, ledger)
```

---

## Architecture

```mermaid
flowchart LR
    subgraph Client["Frontend (Vercel) — vanilla JS, no build step"]
        UI["index.html<br/>Dashboard · Builder · Manager"]
        SA["ai-agent.js<br/>Site Agent UI"]
    end

    subgraph Server["Backend (Render) — Node.js + Express"]
        SRV["server.js<br/>App bootstrap · Routing"]
        FLOW["flow.js<br/>Workflow engine · Webhooks · Scheduler"]
        AGT["agent.js<br/>Flow Assistant"]
        STORE["store.js<br/>Store renderer · Checkout"]
        SITE["siteagent/<br/>Tool-calling Site Agent"]
        SYNC["sync.js<br/>Firebase ⇄ Supabase"]
    end

    subgraph Ext["External services"]
        PP[("PayPal<br/>Orders · Refunds · Webhooks")]
        GROQ[("Groq LLMs")]
        CLD[("Cloudinary")]
        SUPA[("Supabase")]
        FB[("Firebase Auth")]
        RS[("Resend")]
        TG[("Telegram · Slack · Discord")]
    end

    UI --> SRV & FLOW & AGT & STORE & SITE
    SA --> SITE
    FLOW --> PP & RS & TG & SUPA
    AGT --> GROQ
    SITE --> GROQ & CLD & SUPA
    STORE --> PP
    SYNC --> FB & SUPA
    UI --> FB
    PP -- webhooks --> FLOW
```

**Design principles**

1. **Agents edit copies, humans approve.** AI tools operate on a private copy of the spec; publishing needs an explicit tap.
2. **Validate everything.** Every agent output is re-validated against the same sanitizer the renderer uses.
3. **Degrade gracefully.** Without a database key, storage falls back to local files. Optional integrations are disabled individually without breaking the rest of the app.
4. **Sandbox only.** PayPal base URL is fixed to the sandbox.

---

## Tech Stack & Integrations

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JavaScript, HTML/CSS (single-file app, no build step), hosted on **vercel** |
| Backend | **Node.js ≥ 18**, **Express 4**, ES Modules |
| Payments | **PayPal** Orders v2, Webhooks, Refunds, Disputes, Transaction Search (Sandbox) |
| AI | **Groq** (`openai/gpt-oss-120b` default, with `gpt-oss-20b`, `qwen3` and `llama-3.3-70b` fallbacks) |
| Hosting | **Render** (API), **vercel** (UI) |
| Notifications | Slack, Discord, Telegram Bot API |
| Email | **Resend** |
| Images | **Cloudinary** |
| Database | **Supabase** (PostgREST) |
| Auth | **Firebase Authentication** |

### PayPal

PayPal is the payment rail *and* the event source for the whole app.

| PayPal capability | Where it is used |
|---|---|
| **Orders v2** (create + capture) | Customer checkout on every published store, and the *Create Order* / *Capture Payment* workflow nodes. |
| **Webhooks** (`PAYMENT.CAPTURE.COMPLETED`, refunds, disputes, subscriptions) | Trigger user-built automations. Signatures are verified with PayPal's `verify-webhook-signature`. |
| **Refunds** | *Issue Refund* workflow node. |
| **Disputes** | *Dispute Opened* trigger and *Dispute Details* node. |
| **Transaction Search & Balances** | *Fetch Balance* and *Transaction Search* nodes. |
| **Bring-your-own sandbox app** | Merchants connect their own client ID/secret from the UI. Secrets are held in memory (flows) or encrypted at rest (stores) and are never returned to the browser. |

### Groq

Groq's low-latency inference makes tool-calling agents feel instant. It powers two components:

- **Site Agent:** builds and edits stores through ~17 typed tools in a loop of up to 14 steps.
- **Flow Assistant:** builds workflows through validated tools, up to 30 steps.

The loop rotates across models and API keys, handles rate limits (429), oversized requests and network errors, and waits and retries once if everything is cooling down. Reasoning effort is configurable (`low`, `medium`, `high`).

### Render

The Express API is deployed as a **Render Web Service** (`https://paypal-ai-backend.onrender.com`). Render provides:

- Zero-config Node deploys from GitHub with HTTPS out of the box.
- A stable public URL, which PayPal needs to deliver **webhooks** to `/webhooks/paypal`.
- Environment-variable management for every secret in this project.
- Because Render restarts services, all automations and receipts are **persisted to Supabase and rehydrated on boot**.

> On Render's free tier a service sleeps when idle. Scheduled workflows only run while the server is awake, so use a paid instance (or an uptime pinger) for production schedules.

### Cloudinary — product image storage and delivery

Merchants upload product photos from the Site Agent chat. Cloudinary keeps **secrets off the browser** and published stores fast:

- **Signed server-side uploads.** The browser sends the image to `/api/sa/upload`; the server signs the request (SHA-1) with the API secret and uploads to Cloudinary. Only the resulting URL is returned.
- **Organised storage** in the `paypal-ai/site-agent` folder.
- **Automatic optimisation.** Returned URLs are rewritten with `f_auto,q_auto,w_1000`, so Cloudinary serves the best format (WebP/AVIF where supported), automatic quality and a 1000px maximum width.
- **Guard rails.** Max 4 images per request, JPEG/PNG/WebP/GIF only, size-capped, rate-limited to 30 requests per minute.
- **Flexible config.** Use `CLOUDINARY_URL` or the three individual variables.

### Supabase — durable storage

Supabase (via its REST API with a server-only service-role key) stores:

| Table | Purpose |
|---|---|
| `ppai_flow_workflows` | Saved automations (restored on restart). |
| `ppai_receipts` | Generated PDF receipts, so old receipt links keep working. |
| `ppai_published_stores` | Published store specs. |
| `ppai_ai_chat_runs` | Audit log of each Site Agent turn. |

If no key is set, every database helper is a safe no-op and the app keeps working from local files.

### Firebase Authentication

Users sign in with Firebase Auth in the browser. `POST /api/auth/claim` verifies the Firebase ID token and adds the custom claim `role: "authenticated"`, which lets **Supabase Third-Party Auth** accept the same token. A one-off script, `backfill-users.mjs`, migrates existing users.

### Resend, Telegram, Slack & Discord — notifications

- **Resend** delivers transactional email, including the PDF receipt.
- **Telegram** bots send alerts and receipts (tokens are verified with `getMe` and encrypted at rest).
- **Slack** and **Discord** use incoming webhooks.

---

## Hackathon Alignment

| Judging criterion | How PayPal AI delivers |
|---|---|
| **Technological Implementation** | Orders v2, Webhooks (with signature verification), Refunds, Disputes and Transaction Search; multi-model tool-calling agents with fallback and key rotation; encrypted credentials; durable persistence; PDF receipts; cron scheduler. |
| **Design** | One coherent dashboard across store building, automation and bookkeeping; stores themed by AI with live preview, undo and step-by-step transparency. |
| **Potential Impact** | Lets non-technical merchants launch a PayPal-powered store and automate fulfilment, fraud checks and bookkeeping in minutes. |
| **Innovation / Idea** | *Agents that act on PayPal safely:* they edit copies, explain every step, and need human approval to publish or pay. |
| **Presentation** | Public repo, hosted demo, setup instructions, and a demo video under 3 minutes. |

**Special awards this project targets:** Best Use of PayPal + AI · Best Use of Agentic Commerce · Best Use of Render · Most Impactful.

**Sponsor tools used:** Render (hosting).

---

## Getting Started

### Prerequisites

- **Node.js 18 or newer** and npm
- A free **[PayPal Developer](https://developer.paypal.com/)** account with a **Sandbox REST app** (client ID and secret)
- A **[Groq](https://console.groq.com/)** API key (free tier works)
- Optional: Cloudinary, Supabase, Firebase, Resend and Telegram credentials (each feature degrades gracefully without them)

### 1. Clone

```bash
git clone https://github.com/<your-username>/paypal-ai.git
cd paypal-ai
```

### 2. Configure the backend

```bash
cd backend
cp .env.example .env
# open .env and fill in at least PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and GROQ_API_KEY
npm install
```

### 3. Run the backend

```bash
npm start
# → listening on http://localhost:3000   (or the PORT you set)
curl http://localhost:3000/api/health
```

### 4. Run the frontend

The frontend is a static, build-free app (`index.html` + `ai-agent.js`). Serve the repository root with any static server:

```bash
# from the repo root
npx serve .
```

Then point the frontend at your backend: search `index.html` for `paypal-ai-backend.onrender.com` and replace it with `http://localhost:3000` for local development.

### 5. Quick start walkthrough

1. Sign in, open **Build with AI**, and type: *"A small-batch candle shop with 6 products, prices in USD."*
2. Review the agent's steps, then **Approve & publish**.
3. Open the store link, add a candle to the cart and pay with a **PayPal sandbox buyer** account.
4. Open **Workflow Builder** and ask the Flow Assistant: *"When a store order comes in, make a PDF receipt, email it to the buyer and log it."*

### Webhook testing (local)

PayPal needs a public URL to deliver webhooks. Expose your local server with a tunnel (for example `ngrok http 3000`), then in **developer.paypal.com → your sandbox app → Webhooks** add `https://<tunnel>/webhooks/paypal` and copy the **Webhook ID** into `PAYPAL_WEBHOOK_ID`.

---

## Environment Variables

Copy `backend/.env.example` to `backend/.env`. Never commit real secrets.

| Variable | Required | Purpose |
|---|:---:|---|
| `PORT` | No | Server port (default `3000`). |
| `ALLOWED_ORIGIN` | Yes | Frontend origin allowed by CORS (e.g. `https://your-app.netlify.app`). |
| `PUBLIC_API_URL` | Yes | Public backend URL, used for return URLs and webhooks. |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | Yes | PayPal **Sandbox** app credentials. |
| `PAYPAL_WEBHOOK_ID` | Yes | Webhook ID for signature verification. |
| `GROQ_API_KEY` | Yes | AI features. `GROQ_API_KEYS` accepts a comma-separated list for rotation. |
| `GROQ_MODEL`, `AGENT_MODEL`, `SITE_AGENT_MODEL` | No | Override default models. |
| `CLOUDINARY_URL` *or* `CLOUDINARY_CLOUD_NAME` + `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET` | No | Product photo uploads. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | No | Durable storage (server-side only). |
| `FIREBASE_SERVICE_ACCOUNT` | No | Service-account JSON (raw or base64) for `/api/auth/claim`. |
| `RESEND_API_KEY`, `EMAIL_FROM` | No | Email and PDF receipts. |
| `TELEGRAM_BOT_TOKEN` | No | Default Telegram alerts bot. |
| `SLACK_WEBHOOK_URL`, `DISCORD_WEBHOOK_URL` | No | Chat alerts. |
| `STORE_SECRET` | Yes (production) | Passphrase used to encrypt per-store gateway credentials. |

---

## Deployment

### Backend on Render

1. Push this repository to GitHub.
2. In Render, create a **New → Web Service** and connect the repo.
3. Set **Root Directory** to `backend`, **Build Command** to `npm install`, **Start Command** to `npm start`.
4. Add the environment variables from the table above.
5. Copy the Render URL into `PUBLIC_API_URL`, and register `https://<render-url>/webhooks/paypal` in your PayPal sandbox app.
6. Verify with `GET /api/health`.

### Frontend on vercel

1. Create a new vercel site from the same repo with **no build command** and the repo root as the publish directory.
2. Update the API base URL in `index.html` to your Render URL.
3. Set `ALLOWED_ORIGIN` on Render to your Vercel domain.

---

## API Reference

All routes are served by the Express backend. A few are also available without the `/api` prefix for legacy compatibility.

<details>
<summary><strong>Workflows (Flow engine)</strong></summary>

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/flow/connect` · `/disconnect` | Connect or remove a user's PayPal sandbox app. |
| `POST` | `/api/flow/publish` · `/unpublish` | Activate or deactivate a workflow. |
| `POST` | `/api/flow/run` | Run a workflow (test runs are dry runs). |
| `POST` | `/api/flow/order` | Create a PayPal order from a workflow. |
| `POST` | `/api/flow/agent` | Flow Assistant (tool-calling agent). |
| `GET` | `/api/flow/agent/status` · `/status` · `/selftest` | Health and configuration checks. |
| `GET` | `/api/flow/balance` · `/logs` · `/runs` | Balances, event log and run history. |
| `GET` | `/api/flow/receipt/:id` | Download a generated PDF receipt. |
| `POST` | `/api/flow/tg/connect` · `/tg/test` · `/email/test` | Telegram and email setup and tests. |
| `POST` | `/webhooks/paypal[/:id]` | PayPal webhook receiver (signature-verified). |
| `GET` | `/api/paypal/return` | PayPal return URL handler. |

</details>

<details>
<summary><strong>Web Store</strong></summary>

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/store/ai/generate` · `/ai/edit` | AI store generation and editing. |
| `POST` | `/api/store/preview` · `/publish` | Live preview and publish. |
| `GET` | `/s/:id` | The hosted storefront. |
| `POST` | `/api/store/:id/checkout` | Start a PayPal checkout. |
| `GET` | `/api/store/:id/return` | Capture after PayPal approval. |
| `GET` | `/api/store/:id/status` · `/orders` | Store status and orders. |
| `POST` | `/api/store/:id/gateway/test` · `/live` | Test gateway credentials, toggle live. |
| `GET` | `/api/store/capabilities` | Server capability flags. |
| `DELETE` | `/api/store/:id` | Delete a store. |

</details>

<details>
<summary><strong>Site Agent & Auth</strong></summary>

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/sa/chat` | Streaming Site Agent chat (NDJSON). |
| `GET` / `POST` | `/api/sa/upload` | Cloudinary upload status and signed upload. |
| `GET` | `/api/sa/status` | Agent availability. |
| `POST` | `/api/auth/claim` | Add the `authenticated` claim to a Firebase user. |
| `GET` | `/api/health` | Service health. |

</details>

---

## Security

- **Sandbox-only** PayPal base URL; live credentials cannot work.
- **Secrets stay on the server.** Cloudinary, Supabase service-role, Firebase service account and PayPal secrets are never sent to the browser.
- **Encryption at rest.** Per-store gateway keys and Telegram tokens are sealed with **AES-256-GCM**.
- **Secret scrubbing.** API keys and bot tokens in chat are redacted before reaching a model or a log.
- **Human-in-the-loop.** Agents cannot publish, charge, or send money without explicit approval.
- **Webhook verification.** Incoming PayPal events are checked through PayPal's signature verification API.
- **Input validation.** All AI output passes through a sanitizer; HTML is escaped server-side; uploads are type- and size-checked.
- **Rate limiting** on connect, upload, email-test and Telegram routes.

> Found a vulnerability? Please open a private security advisory on GitHub rather than a public issue.

---

## Project Structure

```
paypal-ai/
├── index.html              # Single-file frontend: dashboard, builders, manager
├── ai-agent.js             # Site Agent chat UI (live steps, undo, photo picker)
├── LICENSE                 # GNU GPL v3
├── env.example             # Quick-reference env keys
└── backend/
    ├── server.js           # Express app, middleware, route mounting
    ├── flow.js             # Workflow engine, PayPal nodes, webhooks, scheduler, receipts
    ├── agent.js            # Flow Assistant (Groq tool-calling agent)
    ├── store.js            # AI store generation, renderer, hosted stores, checkout
    ├── extras.js           # Storefront plugins (sidebar, wishlist, QR, Pay Later...)
    ├── db.js               # Supabase REST helpers (safe no-ops without a key)
    ├── sync.js             # Firebase ⇄ Supabase auth claim
    ├── backfill-users.mjs  # One-off migration script for existing users
    ├── package.json
    ├── .env.example
    └── siteagent/
        ├── loop.js         # Groq tool-calling loop, model/key fallback
        ├── tools.js        # Typed store-editing tools
        ├── vocab.js        # Design vocabulary, verified against the sanitizer
        ├── memory.js       # Per-chat memory
        └── routes.js       # /api/sa/* routes, Cloudinary uploads
```

---

## Roadmap

- [ ] PayPal **Subscriptions** and **Invoicing** nodes
- [ ] AI powered plugins and document handling
- [ ] Team workspaces and role-based access
- [ ] More store templates and a visual theme editor
- [ ] MCP server so external agents can drive the workflow engine
- [ ] Test suite and CI pipeline

---

## Contributing

Contributions are welcome.

1. Fork the repository and create a branch: `git checkout -b feature/my-feature`
2. Commit with clear messages: `git commit -m "feat: add my feature"`
3. Push and open a Pull Request describing the change and how you tested it.

Please keep PRs focused, avoid committing secrets, and make sure `npm start` still boots cleanly.

---

## License

Distributed under the **GNU General Public License v3.0**. See [`LICENSE`](LICENSE) for details.

---

## Acknowledgements

- **[PayPal](https://developer.paypal.com/)** and **[Devpost](https://devpost.com/)** for hosting the *PayPal AI Hackathon 2026*.
- **[Render](https://render.com/)** for sponsoring tools used in this project.
- **[Groq](https://groq.com/)**, **[Cloudinary](https://cloudinary.com/)**, **[Supabase](https://supabase.com/)**, **[Firebase](https://firebase.google.com/)** and **[Resend](https://resend.com/)** for the services that power the stack.

## 📚 Research References

1. **AI-Powered Fraud Prevention in Digital Payment Ecosystems: Leveraging Machine Learning for Real-Time Anomaly Detection and Risk Mitigation**
   - **Author:** Prince Kumar (Visvesvaraya Technological University)
   - **Journal:** Journal of Information Systems Engineering and Management (JISEM), Vol. 9, Issue 4 (2024)
   - **Publication Page:** https://researchgate.net
   - **Journal Link:** https://jisem-journal.com

2. **Conversational Commerce and Inclusive Digital Retailing in Tier-2 and Tier-3 Cities: Redefining the Indian Rural-Urban Retail Interface**
   - **Author:** Dr. Dayanand Parappa Bellagi (Government First Grade College, Terdal)
   - **Journal:** International Journal of Research and Analytical Reviews (IJRAR), Vol. 13, Issue 2 (June 2026)
   - **DOI:** https://doi.org
   - **Article Page:** http://ijrar.org

3. **An AI-powered Smart Routing Solution for Payment Systems**
   - **Authors:** Ramya Bygari, Aayush Gupta, Shashwat Raghuvanshi, Aakanksha Bapna, Birendra Sahu (Razorpay)
   - **Repository:** arXiv (arXiv:2111.00783 [cs.AI])
   - **DOI:** https://doi.org
   - **Abstract Page:** https://arxiv.org

<div align="center">



**Built for the PayPal AI Hackathon 2026 · Sandbox only · No real money moves**

If you like this project, please star the repo!

</div>
