# Frontend Dockerfile

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source
COPY . ./

# Build arguments for environment variables
ARG VITE_AGENT_API_URL
ARG VITE_KALMAN_ENGINE_URL
ARG VITE_WS_ENDPOINT
ARG VITE_WALLETCONNECT_PROJECT_ID

# Build
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine

# Needed for container HEALTHCHECK
RUN apk add --no-cache wget

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80 || exit 1

CMD ["nginx", "-g", "daemon off;"]
