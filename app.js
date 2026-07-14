// --- API & SOCKET CONFIGURATION ---
// REPLACE THIS WITH YOUR DEPLOYED RENDER SERVER URL ONCE DEPLOYED:
const PROD_SERVER_URL = 'https://realtime-communication-server.onrender.com';

const IS_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

const API_BASE = IS_DEV
  ? 'http://localhost:3000/api'
  : `${PROD_SERVER_URL}/api`;

const WS_BASE = IS_DEV
  ? 'http://localhost:3000'
  : PROD_SERVER_URL;

const iceServersConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

// --- APPLICATION STATE ---
const state = {
  token: localStorage.getItem('rtc_token') || null,
  user: JSON.parse(localStorage.getItem('rtc_user')) || null,
  localStream: null,
  localScreenStream: null,
  peers: {}, // peerSocketId -> { pc, user, stream }
  socket: null,
  roomId: null,
  roomName: null,
  isAudioMuted: false,
  isVideoDisabled: false,
  isScreenSharing: false,
  whiteboardColor: '#ff007f',
  whiteboardSize: 5,
  isDrawing: false,
  lastX: 0,
  lastY: 0
};

// --- UTILITY FUNCTIONS ---

// Perform API Fetch Calls
async function apiCall(endpoint, method = 'GET', body = null) {
  const headers = {
    'Content-Type': 'application/json'
  };
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  const config = {
    method,
    headers
  };
  if (body) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, config);
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong');
  }
  return data;
}

// Show Toast Notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = '🔔';
  if (type === 'success') icon = '✓';
  if (type === 'danger') icon = '⚠';

  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

// Escape HTML to prevent XSS
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// Setup User avatar colors
function setupAvatar(el, userObj) {
  if (!el || !userObj) return;
  el.style.background = userObj.avatar_color || 'var(--primary)';
  el.innerText = userObj.display_name ? userObj.display_name.charAt(0).toUpperCase() : '?';
  el.setAttribute('title', `@${userObj.username} (${userObj.display_name})`);
}

// Apply theme toggle details if any (default to obsidian)
document.documentElement.setAttribute('data-theme', 'dark');

// Toggle between screens
function showScreen(screenId) {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('dashboard-screen').classList.add('hidden');
  document.getElementById('room-screen').classList.add('hidden');
  document.getElementById('app-loading').classList.add('hidden');
  
  document.getElementById(screenId).classList.remove('hidden');
}

// Setup password eye toggler
function setupPasswordToggle(inputId, toggleId) {
  const passwordInput = document.getElementById(inputId);
  const toggleBtn = document.getElementById(toggleId);
  
  if (passwordInput && toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordInput.setAttribute('type', type);
      
      if (type === 'password') {
        toggleBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-inline"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
        toggleBtn.setAttribute('title', 'Show Password');
      } else {
        toggleBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-inline"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
        toggleBtn.setAttribute('title', 'Hide Password');
      }
    });
  }
}

// --- AUTH HANDLERS ---

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  const errorDiv = document.getElementById('auth-error');

  errorDiv.classList.add('hidden');

  try {
    const data = await apiCall('/auth/login', 'POST', { username, password });
    
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('rtc_token', data.token);
    localStorage.setItem('rtc_user', JSON.stringify(data.user));

    showToast('Signed in successfully!', 'success');
    setupDashboardUI();
    showScreen('dashboard-screen');
  } catch (err) {
    errorDiv.innerText = err.message;
    errorDiv.classList.remove('hidden');
  }
});

document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const displayName = document.getElementById('register-displayname').value;
  const username = document.getElementById('register-username').value;
  const password = document.getElementById('register-password').value;
  const errorDiv = document.getElementById('auth-error');

  errorDiv.classList.add('hidden');

  try {
    const data = await apiCall('/auth/register', 'POST', { 
      username, 
      password, 
      display_name: displayName 
    });

    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('rtc_token', data.token);
    localStorage.setItem('rtc_user', JSON.stringify(data.user));

    showToast('Account created successfully!', 'success');
    setupDashboardUI();
    showScreen('dashboard-screen');
  } catch (err) {
    errorDiv.innerText = err.message;
    errorDiv.classList.remove('hidden');
  }
});

