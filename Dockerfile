# Multi-stage build for optimized production image
FROM node:20-alpine AS builder

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    openssl \
    netcat-openbsd \
    && rm -rf /var/cache/apk/*

WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./

# Copy scripts directory first (needed for postinstall)
COPY scripts/ ./scripts/

# Install all dependencies (including dev dependencies for build)
RUN npm ci --legacy-peer-deps

# Copy source code
COPY src/ ./src/
COPY prisma/ ./prisma/
COPY public/ ./public/

# Generate Prisma client and build
RUN npm run prisma:generate
RUN npm run build || npm run build:js || true

# Production stage
FROM node:20-alpine AS production

# Install system dependencies for runtime
RUN apk add --no-cache \
    dumb-init \
    openssl \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S interspace -u 1001

WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Copy patch script needed for postinstall
COPY scripts/patch-orby.js ./scripts/

# Install only production dependencies
RUN npm ci --legacy-peer-deps --production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /usr/src/app/prisma ./prisma
COPY --from=builder /usr/src/app/tsconfig.json ./tsconfig.json

# Copy necessary scripts
COPY scripts/start-prod.js ./scripts/
COPY scripts/check-production-build.js ./scripts/
COPY scripts/docker-healthcheck.sh ./scripts/
COPY scripts/patch-orby.js ./scripts/

# Copy public assets for passkeys
COPY --from=builder /usr/src/app/public ./public

# Set ownership and permissions
RUN chown -R interspace:nodejs /usr/src/app
USER interspace

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD /usr/src/app/scripts/docker-healthcheck.sh

# Expose port
EXPOSE 3000

# Set environment variables
ENV TS_NODE_BASEURL=/usr/src/app/dist
ENV NODE_OPTIONS="--max-old-space-size=1536"

# V2 API default settings
ENV ENABLE_V2_API=true
ENV AUTO_CREATE_PROFILE=true
ENV DEFAULT_PRIVACY_MODE=linked

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["npm", "run", "start"]
