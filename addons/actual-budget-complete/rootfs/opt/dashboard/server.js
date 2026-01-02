const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8099;

// Function to fetch entity state from Home Assistant
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
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(e);
                    }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        req.end();
    });
}

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    
    // API endpoint to get entity states
    if (parsedUrl.pathname === '/api/entity' && parsedUrl.query.id) {
        const entityId = parsedUrl.query.id;
        const token = process.env.SUPERVISOR_TOKEN;
        
        if (!token) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'No supervisor token available' }));
            return;
        }
        
        try {
            const entityData = await fetchEntityState(entityId, token);
            res.writeHead(200, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify(entityData));
        } catch (error) {
            console.error('Error fetching entity:', entityId, error.message);
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Entity not found', details: error.message }));
        }
        return;
    }
    
    // Serve the index.html file for all other requests
    const filePath = path.join(__dirname, 'index.html');
    
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Error loading dashboard');
            return;
        }
        
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
    });
});

server.listen(PORT, () => {
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