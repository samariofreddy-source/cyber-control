const io = require('socket.io-client');
const screenshot = require('screenshot-desktop');
const robot = require('robotjs');
const dgram = require('dgram');

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const pcName = process.env.COMPUTERNAME || 'PC-Student';
const userName = process.env.USERNAME || 'Alumno';

const BROADCAST_PORT = 41234;
const client = dgram.createSocket('udp4');
let socket = null;
let isLocked = false;
let streamInterval = 2000; // Por defecto: 1 foto cada 2 segundos (Ahorro)
let streamQuality = 15;    // Calidad muy baja para miniaturas
let streamActive = true;
let timerId = null;

// Create Lock Screen HTML (Temporary file)
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
        if (params.get('title')) document.getElementById('title').innerText = params.get('title');
    </script>
</body>
</html>`;
fs.writeFileSync(lockHtmlPath, lockHtmlContent);

function captureAndSend() {
    if (!socket || !socket.connected || !streamActive) return;
    
    // Captura con calidad y tamaño optimizado
    screenshot({ format: 'jpg', quality: streamQuality }).then((img) => {
        socket.emit('screen-data', img.toString('base64'));
    }).catch(() => {});
    
    timerId = setTimeout(captureAndSend, streamInterval);
}

function connectToServer(url) {
    console.log(`Conectando a: ${url}`);
    socket = io(url);

    socket.on('connect', () => {
        socket.emit('register', { type: 'agent', name: pcName, user: userName });
        if (timerId) clearTimeout(timerId);
        captureAndSend();
    });

    // Control de políticas de streaming (Foco)
    socket.on('stream-policy', (policy) => {
        if (policy.mode === 'focus') {
            streamInterval = 200; // Rápido (5 FPS) cuando el profe te está viendo
            streamQuality = 40;   // Mejor calidad
            console.log('Modo Enfoque: Streaming rápido activado');
        } else {
            streamInterval = 2000; // Lento (1 foto / 2 seg) para el resto
            streamQuality = 15;    // Calidad miniatura
            console.log('Modo Reposo: Streaming lento activado');
        }
        if (timerId) clearTimeout(timerId);
        captureAndSend();
    });

    socket.on('execute-command', (data) => {
        const { command, params } = data;
        
        if (command === 'mouse-click') {
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
            // Show message using PowerShell (Native in Windows)
            exec(`powershell -Command "Add-Type -AssemblyName PresentationFramework;[System.Windows.MessageBox]::Show('${msg}', 'Mensaje del Profesor')"`);
        }
        else if (command === 'lock') {
            isLocked = params.state;
            if (isLocked) {
                // Open lock screen in Edge/Chrome (Kiosk mode if possible)
                const message = encodeURIComponent("El profesor te ha bloqueado la computadora por hacer algo indebido");
                exec(`start microsoft-edge:file:///${lockHtmlPath.replace(/\\/g, '/')}?msg=${message}`);
            } else {
                // Terminate browser if we want to "unlock", but simpler to just let them close it
                // Logic for forced unlock can be added here
            }
        }
    });

    socket.on('disconnect', () => { socket = null; });
}

console.log('Buscando servidor...');
client.on('message', (msg) => {
    const data = msg.toString();
    if (data.startsWith('CYBERCONTROL_SERVER:') && !socket) {
        const ip = data.split(':')[1];
        connectToServer(`http://${ip}:3000`);
    }
});
client.bind(BROADCAST_PORT);
