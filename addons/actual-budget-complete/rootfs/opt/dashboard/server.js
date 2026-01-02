const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

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