# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Standalone git repo (`github.com/Condor-Martech/BI.git`) that ships the Business Intelligence platform for Condor: a multi-tenant Power BI gateway backend and its Next.js frontend. Two independent apps under one repo — no root package manifest, no monorepo tooling.

| Path | What | Stack | Per-app docs |
|------|------|-------|--------------|
| [`app/`](app/) | `power-bi` — multi-tenant gateway in front of Microsoft Power BI. Azure AD per tenant, RBAC, row-level filters, audit, notifications, AI narrative (OpenAI). Codebase + Swagger in Brazilian Portuguese. | NestJS 9 + MongoDB + Bull/Redis | [`app/CLAUDE.md`](app/CLAUDE.md) |
| [`web-next/`](web-next/) | Next.js 16 dashboard consuming `app/` through its own BFF. Twenty-CRM-inspired UI. Replaces the archived Angular frontend. | Next 16 + React 19 + Tailwind v4 + shadcn | [`web-next/CLAUDE.md`](web-next/CLAUDE.md) |

The two apps use **different package managers** (`npm` for `app/`, `pnpm` for `web-next/`) with separate lockfiles, `node_modules`, CI images and deploys. They share nothing at the code level — only the wire protocol.

## Commands

There is no root `package.json`. Always `cd` into the relevant subdirectory.

### Backend (`app/` — NestJS, npm)

```bash
cd app
npm install --legacy-peer-deps     # peer-dep conflicts; matches Dockerfile
npm run start:dev                  # watch, :3000
npm run build                      # nest build + tsc-alias -> dist/
npm run lint                       # eslint --fix over {src,apps,libs,test}/**/*.ts
npm run test                       # jest unit
npm run test -- <pattern>          # single test file/pattern
npm run test:e2e                   # ./test/jest-e2e.json
npm run test:cov
```

Runtime endpoints: REST on `:3000`, Swagger UI at `/api`, Bull Board (basic-auth) at `/admin/queues`.

Utility script:
```bash
node app/scripts/reset-password.mjs <email> [--length N] [--uri mongodb://...]
# Regenerates a user's password using the same bcryptjs + BCRYPT_COST as users.service.ts.
```

### Frontend (`web-next/` — Next.js, pnpm)

```bash
cd web-next
pnpm install --ignore-workspace    # see gotchas — the flag is required
pnpm dev                           # next dev :3002
pnpm typecheck                     # tsc --noEmit
pnpm lint
pnpm build
pnpm ladle                         # component explorer
```

### Docker / deploy

Three compose files, all doing different things — don't confuse them:

| File | Purpose |
|------|---------|
| [`docker-compose.yml`](docker-compose.yml) *(repo root)* | **Local dev infra only** — Mongo :27017, Redis :6379, mongo-express :5525. No app containers. Run `app/` and `web-next/` from your shell against this. |
| [`docker-compose.prod.yml`](docker-compose.prod.yml) *(repo root)* | **Portainer prod stack** — pulls `ghcr.io/condor-martech/bi-app:${APP_TAG}` and `bi-web-next:${WEB_TAG}` from GHCR. Mongo + Redis + app :3000 + web-next :3002. Env vars listed in [`app.env.example`](app.env.example). |
| [`app/docker-compose.yml`](app/docker-compose.yml) | Legacy in-app dev stack from before the root files existed — app :5524→3000, mongo, mongo-express :5525, redis, redis-commander :5521. Prefer the root files unless you specifically need this. |

Images are published to GHCR by `.github/workflows/publish-app.yml` and `publish-web-next.yml`. Roll a version in Portainer by editing the stack and setting `APP_TAG=sha-abc1234` (or a semver tag) → Update.

## Architecture

### How the pieces connect

```
browser  ──▶  web-next  (:3002, Next.js BFF)  ──▶  app  (:3000, NestJS)  ──▶  Mongo / Redis / Azure AD / Power BI REST
            cookie: bi_token (httpOnly)          Authorization: Bearer <JWT>
```

- `web-next/app/api/**/route.ts` are **BFF route handlers**. They read the `bi_token` httpOnly cookie, attach `Authorization: Bearer <jwt>` server-side, and proxy to `app/` via `lib/api/proxy.ts`. The legacy URL is **never** exposed to the client — do not introduce `NEXT_PUBLIC_API_URL`.
- The backend has no refresh-token flow. `bi_token` TTL is derived from `JWT.exp`; 401 → redirect to `/login`.
- Special-case BFF handlers: `/api/notifications/stream` translates header-auth into a query-param JWT for `EventSource` SSE; `/api/maps/upload` uses `duplex: 'half'` to preserve multipart boundaries.

