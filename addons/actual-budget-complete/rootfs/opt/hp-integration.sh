#!/usr/bin/with-contenv bashio

# ==============================================================================
# HP Transaction Automation Integration
# Integrates HP transaction processing with the main addon
# ==============================================================================

# Function to log with timestamp
log_hp() {
    local level="$1"
    shift
    local message="$*"
    bashio::log."$level" "[HP] $message"
}

# Function to export HP-specific environment variables
export_hp_environment() {
    log_hp "info" "Exporting HP configuration..."
    
    # HP-specific configuration
    export HP_CATEGORY_GROUP_ID=$(bashio::config 'hp_category_group_id' 'a85d9076-d269-4eb4-ab58-92d2f37997c6')
    export HP_DRY_RUN_MODE=$(bashio::config 'hp_dry_run_mode' 'false')
    export HP_MAX_TRANSACTIONS_PER_BATCH=$(bashio::config 'hp_max_transactions_per_batch' '50')
    export HP_RETRY_ATTEMPTS=$(bashio::config 'hp_retry_attempts' '3')
    export HP_RETRY_DELAY_SECONDS=$(bashio::config 'hp_retry_delay_seconds' '300')
    
    # Also export main configuration for HP processor
    export ACTUAL_BUDGET_URL=$(bashio::config 'external_actual_url' 'http://localhost:5006')
    export ACTUAL_BUDGET_PASSWORD=$(bashio::config 'actual_budget_password')
    export XANO_API_URL=$(bashio::config 'xano_api_url')
    export XANO_API_KEY=$(bashio::config 'xano_api_key')
    
    log_hp "info" "HP environment variables exported"
}

# Function to initialize HP sensors in Home Assistant
initialize_hp_sensors() {
    log_hp "info" "Initializing HP sensors in Home Assistant..."
    
    # Initialize HP sensors with default values
    local sensors=(
        "sensor.actual_budget_hp_automation_status:idle"
        "sensor.actual_budget_hp_pending_transactions:0"
        "sensor.actual_budget_hp_submitted_transactions:0"
        "sensor.actual_budget_hp_paid_transactions:0"
        "sensor.actual_budget_hp_failed_transactions:0"
        "sensor.actual_budget_hp_last_processing:never"
    )
    
    for sensor_info in "${sensors[@]}"; do
        local sensor_id="${sensor_info%:*}"
        local initial_state="${sensor_info#*:}"
        
        # Create/update sensor via Home Assistant API
        if [[ -n "${SUPERVISOR_TOKEN}" ]]; then
            local friendly_name=$(echo "$sensor_id" | sed 's/sensor\.actual_budget_hp_/HP /' | sed 's/_/ /g')
            
            curl -s -X POST \
                -H "Authorization: Bearer ${SUPERVISOR_TOKEN}" \
                -H "Content-Type: application/json" \
                -d "{
                    \"state\": \"$initial_state\",
                    \"attributes\": {
                        \"friendly_name\": \"$friendly_name\",
                        \"device_class\": \"timestamp\",
                        \"last_update\": \"$(date -Iseconds)\"
                    }
                }" \
                "http://supervisor/core/api/states/$sensor_id" > /dev/null
                
            log_hp "debug" "Initialized sensor: $sensor_id = $initial_state"
        fi
    done
    
    log_hp "info" "HP sensors initialized"
}

# Function to run HP processing
run_hp_processing() {
    local manual_trigger="$1"
    
    if [[ "$manual_trigger" == "true" ]]; then
        log_hp "info" "Running manual HP transaction processing..."
        node /opt/hp-processor.js --manual
    else
        log_hp "info" "Running scheduled HP transaction processing..."
        node /opt/hp-processor.js
    fi
    
    local exit_code=$?
    
    if [[ $exit_code -eq 0 ]]; then
        log_hp "info" "HP processing completed successfully"
    else
        log_hp "error" "HP processing failed with exit code: $exit_code"
    fi
    
    return $exit_code
}

