# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A NestJS 9 backend (`power-bi`) that acts as a **multi-tenant gateway in front of Microsoft Power BI**.
It authenticates against Azure AD per tenant, pulls Power BI workspaces (groups) and reports, caches
them in MongoDB, and serves them to end users through its own RBAC, row-level filters, user-groups,
favorites, custom reports and notifications layer. The codebase and Swagger docs are mostly in
Brazilian Portuguese.

## Commands

```bash
npm install              # use --legacy-peer-deps (peer dep conflicts; see Dockerfile)
npm run start:dev        # watch mode (port 3000)
npm run start:debug      # watch + inspector
npm run start:prod       # node dist/main
npm run build            # nest build -> dist/
npm run lint             # eslint --fix over {src,apps,libs,test}/**/*.ts
npm run format           # prettier
npm run test             # jest (unit)
npm run test -- <pattern>   # run a single test file/pattern
npm run test:e2e         # jest --config ./test/jest-e2e.json
npm run test:cov         # coverage
```

Docker: `docker-compose up` brings up the app (host port 5524 → 3000), MongoDB, mongo-express
(5525), Redis and redis-commander (5521).

Runtime endpoints: REST API on port 3000, Swagger UI at `/api`, Bull Board queue dashboard at
`/admin/queues`.

## Architecture

**Bootstrap** — `src/main.ts`: global `ValidationPipe({ transform: true })`, CORS fully open,
Sentry init, Swagger at `/api`, `useContainer` wired for class-validator custom validators.

**Root module** — `src/app.module.ts` imports `ModModule` (feature modules) and `JobModule`
(Bull queues). All infra config is centralized in `src/app.config.ts` as exported constants
(`CONF`, `CACHE_CONF`, `REDIS_CONF`, `MONGO_URL`, `MONGO_CONF`, `PROVIDER`).

**`PROVIDER`** in `app.config.ts` registers two **global** `APP_GUARD`s — order matters:
`JwtAuthGuard` then `RolesGuard`. They run on *every* request.

**Feature modules** — `src/app/modules/`, aggregated by `mod.module.ts`: `accounts`, `groups`,
`reports`, `users`, `user-groups`, `custom-reports`, `favourites`, `filters`, `maps`,
`notifications`, `login-log`. Each follows the same shape: `<name>.module.ts`, `.controller.ts`,
`.service.ts`, `<entity>.entity.ts` (Mongoose `@Schema`), and a `dto/` folder.

**`src/app/core/`** — cross-cutting concerns: `auth/` (guards + decorators), `jobs/` (Bull email
queues), `services/` (backup, scheduled `tasks`, date conversion), `utils/` (`authenticator`,
`encryption.service`, `refresh.token.service`, `hash.manager`), `error/` (global exception),
`sentry/`, `api/` (Swagger helpers).

### Auth & RBAC

- `JwtAuthGuard` reads the raw `Authorization` header, verifies the JWT with `JWT_SECRET`
  (`Bearer <token>` format), loads the user from Mongo via `Authenticator`, and attaches the full
  user document to `request.user`.
- `RolesGuard` reads `@Roles(...)` metadata and checks `user.role`. If no `@Roles()` is present it
  passes — so role enforcement is opt-in per handler.
- `@SkipAuth()` (`skip-auth.decorator.ts`) bypasses `JwtAuthGuard` for public endpoints.
- Roles: `ROLE_TYPES` enum (`manager`, `admin`, `user`) lives in
  `modules/users/dto/create-user.dto.ts` — import it from there.

### Power BI integration (the core flow)

- An `Account` entity stores one Azure AD credential set per Power BI tenant. `AccountsService.create`
  does an OAuth **password grant** against `AZURE_URL` to obtain `access_token` + `refresh_token`;
  the tenant password is stored encrypted via `EncryptionService`.
- Before any Power BI call, `RefreshToken.refresh(email)` checks token expiry and refreshes via
  `login.microsoftonline.com/.../oauth2/token` when < 3 min remain. It is invoked inside
  `AccountsService.getIdAccount` / `getBiAccount` / `findAllAccounts` — call those, not the model
  directly, when you need a usable token.
- `GroupsService` / `ReportsService` call `POWER_BI_BASE_URL` with the account bearer token and
  persist groups/reports into MongoDB (the local cache).
- `POST /reports/syncronize` (note the typo — keep it) is the manual full resync: MANAGER-only, it
  rebuilds groups + reports for every account linked to the calling user.

### Async work & scheduling

- Bull queues `sendMailWelcomeQueue` and `sendMailResetQueue` (Redis-backed) handle transactional
  email; producers/consumers in `core/jobs/`.
- `TasksService` (`@nestjs/schedule`) runs a daily Mongo `@Cron('0 0 * * *')` backup. The
  token-refresh cron is intentionally commented out — refresh is now on-demand via `RefreshToken`.

## Environment

`ConfigModule.forRoot({ isGlobal: true })` loads a `.env` file (not committed; no `.env.example`).
Required vars referenced in code: `JWT_SECRET`, `ENCRYPTION_KEY`, `BCRYPT_COST`, `POWER_BI_BASE_URL`,
`AZURE_URL`, `AZURE_GRANT_TYPE`, `AZURE_GRANT_TYPE2`, `AZURE_SCOPE`, `AZURE_RESOURCE`,
`AZURE_CLIENT_SECRET`, `REDIS_HOST`, `REDIS_PORT`, `EMAIL_API_URL`, `BASE_URL`,
`BULL_BOARD_USER`, `BULL_BOARD_PASS`, `USER_LIMIT`, `MULTER_TYPES`.

**`BLOB_READ_WRITE_TOKEN`** is required by `MapsController.uploadFile` for `@vercel/blob` `put()`.
Auto-injected by Vercel when a Blob store is linked to the project (Vercel dashboard → Storage →
Blob → Connect Project). For non-Vercel deploys (Docker, local), set it manually from
`https://vercel.com/dashboard/stores/blob/<id>/settings`. Without it, `POST /maps/upload` will throw
at runtime (the boot succeeds — `put()` is called inside the handler, not at module load).

## Conventions & gotchas

- **MongoDB connection is hardcoded** in `app.config.ts` (`MONGO_URL`), *not* env-driven — the
  `MONGO_DSN` env var exists but is unused. Changing the DB target means editing that constant.
- `tsconfig.json` runs loose: `strictNullChecks: false`, `noImplicitAny: false`. Don't assume strict
  null safety.
- **Imports MUST be relative.** Do NOT use absolute paths like `from 'src/app/...'`, even though
  `tsconfig.json` has `baseUrl: "./"` and `paths: { "src/*": ["src/*"] }`. The Vercel deploy uses
  the legacy `@vercel/node` builder (`vercel.json` → `"use": "@vercel/node"`) which **IGNORES
  `tsconfig.paths`** and serves the source tree compiled in-place from `/var/task/app/src/...`,
  bypassing the `dist/` output that `tsc-alias` rewrites. Any module loaded at boot that contains
  `from 'src/...'` will crash the Lambda with `Cannot find module 'src/...'`. The `paths` block
  and `tsc-alias` in the build script are kept as a safety net for Docker / non-Vercel deploys —
  they don't help on Vercel.
- `mongoose-autopopulate` is registered globally via `connectionFactory`; entities can rely on
  `autopopulate: true` on refs.
- Two bcrypt libraries are installed (`bcrypt` + `bcryptjs`); password hashing went through
  `hash.manager.ts` — check which one a given path uses before adding hashing code.
- New feature modules must be added to `src/app/modules/mod.module.ts` to be loaded.
