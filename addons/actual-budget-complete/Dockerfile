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

# Copy API server files
COPY ../../api/ /opt/actual-budget-api/
WORKDIR /opt/actual-budget-api
RUN npm install --production

# Copy server configuration
COPY ../../server/ /opt/actual-budget-server/

# Copy add-on files
COPY rootfs/ /

# Set permissions
RUN chmod +x /etc/services.d/*/run \
    && chmod +x /etc/services.d/*/finish \
    && chmod +x /usr/bin/actual-budget-*

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD /usr/bin/actual-budget-healthcheck || exit 1

# Labels
LABEL \
    io.hass.name="Actual Budget Complete" \
    io.hass.description="Complete Actual Budget system with native HA dashboard integration" \
    io.hass.arch="armhf|aarch64|amd64|armv7|i386" \
    io.hass.type="addon" \
    io.hass.version="2.0.0"

# Expose ports
EXPOSE 3001 5006