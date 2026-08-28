# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV NODE_ENV=production
RUN npm run build

# Production stage
FROM node:22-alpine
LABEL maintainer="GameTrack Team" \
      description="GameTrack Application - Personal Gaming Registry & Backlog Tracker"

# Create a non-root user/group (node image comes with 'node' user)
# Create data directory and set permissions
RUN mkdir -p /app/data && chown -R node:node /app

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/dist-server ./dist-server
COPY --from=builder --chown=node:node /app/scripts ./scripts

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
ENV GAMETRACK_DATA_DIR=/app/data

# Run as non-root user
USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

CMD ["npm", "start"]
