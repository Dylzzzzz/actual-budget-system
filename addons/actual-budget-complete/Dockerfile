ARG BUILD_FROM=ghcr.io/hassio-addons/base:15.0.7
FROM $BUILD_FROM

# Set shell
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Install Node.js and dependencies
RUN apk add --no-cache \
    nodejs \
    npm \
    python3 \
    make \
    g++ \
    git \
    curl \
    jq \
    sqlite

# Create app directories
RUN mkdir -p /opt/actual-budget-api \
    && mkdir -p /opt/actual-budget-server \
    && mkdir -p /opt/addon \
    && mkdir -p /data/actual-budget \
    && mkdir -p /var/log/actual-budget

# For now, we'll create a simple placeholder structure
# The add-on will focus on creating HA entities and dashboard integration
RUN echo '{"name": "actual-budget-api", "version": "2.0.0"}' > /opt/actual-budget-api/package.json \
    && echo 'console.log("API server placeholder");' > /opt/actual-budget-api/index.js

# Copy add-on files
COPY rootfs/ /

# Set permissions
RUN chmod +x /etc/services.d/*/run \
    && chmod +x /etc/services.d/*/finish

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Labels
LABEL \
    io.hass.name="Actual Budget Complete" \
    io.hass.description="Complete Actual Budget system with native HA dashboard integration" \
    io.hass.arch="armhf|aarch64|amd64|armv7|i386" \
    io.hass.type="addon" \
    io.hass.version="2.0.0"

# Expose ports for future use
EXPOSE 3001 5006