# Multi-stage build for documentation deployment
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code and docs
COPY src/ ./src/
COPY docs/ ./docs/
COPY scripts/ ./scripts/

# Install additional build dependencies
RUN npm install -g typescript ts-node

# Generate documentation
RUN npm run docs:generate
RUN npm run docs:build

# Production stage - serve static documentation
FROM nginx:alpine AS production

# Copy custom nginx configuration
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built documentation
COPY --from=builder /app/docs/ /usr/share/nginx/html/

# Create API docs directory structure
RUN mkdir -p /usr/share/nginx/html/api-docs

# Copy OpenAPI spec and examples
COPY --from=builder /app/docs/openapi.yaml /usr/share/nginx/html/api-docs/
COPY --from=builder /app/docs/api-docs.html /usr/share/nginx/html/api-docs/index.html
COPY --from=builder /app/docs/examples/ /usr/share/nginx/html/examples/

# Set proper permissions
RUN chown -R nginx:nginx /usr/share/nginx/html

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/health || exit 1

# Expose port
EXPOSE 80

# Labels for metadata
LABEL maintainer="Lifestream Dynamics <support@lifestreamdynamics.com>"
LABEL description="Accounting API Documentation Server"
LABEL version="1.0.0"

# Start nginx
CMD ["nginx", "-g", "daemon off;"]