function handleLogout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('rtc_token');
  localStorage.removeItem('rtc_user');

  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
  document.getElementById('register-displayname').value = '';
  document.getElementById('register-username').value = '';
  document.getElementById('register-password').value = '';
  document.getElementById('auth-error').classList.add('hidden');

  showToast('Logged out.', 'info');
  showScreen('auth-screen');
}

document.getElementById('btn-logout').addEventListener('click', handleLogout);

document.getElementById('go-to-register').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('register-form').classList.remove('hidden');
});

document.getElementById('go-to-login').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('register-form').classList.add('hidden');
  document.getElementById('login-form').classList.remove('hidden');
});

function setupDashboardUI() {
  if (!state.user) return;
  setupAvatar(document.getElementById('dashboard-avatar'), state.user);
  document.getElementById('dashboard-displayname').innerText = state.user.display_name;
}

// --- ROOM DASHBOARD ACTION HANDLERS ---

document.getElementById('create-room-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('new-room-name').value;
  const roomId = document.getElementById('new-room-id').value;

  try {
    const room = await apiCall('/rooms', 'POST', { name, roomId });
    showToast(`Room "${room.name}" created!`, 'success');
    joinMeetingRoom(room.id, room.name);
  } catch (err) {
    showToast(err.message, 'danger');
  }
});

document.getElementById('join-room-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const roomId = document.getElementById('join-room-id').value;

  try {
    const room = await apiCall(`/rooms/${roomId}`);
    showToast(`Joining Room: ${room.name}`, 'success');
    joinMeetingRoom(room.id, room.name);
  } catch (err) {
    showToast(err.message, 'danger');
  }
});

// Copy Room ID to Clipboard
document.getElementById('btn-copy-room-id').addEventListener('click', () => {
  if (state.roomId) {
    navigator.clipboard.writeText(state.roomId)
      .then(() => showToast('Room ID copied to clipboard!', 'success'))
      .catch(() => showToast('Failed to copy ID.', 'danger'));
  }
});

// --- MULTI-USER WEBRTC CONFERENCING SYSTEM (MESH) ---

async function joinMeetingRoom(roomId, roomName) {
  state.roomId = roomId;
  state.roomName = roomName;

  document.getElementById('room-id-display').innerText = roomId;
  document.getElementById('room-title').innerText = roomName;

  // 1. Get Local Camera & Audio Stream
  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });
    
    // Render local video feed in the grid
    addLocalVideoFeed(state.localStream);
  } catch (err) {
    console.error('Error getting media devices:', err);
    showToast('Failed to open camera/mic. Joining audio-only/receiving.', 'danger');
    state.localStream = new MediaStream(); // Fallback empty stream
  }

  // 2. Connect to Socket.io signaling server
  const socket = io(WS_BASE);
  state.socket = socket;

  socket.on('connect', () => {
    console.log('Connected to signaling server with ID:', socket.id);
    socket.emit('join-room', { roomId, user: state.user });
  });

  // 3. Receive list of existing peers in the room
  socket.on('peers-list', (peersList) => {
    console.log('Received list of existing peers in room:', peersList);
    peersList.forEach(peer => {
      // We initiate WebRTC connections to all existing peers (we create the offer)
      initWebRTCPeer(peer.socketId, peer.user, true);
    });
  });

  // 4. Handle a new peer connecting to the room
  socket.on('peer-connected', ({ socketId, user }) => {
    console.log('New peer connected:', socketId, user);
    showToast(`@${user.username} entered the room`, 'info');
    // We wait for them to send us an offer, so we initialize connection but don't create offer
    initWebRTCPeer(socketId, user, false);
  });

  // 5. Handle receiving SDP Metadata Offer/Answer
  socket.on('receive-SDP', async ({ senderSocketId, sdp }) => {
    console.log('Received SDP from:', senderSocketId, sdp.type);
    const peer = state.peers[senderSocketId];
    if (!peer) return;

    try {
      await peer.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      
      if (sdp.type === 'offer') {
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        state.socket.emit('relay-SDP', {
          targetSocketId: senderSocketId,
          sdp: peer.pc.localDescription
        });
      }
    } catch (err) {
      console.error('Error handling relayed SDP:', err);
    }
  });

  // 6. Handle receiving relayed ICE candidate
  socket.on('receive-ICE', async ({ senderSocketId, candidate }) => {
    const peer = state.peers[senderSocketId];
    if (!peer) return;

    try {
      await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('Error adding ICE Candidate:', err);
    }
  });

  // 7. Handle peer disconnecting
  socket.on('peer-disconnected', ({ socketId, user }) => {
    console.log('Peer disconnected:', socketId);
    if (user) {
      showToast(`@${user.username} left the room`, 'info');
    }
    removeRemoteVideoFeed(socketId);
    
    if (state.peers[socketId]) {
      state.peers[socketId].pc.close();
      delete state.peers[socketId];
    }
  });

  // 8. Handle shared Whiteboard Canvas Drawing sync
  socket.on('draw-line', (data) => {
    drawReceivedStroke(data);
  });

  socket.on('clear-whiteboard', () => {
    clearLocalCanvas(false);
  });

  // 9. Handle Chat Messages
  socket.on('chat-message', (data) => {
    appendChatBubble(data.user, data.message, data.file, false, data.timestamp);
  });

  // Switch to conference layout
  showScreen('room-screen');
  resizeCanvas();
}

