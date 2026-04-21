// Authentication
const LOGIN_DATA = { user: 'Freddy', pass: '1310' };
const loginOverlay = document.getElementById('login-overlay');
const mainApp = document.getElementById('main-app');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const navItems = document.querySelectorAll('.nav-item');

function switchSection(sectionId) {
    navItems.forEach(item => {
        item.classList.toggle('active', item.dataset.section === sectionId);
    });
    console.log('Cambiando a sección:', sectionId);
}

navItems.forEach(item => {
    item.addEventListener('click', () => {
        const section = item.dataset.section;
        if (section) switchSection(section);
    });
});

function checkAuth() {
    if (localStorage.getItem('cybercontrol_auth') === 'true') {
        showDashboard();
    }
}

function showDashboard() {
    if (loginOverlay) loginOverlay.style.display = 'none';
    if (mainApp) mainApp.style.display = 'flex';
    initSocket();
}

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const user = document.getElementById('login-user').value;
    const pass = document.getElementById('login-pass').value;

    if (user === LOGIN_DATA.user && pass === LOGIN_DATA.pass) {
        localStorage.setItem('cybercontrol_auth', 'true');
        showDashboard();
    } else {
        loginError.textContent = "Credenciales incorrectas.";
        setTimeout(() => loginError.textContent = "", 3000);
    }
});

// Configuration
const SERVER_URL = window.location.origin;
let socket;
let currentAgentId = null;
let computers = [];

const gridContainer = document.getElementById('pc-grid-container');
const modal = document.getElementById('pc-modal');
const closeModal = document.querySelector('.close-modal');
const remoteImg = document.getElementById('remote-screen');
const lockStatusBadge = document.getElementById('pc-lock-status');
const lockBtnText = document.getElementById('lock-btn-text');
const remoteOverlay = document.getElementById('remote-screen-overlay');

// Keyboard Logic
const kbInput = document.getElementById('remote-kb-input');
const btnSendKb = document.getElementById('btn-send-kb');
const btnSendEnter = document.getElementById('btn-send-enter');

function sendKbText() {
    const text = kbInput.value;
    if (text) {
        sendCommand(currentAgentId, 'keyboard-type', { text });
        kbInput.value = '';
    }
}

if (btnSendKb) btnSendKb.addEventListener('click', sendKbText);
if (kbInput) kbInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendKbText(); });
if (btnSendEnter) btnSendEnter.addEventListener('click', () => {
    sendCommand(currentAgentId, 'keyboard-key', { key: 'ENTER' });
});

remoteOverlay.addEventListener('click', (e) => {
    const rect = remoteOverlay.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    sendCommand(currentAgentId, 'mouse-click', { x, y });
    
    const ripple = document.createElement('div');
    ripple.className = 'click-ripple';
    ripple.style.left = `${(x * 100)}%`;
    ripple.style.top = `${(y * 100)}%`;
    remoteOverlay.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
});

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
                status: a.connected ? 'online' : 'offline',
                cpu: a.cpu || 0,
                ram: a.ram || 0,
                locked: a.locked || false,
                connected: a.connected
            }));
            updateStats();
            renderPCs();
        });

        socket.on('screen-stream', (data) => {
            if (currentAgentId === data.agentId) {
                remoteImg.src = `data:image/jpeg;base64,${data.image}`;
            }
            const thumb = document.getElementById(`thumb-${data.agentId}`);
            if (thumb) {
                thumb.src = `data:image/jpeg;base64,${data.image}`;
                thumb.style.opacity = "1";
            }
        });
    } catch (e) { console.error('Socket error:', e); }
}

function updateStats() {
    const total = computers.length;
    const online = computers.filter(pc => pc.connected).length;
    const offline = total - online;

    const elTotal = document.getElementById('stat-total');
    const elOnline = document.getElementById('stat-online');
    const elOffline = document.getElementById('stat-offline');

    if (elTotal) elTotal.textContent = total;
    if (elOnline) elOnline.textContent = online;
    if (elOffline) elOffline.textContent = offline;
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

function sendCommand(id, command, params = {}) {
    if (!socket) return;
    socket.emit('remote-command', { targetId: id, command, params });
}

// Global Commands
document.getElementById('btn-lock-toggle').addEventListener('click', () => {
    const pc = computers.find(c => c.id === currentAgentId);
    if (!pc) return;
    pc.locked = !pc.locked;
    updateLockUI(pc.locked);
    sendCommand(currentAgentId, 'lock', { state: pc.locked });
});

document.getElementById('btn-update-all').addEventListener('click', () => {
    if (confirm("¿Actualizar todas las PCs?")) {
        computers.forEach(pc => sendCommand(pc.id, 'update'));
    }
});

document.getElementById('btn-message-all').addEventListener('click', () => {
    const msg = prompt("Mensaje GLOBAL:");
    if (msg) computers.forEach(pc => sendCommand(pc.id, 'message', { text: msg }));
});

closeModal.addEventListener('click', () => {
    modal.classList.remove('active');
    sendCommand(currentAgentId, 'unfocus');
    currentAgentId = null;
});

document.getElementById('btn-edit-name').addEventListener('click', () => {
    const pc = computers.find(c => c.id === currentAgentId);
    if (!pc) return;
    const newName = prompt("Nuevo nombre para esta PC:", pc.name);
    if (newName && newName !== pc.name) {
        sendCommand(currentAgentId, 'rename', { name: newName });
        modal.classList.remove('active'); // Cerrar modal porque el agente se reiniciará
    }
});

// Initialize
checkAuth();
