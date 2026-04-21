const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const dgram = require('dgram'); 
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));

// Memoria de Agentes
const agents = {}; 

io.on('connection', (socket) => {
    socket.on('register', (data) => {
        if (data.type === 'agent') {
            const pcId = data.name;
            agents[pcId] = {
                id: socket.id,
                name: data.name,
                user: data.user,
                locked: agents[pcId] ? agents[pcId].locked : false,
                connected: true,
                cpu: 0,
                ram: 0
            };
            socket.agentName = pcId;
            io.emit('agent-list', Object.values(agents));
        } else {
            socket.emit('agent-list', Object.values(agents));
        }
    });

    socket.on('screen-data', (data) => {
        socket.broadcast.emit('screen-stream', { agentId: socket.id, image: data });
    });

    socket.on('remote-command', (data) => {
        const { targetId, command, params } = data;
        
        if (command === 'focus' || command === 'unfocus') {
            io.to(targetId).emit('stream-policy', { mode: command });
            return;
        }

        // Actualizar estados internos
        for (let name in agents) {
            if (agents[name].id === targetId) {
                if (command === 'lock') agents[name].locked = params.state;
                if (command === 'rename') {
                    // Marcar para limpieza al desconectar
                    socket.pendingRename = true;
                    socket.oldName = name;
                }
                if (command === 'delete-agent') delete agents[name];
                break;
            }
        }

        if (command !== 'delete-agent') {
            io.to(targetId).emit('execute-command', { command, params });
        }
        io.emit('agent-list', Object.values(agents));
    });

    socket.on('disconnect', () => {
        const name = socket.agentName;
        if (name && agents[name]) {
            if (socket.pendingRename) {
                // Si se desconectó por un rename, borramos el registro viejo
                delete agents[name];
            } else {
                agents[name].connected = false;
            }
            io.emit('agent-list', Object.values(agents));
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on ${PORT}`));