// Initialize individual Peer Connection
function initWebRTCPeer(peerSocketId, peerUser, isCaller = false) {
  if (state.peers[peerSocketId]) return;

  const pc = new RTCPeerConnection(iceServersConfig);
  state.peers[peerSocketId] = { pc, user: peerUser };

  // ICE Candidate relay
  pc.onicecandidate = (event) => {
    if (event.candidate && state.socket) {
      state.socket.emit('relay-ICE', {
        targetSocketId: peerSocketId,
        candidate: event.candidate
      });
    }
  };

  // Add tracks
  if (state.localStream) {
    state.localStream.getTracks().forEach(track => {
      pc.addTrack(track, state.localStream);
    });
  }

  // Handle stream arrival
  pc.ontrack = (event) => {
    console.log('Received remote track from peer:', peerSocketId);
    addRemoteVideoFeed(peerSocketId, peerUser, event.streams[0]);
  };

  // Caller creates offer
  if (isCaller) {
    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .then(() => {
        state.socket.emit('relay-SDP', {
          targetSocketId: peerSocketId,
          sdp: pc.localDescription
        });
      })
      .catch(err => console.error('Failed to create peer offer:', err));
  }
}

// Render local video
function addLocalVideoFeed(stream) {
  const grid = document.getElementById('video-streams-grid');
  
  // Clean old local video if exists
  const oldLocal = document.getElementById('local-video-container');
  if (oldLocal) oldLocal.remove();

  const container = document.createElement('div');
  container.className = 'video-frame';
  container.id = 'local-video-container';

  const video = document.createElement('video');
  video.srcObject = stream;
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true; // Local audio must be muted to prevent echo feedback

  // Avatar placeholder (hidden by default)
  const avatar = document.createElement('div');
  avatar.className = 'stream-avatar-placeholder hidden';
  setupAvatar(avatar, state.user);

  const label = document.createElement('div');
  label.className = 'video-label-bar';
  label.innerText = `${state.user.display_name} (You)`;

  container.appendChild(video);
  container.appendChild(avatar);
  container.appendChild(label);
  grid.appendChild(container);

  updateVideoGridLayout();
}

// Render remote peer video
function addRemoteVideoFeed(socketId, peerUser, stream) {
  const grid = document.getElementById('video-streams-grid');
  
  let container = document.getElementById(`video-peer-${socketId}`);
  if (!container) {
    container = document.createElement('div');
    container.className = 'video-frame remote-peer-frame';
    container.id = `video-peer-${socketId}`;

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;

    const avatar = document.createElement('div');
    avatar.className = 'stream-avatar-placeholder hidden';
    setupAvatar(avatar, peerUser);

    const label = document.createElement('div');
    label.className = 'video-label-bar';
    label.innerText = peerUser.display_name;

    container.appendChild(video);
    container.appendChild(avatar);
    container.appendChild(label);
    grid.appendChild(container);
  }

  const videoEl = container.querySelector('video');
  if (videoEl.srcObject !== stream) {
    videoEl.srcObject = stream;
  }

  updateVideoGridLayout();
}