### Backend internals (full detail in [`app/CLAUDE.md`](app/CLAUDE.md))

- Global guards wired in `app/src/app.config.ts` (`PROVIDER`): `JwtAuthGuard` then `RolesGuard`, running on every request. Opt out with `@SkipAuth()`; opt into roles with `@Roles(...)`. Roles enum (`manager`, `admin`, `user`) lives in `modules/users/dto/create-user.dto.ts`.
- Power BI integration: one `Account` per Azure AD tenant; OAuth password-grant tokens stored encrypted via `EncryptionService`. `RefreshToken.refresh(email)` refreshes on demand when <3 min remain. Always go through `AccountsService.getIdAccount` / `getBiAccount` / `findAllAccounts` — never the Mongo model — when you need a usable bearer token.
- **MongoDB URL is hardcoded** in `app/src/app.config.ts` (`MONGO_URL`). `MONGO_DSN` env var exists but is unused by the app runtime — the Portainer stack passes it but the constant wins. Change the constant to retarget.
- `tsconfig` runs loose: `strictNullChecks: false`, `noImplicitAny: false`.
- New feature modules MUST be registered in `app/src/app/modules/mod.module.ts` to load.
- Two bcrypt libs coexist (`bcrypt` + `bcryptjs`); password hashing goes through `core/utils/hash.manager.ts` — match the surrounding file when adding new hash paths.

### Frontend internals (full detail in [`web-next/CLAUDE.md`](web-next/CLAUDE.md))

- TypeScript strict + `noUncheckedIndexedAccess` — indexed access yields `T | undefined`.
- Tailwind v4 is **CSS-first**: no `tailwind.config.ts`; theme tokens in `app/globals.css` (Twenty-inspired, mirrored in `lib/theme/twenty-tokens.ts`).
- IDs from the legacy are Mongo `ObjectId` (24-hex, regex `/^[0-9a-f]{24}$/`) — not UUIDs.
- Validate legacy responses with `zod` in the BFF: the legacy mixes `_id`/`id` and has inconsistent shapes.
- Power BI client is browser-only — wrap in `'use client'`, use `next/dynamic({ ssr: false })` if the bundler complains.
- The legacy preserves **typos in its routes** (`POST /reports/syncronize`, `PATCH /filters/upadate/:id`, `inclued`). Keep them — don't "fix" them in BFF paths.
- BFF proxy must forward `searchParams`. Strip `Set-Cookie` from upstream before returning to avoid leaking legacy cookies. Forward `req.signal` to upstream `fetch` in SSE handlers so the legacy doesn't accumulate orphan subscribers when the browser disconnects.

## Conventions

- **Backend imports**: absolute (`src/app/...`) is enabled via `baseUrl: "./"` and rewritten by `tsc-alias` at build. Match the surrounding file. Brazilian Portuguese identifiers, Swagger and error messages.
- **Frontend imports**: `@/*` alias (see `web-next/tsconfig.json`). One catch-all `[[...path]]/route.ts` per legacy module under `app/api/`, delegating to `lib/api/proxy.ts`. SSE and multipart have dedicated handlers.
- **Tests** exist only in `app/` (Jest). `web-next/` has no test suite.

## Gotchas

- **pnpm from `web-next/`**: always pass `--ignore-workspace`. The historical case for this flag was the parent `new-bi/pnpm-workspace.yaml`; the repo is standalone now, but keep the flag — the local `.npmrc` declares `ignore-workspace=true` and pnpm 10 doesn't always honor it without the CLI flag, and it's harmless when no workspace exists.
- Don't run `npm`/`pnpm`/`turbo` at the repo root — no manifest lives there. The root exists only to hold the two apps and the compose files.
- Swagger at `http://localhost:3000/api` is the **only reliable contract** between the two apps. Verify shapes there before assuming — the legacy has intentional route typos and inconsistent field casings.
- `docker-compose.prod.yml` sets `API_URL=http://app:3000` inside the compose network for the `web-next` container to reach the backend. Server-side only — do not expose to the client.
- Required env vars for the backend are validated at boot in `app/src/app.config.ts` (`REQUIRED_ENV_VARS`); missing any refuses to start. `app.env.example` at the root lists every value the Portainer stack needs.

## Resources

- Backend deep-dive: [`app/CLAUDE.md`](app/CLAUDE.md)
- Frontend deep-dive: [`web-next/CLAUDE.md`](web-next/CLAUDE.md)
- Frontend project skill: [`web-next/.claude/skills/legacy-web-next/SKILL.md`](web-next/.claude/skills/legacy-web-next/SKILL.md)
- Portainer env template: [`app.env.example`](app.env.example)
