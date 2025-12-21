# Quick Start Guide

## 🚀 Installation

### 1. Add Repository to Home Assistant

1. Go to **Settings** → **Add-ons** → **Add-on Store**
2. Click the **⋮** menu → **Repositories**
3. Add this URL:
   ```
   https://github.com/Dylzzzzz/actual-budget-system
   ```
4. Click **Add**

### 2. Install the Add-on

1. Find "Actual Budget Complete" in the add-on store
2. Click **Install**
3. Wait for installation to complete

### 3. Configure the Add-on

1. Go to the **Configuration** tab
2. Fill in required settings:
   - **Xero Client ID**: Your Xero app client ID
   - **Xero Client Secret**: Your Xero app secret
   - **Xero Tenant ID**: Your Xero organization ID
   - **Business Category Group Name**: Name of your business expense category in Actual Budget

3. Optional settings:
   - **Sync Schedule**: Cron expression (default: Monday 2 AM)
   - **Sync Days Back**: How many days to look back (default: 7)
   - **Dry Run Mode**: Test mode without making changes

### 4. Start the Add-on

1. Go to the **Info** tab
2. Click **Start**
3. Enable **Start on boot** if desired
4. Check the **Log** tab for startup messages

### 5. Access the Dashboard

1. Look for **"Actual Budget"** in your Home Assistant sidebar
2. Click to open the native dashboard
3. You'll see status tiles and action buttons

## 📊 Dashboard Overview

### Status Tiles
- **🟢 System Status**: Overall health indicator
- **🔧 API Server**: Node.js API server status
- **🖥️ Actual Budget Server**: Official server status
- **🔄 Last Sync**: Last synchronization result

### Statistics Tiles
- **📊 Transactions Processed**: Total count
- **✅ Successful Imports**: Xero import successes
- **❌ Failed Transactions**: Import failures
- **⏳ Pending Mappings**: Awaiting category mapping

### Action Buttons
- **▶️ Manual Sync**: Trigger immediate sync
- **🔄 Reprocess Failed**: Retry failed transactions
- **🔧 Restart Services**: Restart individual services

## 🔧 Configuration Options

### Service Management
- **Manage API Server**: Let add-on manage the Node.js API server
- **Manage Actual Server**: Let add-on manage Actual Budget server
- **External URLs**: Point to existing services instead

### Sync Settings
- **Auto Sync Enabled**: Enable scheduled synchronization
- **Sync Schedule**: Cron expression for timing
- **Batch Size**: Number of transactions per batch
- **Rate Limit**: API calls per minute

### Safety Options
- **Dry Run Mode**: Test without making changes
- **Test Mode**: Additional safety checks
- **Sync to Xero**: Enable/disable Xero integration

## 🚨 Troubleshooting

### Add-on Won't Start
1. Check the **Log** tab for error messages
2. Verify all required configuration is filled in
3. Check that ports 3001 and 5006 are available

### Dashboard Not Appearing
1. Refresh your Home Assistant page
2. Check that the add-on is running
3. Look for "Actual Budget" in the sidebar

### Sync Failures
1. Check Xero credentials are correct
2. Verify Actual Budget server is accessible
3. Check business category group name matches exactly

### Status Shows "Placeholder"
- This is normal until first sync completes
- Tooltips will indicate when data is placeholder vs real

## 📚 Next Steps

- [Configuration Reference](configuration.md)
- [Dashboard Guide](dashboard.md)
- [Troubleshooting Guide](troubleshooting.md)
- [API Documentation](api.md)

## 🤝 Support

1. Check add-on logs first
2. Review troubleshooting guide
3. Create GitHub issue with logs and configuration