function removeRemoteVideoFeed(socketId) {
  const container = document.getElementById(`video-peer-${socketId}`);
  if (container) {
    container.remove();
  }
  updateVideoGridLayout();
}

// Adjust Grid Columns dynamically to fit video windows perfectly
function updateVideoGridLayout() {
  const grid = document.getElementById('video-streams-grid');
  const count = grid.children.length;

  grid.className = 'video-grid'; // Reset layout classes
  if (count <= 1) {
    grid.classList.add('layout-1');
  } else if (count === 2) {
    grid.classList.add('layout-2');
  } else if (count === 3) {
    grid.classList.add('layout-3');
  } else if (count === 4) {
    grid.classList.add('layout-4');
  } else {
    grid.classList.add('layout-5');
  }
}

// --- MEDIA & CONTROL TOGGLES ---

// Audio Mute Toggle
document.getElementById('btn-toggle-audio').addEventListener('click', () => {
  if (!state.localStream) return;

  const audioTrack = state.localStream.getAudioTracks()[0];
  if (audioTrack) {
    state.isAudioMuted = !state.isAudioMuted;
    audioTrack.enabled = !state.isAudioMuted;
    
    const btn = document.getElementById('btn-toggle-audio');
    if (state.isAudioMuted) {
      btn.classList.add('disabled');
      btn.setAttribute('title', 'Unmute Microphone');
      btn.innerHTML = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/></svg>`;
      showToast('Microphone muted', 'info');
    } else {
      btn.classList.remove('disabled');
      btn.setAttribute('title', 'Mute Microphone');
      btn.innerHTML = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1v10M19 10v1a7 7 0 0 1-14 0v-1M12 23h0"/></svg>`;
      showToast('Microphone active', 'success');
    }
  }
});

// Camera Disable Toggle
document.getElementById('btn-toggle-video').addEventListener('click', () => {
  if (!state.localStream) return;

  const videoTrack = state.localStream.getVideoTracks()[0];
  if (videoTrack) {
    state.isVideoDisabled = !state.isVideoDisabled;
    videoTrack.enabled = !state.isVideoDisabled;

    const btn = document.getElementById('btn-toggle-video');
    const localVideoContainer = document.getElementById('local-video-container');
    const avatar = localVideoContainer.querySelector('.stream-avatar-placeholder');

    if (state.isVideoDisabled) {
      btn.classList.add('disabled');
      btn.setAttribute('title', 'Enable Camera');
      btn.innerHTML = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3m5.66 0H14a2 2 0 0 1 2 2v3.34M23 7l-7 5 7 5V7z"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
      
      avatar.classList.remove('hidden');
      showToast('Camera disabled', 'info');
    } else {
      btn.classList.remove('disabled');
      btn.setAttribute('title', 'Disable Camera');
      btn.innerHTML = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 7l-7 5 7 5V7zM16 5H1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h15V5z"/></svg>`;
      
      avatar.classList.add('hidden');
      showToast('Camera active', 'success');
    }
  }
});

// Screen Share Toggle
document.getElementById('btn-screen-share').addEventListener('click', async () => {
  const btn = document.getElementById('btn-screen-share');

  if (!state.isScreenSharing) {
    try {
      state.localScreenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true
      });
      
      const screenTrack = state.localScreenStream.getVideoTracks()[0];
      
      // Update local feed
      const localVideoContainer = document.getElementById('local-video-container');
      const videoEl = localVideoContainer.querySelector('video');
      videoEl.srcObject = state.localScreenStream;
      videoEl.style.transform = 'none'; // Screen shouldn't be mirrored

      // Swap track for all active peer connections
      for (let peerId in state.peers) {
        const senders = state.peers[peerId].pc.getSenders();
        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
        if (videoSender) {
          videoSender.replaceTrack(screenTrack);
        }
      }

      state.isScreenSharing = true;
      btn.classList.add('active');
      showToast('Screen sharing started', 'success');

      // Listen for screen sharing stop button click inside native browser overlay
      screenTrack.onended = () => {
        stopScreenSharing();
      };
    } catch (err) {
      console.error('Error sharing screen:', err);
      showToast('Failed to share screen.', 'danger');
    }
  } else {
    stopScreenSharing();
  }
});

