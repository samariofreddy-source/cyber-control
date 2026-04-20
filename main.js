// Authentication
const LOGIN_DATA = { user: 'Freddy', pass: '1310' };
const loginOverlay = document.getElementById('login-overlay');
const mainApp = document.getElementById('main-app');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');

function checkAuth() {
    if (localStorage.getItem('cybercontrol_auth') === 'true') {
        showDashboard();
    }
}

function showDashboard() {
    loginOverlay.style.display = 'none';
    mainApp.style.display = 'flex';
    initSocket();
    renderPCs();
}

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const user = document.getElementById('login-user').value;
    const pass = document.getElementById('login-pass').value;

    if (user === LOGIN_DATA.user && pass === LOGIN_DATA.pass) {
        localStorage.setItem('cybercontrol_auth', 'true');
        showDashboard();
    } else {
        loginError.textContent = "Credenciales incorrectas. Intenta de nuevo.";
        setTimeout(() => loginError.textContent = "", 3000);
    }
});

// Configuration
const SERVER_URL = window.location.origin;
let socket;
let currentAgentId = null;
let computers = []; // Will be populated by agents

const gridContainer = document.getElementById('pc-grid-container');
const modal = document.getElementById('pc-modal');
const closeModal = document.querySelector('.close-modal');
const remoteImg = document.getElementById('remote-screen');
const screenOverlay = document.getElementById('screen-overlay');
const lockStatusBadge = document.getElementById('pc-lock-status');
const lockBtnText = document.getElementById('lock-btn-text');

// Initialize Socket.io
function initSocket() {
    try {
        socket = io(SERVER_URL);

        socket.on('connect', () => {
            console.log('Dashboard Connected');
            socket.emit('register', { type: 'admin' });
        });

        socket.on('agent-list', (agents) => {
            computers = agents.map(a => ({
                id: a.id,
                name: a.name,
                user: a.user,
                status: 'online',
                cpu: a.cpu || 10,
                ram: a.ram || 30,
                locked: a.locked || false
            }));
            renderPCs();
        });

        socket.on('screen-stream', (data) => {
            // Update modal if open
            if (currentAgentId === data.agentId) {
                remoteImg.src = `data:image/jpeg;base64,${data.image}`;
            }
            // Update grid thumbnail
            const thumb = document.getElementById(`thumb-${data.agentId}`);
            if (thumb) {
                thumb.src = `data:image/jpeg;base64,${data.image}`;
                thumb.style.opacity = "1";
            }
        });
    } catch (e) {
        console.error('Socket error:', e);
    }
}

function renderPCs() {
    if (!gridContainer) return;
    gridContainer.innerHTML = '';
    
    if (computers.length === 0) {
        gridContainer.innerHTML = '<p class="text-secondary">No hay computadoras conectadas aún.</p>';
        return;
    }

    computers.forEach(pc => {
        const card = document.createElement('div');
        card.className = `pc-card ${pc.status}`;
        card.innerHTML = `
            <div class="pc-status ${pc.status}"></div>
            <div class="pc-thumbnail">
                <img id="thumb-${pc.id}" src="" alt="" style="opacity: 0">
                <div class="pc-placeholder"><i data-lucide="monitor"></i></div>
            </div>
            <div class="pc-info">
                <h4>${pc.name}</h4>
                <p class="student">${pc.user}</p>
            </div>
            <div class="pc-usage">
                <div class="progress-bar">
                    <div class="fill" style="width: ${pc.cpu}%"></div>
                </div>
            </div>
        `;
        
        card.addEventListener('click', () => openControlModal(pc));
        gridContainer.appendChild(card);
    });
    
    if (window.lucide) lucide.createIcons();
}

