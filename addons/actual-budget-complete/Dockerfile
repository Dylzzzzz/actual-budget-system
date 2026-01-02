ARG BUILD_FROM=ghcr.io/hassio-addons/base:15.0.7
FROM $BUILD_FROM

# Set shell
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Install Node.js and dependencies
RUN apk add --no-cache \
    nodejs \
    npm \
    curl \
    jq \
    python3 \
    py3-pip

# Create app directories
RUN mkdir -p /opt/actual-budget-api \
    && mkdir -p /data/actual-budget \
    && mkdir -p /var/log/actual-budget

# Create placeholder files
RUN echo '{"name": "actual-budget-api", "version": "2.0.1"}' > /opt/actual-budget-api/package.json \
    && echo 'console.log("API server placeholder");' > /opt/actual-budget-api/index.js

# Copy add-on files
COPY rootfs/ /

# Set permissions explicitly
RUN chmod +x /etc/services.d/actual-budget-addon/run \
    && chmod +x /etc/services.d/actual-budget-addon/finish

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://supervisor/core/api/info -H "Authorization: Bearer ${SUPERVISOR_TOKEN}" || exit 1

# Labels
LABEL \
    io.hass.name="Actual Budget Complete" \
    io.hass.description="Complete Actual Budget system with native HA dashboard integration" \
    io.hass.arch="armhf|aarch64|amd64|armv7|i386" \
    io.hass.type="addon" \
    io.hass.version="2.0.9"

# NO EXPOSE - we don't need ports for native HA integration