function stopScreenSharing() {
  if (!state.isScreenSharing) return;

  const btn = document.getElementById('btn-screen-share');
  
  if (state.localScreenStream) {
    state.localScreenStream.getTracks().forEach(t => t.stop());
  }

  // Restore camera feed locally
  const cameraTrack = state.localStream.getVideoTracks()[0];
  const localVideoContainer = document.getElementById('local-video-container');
  const videoEl = localVideoContainer.querySelector('video');
  videoEl.srcObject = state.localStream;
  videoEl.style.transform = 'rotateY(180deg)'; // Mirror camera again

  // Restore track in WebRTC peers
  for (let peerId in state.peers) {
    const senders = state.peers[peerId].pc.getSenders();
    const videoSender = senders.find(s => s.track && s.track.kind === 'video');
    if (videoSender && cameraTrack) {
      videoSender.replaceTrack(cameraTrack);
    }
  }

  state.isScreenSharing = false;
  btn.classList.remove('active');
  showToast('Screen sharing stopped', 'info');
}

// Leave Room
document.getElementById('btn-leave-meeting').addEventListener('click', () => {
  if (confirm('Are you sure you want to leave the meeting room?')) {
    exitMeetingRoom();
  }
});

function exitMeetingRoom() {
  // Stop local tracks
  if (state.localStream) {
    state.localStream.getTracks().forEach(t => t.stop());
    state.localStream = null;
  }
  if (state.localScreenStream) {
    state.localScreenStream.getTracks().forEach(t => t.stop());
    state.localScreenStream = null;
  }

  // Close all peer connections
  for (let peerId in state.peers) {
    state.peers[peerId].pc.close();
  }
  state.peers = {};

  // Disconnect Socket
  if (state.socket) {
    state.socket.disconnect();
    state.socket = null;
  }

  // Clear workspace UI streams
  document.getElementById('video-streams-grid').innerHTML = '';
  document.getElementById('chat-messages-list').innerHTML = '';
  clearLocalCanvas(false);

  state.roomId = null;
  state.roomName = null;
  state.isScreenSharing = false;
  
  document.getElementById('btn-screen-share').classList.remove('active');
  document.getElementById('btn-toggle-whiteboard').classList.remove('active');
  document.getElementById('btn-toggle-chat').classList.remove('active');
  
  document.getElementById('whiteboard-workspace-panel').classList.add('hidden');
  document.getElementById('chat-workspace-panel').classList.add('hidden');

  showScreen('dashboard-screen');
  showToast('You left the meeting.', 'info');
}

// --- TAB SIDE PANELS SLIDE OUT CONTROL ---

document.getElementById('btn-toggle-whiteboard').addEventListener('click', () => {
  const panel = document.getElementById('whiteboard-workspace-panel');
  const btn = document.getElementById('btn-toggle-whiteboard');

  panel.classList.toggle('hidden');
  
  if (!panel.classList.contains('hidden')) {
    btn.classList.add('active');
    resizeCanvas();
  } else {
    btn.classList.remove('active');
  }
});

document.getElementById('btn-close-whiteboard').addEventListener('click', () => {
  document.getElementById('whiteboard-workspace-panel').classList.add('hidden');
  document.getElementById('btn-toggle-whiteboard').classList.remove('active');
});

document.getElementById('btn-toggle-chat').addEventListener('click', () => {
  const panel = document.getElementById('chat-workspace-panel');
  const btn = document.getElementById('btn-toggle-chat');

  panel.classList.toggle('hidden');
  
  if (!panel.classList.contains('hidden')) {
    btn.classList.add('active');
  } else {
    btn.classList.remove('active');
  }
});

