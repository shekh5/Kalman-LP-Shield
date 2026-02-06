# Stage 1: Build Agents
FROM node:20-alpine AS agent-builder

WORKDIR /app/agents

# Install dependencies
COPY agents/package*.json ./
RUN npm ci

# Copy source and build
COPY agents/ ./
RUN npm run build

# Stage 2: Build Frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Install dependencies
COPY frontend/package*.json ./
RUN npm ci

# Copy source and build
COPY frontend/ ./
RUN npm run build

# Stage 3: Python Kalman Engine
FROM python:3.11-slim AS kalman-engine

WORKDIR /app/kalman-engine

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY kalman-engine/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY kalman-engine/ ./

# Stage 4: Final Runtime Image
FROM node:20-alpine AS runtime

WORKDIR /app

# Install production dependencies for agents
COPY agents/package*.json ./agents/
RUN cd agents && npm ci --production

# Copy built agents
COPY --from=agent-builder /app/agents/dist ./agents/dist

# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Create non-root user
RUN addgroup -g 1001 -S kalmanguard && \
    adduser -S kalmanguard -u 1001 -G kalmanguard

# Set ownership
RUN chown -R kalmanguard:kalmanguard /app

USER kalmanguard

# Environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Expose ports
EXPOSE 3001 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Start command
CMD ["node", "agents/dist/coordinator.js"]
