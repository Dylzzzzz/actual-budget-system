#!/usr/bin/env node

/**
 * HP Transaction Processor
 * 
 * This script implements the HP (Home Practice) transaction automation system.
 * It detects, processes, and tracks HP business expense transactions from Actual Budget.
 * 
 * Uses the official Actual Budget JavaScript API SDK.
 */

const fs = require('fs');
const https = require('https');
const http = require('http');

// Import Actual Budget API
let actualApi;
try {
    actualApi = require('@actual-app/api');
} catch (error) {
    console.error('Actual Budget API not found. Please install: npm install @actual-app/api');
    process.exit(1);
}

class HPTransactionProcessor {
    constructor() {
        this.config = this.loadConfiguration();
        this.logFile = '/data/hp-processing.log';
        this.stateFile = '/data/hp-state.json';
        this.state = this.loadState();
        
        // Initialize counters
        this.counters = {
            pending: 0,
            submitted: 0,
            paid: 0,
            failed: 0,
            processed_today: 0
        };
        
        this.log('info', 'HP Transaction Processor initialized');
        this.log('info', `Category Group ID: ${this.config.hp_category_group_id}`);
        this.log('info', `Dry Run Mode: ${this.config.hp_dry_run_mode}`);
    }

    loadConfiguration() {
        try {
            // Load configuration from environment variables (set by the main script)
            const config = {
                actual_budget_url: process.env.ACTUAL_BUDGET_URL || 'http://localhost:5006',
                actual_budget_password: process.env.ACTUAL_BUDGET_PASSWORD,
                actual_budget_sync_id: process.env.ACTUAL_BUDGET_SYNC_ID, // Budget file ID
                hp_category_group_id: process.env.HP_CATEGORY_GROUP_ID || 'a85d9076-d269-4eb4-ab58-92d2f37997c6',
                xano_api_url: process.env.XANO_API_URL,
                xano_api_key: process.env.XANO_API_KEY,
                hp_dry_run_mode: process.env.HP_DRY_RUN_MODE === 'true',
                hp_max_transactions_per_batch: parseInt(process.env.HP_MAX_TRANSACTIONS_PER_BATCH) || 50,
                hp_retry_attempts: parseInt(process.env.HP_RETRY_ATTEMPTS) || 3,
                hp_retry_delay_seconds: parseInt(process.env.HP_RETRY_DELAY_SECONDS) || 300
            };
            
            this.log('info', 'Configuration loaded successfully');
            return config;
        } catch (error) {
            this.log('error', `Failed to load configuration: ${error.message}`);
            throw error;
        }
    }

    loadState() {
        try {
            if (fs.existsSync(this.stateFile)) {
                const stateData = fs.readFileSync(this.stateFile, 'utf8');
                const state = JSON.parse(stateData);
                this.log('info', `State loaded: ${Object.keys(state.transactions || {}).length} tracked transactions`);
                return state;
            }
        } catch (error) {
            this.log('warning', `Failed to load state file: ${error.message}`);
        }
        
        return {
            transactions: {},
            last_processing: null,
            statistics: {
                total_processed: 0,
                total_submitted: 0,
                total_paid: 0,
                total_failed: 0
            }
        };
    }

    saveState() {
        try {
            this.state.last_processing = new Date().toISOString();
            fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
            this.log('debug', 'State saved successfully');
        } catch (error) {
            this.log('error', `Failed to save state: ${error.message}`);
        }
    }

    log(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level: level.toUpperCase(),
            message,
            data
        };
        
        const logLine = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
        console.log(logLine);
        
        // Append to log file
        try {
            const logWithData = data ? `${logLine} | Data: ${JSON.stringify(data)}` : logLine;
            fs.appendFileSync(this.logFile, logWithData + '\n');
        } catch (error) {
            console.error('Failed to write to log file:', error.message);
        }
        