document.getElementById('btn-close-chat').addEventListener('click', () => {
  document.getElementById('chat-workspace-panel').classList.add('hidden');
  document.getElementById('btn-toggle-chat').classList.remove('active');
});

// --- INTERACTIVE SHARED WHITEBOARD ---

const canvas = document.getElementById('whiteboard-canvas');
const ctx = canvas.getContext('2d');

// Draw configs
ctx.lineCap = 'round';
ctx.lineJoin = 'round';

// Handle resizing canvas dynamically
function resizeCanvas() {
  const parent = canvas.parentElement;
  if (!parent) return;

  // Save current whiteboard drawing content in memory before resizing
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.drawImage(canvas, 0, 0);

  // Resize canvas to fill parent width/height
  canvas.width = parent.clientWidth;
  canvas.height = parent.clientHeight;

  // Restore drawing settings
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Draw back content scaled
  ctx.drawImage(tempCanvas, 0, 0, tempCanvas.width, tempCanvas.height, 0, 0, canvas.width, canvas.height);
}
window.addEventListener('resize', resizeCanvas);

// Whiteboard Drawing Event Listeners
canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', drawLine);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseout', stopDrawing);

// Mobile touch support
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  startDrawing({ clientX: touch.clientX, clientY: touch.clientY });
});
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  drawLine({ clientX: touch.clientX, clientY: touch.clientY });
});
canvas.addEventListener('touchend', stopDrawing);

function startDrawing(e) {
  state.isDrawing = true;
  
  const rect = canvas.getBoundingClientRect();
  state.lastX = e.clientX - rect.left;
  state.lastY = e.clientY - rect.top;
}

function drawLine(e) {
  if (!state.isDrawing) return;

  const rect = canvas.getBoundingClientRect();
  const currentX = e.clientX - rect.left;
  const currentY = e.clientY - rect.top;

  // Draw locally
  ctx.beginPath();
  ctx.strokeStyle = state.whiteboardColor;
  ctx.lineWidth = state.whiteboardSize;
  ctx.moveTo(state.lastX, state.lastY);
  ctx.lineTo(currentX, currentY);
  ctx.stroke();

  // Normalize coordinates as width/height percentage scales to match all devices
  if (state.socket) {
    state.socket.emit('draw-line', {
      x0: state.lastX / canvas.width,
      y0: state.lastY / canvas.height,
      x1: currentX / canvas.width,
      y1: currentY / canvas.height,
      color: state.whiteboardColor,
      size: state.whiteboardSize
    });
  }

  state.lastX = currentX;
  state.lastY = currentY;
}

function drawReceivedStroke(data) {
  // Scale normalized coordinates to fit local canvas dimensions
  const x0 = data.x0 * canvas.width;
  const y0 = data.y0 * canvas.height;
  const x1 = data.x1 * canvas.width;
  const y1 = data.y1 * canvas.height;

  ctx.beginPath();
  ctx.strokeStyle = data.color;
  ctx.lineWidth = data.size;
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function stopDrawing() {
  state.isDrawing = false;
}

// Clear Board
document.getElementById('btn-clear-canvas').addEventListener('click', () => {
  clearLocalCanvas(true);
});

function clearLocalCanvas(emit = true) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (emit && state.socket) {
    state.socket.emit('clear-whiteboard');
  }
}

// Whiteboard tools panel bindings
document.querySelectorAll('.color-dot').forEach(el => {
  el.addEventListener('click', (e) => {
    document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
    el.classList.add('active');
    state.whiteboardColor = el.dataset.color;
  });
});

document.getElementById('stroke-size-select').addEventListener('change', (e) => {
  state.whiteboardSize = parseInt(e.target.value);
});

document.getElementById('btn-eraser').addEventListener('click', () => {
  document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
  state.whiteboardColor = '#0b071a'; // Eraser matches background color
});

// --- SESSION CHAT & FILE SHARING ---

document.getElementById('chat-compose-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('chat-text-input');
  const message = input.value.trim();
  if (!message) return;

  // Send to socket
  if (state.socket) {
    state.socket.emit('chat-message', { message });
    
    // Append locally
    appendChatBubble(state.user, message, null, true);
    input.value = '';
  }
});

