const io = require('socket.io-client');
const screenshot = require('screenshot-desktop');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const os = require('os');
const dgram = require('dgram');

// --- CONFIGURACIÓN DE PERSISTENCIA ---
// Usamos una ruta más segura para guardar el nombre, como el home del usuario
const configPath = path.join(os.homedir(), '.cybercontrol_config.json');
let agentConfig = { name: null };

function loadConfig() {
    if (fs.existsSync(configPath)) {
        try { 
            const data = fs.readFileSync(configPath, 'utf8');
            const parsed = JSON.parse(data); 
            if (parsed && typeof parsed === 'object') {
                agentConfig = { ...agentConfig, ...parsed };
                console.log("Configuración cargada:", agentConfig);
            }
        } catch(e) {
            console.error("Error cargando config:", e.message);
        }
    } else {
        console.log("No se encontró archivo de configuración, se usará hostname.");
    }
}
loadConfig();

const CLOUD_URL = 'https://cyber-control-production.up.railway.app';
const RAW_AGENT_URL = 'https://raw.githubusercontent.com/samariofreddy-source/cyber-control/main/agent.js';
const VERSION = '1.0.4'; 
const BROADCAST_PORT = 41234;
// ---------------------

// Nombre de la PC (Prioridad: Config > Hostname)
let pcName = agentConfig.name || os.hostname();
const userName = os.userInfo().username || 'Alumno';

let socket = null;
let streamInterval = 2000;
let streamQuality = 15;
let timerId = null;

// Crear Pantalla de Bloqueo HTML
const lockHtmlPath = path.join(os.tmpdir(), 'lock_overlay.html');
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

function connectToServer(url) {
    if (socket) return;
    console.log(`Conectando a: ${url} (ID: ${pcName})`);
    
    socket = io(url, {
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000
    });

    socket.on('connect', () => {
        console.log(`¡Conectado! Registrando como: ${pcName}`);
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
        console.log(`Ejecutando comando: ${command}`);
        
        if (command === 'update') {
            try {
                const response = await axios.get(RAW_AGENT_URL);
                fs.writeFileSync(__filename, response.data);
                console.log("Actualización descargada. Reiniciando...");
                process.exit(0); 
            } catch (err) { console.error("Error en update:", err.message); }
        }
        else if (command === 'rename') {
            const newName = params.name;
            console.log(`Petición de renombrado: de "${pcName}" a "${newName}"`);
            
            const oldName = pcName;
            agentConfig.name = newName;
            
            try {
                fs.writeFileSync(configPath, JSON.stringify(agentConfig), 'utf8');
                pcName = newName; // Actualizar localmente
                console.log("Nuevo nombre guardado en archivo.");
                
                // Intentar avisar al servidor del cambio antes de reiniciar
                if (socket && socket.connected) {
                    socket.emit('register', { type: 'agent', name: pcName, user: userName, version: VERSION });
                }
                
                console.log("Reiniciando para aplicar cambios de forma limpia...");
                setTimeout(() => {
                    process.exit(0);
                }, 1000); 
            } catch (e) {
                console.error("Error crítico guardando nuevo nombre:", e.message);
                // Si falla el guardado, al menos intentamos seguir con el nombre anterior
                agentConfig.name = oldName;
            }
        }
        else if (command === 'mouse-click') {
            const x = Math.round(params.x * 100) / 100;
            const y = Math.round(params.y * 100) / 100;
            const ps = `Add-Type -AssemblyName System.Windows.Forms; ` +
                       `$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; ` +
                       `[System.Windows.Forms.Cursor]::Position=New-Object System.Drawing.Point(([int](${x}*$b.Width)),([int](${y}*$b.Height))); ` +
                       `$a=Add-Type -M '[DllImport("user32.dll")]public static extern void mouse_event(uint f,uint x,uint y,uint d,uint e);' -N W -P; ` +
                       `$a::mouse_event(2,0,0,0,0);$a::mouse_event(4,0,0,0,0);`;
            exec(`powershell -WindowStyle Hidden -Command "${ps}"`);
        } 
        else if (command === 'power') {
            const flag = params.action === 'shutdown' ? '/s /t 0' : '/r /t 0';
            exec(`shutdown ${flag}`);
        }
        else if (command === 'message') {
            const msg = params.text.replace(/'/g, "''");
            exec(`powershell -Command "Add-Type -AssemblyName PresentationFramework;[System.Windows.MessageBox]::Show('${msg}', 'Mensaje del Profesor')"`);
        }
        else if (command === 'keyboard-type') {
            const text = params.text.replace(/'/g, "''");
            exec(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${text}')"`);
        }
        else if (command === 'keyboard-key') {
            exec(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{%${params.key}%}')"`);
        }
        else if (command === 'lock') {
            if (params.state) {
                const lockFile = lockHtmlPath.replace(/\\/g, '/');
                exec(`start "" "msedge" --kiosk "file:///${lockFile}" --edge-kiosk-type=fullscreen`);
            } else {
                exec('taskkill /F /IM msedge.exe');
            }
        }
    });

    socket.on('disconnect', () => { 
        console.log('Desconectado. Intentando reconectar...');
        socket = null; 
    });
}

// Descubrimiento UDP
const client = dgram.createSocket('udp4');
client.on('message', (msg) => {
    const data = msg.toString();
    if (data.startsWith('CYBERCONTROL_SERVER:') && !socket) {
        const ip = data.split(':')[1];
        console.log(`Servidor local en ${ip}`);
        connectToServer(`http://${ip}:3000`);
    }
});

client.bind(BROADCAST_PORT, () => {
    client.setBroadcast(true);
    console.log('Buscando servidor en red local...');
});

// Fallback a Nube
setTimeout(() => {
    if (!socket) {
        console.log('Usando servidor en la nube...');
        connectToServer(CLOUD_URL);
    }
}, 5000);
