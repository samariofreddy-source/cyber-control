const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const dgram = require('dgram'); // Para descubrimiento automático
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
    }
});

// --- Descubrimiento Automático (UDP Broadcast) ---
const udpServer = dgram.createSocket('udp4');
const BROADCAST_PORT = 41234;

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

setInterval(() => {
    const ip = getLocalIP();
    const message = Buffer.from(`CYBERCONTROL_SERVER:${ip}`);
    udpServer.send(message, 0, message.length, BROADCAST_PORT, '255.255.255.255', (err) => {
        if (err) console.error('UDP Broadcast error:', err);
    });
}, 3000); // Avisa cada 3 segundos donde está el servidor

udpServer.bind(() => {
    udpServer.setBroadcast(true);
    console.log('UDP Broadcast active for auto-discovery');
});
// -------------------------------------------------

app.use(express.static(__dirname));

// Store connected agents
const agents = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Identify as Admin or Agent
    socket.on('register', (data) => {
        if (data.type === 'agent') {
            agents[socket.id] = {
                id: socket.id,
                name: data.name,
                user: data.user,
                locked: false,
                cpu: 10,
                ram: 30
            };
            console.log(`Agent registered: ${data.name}`);
            io.emit('agent-list', Object.values(agents));
        } else {
            console.log('Admin connected');
            socket.emit('agent-list', Object.values(agents));
        }
    });

    // Screen frame relay
    socket.on('screen-data', (data) => {
        socket.broadcast.emit('screen-stream', {
            agentId: socket.id,
            image: data
        });
    });

    // Remote Control Commands (Admin -> Agent)
    socket.on('remote-command', (data) => {
        const { targetId, command, params } = data;
        
        // Optimización: Manejar foco para streaming dinámico
        if (command === 'focus' || command === 'unfocus') {
            if (io.sockets.sockets.get(targetId)) {
                io.to(targetId).emit('stream-policy', { mode: command });
            }
            return;
        }

        // Update local state if it's a persistent state change
        if (command === 'lock' && agents[targetId]) {
            agents[targetId].locked = params.state;
            io.emit('agent-list', Object.values(agents));
        }

        if (io.sockets.sockets.get(targetId)) {
            io.to(targetId).emit('execute-command', { command, params });
        }
    });

    socket.on('disconnect', () => {
        if (agents[socket.id]) {
            console.log(`Agent disconnected: ${agents[socket.id].name}`);
            delete agents[socket.id];
            io.emit('agent-list', Object.values(agents));
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
