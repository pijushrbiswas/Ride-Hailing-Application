# ================================
# Build stage
# ================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (better caching)
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copy source code
COPY src ./src
COPY newrelic.js ./

# ================================
# Runtime stage
# ================================
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# Install wget for healthcheck
RUN apk add --no-cache wget

# Security: run as non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Copy built app from builder
COPY --from=builder /app /app

EXPOSE 3000

CMD ["node", "src/server.js"]