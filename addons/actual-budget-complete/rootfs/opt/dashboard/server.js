const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { spawn } = require('child_process');

const PORT = 8099;

// Simple in-memory cache for entity states (updated by the main script)
let entityCache = {};

// Function to fetch entity state from Home Assistant (simplified)
function fetchEntityState(entityId, token) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'supervisor',
            port: 80,
            path: `/core/api/states/${entityId}`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            timeout: 5000
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const parsed = JSON.parse(data);
                        entityCache[entityId] = parsed; // Cache the result
                        resolve(parsed);
                    } catch (e) {
                        reject(new Error(`Parse error: ${e.message}`));
                    }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}`));
                }
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.end();
    });
}

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - pathname: "${parsedUrl.pathname}"`);
    
    // API endpoint to get entity states (handle both /dashboard-api/ and //dashboard-api/)
    if ((parsedUrl.pathname === '/dashboard-api/entity' || parsedUrl.pathname === '//dashboard-api/entity') && parsedUrl.query.id) {
        const entityId = parsedUrl.query.id;
        const token = process.env.SUPERVISOR_TOKEN;
        
        console.log(`API request for entity: ${entityId}`);
        
        if (!token) {
            console.log('No supervisor token available');
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: 'No supervisor token available',
                state: 'unknown',
                attributes: { friendly_name: 'Unknown' }
            }));
            return;
        }
        
        try {
            const entityData = await fetchEntityState(entityId, token);
            console.log(`Successfully fetched entity ${entityId}: state="${entityData.state}"`);
            res.writeHead(200, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify(entityData));
        } catch (error) {
            console.error('Error fetching entity:', entityId, error.message);
            // Return cached data if available, otherwise return placeholder
            if (entityCache[entityId]) {
                console.log(`Returning cached data for ${entityId}`);
                res.writeHead(200, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify(entityCache[entityId]));
            } else {
                console.log(`Returning placeholder data for ${entityId}`);
                res.writeHead(200, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify({ 
                    entity_id: entityId,
                    state: 'unavailable',
                    attributes: { 
                        friendly_name: entityId.replace('sensor.actual_budget_', '').replace(/_/g, ' '),
                        description: 'Unable to fetch data'
                    }
                }));
            }
        }
        return;
    }
    
    // HP Transactions API endpoint
    if ((parsedUrl.pathname === '/dashboard-api/hp-transactions' || parsedUrl.pathname === '//dashboard-api/hp-transactions')) {
        console.log('HP Transactions API request');
        
        try {
            // Read HP state file if it exists
            let hpState = {
                transactions: {},
                statistics: {
                    total_processed: 0,
                    total_submitted: 0,
                    total_paid: 0,
                    total_failed: 0
                }
            };
            
            const stateFile = '/data/hp-state.json';
            if (fs.existsSync(stateFile)) {
                const stateData = fs.readFileSync(stateFile, 'utf8');
                hpState = JSON.parse(stateData);
            }
            
            // Organize transactions by status
            const transactions = Object.values(hpState.transactions || {});
            const hpTransactions = {
                pending: transactions.filter(t => t.status === 'pending'),
                submitted: transactions.filter(t => t.status === 'submitted'),
                paid: transactions.filter(t => t.status === 'paid'),
                failed: transactions.filter(t => t.status === 'failed'),
                statistics: {
                    total_pending: transactions.filter(t => t.status === 'pending').length,
                    total_submitted: transactions.filter(t => t.status === 'submitted').length,
                    total_paid: transactions.filter(t => t.status === 'paid').length,
                    total_failed: transactions.filter(t => t.status === 'failed').length,
                    last_processing: hpState.last_processing || null,
                    success_rate: transactions.length > 0 ? 
                        Math.round((transactions.filter(t => t.status === 'submitted' || t.status === 'paid').length / transactions.length) * 100) : 100
                }
            };
            
            res.writeHead(200, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify(hpTransactions));
        } catch (error) {
            console.error('Error reading HP state:', error);
            // Return empty data on error
            const hpTransactions = {
                pending: [],
                submitted: [],
                paid: [],
                failed: [],
                statistics: {
                    total_pending: 0,
                    total_submitted: 0,
                    total_paid: 0,
                    total_failed: 0,
                    last_processing: null,
                    success_rate: 100
                }
            };
            
            res.writeHead(200, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify(hpTransactions));
        }
        return;
    }
    
    // HP Process trigger endpoint
    if ((parsedUrl.pathname === '/dashboard-api/hp-process' || parsedUrl.pathname === '//dashboard-api/hp-process') && req.method === 'POST') {
        console.log('HP Process trigger request');
        
        try {
            // Execute the HP processor script
            const { spawn } = require('child_process');
            const hpProcessor = spawn('node', ['/opt/hp-processor.js', '--manual'], {
                env: process.env,
                stdio: 'pipe'
            });
            
            let output = '';
            let errorOutput = '';
            
            hpProcessor.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            hpProcessor.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });
            
            hpProcessor.on('close', (code) => {
                try {
                    if (code === 0 && output) {
                        // Parse the JSON result from the processor
                        const result = JSON.parse(output.trim().split('\n').pop());
                        
                        res.writeHead(200, { 
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        });
                        res.end(JSON.stringify({
                            success: true,
                            message: 'HP transaction processing completed successfully',
                            ...result
                        }));
                    } else {
                        throw new Error(`Process exited with code ${code}: ${errorOutput}`);
                    }
                } catch (parseError) {
                    console.error('Failed to parse HP processor output:', parseError);
                    res.writeHead(500, { 
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(JSON.stringify({
                        success: false,
                        message: 'HP processing failed',
                        error: parseError.message
                    }));
                }
            });
            
            // Set a timeout for the processing
            setTimeout(() => {
                if (!hpProcessor.killed) {
                    hpProcessor.kill();
                    res.writeHead(408, { 
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(JSON.stringify({
                        success: false,
                        message: 'HP processing timed out',
                        error: 'Processing took too long'
                    }));
                }
            }, 60000); // 60 second timeout
            
        } catch (error) {
            console.error('Error triggering HP processing:', error);
            res.writeHead(500, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({
                success: false,
                message: 'Failed to trigger HP processing',
                error: error.message
            }));
        }
        return;
    }
    
    // HP Statistics endpoint
    if ((parsedUrl.pathname === '/dashboard-api/hp-stats' || parsedUrl.pathname === '//dashboard-api/hp-stats')) {
        console.log('HP Statistics API request');
        
        // Return mock statistics for now
        const hpStats = {
            automation_enabled: true,
            category_group_id: 'a85d9076-d269-4eb4-ab58-92d2f37997c6',
            processing_schedule: '0 */6 * * *',
            last_24h: {
                processed: 0,
                submitted: 0,
                paid: 0,
                failed: 0
            },
            all_time: {
                processed: 0,
                submitted: 0,
                paid: 0,
                failed: 0
            },
            success_rate: 100,
            average_processing_time: 0
        };
        
        res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify(hpStats));
        return;
    }
    
    // Serve the index.html file for all other requests
    console.log('Serving dashboard HTML');
    const filePath = path.join(__dirname, 'index.html');
    
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading index.html:', err);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Error loading dashboard');
            return;
        }
        
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
    });
});

server.on('error', (err) => {
    console.error('Server error:', err);
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Dashboard server running on port ${PORT}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully');
    server.close(() => {
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully');
    server.close(() => {
        process.exit(0);
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
});