# Function to setup HP processing schedule
setup_hp_schedule() {
    local hp_enabled=$(bashio::config 'hp_automation_enabled' 'true')
    local hp_schedule=$(bashio::config 'hp_processing_schedule' '0 */6 * * *')
    
    if [[ "$hp_enabled" == "true" ]]; then
        log_hp "info" "Setting up HP processing schedule: $hp_schedule"
        
        # Create cron job for HP processing
        echo "$hp_schedule /opt/hp-integration.sh schedule >> /data/hp-cron.log 2>&1" > /tmp/hp-cron
        crontab /tmp/hp-cron
        
        # Start cron daemon if not running
        if ! pgrep crond > /dev/null; then
            crond -b
            log_hp "info" "Started cron daemon for HP scheduling"
        fi
        
        log_hp "info" "HP processing scheduled: $hp_schedule"
    else
        log_hp "info" "HP automation is disabled"
    fi
}

# Function to check HP configuration
check_hp_configuration() {
    log_hp "info" "Checking HP configuration..."
    
    local config_valid=true
    
    # Check required configuration
    if ! bashio::config.has_value 'actual_budget_password'; then
        log_hp "error" "Actual Budget password is required for HP automation"
        config_valid=false
    fi
    
    if ! bashio::config.has_value 'xano_api_url'; then
        log_hp "error" "Xano API URL is required for HP automation"
        config_valid=false
    fi
    
    if ! bashio::config.has_value 'xano_api_key'; then
        log_hp "error" "Xano API key is required for HP automation"
        config_valid=false
    fi
    
    local hp_category_id=$(bashio::config 'hp_category_group_id' 'a85d9076-d269-4eb4-ab58-92d2f37997c6')
    if [[ -z "$hp_category_id" ]]; then
        log_hp "error" "HP category group ID is required"
        config_valid=false
    fi
    
    if [[ "$config_valid" == "true" ]]; then
        log_hp "info" "HP configuration is valid"
        return 0
    else
        log_hp "error" "HP configuration is invalid"
        return 1
    fi
}

# Function to create HP processing log viewer
create_hp_log_viewer() {
    log_hp "info" "Creating HP log viewer endpoint..."
    
    # Create a simple log viewer script
    cat > /opt/hp-logs.sh << 'EOF'
#!/bin/bash
# HP Log Viewer

case "$1" in
    "processing")
        if [[ -f /data/hp-processing.log ]]; then
            tail -n 100 /data/hp-processing.log
        else
            echo "No HP processing log found"
        fi
        ;;
    "cron")
        if [[ -f /data/hp-cron.log ]]; then
            tail -n 50 /data/hp-cron.log
        else
            echo "No HP cron log found"
        fi
        ;;
    "state")
        if [[ -f /data/hp-state.json ]]; then
            cat /data/hp-state.json | jq '.'
        else
            echo "No HP state file found"
        fi
        ;;
    *)
        echo "Usage: $0 {processing|cron|state}"
        exit 1
        ;;
esac
EOF
    
    chmod +x /opt/hp-logs.sh
    log_hp "info" "HP log viewer created at /opt/hp-logs.sh"
}

# Main function
main() {
    local action="${1:-init}"
    
    case "$action" in
        "init")
            log_hp "info" "Initializing HP Transaction Automation..."
            export_hp_environment
            
            if check_hp_configuration; then
                initialize_hp_sensors
                setup_hp_schedule
                create_hp_log_viewer
                log_hp "info" "HP Transaction Automation initialized successfully"
            else
                log_hp "warning" "HP Transaction Automation initialization skipped due to configuration issues"
            fi
            ;;
        "manual")
            log_hp "info" "Manual HP processing triggered"
            export_hp_environment
            run_hp_processing "true"
            ;;
        "schedule")
            log_hp "info" "Scheduled HP processing triggered"
            export_hp_environment
            run_hp_processing "false"
            ;;
        "status")
            log_hp "info" "HP Status Check"
            if [[ -f /data/hp-state.json ]]; then
                echo "HP State File exists"
                /opt/hp-logs.sh state
            else
                echo "No HP state file found"
            fi
            ;;
        "logs")
            local log_type="${2:-processing}"
            /opt/hp-logs.sh "$log_type"
            ;;
        *)
            echo "Usage: $0 {init|manual|schedule|status|logs}"
            exit 1
            ;;
    esac
}

# Execute main function with all arguments
main "$@"