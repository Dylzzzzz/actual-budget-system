# Actual Budget Complete Add-on

## Native Home Assistant Integration

This add-on provides **native Home Assistant dashboard integration** for Actual Budget, replacing the separate web interface with integrated dashboard tiles.

## ✨ Features

### 🏠 Native HA Integration
- **Sidebar Item**: "Actual Budget" appears in HA sidebar
- **Dashboard Tiles**: Status and statistics integrated into HA
- **No Separate Tab**: Everything within Home Assistant interface
- **Real-time Updates**: Live status without page refresh

### 📊 Dashboard Tiles
- **System Status**: Overall health indicator
- **API Server Status**: Node.js API server health
- **Actual Budget Server**: Official server status
- **Last Sync**: Synchronization results and timing
- **Statistics**: Processed, successful, failed, pending counts

### 🔧 Service Management
- **Flexible Configuration**: Manage services or connect to external
- **Health Monitoring**: Automatic service health checks
- **Auto-restart**: Configurable service recovery
- **Manual Controls**: Restart services through HA

## 🚀 Installation

1. Add this repository to Home Assistant
2. Install "Actual Budget Complete" add-on
3. Configure through HA interface
4. Start the add-on
5. Look for "Actual Budget" in HA sidebar

## ⚙️ Configuration

### Required Settings
- **Xero Client ID**: Your Xero app client ID
- **Xero Client Secret**: Your Xero app secret  
- **Xero Tenant ID**: Your Xero organization ID
- **Business Category Group**: Name of business expense category

### Service Management
- **Manage API Server**: Let add-on manage Node.js API server
- **Manage Actual Server**: Let add-on manage Actual Budget server
- **External URLs**: Connect to existing services instead

### Sync Settings
- **Auto Sync**: Enable scheduled synchronization
- **Sync Schedule**: Cron expression for timing
- **Batch Size**: Transactions per batch
- **Rate Limit**: API calls per minute

## 🎯 Key Differences from Web Interface

### ❌ Old Way (Web Interface)
- Separate browser tab
- External web interface
- Manual refresh needed
- Isolated from HA

### ✅ New Way (Native Integration)
- Native HA sidebar item
- Integrated dashboard tiles
- Real-time updates
- Full HA integration

## 📱 Dashboard Usage

1. **Click "Actual Budget"** in HA sidebar
2. **View status tiles** for system health
3. **Check statistics** for sync results
4. **Use action buttons** for manual operations
5. **Hover tooltips** for explanations

## 🔍 Troubleshooting

### Dashboard Not Appearing
- Refresh Home Assistant page
- Check add-on is running
- Look for "Actual Budget" in sidebar

### Status Shows "Placeholder"
- Normal until first sync completes
- Tooltips indicate test vs real data
- Run manual sync to populate

### Service Issues
- Check add-on logs
- Verify configuration
- Use restart buttons in dashboard

## 📚 Support

1. Check add-on logs first
2. Review configuration settings
3. Create GitHub issue with details

## 🎉 Version 2.0.0

This version introduces **native Home Assistant integration** with dashboard tiles, replacing the separate web interface for a seamless HA experience.