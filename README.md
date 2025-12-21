# Actual Budget System

A complete Home Assistant integration for Actual Budget with native dashboard tiles, Node.js API server management, and Xero synchronization capabilities.

## 🏗️ Nested Repository Structure

This repository is designed to be nested within your Xano development workspace:

```
workspace-root/                    # Your Xano development workspace
├── tables/                        # Xano backend files (ignored by git)
├── functions/                     # Xano backend files (ignored by git)
├── apis/                          # Xano backend files (ignored by git)
├── addons/                        # Xano backend files (ignored by git)
├── tools/                         # Xano backend files (ignored by git)
├── mcp_servers/                   # Xano backend files (ignored by git)
├── agents/                        # Xano backend files (ignored by git)
├── docs/                          # Xano documentation (ignored by git)
├── 
└── actual-budget-system/          # 🎯 THIS REPOSITORY
    ├── .git/                      # Git repository root
    ├── .gitignore                 # Ignores parent Xano files
    ├── repository.yaml            # HA repository config
    ├── addons/                    # HA add-ons (different from parent addons/)
    │   └── actual-budget-complete/
    ├── api/                       # Node.js API server
    ├── server/                    # Actual Budget server setup
    └── README.md                  # This file
```

## 🎯 Key Benefits of Nested Structure

### ✅ **Clear Separation**
- **Xano Development**: Parent workspace for Xano backend development
- **Actual Budget System**: This repository for versioned components
- **No Naming Conflicts**: Each `addons/` folder has clear purpose

### ✅ **Clean Git History**
- Only tracks Actual Budget system components
- Ignores all Xano development files
- Fresh repository without historical bloat

### ✅ **Flexible Development**
- Work on Xano backend independently
- Version control only what should be shared
- Deploy components separately or together

## 📱 Native Home Assistant Dashboard

### **Replaces Web Interface**
Instead of a separate browser tab, you get:
- **Sidebar Navigation**: "Actual Budget" appears in HA sidebar
- **Native Dashboard Tiles**: Status and statistics integrated into HA
- **Action Buttons**: Trigger sync, restart services, view logs
- **Real-time Updates**: Live status updates without page refresh

### **Dashboard Tiles Include:**

#### **Status Tiles**
- 🟢 **System Status**: Overall health (running/degraded/failed)
- 🔧 **API Server Status**: Node.js API server health
- 🖥️ **Actual Budget Server**: Official server status
- 🔄 **Last Sync**: Last synchronization time and result

#### **Statistics Tiles**
- 📊 **Transactions Processed**: Total processed count
- ✅ **Successful Imports**: Successfully imported to Xero
- ❌ **Failed Transactions**: Failed import count
- ⏳ **Pending Mappings**: Awaiting category mapping

#### **Action Buttons**
- ▶️ **Manual Sync**: Trigger immediate synchronization
- 🔄 **Reprocess Failed**: Retry failed transactions
- 🔧 **Restart API Server**: Restart Node.js API service
- 🖥️ **Restart Actual Server**: Restart Actual Budget service

### **Smart Tooltips & Documentation**
- **Clear Status Indicators**: Green=Good, Yellow=Warning, Red=Error
- **Helpful Tooltips**: Hover explanations for all tiles
- **Placeholder Indicators**: Clear marking of test vs real data
- **Action Confirmations**: Notifications for all operations

## 🚀 Installation

### **1. Add Repository to Home Assistant**
```
Repository URL: https://github.com/Dylzzzzz/actual-budget-system
```

### **2. Install Add-on**
- Install "Actual Budget Complete" add-on
- Configure through HA interface
- Add-on appears in HA sidebar automatically

### **3. Configuration**
All configuration through Home Assistant interface:
- **Service Management**: Choose which services to manage
- **API Credentials**: Xero client ID, secret, tenant ID
- **Sync Settings**: Schedule, batch size, rate limits
- **Safety Options**: Dry run mode, test mode

## 🔧 Service Management Options

### **Managed Services (Default)**
Add-on manages everything:
- Starts/stops API server and Actual Budget server
- Health monitoring and auto-restart
- Integrated configuration

### **External Services**
Point to existing services:
- Use existing API server on Pi
- Connect to external Actual Budget server
- Add-on provides dashboard and sync only

### **Hybrid Mode**
Mix and match:
- Manage API server, use external Actual Budget server
- Or vice versa

## 📊 Monitoring & Health Checks

### **Automatic Health Monitoring**
- **Service Health**: Continuous process and port monitoring
- **Auto-restart**: Configurable automatic service recovery
- **Status Updates**: Real-time dashboard tile updates
- **Notifications**: HA notifications for important events

### **Manual Actions**
- **Restart Services**: Individual service restart buttons
- **Manual Sync**: On-demand synchronization
- **Reprocess Failed**: Retry failed transactions
- **View Logs**: Access detailed operation logs

## 🛠️ Development & Deployment

### **Local Development**
```bash
# Work in parent workspace for Xano development
cd workspace-root/
# Edit tables/, functions/, apis/, etc.

# Work in nested repository for Actual Budget system
cd actual-budget-system/
git add .
git commit -m "Update HA integration"
git push
```

### **Pi Deployment (API Server Only)**
```bash
# Sparse checkout for API server only
git clone --depth 1 --filter=blob:none --sparse https://github.com/Dylzzzzz/actual-budget-system
cd actual-budget-system
git sparse-checkout set api
cd api && npm install && node index.js
```

### **Full Stack Deployment**
```bash
# Clone entire repository
git clone https://github.com/Dylzzzzz/actual-budget-system
cd actual-budget-system
docker-compose up -d
```

## 📚 Documentation

- [Configuration Guide](docs/configuration.md)
- [Dashboard Guide](docs/dashboard.md)
- [Troubleshooting](docs/troubleshooting.md)
- [API Documentation](docs/api.md)
- [Development Guide](docs/development.md)

## 🎯 Migration from Web Interface

### **What Changes:**
- ❌ **No more separate browser tab**
- ✅ **Native HA sidebar item**
- ✅ **Integrated dashboard tiles**
- ✅ **Real-time status updates**
- ✅ **HA notifications for events**

### **What Stays the Same:**
- ✅ **All functionality preserved**
- ✅ **Same API endpoints**
- ✅ **Same configuration options**
- ✅ **Same sync capabilities**

## 🤝 Support

1. Check HA add-on logs
2. Review [troubleshooting guide](docs/troubleshooting.md)
3. Create GitHub issue with logs

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.