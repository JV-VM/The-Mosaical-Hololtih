# Deployment Checklist (Minimum Production-Ready)

This document describes a small, reliable path to deploy the NestJS + Fastify backend with Prisma migrations.

## 1) Required environment variables

These are validated by `src/shared/env.ts` (plus `MIGRATE_URL` used by Prisma CLI):

- `NODE_ENV` (recommended: `production`)
- `PORT` (example: `3000`)
- `DATABASE_URL` (runtime DB connection)
- `MIGRATE_URL` (Prisma migration connection; can be the same as `DATABASE_URL`)
- `JWT_ACCESS_SECRET` (min length 16)
- `JWT_ACCESS_EXPIRES_IN` (seconds; default `900`)
- `JWT_REFRESH_SECRET` (min length 15)
- `JWT_REFRESH_EXPIRES_IN` (seconds; default `2592000`)
- `CORS_ORIGIN` (comma-separated list; example: `https://app.example.com,https://hub.example.com`)

## 2) Install dependencies

Use your standard install step for this repo (example below):

```bash
npm install
```

## 3) Run database migrations (deploy)

Use the migration scripts added to `package.json`:

```bash
npm run db:migrate:status
npm run db:migrate:deploy
```

Notes:
- `db:migrate:deploy` is the safe, production-oriented command.
- `db:migrate:reset` is destructive and intended for development only.

## 4) Database seed

After migrations, seed the minimal lookup data (plans + tags). The seed is idempotent and safe to re-run.

```bash
pnpm run db:migrate:deploy
pnpm run db:seed
```

## 5) Build and start

```bash
npm run build
npm run start:prod
```

## 6) Smoke checks

With the global prefix enabled, check:

- Liveness: `GET /api/v1/health/live`
- Readiness (DB): `GET /api/v1/health/ready`
- DB alias: `GET /api/v1/health/db`
- Swagger: `GET /docs`

Every response should include the `x-request-id` header.

## 7) Troubleshooting

### Migrations fail with missing env var

- Ensure `MIGRATE_URL` is set for the Prisma CLI.
- Ensure `DATABASE_URL` is set for runtime.

### App fails at boot with env validation errors

- The env schema is strict. Double-check secrets and lengths.
- Confirm all required vars are present in the runtime environment.

### Requests succeed but logs are hard to correlate

- Ensure your proxy/load balancer preserves or forwards `x-request-id`.
- The app will generate one if it is missing.

## 8) CI/CD expectations

This repo includes a GitHub Actions workflow at `.github/workflows/ci.yml` that:

- Boots a Postgres service
- Runs `prisma migrate deploy`
- Executes `npm run lint`, `npm test`, and `npm run test:e2e`

To reproduce locally, start a Postgres instance and set `DATABASE_URL` / `MIGRATE_URL` before running the same commands.