// File attachment triggers
const fileInput = document.getElementById('file-hidden-input');
document.getElementById('btn-file-attach-trigger').addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  const progressDiv = document.getElementById('file-upload-status');
  const progressBar = document.getElementById('progress-bar-fill');
  const progressText = document.getElementById('progress-text');

  progressDiv.classList.remove('hidden');
  progressBar.style.width = '0%';
  progressText.innerText = `Uploading: ${file.name}...`;

  try {
    // Custom XMLHttpRequest to monitor upload progress bar
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/upload`, true);
    if (state.token) {
      xhr.setRequestHeader('Authorization', `Bearer ${state.token}`);
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        progressBar.style.width = `${percentComplete}%`;
        progressText.innerText = `Uploading: ${percentComplete}%`;
      }
    };

    xhr.onload = () => {
      progressDiv.classList.add('hidden');
      if (xhr.status === 200) {
        const res = JSON.parse(xhr.responseText);
        
        // Broadcast file message URL over socket
        if (state.socket) {
          state.socket.emit('chat-message', {
            message: `Shared a file: ${res.filename}`,
            file: { url: res.url, filename: res.filename, size: res.size }
          });

          // Append locally
          appendChatBubble(state.user, `Shared a file: ${res.filename}`, res, true);
          showToast('File uploaded and shared successfully!', 'success');
        }
      } else {
        const err = JSON.parse(xhr.responseText);
        showToast('Upload failed: ' + (err.error || xhr.statusText), 'danger');
      }
    };

    xhr.onerror = () => {
      progressDiv.classList.add('hidden');
      showToast('File upload failed due to network error.', 'danger');
    };

    xhr.send(formData);
  } catch (err) {
    progressDiv.classList.add('hidden');
    showToast(err.message, 'danger');
  } finally {
    fileInput.value = ''; // Reset input selection
  }
});

// Render chat bubble bubbles inside panel list
function appendChatBubble(userObj, text, fileObj = null, isLocalUser = false, timestampStr = null) {
  const container = document.getElementById('chat-messages-list');
  if (!container) return;

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${isLocalUser ? 'local-user' : 'remote-peer'}`;

  const timestamp = timestampStr || new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const meta = document.createElement('div');
  meta.className = 'chat-bubble-meta';
  meta.innerHTML = `<span>@${userObj.username}</span><span>${timestamp}</span>`;

  const body = document.createElement('div');
  body.className = 'chat-bubble-text';
  body.innerText = text;

  bubble.appendChild(meta);
  bubble.appendChild(body);

  // If there's an attached file card, append it!
  if (fileObj) {
    const fileCard = document.createElement('a');
    fileCard.className = 'file-attachment-card';
    fileCard.href = fileObj.url;
    fileCard.target = '_blank';
    fileCard.download = fileObj.filename;

    const sizeKB = Math.round(fileObj.size / 1024);

    fileCard.innerHTML = `
      <span class="file-icon">📁</span>
      <div class="file-info">
        <span class="file-name">${escapeHTML(fileObj.filename)}</span>
        <span class="file-size">${sizeKB} KB</span>
      </div>
    `;
    bubble.appendChild(fileCard);
  }

  container.appendChild(bubble);
  
  // Scroll list to bottom
  container.scrollTop = container.scrollHeight;
}

// --- INITIALIZATION ON BOOT ---

async function init() {
  // Setup password visibility togglers
  setupPasswordToggle('login-password', 'btn-login-password-toggle');
  setupPasswordToggle('register-password', 'btn-register-password-toggle');

  if (state.token) {
    try {
      // Validate active token
      const me = await apiCall('/auth/me');
      state.user = me;
      localStorage.setItem('rtc_user', JSON.stringify(me));
      setupDashboardUI();
      showScreen('dashboard-screen');
    } catch (err) {
      console.log('Session expired, forcing logout.');
      handleLogout();
    }
  } else {
    showScreen('auth-screen');
  }
}

// Run app init
window.addEventListener('DOMContentLoaded', init);
