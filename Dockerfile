# Use official lightweight Node.js Alpine base image
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=8080

# Create data directory and set permissions for non-root node user
RUN mkdir -p /app/data && chown -R node:node /app

# Copy application files
COPY --chown=node:node package.json server.js ./
COPY --chown=node:node public ./public
COPY --chown=node:node data ./data

# Switch to non-root user for container security
USER node

# Expose port (Cloud Run defaults to 8080)
EXPOSE 8080

# Start server
CMD ["node", "server.js"]

