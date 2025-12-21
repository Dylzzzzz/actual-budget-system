require('dotenv').config();
const express = require('express');
const api = require('@actual-app/api');
const app = express();
app.use(express.json());

const fs = require('fs');

// Timestamp helper for logging
function getTimestamp() {
  const now = new Date();
  const utc8 = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  const date = utc8.toISOString().split('T')[0];
  const time = utc8.toISOString().split('T')[1].split('.')[0];
  return `${date} ${time}`;
}

function log(...args) {
  console.log(`[${getTimestamp()}]`, ...args);
}

function logError(...args) {
  console.error(`[${getTimestamp()}]`, ...args);
}

// Enable garbage collection if available
if (global.gc) {
  log('Garbage collection available');
} else {
  log('Garbage collection not available - run with --expose-gc flag');
}

// Memory monitoring function
function logMemoryUsage(label) {
  const used = process.memoryUsage();
  log(`${label} - Memory: RSS ${(used.rss / 1024 / 1024).toFixed(2)}MB, Heap ${(used.heapUsed / 1024 / 1024).toFixed(2)}MB / ${(used.heapTotal / 1024 / 1024).toFixed(2)}MB`);

  // Trigger GC if heap usage is high
  if (used.heapUsed / used.heapTotal > 0.8 && global.gc) {
    log('🧹 Triggering garbage collection...');
    global.gc();
    const afterGC = process.memoryUsage();
    log(`After GC - Heap ${(afterGC.heapUsed / 1024 / 1024).toFixed(2)}MB / ${(afterGC.heapTotal / 1024 / 1024).toFixed(2)}MB`);
  }
}
const ACTUAL_SERVER_URL = process.env.ACTUAL_SERVER_URL;
const PASSWORD = process.env.PASSWORD;
const BUDGET_ID = process.env.BUDGET_ID;
const IMPORT_GROUP_ID = process.env.IMPORT_GROUP_ID;

log('ACTUAL_SERVER_URL:', ACTUAL_SERVER_URL);
log('BUDGET_ID:', BUDGET_ID);
log('IMPORT_GROUP_ID:', IMPORT_GROUP_ID);

let actualInitialized = false;
let initializationInProgress = false;
let initializationError = null;

function logMemory(label) {
  logMemoryUsage(label);
}

async function initActual() {
  if (actualInitialized) {
    return;
  }

  if (initializationInProgress) {
    throw new Error('Initialization in progress. Please try again in a few minutes.');
  }

  if (initializationError) {
    throw new Error(`Previous initialization failed: ${initializationError.message}`);
  }

  throw new Error('System not ready. Initialization may still be in progress.');
}

async function performBackgroundInit() {
  if (actualInitialized || initializationInProgress) {
    return;
  }

  initializationInProgress = true;
  initializationError = null;

  try {
    const dataPath = process.env.NODE_ENV === 'pi' ? '/home/homeassistant/actual-data' : './actual-data';
    if (!fs.existsSync(dataPath)) {
      fs.mkdirSync(dataPath, { recursive: true });
    }

    log('🚀 Starting Actual API initialization...');
    logMemoryUsage('Before API init');

    await api.init({
      serverURL: ACTUAL_SERVER_URL,
      password: PASSWORD,
      dataDir: dataPath,
    });

    log('✅ API initialized, downloading budget...');
    logMemoryUsage('After API init');

    // Force garbage collection before heavy operation
    if (global.gc) {
      global.gc();
      logMemoryUsage('After GC before budget download');
    }

    // Add timeout for budget download
    const downloadPromise = api.downloadBudget(BUDGET_ID);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Budget download timeout')), 300000) // 5 minutes
    );

    try {
      const budgetResult = await Promise.race([downloadPromise, timeoutPromise]);
      log('✅ Budget download completed successfully');
      logMemoryUsage('After budget download');
    } catch (downloadError) {
      logError('❌ Budget download failed:', downloadError.message);
      
      // Check if it's a migration error
      if (downloadError.message && downloadError.message.includes('out-of-sync-migration')) {
        logError('⚠️  Database migration mismatch detected!');
        logError('This usually means your Actual server version is newer than your API client.');
        logError('Solutions:');
        logError('  1. Update @actual-app/api: npm update @actual-app/api');
        logError('  2. Or delete ./actual-data directory to start fresh');
      }
      
      throw downloadError;
    }

    // Clean up after initialization
    if (global.gc) {
      global.gc();
      logMemoryUsage('After final GC');
    }

    actualInitialized = true;
    initializationInProgress = false;
    log('🎉 Actual API fully initialized and ready!');

  } catch (error) {
    logError('❌ Failed to initialize Actual API:', error);
    initializationError = error;
    initializationInProgress = false;

    // Clean up memory on error
    if (global.gc) {
      global.gc();
      logMemoryUsage('After error cleanup GC');
    }

    // Retry after 5 minutes
    setTimeout(() => {
      log('🔄 Retrying initialization...');
      initializationError = null;
      performBackgroundInit();
    }, 300000);
  }
}

