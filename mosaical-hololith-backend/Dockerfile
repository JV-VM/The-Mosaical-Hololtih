# --- build stage ---
FROM node:20-alpine AS build
WORKDIR /app

# Prisma on alpine often needs these at runtime/build time
RUN apk add --no-cache libc6-compat openssl

# Enable corepack and pin pnpm to v9 (matches your lock usage in logs)
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# 1) Copy only dependency manifests first (better Docker cache)
COPY package.json pnpm-lock.yaml ./

# Install deps
RUN pnpm install --frozen-lockfile

# 2) Copy the rest of the source
COPY . .

# Generate Prisma client
RUN pnpm prisma generate --schema=prisma/schema.prisma

# Build NestJS
RUN pnpm build

# Optional: keep runtime smaller
RUN pnpm prune --prod


# --- runtime stage ---
FROM node:20-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl

ENV NODE_ENV=production

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

EXPOSE 3000
CMD ["node", "dist/src/main.js"]