        // Update Home Assistant sensors
        this.updateHASensor('sensor.actual_budget_hp_last_processing', timestamp);
    }

    async updateHASensor(entityId, state, attributes = {}) {
        try {
            const token = process.env.SUPERVISOR_TOKEN;
            if (!token) {
                this.log('warning', 'No supervisor token available for HA sensor updates');
                return;
            }

            const data = JSON.stringify({
                state: state,
                attributes: {
                    friendly_name: entityId.replace('sensor.actual_budget_hp_', 'HP ').replace(/_/g, ' '),
                    last_update: new Date().toISOString(),
                    ...attributes
                }
            });

            const options = {
                hostname: 'supervisor',
                port: 80,
                path: `/core/api/states/${entityId}`,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data)
                }
            };

            const req = http.request(options, (res) => {
                if (res.statusCode === 200 || res.statusCode === 201) {
                    this.log('debug', `Updated HA sensor ${entityId}: ${state}`);
                } else {
                    this.log('warning', `Failed to update HA sensor ${entityId}: HTTP ${res.statusCode}`);
                }
            });

            req.on('error', (error) => {
                this.log('warning', `Error updating HA sensor ${entityId}: ${error.message}`);
            });

            req.write(data);
            req.end();
        } catch (error) {
            this.log('warning', `Failed to update HA sensor ${entityId}: ${error.message}`);
        }
    }

    async initializeActualBudget() {
        try {
            this.log('info', 'Initializing Actual Budget API connection...');
            
            // Initialize the API
            await actualApi.init({
                serverURL: this.config.actual_budget_url,
                password: this.config.actual_budget_password,
                dataDir: '/tmp/actual-data'
            });
            
            this.log('info', 'Actual Budget API initialized successfully');
            
            // Load the budget file
            if (this.config.actual_budget_sync_id) {
                this.log('info', `Loading budget file: ${this.config.actual_budget_sync_id}`);
                await actualApi.downloadBudget({ syncId: this.config.actual_budget_sync_id });
            } else {
                // Get available budgets and use the first one
                const budgets = await actualApi.getBudgets();
                if (budgets.length === 0) {
                    throw new Error('No budget files found');
                }
                
                const budget = budgets[0];
                this.log('info', `Loading first available budget: ${budget.name} (${budget.cloudFileId})`);
                await actualApi.downloadBudget({ syncId: budget.cloudFileId });
            }
            
            this.log('info', 'Budget loaded successfully');
            return true;
            
        } catch (error) {
            this.log('error', `Failed to initialize Actual Budget: ${error.message}`);
            throw error;
        }
    }

    async shutdownActualBudget() {
        try {
            await actualApi.shutdown();
            this.log('info', 'Actual Budget API shutdown complete');
        } catch (error) {
            this.log('warning', `Error during Actual Budget shutdown: ${error.message}`);
        }
    }

    async fetchHPTransactions() {
        this.log('info', 'Starting HP transaction detection...');
        
        try {
            // Step 1: Get all category groups
            this.log('info', 'Fetching category groups from Actual Budget...');
            const categoryGroups = await actualApi.getCategoryGroups();
            
            this.log('info', `Found ${categoryGroups.length} category groups`);
            
            // Find HP category group
            const hpCategoryGroup = categoryGroups.find(group => 
                group.id === this.config.hp_category_group_id || 
                group.name === 'HP' || 
                group.name.toLowerCase().includes('hp')
            );
            
            if (!hpCategoryGroup) {
                this.log('error', `HP category group not found. Looking for ID: ${this.config.hp_category_group_id}`);
                this.log('info', `Available category groups: ${categoryGroups.map(g => `${g.name} (${g.id})`).join(', ')}`);
                return [];
            }
            
            this.log('info', `Found HP category group: "${hpCategoryGroup.name}" (${hpCategoryGroup.id})`);
            
            // Step 2: Get all categories and filter for HP group
            this.log('info', 'Fetching categories in HP group...');
            const allCategories = await actualApi.getCategories();
            const hpCategories = allCategories.filter(cat => cat.group_id === hpCategoryGroup.id);
            
            this.log('info', `Found ${hpCategories.length} HP categories:`);
            hpCategories.forEach(cat => {
                this.log('info', `  - ${cat.name} (${cat.id})`);
            });
            
            if (hpCategories.length === 0) {
                this.log('warning', 'No categories found in HP group');
                return [];
            }
            
            // Step 3: Get all accounts to fetch transactions from
            this.log('info', 'Fetching accounts...');
            const accounts = await actualApi.getAccounts();
            const onBudgetAccounts = accounts.filter(acc => !acc.offbudget && !acc.closed);
            
            this.log('info', `Found ${onBudgetAccounts.length} on-budget accounts`);
            
            // Step 4: Get transactions for HP categories from all accounts
            this.log('info', 'Fetching transactions for HP categories...');
            const hpCategoryIds = hpCategories.map(cat => cat.id);
            
            // Get transactions from the last 30 days
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const startDate = thirtyDaysAgo.toISOString().split('T')[0];
            const endDate = new Date().toISOString().split('T')[0];
            
            let allTransactions = [];
            
            for (const account of onBudgetAccounts) {
                try {
                    const transactions = await actualApi.getTransactions(account.id, startDate, endDate);
                    const hpTransactions = transactions.filter(t => 
                        t.category && hpCategoryIds.includes(t.category)
                    );
                    
                    if (hpTransactions.length > 0) {
                        this.log('info', `Found ${hpTransactions.length} HP transactions in account: ${account.name}`);
                        allTransactions = allTransactions.concat(hpTransactions);
                    }
                } catch (error) {
                    this.log('warning', `Failed to fetch transactions for account ${account.name}: ${error.message}`);
                }
            }
            
            this.log('info', `Found ${allTransactions.length} total HP transactions in the last 30 days`);
            
            // Step 5: Filter for eligible transactions
            const eligibleTransactions = allTransactions.filter(transaction => {
                // Must be cleared (reconciled)
                if (!transaction.cleared) {
                    return false;
                }
                
                // Must not have HP status tags in notes
                const notes = transaction.notes || '';
                if (notes.includes('#HP-Submitted') || notes.includes('#HP-Paid')) {
                    return false;
                }
                
                return true;
            });
            
            this.log('info', `Found ${eligibleTransactions.length} eligible HP transactions for processing`);
            
            // Log details about each eligible transaction
            eligibleTransactions.forEach((transaction, index) => {
                const category = hpCategories.find(cat => cat.id === transaction.category);
                const amount = Math.abs(transaction.amount / 100).toFixed(2);
                this.log('info', `  ${index + 1}. ${transaction.payee || 'Unknown Payee'} - $${amount} - ${category?.name || 'Unknown Category'} - ${transaction.date}`);
            });
            
            return eligibleTransactions;
            
        } catch (error) {
            this.log('error', `Failed to fetch HP transactions: ${error.message}`);
            throw error;
        }
    }

    async processTransaction(transaction) {
        const transactionId = transaction.id;
        
        try {
            this.log('info', `Processing transaction ${transactionId}: ${transaction.payee} - $${Math.abs(transaction.amount / 100).toFixed(2)}`);
            
            // Track transaction in state
            if (!this.state.transactions[transactionId]) {
                this.state.transactions[transactionId] = {
                    id: transactionId,
                    payee: transaction.payee,
                    amount: transaction.amount,
                    date: transaction.date,
                    category: transaction.category,
                    status: 'pending',
                    created_at: new Date().toISOString(),
                    attempts: 0
                };
            }
            
            const trackedTransaction = this.state.transactions[transactionId];
            trackedTransaction.attempts += 1;
            trackedTransaction.last_attempt = new Date().toISOString();
            
            if (this.config.hp_dry_run_mode) {
                this.log('info', `DRY RUN: Would submit transaction ${transactionId} to Xano`);
                trackedTransaction.status = 'submitted';
                trackedTransaction.submitted_at = new Date().toISOString();
                this.counters.submitted += 1;
                
                // Simulate adding note tag
                this.log('info', `DRY RUN: Would add #HP-Submitted tag to transaction notes`);
                return { success: true, message: 'Dry run successful' };
            }
            
            // Submit to Xano (implement actual submission logic here)
            const submissionResult = await this.submitToXano(transaction);
            
            if (submissionResult.success) {
                trackedTransaction.status = 'submitted';
                trackedTransaction.submitted_at = new Date().toISOString();
                trackedTransaction.xano_id = submissionResult.xano_id;
                this.counters.submitted += 1;
                
                // Add note tag to transaction
                await this.addNoteTag(transaction, '#HP-Submitted');
                
                this.log('info', `Successfully submitted transaction ${transactionId} to Xano`);
                return { success: true, message: 'Transaction submitted successfully' };
            } else {
                trackedTransaction.status = 'failed';
                trackedTransaction.error = submissionResult.error;
                this.counters.failed += 1;
                
                this.log('error', `Failed to submit transaction ${transactionId}: ${submissionResult.error}`);
                return { success: false, error: submissionResult.error };
            }
            
        } catch (error) {
            this.log('error', `Error processing transaction ${transactionId}: ${error.message}`);
            
            if (this.state.transactions[transactionId]) {
                this.state.transactions[transactionId].status = 'failed';
                this.state.transactions[transactionId].error = error.message;
            }
            
            this.counters.failed += 1;
            return { success: false, error: error.message };
        }
    }

    async submitToXano(transaction) {
        try {
            this.log('info', `Submitting transaction to Xano: ${transaction.id}`);
            
            const xanoData = {
                actual_transaction_id: transaction.id,
                payee: transaction.payee,
                amount: Math.abs(transaction.amount / 100), // Convert from cents to dollars
                date: transaction.date,
                category: transaction.category,
                notes: transaction.notes || '',
                account: transaction.account
            };
            
            // Make request to Xano API
            const response = await this.makeXanoRequest('/transactions', 'POST', xanoData);
            
            return {
                success: true,
                xano_id: response.id,
                message: 'Transaction submitted to Xano successfully'
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async makeXanoRequest(endpoint, method = 'GET', data = null) {
        return new Promise((resolve, reject) => {
            const url = new URL(endpoint, this.config.xano_api_url);
            
            const options = {
                hostname: url.hostname,
                port: url.port || 443,
                path: url.pathname + url.search,
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.xano_api_key}`
                }
            };

            if (data) {
                const jsonData = JSON.stringify(data);
                options.headers['Content-Length'] = Buffer.byteLength(jsonData);
            }

            const req = https.request(options, (res) => {
                let responseData = '';
                
                res.on('data', (chunk) => {
                    responseData += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const parsed = responseData ? JSON.parse(responseData) : {};
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(parsed);
                        } else {
                            reject(new Error(`Xano API error ${res.statusCode}: ${parsed.message || responseData}`));
                        }
                    } catch (error) {
                        reject(new Error(`Parse error: ${error.message}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            if (data) {
                req.write(JSON.stringify(data));
            }
            
            req.end();
        });
    }

    async addNoteTag(transaction, tag) {
        try {
            const currentNotes = transaction.notes || '';
            const newNotes = currentNotes ? `${currentNotes} ${tag}` : tag;
            
            // Use the official API to update transaction
            await actualApi.updateTransaction(transaction.id, {
                notes: newNotes
            });
            
            this.log('info', `Added tag "${tag}" to transaction ${transaction.id}`);
        } catch (error) {
            this.log('error', `Failed to add tag to transaction ${transaction.id}: ${error.message}`);
        }
    }

    async updateCounters() {
        // Reset counters
        this.counters = {
            pending: 0,
            submitted: 0,
            paid: 0,
            failed: 0,
            processed_today: 0
        };
        
        // Count transactions by status
        const today = new Date().toISOString().split('T')[0];
        
        Object.values(this.state.transactions).forEach(transaction => {
            switch (transaction.status) {
                case 'pending':
                    this.counters.pending += 1;
                    break;
                case 'submitted':
                    this.counters.submitted += 1;
                    break;
                case 'paid':
                    this.counters.paid += 1;
                    break;
                case 'failed':
                    this.counters.failed += 1;
                    break;
            }
            
            // Count today's processing
            if (transaction.created_at && transaction.created_at.startsWith(today)) {
                this.counters.processed_today += 1;
            }
        });
        
        // Update Home Assistant sensors
        await this.updateHASensor('sensor.actual_budget_hp_pending_transactions', this.counters.pending);
        await this.updateHASensor('sensor.actual_budget_hp_submitted_transactions', this.counters.submitted);
        await this.updateHASensor('sensor.actual_budget_hp_paid_transactions', this.counters.paid);
        await this.updateHASensor('sensor.actual_budget_hp_failed_transactions', this.counters.failed);
        
        this.log('info', `Updated counters - Pending: ${this.counters.pending}, Submitted: ${this.counters.submitted}, Paid: ${this.counters.paid}, Failed: ${this.counters.failed}`);
    }

    async processAllTransactions() {
        try {
            this.log('info', '=== Starting HP Transaction Processing Run ===');
            
            // Initialize Actual Budget API
            await this.initializeActualBudget();
            
            // Update automation status
            await this.updateHASensor('sensor.actual_budget_hp_automation_status', 'running', {
                description: 'Processing HP transactions'
            });
            
            // Fetch eligible transactions
            const transactions = await this.fetchHPTransactions();
            
            if (transactions.length === 0) {
                this.log('info', 'No eligible HP transactions found for processing');
                await this.updateHASensor('sensor.actual_budget_hp_automation_status', 'idle', {
                    description: 'No transactions to process'
                });
                await this.updateCounters();
                return { processed: 0, submitted: 0, failed: 0 };
            }
            
            // Process transactions in batches
            const batchSize = Math.min(transactions.length, this.config.hp_max_transactions_per_batch);
            const transactionsToProcess = transactions.slice(0, batchSize);
            
            this.log('info', `Processing ${transactionsToProcess.length} transactions (batch size: ${batchSize})`);
            
            let processed = 0;
            let submitted = 0;
            let failed = 0;
            
            for (const transaction of transactionsToProcess) {
                const result = await this.processTransaction(transaction);
                processed += 1;
                
                if (result.success) {
                    submitted += 1;
                } else {
                    failed += 1;
                }
                
                // Small delay between transactions to avoid overwhelming APIs
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // Update statistics
            this.state.statistics.total_processed += processed;
            this.state.statistics.total_submitted += submitted;
            this.state.statistics.total_failed += failed;
            
            // Save state
            this.saveState();
            
            // Update counters and sensors
            await this.updateCounters();
            await this.updateHASensor('sensor.actual_budget_hp_automation_status', 'completed', {
                description: `Processed ${processed} transactions`
            });
            
            this.log('info', `=== Processing Complete - Processed: ${processed}, Submitted: ${submitted}, Failed: ${failed} ===`);
            
            return { processed, submitted, failed };
            
        } catch (error) {
            this.log('error', `HP transaction processing failed: ${error.message}`);
            await this.updateHASensor('sensor.actual_budget_hp_automation_status', 'error', {
                description: `Processing failed: ${error.message}`
            });
            throw error;
        } finally {
            // Always shutdown the API connection
            await this.shutdownActualBudget();
        }
    }
}

// Main execution
async function main() {
    try {
        const processor = new HPTransactionProcessor();
        
        // Check if this is a manual trigger or scheduled run
        const isManualTrigger = process.argv.includes('--manual');
        
        if (isManualTrigger) {
            processor.log('info', 'Manual HP transaction processing triggered');
        } else {
            processor.log('info', 'Scheduled HP transaction processing started');
        }
        
        const result = await processor.processAllTransactions();
        
        console.log(JSON.stringify({
            success: true,
            ...result,
            timestamp: new Date().toISOString()
        }));
        
        process.exit(0);
        
    } catch (error) {
        console.error(JSON.stringify({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        }));
        
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully');
    process.exit(0);
});

if (require.main === module) {
    main();
}

module.exports = HPTransactionProcessor;