// Create Accounts with 0 starting balance
app.post('/create_account', async (req, res) => {
  try {
    await initActual();
    const { accounts } = req.body;

    if (!Array.isArray(accounts)) {
      return res.status(400).json({ error: "accounts must be an array" });
    }

    const created = [];

    for (const acc of accounts) {
      const accountName = acc.name ? acc.name : "Unnamed";
      const accountType = acc.type ? acc.type : null;
      const offBudget = acc.offbudget ? acc.offbudget : false;

      log('Creating account:', accountName, 'Type:', accountType);

      const accountId = await api.createAccount({
        name: accountName,
        type: accountType,
        offbudget: offBudget,
        balance: 0
      });

      created.push({ accountName, accountId });
    }

    res.json({ created });
  } catch (err) {
    logError('Add accounts error:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.post('/import', async (req, res) => {
  const startTime = Date.now();
  const { accountId, transactions } = req.body;
  
  log(`Import started: ${accountId}, ${transactions?.length || 0} transactions`);
  log('Request body:', req.body);

  logMemoryUsage('Start of /import');
  
  const maxRetries = 3;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      log(`Attempt ${attempt + 1}/${maxRetries} - Calling initActual...`);
      await initActual();
      log('After initActual');
      logMemoryUsage('After initActual');

      log('Processing transactions for import...');
      
      // Process transactions to add cleared status
      const processedTransactions = transactions.map(transaction => {
        const processed = { ...transaction };
        
        // Map PocketSmith status to Actual cleared status
        if (transaction.status) {
          processed.cleared = transaction.status.toLowerCase() === 'posted';
        }
        
        // Ensure required fields
        if (!processed.imported_id) {
          processed.imported_id = transaction.id || `${transaction.date}-${transaction.amount}-${Date.now()}`;
        }
        
        return processed;
      });
      
      log(`Calling api.importTransactions with ${processedTransactions.length} processed transactions...`);
      
      // Clean up before heavy operation
      if (global.gc) {
        global.gc();
        logMemoryUsage('Before importTransactions (after GC)');
      }
      
      let result;
      try {
        result = await api.importTransactions(accountId, processedTransactions);
        log('importTransactions result:', result);
      } catch (err) {
        logError('Error in importTransactions:', err);
        throw err;
      }
      
      log('After importTransactions');
      logMemoryUsage('After importTransactions');

      // Clean up after operation
      if (global.gc) {
        global.gc();
        logMemoryUsage('After final cleanup GC');
      }

      if (!result) {
        logError('importTransactions returned undefined!');
        result = { added: 0, updated: 0 };
      }

      const duration = Date.now() - startTime;
      log(`Import completed: ${accountId}, ${duration}ms, added: ${result.added || 0}, updated: ${result.updated || 0}`);

      if (result && result.errors && result.errors.length > 0) {
        res.status(400).json({ 
          status: 'error', 
          errors: result.errors,
          duration,
          attempt: attempt + 1
        });
      } else {
        res.json({
          status: 'success',
          added: result ? result.added : 0,
          updated: result ? result.updated : 0,
          duration,
          attempt: attempt + 1,
          processed: processedTransactions.length
        });
      }
      return; // Success, exit retry loop
      
    } catch (err) {
      attempt++;
      logError(`Import attempt ${attempt} failed: ${accountId}, ${err.message}`);
      
      // Clean up on error
      if (global.gc) {
        global.gc();
        logMemoryUsage('After error cleanup GC');
      }
      
      if (attempt === maxRetries) {
        const duration = Date.now() - startTime;
        logError(`Import failed after ${maxRetries} attempts: ${accountId}`);
        
        res.status(500).json({ 
          status: 'error', 
          error: err.message, 
          stack: err.stack,
          duration,
          attempts: maxRetries,
          accountId
        });
        return;
      }
      
      // Wait before retry (exponential backoff)
      const waitTime = 1000 * Math.pow(2, attempt - 1);
      log(`Waiting ${waitTime}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
});

app.post('/add-categories', async (req, res) => {
  try {
    await initActual();
    const { categories } = req.body;
    const created = [];

    for (const cat of categories) {
      const categoryName = cat.categoryName ? cat.categoryName : "Unnamed";
      log('Creating category:', categoryName, 'with group_id:', IMPORT_GROUP_ID);
      const categoryId = await api.createCategory({
        name: categoryName,
        group_id: IMPORT_GROUP_ID,
      });
      created.push({ categoryName, categoryId });
    }

    res.json({ created });
  } catch (err) {
    logError('Add categories error:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Get budgets endpoint
app.get('/budgets', async (req, res) => {
  try {
    await initActual();
    const budgets = await api.getBudgets();
    log(`Found ${budgets.length} budgets`);
    res.json({
      status: 'success',
      budgets: budgets
    });
  } catch (err) {
    logError('Get budgets error:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Load budget endpoint
app.post('/load-budget', async (req, res) => {
  try {
    await initActual();
    const { budgetId } = req.body;
    if (!budgetId) {
      return res.status(400).json({ error: 'budgetId is required' });
    }
    
    log(`Loading budget: ${budgetId}`);
    await api.loadBudget(budgetId);
    log(`Successfully loaded budget: ${budgetId}`);
    
    res.json({
      status: 'success',
      message: `Budget ${budgetId} loaded successfully`
    });
  } catch (err) {
    logError('Load budget error:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// List accounts endpoint
app.get('/accounts', async (req, res) => {
  try {
    await initActual();
    const accounts = await api.getAccounts();
    res.json({
      status: 'success',
      accounts: accounts.map(acc => ({
        id: acc.id,
        name: acc.name,
        type: acc.type,
        offbudget: acc.offbudget,
        closed: acc.closed
      }))
    });
  } catch (err) {
    logError('Get accounts error:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Get categories endpoint
app.get('/categories', async (req, res) => {
  try {
    await initActual();
    const categories = await api.getCategories();
    res.json({
      status: 'success',
      categories: categories
    });
  } catch (err) {
    logError('Get categories error:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Get category groups endpoint
app.get('/category-groups', async (req, res) => {
  try {
    await initActual();
    const groups = await api.getCategoryGroups();
    res.json({
      status: 'success',
      groups: groups
    });
  } catch (err) {
    logError('Get category groups error:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Get payees endpoint
app.get('/payees', async (req, res) => {
  try {
    await initActual();
    const payees = await api.getPayees();
    res.json({
      status: 'success',
      payees: payees
    });
  } catch (err) {
    logError('Get payees error:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Get transactions endpoint
app.get('/transactions', async (req, res) => {
  try {
    await initActual();
    const { categoryGroupId, since } = req.query;
    
    let transactions = await api.getTransactions();
    
    // Filter by category group if specified
    if (categoryGroupId) {
      const categories = await api.getCategories();
      const categoryIds = categories
        .filter(cat => cat.cat_group === categoryGroupId || cat.group_id === categoryGroupId)
        .map(cat => cat.id);
      
      transactions = transactions.filter(t => categoryIds.includes(t.category));
    }
    
    // Filter by date if specified
    if (since) {
      const sinceDate = new Date(since);
      transactions = transactions.filter(t => new Date(t.date) >= sinceDate);
    }
    
    res.json({
      status: 'success',
      transactions: transactions
    });
  } catch (err) {
    logError('Get transactions error:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Update transaction endpoint
app.put('/transactions/:id', async (req, res) => {
  try {
    await initActual();
    const { id } = req.params;
    const updates = req.body;
    
    log(`Updating transaction ${id} with:`, updates);
    await api.updateTransaction(id, updates);
    
    res.json({
      status: 'success',
      message: `Transaction ${id} updated successfully`
    });
  } catch (err) {
    logError('Update transaction error:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Actual Budget API Server',
    initialized: actualInitialized,
    initializationInProgress: initializationInProgress,
    timestamp: new Date().toISOString()
  });
});

// Status endpoint
app.get('/status', (req, res) => {
  const memUsage = process.memoryUsage();
  res.json({
    initialized: actualInitialized,
    initializationInProgress: initializationInProgress,
    hasError: !!initializationError,
    error: initializationError?.message,
    uptime: process.uptime(),
    memory: {
      rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)}MB`,
      heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
      heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`,
      external: `${(memUsage.external / 1024 / 1024).toFixed(2)}MB`,
      heapUtilization: `${((memUsage.heapUsed / memUsage.heapTotal) * 100).toFixed(1)}%`
    },
    timestamp: new Date().toISOString()
  });
});

// Health endpoint for monitoring
app.get('/health', (req, res) => {
  const memUsage = process.memoryUsage();
  const isHealthy = actualInitialized && !initializationError;
  
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    initialized: actualInitialized,
    uptime: process.uptime(),
    memory: {
      heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
      heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`,
      heapUtilization: `${((memUsage.heapUsed / memUsage.heapTotal) * 100).toFixed(1)}%`
    },
    version: require('./package.json').version,
    timestamp: new Date().toISOString()
  });
});