function openControlModal(pc) {
    currentAgentId = pc.id;
    document.getElementById('modal-pc-name').textContent = `Control de ${pc.name}`;
    document.getElementById('modal-student-name').textContent = `Usuario: ${pc.user}`;
    document.getElementById('modal-cpu-fill').style.width = `${pc.cpu}%`;
    document.getElementById('modal-ram-fill').style.width = `${pc.ram}%`;
    
    updateLockUI(pc.locked);
    remoteImg.src = '';
    modal.classList.add('active');

    // Optimización: Pedirle al agente que transmita rápido
    sendCommand(currentAgentId, 'focus');
}

function updateLockUI(isLocked) {
    if (isLocked) {
        lockStatusBadge.textContent = "BLOQUEADA";
        lockStatusBadge.classList.add('locked');
        lockBtnText.textContent = "Desbloquear";
    } else {
        lockStatusBadge.textContent = "DESBLOQUEADA";
        lockStatusBadge.classList.remove('locked');
        lockBtnText.textContent = "Bloquear";
    }
}

// Control Handlers
function sendCommand(id, command, params = {}) {
    if (!socket) return;
    socket.emit('remote-command', { targetId: id, command, params });
}

// Individual Controls
document.getElementById('btn-lock-toggle').addEventListener('click', () => {
    const pc = computers.find(c => c.id === currentAgentId);
    if (!pc) return;
    pc.locked = !pc.locked;
    updateLockUI(pc.locked);
    sendCommand(currentAgentId, 'lock', { state: pc.locked });
});

document.getElementById('btn-send-message').addEventListener('click', () => {
    const msg = prompt("Escribe el mensaje para el alumno:");
    if (msg) sendCommand(currentAgentId, 'message', { text: msg });
});

document.getElementById('btn-pc-power').addEventListener('click', () => {
    if (confirm("¿Seguro que quieres apagar esta PC?")) {
        sendCommand(currentAgentId, 'power', { action: 'shutdown' });
    }
});

document.getElementById('btn-pc-restart').addEventListener('click', () => {
    if (confirm("¿Seguro que quieres reiniciar esta PC?")) {
        sendCommand(currentAgentId, 'power', { action: 'restart' });
    }
});

// Global Controls
document.getElementById('btn-shutdown-all').addEventListener('click', () => {
    if (confirm("¿APAGAR TODAS las computadoras del laboratorio?")) {
        computers.forEach(pc => sendCommand(pc.id, 'power', { action: 'shutdown' }));
    }
});

document.getElementById('btn-restart-all').addEventListener('click', () => {
    if (confirm("¿REINICIAR TODAS las computadoras del laboratorio?")) {
        computers.forEach(pc => sendCommand(pc.id, 'power', { action: 'restart' }));
    }
});

document.getElementById('btn-message-all').addEventListener('click', () => {
    const msg = prompt("Mensaje GLOBAL para todos los alumnos:");
    if (msg) computers.forEach(pc => sendCommand(pc.id, 'message', { text: msg }));
});

document.getElementById('btn-update-all').addEventListener('click', () => {
    if (confirm("¿Quieres actualizar el código en TODAS las computadoras? (Se reiniciarán los agentes)")) {
        computers.forEach(pc => sendCommand(pc.id, 'update'));
    }
});

// Mouse Logic
if (screenOverlay) {
    screenOverlay.addEventListener('mousedown', (e) => {
        if (!currentAgentId) return;
        const rect = screenOverlay.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        sendCommand(currentAgentId, 'mouse-click', { x, y });
    });
}

closeModal.addEventListener('click', () => { 
    if (currentAgentId) sendCommand(currentAgentId, 'unfocus');
    modal.classList.remove('active'); 
    currentAgentId = null; 
});
window.addEventListener('click', (e) => { 
    if (e.target === modal) { 
        if (currentAgentId) sendCommand(currentAgentId, 'unfocus');
        modal.classList.remove('active'); 
        currentAgentId = null; 
    } 
});

document.getElementById('btn-refresh').addEventListener('click', () => location.reload());

// Initialize
checkAuth();
console.log('CyberControl Pro Max Dashboard Inicializado');
