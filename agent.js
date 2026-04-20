const io = require('socket.io-client');
const screenshot = require('screenshot-desktop');
const robot = require('robotjs');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// --- CONFIGURACIÓN DE CONEXIÓN ---
const CLOUD_URL = 'https://cyber-control-production.up.railway.app';
const RAW_AGENT_URL = 'https://raw.githubusercontent.com/samariofreddy-source/cyber-control/main/agent.js';
const VERSION = '1.0.2'; // Incrementa esto cuando cambies el código
// ---------------------------------

const pcName = process.env.COMPUTERNAME || 'PC-Student';
const userName = process.env.USERNAME || 'Alumno';

let socket = null;
let streamInterval = 2000;
let streamQuality = 15;
let timerId = null;

// Crear Pantalla de Bloqueo HTML
const lockHtmlPath = path.join(__dirname, 'lock_overlay.html');
const lockHtmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>SISTEMA BLOQUEADO</title>
    <style>
        body { background: #000; color: #fff; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; overflow: hidden; }
        .lock-icon { font-size: 100px; margin-bottom: 20px; }
        h1 { color: #ef4444; font-size: 3rem; text-align: center; }
        p { font-size: 1.5rem; text-align: center; max-width: 800px; line-height: 1.6; opacity: 0.8; }
    </style>
</head>
<body>
    <div class="lock-icon">🔒</div>
    <h1 id="title">ACCESO RESTRINGIDO</h1>
    <p id="msg">El profesor ha bloqueado esta computadora.</p>
    <script>
        const params = new URLSearchParams(window.location.search);
        if (params.get('msg')) document.getElementById('msg').innerText = params.get('msg');
    </script>
</body>
</html>`;
fs.writeFileSync(lockHtmlPath, lockHtmlContent);

function captureAndSend() {
    if (!socket || !socket.connected) return;
    screenshot({ format: 'jpg', quality: streamQuality }).then((img) => {
        socket.emit('screen-data', img.toString('base64'));
    }).catch(() => {});
    timerId = setTimeout(captureAndSend, streamInterval);
}

function connectToServer() {
    console.log(`Conectando: ${CLOUD_URL} (V: ${VERSION})`);
    socket = io(CLOUD_URL);

    socket.on('connect', () => {
        socket.emit('register', { type: 'agent', name: pcName, user: userName, version: VERSION });
        if (timerId) clearTimeout(timerId);
        captureAndSend();
    });

    socket.on('stream-policy', (policy) => {
        if (policy.mode === 'focus') {
            streamInterval = 200; streamQuality = 40;
        } else {
            streamInterval = 2000; streamQuality = 15;
        }
        if (timerId) clearTimeout(timerId);
        captureAndSend();
    });

    socket.on('execute-command', async (data) => {
        const { command, params } = data;
        
        if (command === 'update') {
            console.log('Descargando actualización...');
            try {
                const response = await axios.get(RAW_AGENT_URL);
                fs.writeFileSync(__filename, response.data);
                console.log('¡Actualizado! Reiniciando agente...');
                process.exit(0); 
            } catch (err) {
                console.error('Fallo al actualizar:', err.message);
            }
        }
        else if (command === 'mouse-click') {
            const size = robot.getScreenSize();
            robot.moveMouse(params.x * size.width, params.y * size.height);
            robot.mouseClick();
        } 
        else if (command === 'power') {
            const flag = params.action === 'shutdown' ? '/s /t 0' : '/r /t 0';
            exec(`shutdown ${flag}`);
        }
        else if (command === 'message') {
            const msg = params.text.replace(/"/g, '\"');
            exec(`powershell -Command "Add-Type -AssemblyName PresentationFramework;[System.Windows.MessageBox]::Show('${msg}', 'Mensaje del Profesor')"`);
        }
        else if (command === 'lock') {
            if (params.state) {
                const message = encodeURIComponent("El profesor te ha bloqueado la computadora");
                exec(`start microsoft-edge:file:///${lockHtmlPath.replace(/\\/g, '/')}?msg=${message}`);
            }
        }
    });

    socket.on('disconnect', () => { socket = null; });
}

connectToServer();