// Memory cleanup endpoint (for manual cleanup if needed)
app.post('/cleanup', (req, res) => {
  const beforeGC = process.memoryUsage();

  if (global.gc) {
    global.gc();
    const afterGC = process.memoryUsage();

    res.json({
      status: 'success',
      message: 'Garbage collection triggered',
      before: {
        heapUsed: `${(beforeGC.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        heapTotal: `${(beforeGC.heapTotal / 1024 / 1024).toFixed(2)}MB`
      },
      after: {
        heapUsed: `${(afterGC.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        heapTotal: `${(afterGC.heapTotal / 1024 / 1024).toFixed(2)}MB`
      },
      freed: `${((beforeGC.heapUsed - afterGC.heapUsed) / 1024 / 1024).toFixed(2)}MB`
    });
  } else {
    res.json({
      status: 'error',
      message: 'Garbage collection not available'
    });
  }
});

// Reset initialization endpoint (for fixing migration issues)
app.post('/reset-init', async (req, res) => {
  try {
    log('🔄 Resetting initialization state...');
    
    // Reset state
    actualInitialized = false;
    initializationInProgress = false;
    initializationError = null;
    
    // Close current budget if open
    try {
      await api.shutdown();
      log('✅ Shut down existing API connection');
    } catch (err) {
      log('ℹ️  No active connection to shut down');
    }
    
    res.json({
      status: 'success',
      message: 'Initialization state reset. Call /retry-init to try again, or manually delete ./actual-data and restart.'
    });
  } catch (err) {
    logError('Reset error:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Retry initialization endpoint
app.post('/retry-init', async (req, res) => {
  try {
    if (actualInitialized) {
      return res.json({
        status: 'success',
        message: 'Already initialized'
      });
    }
    
    if (initializationInProgress) {
      return res.status(409).json({
        status: 'error',
        message: 'Initialization already in progress'
      });
    }
    
    log('🔄 Manual initialization retry requested...');
    
    // Start initialization in background
    performBackgroundInit().catch(err => {
      logError('Manual retry failed:', err.message);
    });
    
    res.json({
      status: 'success',
      message: 'Initialization started. Check /status for progress.'
    });
  } catch (err) {
    logError('Retry init error:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Handle unhandled promise rejections to prevent crashes
process.on('unhandledRejection', (reason, promise) => {
  logError('❌ Unhandled Promise Rejection:', reason);
  logError('Promise:', promise);
  // Don't exit the process - let the server keep running
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  log(`Server running on port ${PORT}`);

  // Start background initialization after server is running
  log('� StartingS background initialization...');
  performBackgroundInit().catch(err => {
    logError('❌ Background initialization failed:', err.message);
    // Error is already handled in performBackgroundInit
  });
});

log('Current working directory:', process.cwd());