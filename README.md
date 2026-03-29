# wallet-backend

Scalable NestJS backend — Wallet, Auth, Call and more.

## Tech Stack
- **NestJS** — Modular Node.js framework
- **TypeORM** — Database ORM
- **Supabase PostgreSQL** — Primary database
- **Upstash Redis** — Caching & sessions
- **Passport.js** — Google OAuth + JWT

## Local Setup (No Docker needed)

```bash
# 1. Install dependencies
npm install

# 2. Copy env file and fill in values
cp .env.example .env

# 3. Start dev server
npm run start:dev
```

Server runs at: `http://localhost:3000/api/v1`

Health check: `GET http://localhost:3000/api/v1/health`

## Deployment (Docker on Render.com)

Dockerfile is production-ready with multi-stage build.
Connect this repo to Render → Select Docker → Set env vars → Deploy.

## Project Structure

```
src/
├── modules/        ← Feature modules (auth, wallet, call, ...)
├── common/         ← Shared guards, decorators, filters, interceptors
├── config/         ← DB + Redis config
├── database/
│   └── migrations/ ← All DB migrations
└── main.ts
```

## Build Order (Phases)
- [x] Phase 0 — Core scaffold
- [ ] Phase 1 — Authentication (Google OAuth + JWT)
- [ ] Phase 2 — Wallet (top-up + debit + history)
- [ ] Phase 3 — Call feature (fake call + auto-debit)
- [ ] Phase 4 — DevOps + Deployment
