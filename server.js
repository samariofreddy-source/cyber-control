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

udpServer.on('error', (err) => {
    console.error('UDP Server error:', err.message);
});

udpServer.bind(() => {
    try {
        udpServer.setBroadcast(true);
        console.log('UDP Broadcast active for auto-discovery');
    } catch (e) {
        console.error('Could not enable UDP broadcast:', e.message);
    }
});
// -------------------------------------------------

app.use(express.static(__dirname));

// Store connected agents
const agents = {}; // Use name as key for persistence

let adminsCount = 0;

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('register', (data) => {
        if (data.type === 'agent') {
            // Unificar por nombre de PC para evitar duplicados
            const pcId = data.name; 
            agents[pcId] = {
                id: socket.id, // Current socket
                name: data.name,
                user: data.user,
                version: data.version || '1.0.0', // Aseguramos que se guarde
                locked: agents[pcId] ? agents[pcId].locked : false,
                connected: true,
                cpu: 10,
                ram: 30
            };
            // Guardar el mapeo de socket -> nombre para el disconnect
            socket.agentName = pcId;
            
            console.log(`Agent registered: ${data.name}`);
            
            // Informar al agente si debe empezar a transmitir de inmediato
            socket.emit('stream-control', { enabled: adminsCount > 0 });
            
            io.emit('agent-list', Object.values(agents));
        } else {
            socket.join('admins');
            socket.isAdmin = true;
            adminsCount++;
            console.log(`Admin connected. Total: ${adminsCount}`);
            
            // Si es el primer admin, pedirle a todas las PCs que empiecen a transmitir
            if (adminsCount === 1) {
                io.emit('stream-control', { enabled: true });
            }
            
            socket.emit('agent-list', Object.values(agents));
        }
    });

    socket.on('screen-data', (data) => {
        socket.broadcast.emit('screen-stream', {
            agentId: socket.id,
            image: data
        });
    });

    socket.on('remote-command', (data) => {
        const { targetId, command, params } = data;
        
        // El targetId aquí es el socket.id
        if (command === 'focus' || command === 'unfocus') {
            io.to(targetId).emit('stream-policy', { mode: command });
            return;
        }

        // Actualizar estado de bloqueo en la memoria persistente
        for (let name in agents) {
            if (agents[name].id === targetId) {
                if (command === 'lock') agents[name].locked = params.state;
                
                if (command === 'rename') {
                    const newName = params.name;
                    const agentData = agents[name];
                    delete agents[name]; // Eliminar el nombre viejo
                    agentData.name = newName;
                    agents[newName] = agentData; // Insertar con el nuevo nombre
                    
                    // Actualizar el socket del agente para que al desconectarse 
                    // sepa que el nombre ya cambió
                    const agentSocket = io.sockets.sockets.get(targetId);
                    if (agentSocket) {
                        agentSocket.agentName = newName;
                    }
                    console.log(`PC Renombrada: ${name} -> ${newName}`);
                }

                if (command === 'delete-agent') {
                    console.log(`Eliminando agente: ${name}`);
                    delete agents[name];
                }
                break;
            }
        }
        
        if (command !== 'delete-agent') {
            io.to(targetId).emit('execute-command', { command, params });
        }

        // Solo refrescar la lista global si el comando cambió el estado persistente
        const stateCommands = ['lock', 'rename', 'delete-agent', 'register'];
        if (stateCommands.includes(command)) {
            io.emit('agent-list', Object.values(agents));
        }
    });

    socket.on('disconnect', () => {
        if (socket.isAdmin) {
            adminsCount--;
            console.log(`Admin disconnected. Total: ${adminsCount}`);
            // Si no quedan admins, pedirle a todas las PCs que dejen de transmitir
            if (adminsCount === 0) {
                io.emit('stream-control', { enabled: false });
            }
        }

        const agentName = socket.agentName;
        if (agentName && agents[agentName]) {
            console.log(`Agent offline: ${agentName}`);
            agents[agentName].connected = false;
            io.emit('agent-list', Object.values(agents));
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
