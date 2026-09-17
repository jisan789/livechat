// LiveChat — Real-time WebSocket + WebRTC Client
// Jisu (PIN 1470) ↔ Jenu (PIN 3690)

// ─────────────────────────────────────────────────
//  DOM References
// ─────────────────────────────────────────────────
const chatApp            = document.getElementById('chatApp');
const avatarImg          = document.getElementById('avatarImg');
const userNameEl         = document.getElementById('userName');
const userStatusEl       = document.getElementById('userStatus');
const avatarBadge        = document.querySelector('.avatar-badge');
const chatMessages       = document.getElementById('chatMessages');
const chatInput          = document.getElementById('chatInput');
const actionBtn          = document.getElementById('actionBtn');
const actionIcon         = document.getElementById('actionIcon');
const typingIndicator    = document.getElementById('typingIndicator');
const emojiPopover       = document.getElementById('emojiPopover');
const emojiBtn           = document.getElementById('emojiBtn');
const inputPill          = document.getElementById('inputPill');
const inputNormalContent = document.getElementById('inputNormalContent');
const inputRecordingContent = document.getElementById('inputRecordingContent');
const recordingTimer     = document.getElementById('recordingTimer');
const cancelRecordBtn    = document.getElementById('cancelRecordBtn');

const soundToggleBtn     = document.getElementById('soundToggleBtn');
const lockAppBtn         = document.getElementById('lockAppBtn');
const pinOverlay         = document.getElementById('pinOverlay');
const pinDotsContainer   = document.getElementById('pinDots');
const pinFeedback        = document.getElementById('pinFeedback');
const pinBackspaceBtn    = document.getElementById('pinBackspaceBtn');
// Call UI
const callModal          = document.getElementById('callModal');
const callAvatar         = document.getElementById('callAvatar');
const callName           = document.getElementById('callName');
const callStatus         = document.getElementById('callStatus');
const callStatusDot      = document.getElementById('callStatusDot');
const endCallBtn         = document.getElementById('endCallBtn');
const voiceCallBtn       = document.getElementById('voiceCallBtn');
const callMinimizeBtn    = document.getElementById('callMinimizeBtn');
const callMicToggleBtn   = document.getElementById('callMicToggleBtn');
const callSpeakerBtn     = document.getElementById('callSpeakerBtn');
const callChatBackBtn    = document.getElementById('callChatBackBtn');
const micLabel           = document.getElementById('micLabel');
const minimizedCallBanner = document.getElementById('minimizedCallBanner');
const minimizedCallTimer  = document.getElementById('minimizedCallTimer');
const minimizedEndCallBtn = document.getElementById('minimizedEndCallBtn');
// Incoming call UI
const incomingCallOverlay = document.getElementById('incomingCallOverlay');
const incomingCallerName  = document.getElementById('incomingCallerName');
const incomingCallerAvatar = document.getElementById('incomingCallerAvatar');
const acceptCallBtn       = document.getElementById('acceptCallBtn');
const rejectCallBtn       = document.getElementById('rejectCallBtn');

// ─────────────────────────────────────────────────
//  User Profiles
// ─────────────────────────────────────────────────
const USER_PROFILES = {
  jisu: {
    userName: 'Jisu',
    pin: '1470',
    opponent: {
      key: 'jenu',
      name: 'Jenu',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=256'
    }
  },
  jenu: {
    userName: 'Jenu',
    pin: '3690',
    opponent: {
      key: 'jisu',
      name: 'Jisan',
      avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=256'
    }
  }
};

// ─────────────────────────────────────────────────
//  App State
// ─────────────────────────────────────────────────
let activeUser     = null;
let currentPartner = { name: '', avatar: '', key: '' };
let enteredPin     = '';
let isOpponentOnline = false;

// WebSocket state
let ws              = null;
let wsReconnectDelay = 1000;
let wsReconnectTimer = null;
let isManualDisconnect = false;

// WebRTC state
let peerConn        = null;
let localStream     = null;
let remoteAudioEl   = null;
let isMicMuted      = false;
let isCaller        = false;

// Call UI state
let isCallActive    = false;
let isCallMinimized = false;
let callTimer       = null;
let callSeconds     = 0;

// Recording state
let isRecording       = false;
let recordingSeconds  = 0;
let recordingInterval = null;

// Typing state
let typingOutTimer    = null;
let opponentTyping    = false;
let opponentTypingTimer = null;

// Sound
let soundEnabled = localStorage.getItem('chat_typing_sound') !== 'false';
let audioCtx     = null;
const KEYPRESS_AUDIO_BUFFERS = [];
let audioBuffersLoaded = false;
let lastSoundIndex = -1;
const soundBasePath = (window.location.pathname.includes('/static/') ? 'keypresssound/' : 'static/keypresssound/');
const SOUND_FILES = [
  'keypress-001.wav','keypress-002.wav','keypress-003.wav','keypress-004.wav',
  'keypress-005.wav','keypress-006.wav','keypress-007.wav','keypress-008.wav'
];

// WebRTC config — uses free Google STUN servers
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

// ─────────────────────────────────────────────────
//  Boot
// ─────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  setupPinPad();
  setupEventListeners();
  setupKeyboardUIHandling();
  preloadKeypressSounds();

  const saved = sessionStorage.getItem('chat_active_user');
  if (saved && USER_PROFILES[saved]) {
    loginUser(saved);
  } else {
    lockApp();
  }
});

// ─────────────────────────────────────────────────
//  PIN Lock Screen
// ─────────────────────────────────────────────────
function setupPinPad() {
  document.querySelectorAll('.pin-key[data-digit]').forEach((key) => {
    key.addEventListener('click', () => handlePinDigit(key.getAttribute('data-digit')));
  });
  if (pinBackspaceBtn) {
    pinBackspaceBtn.addEventListener('click', handlePinBackspace);
  }
  window.addEventListener('keydown', (e) => {
    if (pinOverlay && !pinOverlay.classList.contains('unlocked')) {
      if (e.key >= '0' && e.key <= '9') { e.preventDefault(); handlePinDigit(e.key); }
      else if (e.key === 'Backspace')    { e.preventDefault(); handlePinBackspace(); }
      else if (e.key === 'Enter' && enteredPin.length === 4) verifyPin();
    }
  });
}

function handlePinDigit(digit) {
  if (enteredPin.length >= 4) return;
  enteredPin += digit;
  updatePinDotsUI();
  if (enteredPin.length === 4) setTimeout(verifyPin, 100);
}

function handlePinBackspace() {
  if (enteredPin.length > 0) {
    enteredPin = enteredPin.slice(0, -1);
    updatePinDotsUI();
    clearPinFeedback();
  }
}

function updatePinDotsUI() {
  document.querySelectorAll('#pinDots .pin-dot').forEach((dot, i) => {
    dot.classList.toggle('filled', i < enteredPin.length);
  });
}

function verifyPin() {
  if      (enteredPin === '1470') loginUser('jisu');
  else if (enteredPin === '3690') loginUser('jenu');
  else showPinError();
}

function showPinError() {
  if (pinDotsContainer) pinDotsContainer.classList.add('error');
  if (pinFeedback) { pinFeedback.textContent = 'Incorrect PIN. Try again.'; pinFeedback.classList.add('visible'); }
  setTimeout(() => {
    enteredPin = '';
    updatePinDotsUI();
    if (pinDotsContainer) pinDotsContainer.classList.remove('error');
  }, 500);
}

function clearPinFeedback() {
  if (pinFeedback) { pinFeedback.textContent = ''; pinFeedback.classList.remove('visible'); }
}

function loginUser(userKey) {
  activeUser = userKey;
  sessionStorage.setItem('chat_active_user', userKey);
  const profile = USER_PROFILES[userKey];
  currentPartner = { ...profile.opponent };

  applyOpponentProfile(profile.opponent.avatar, profile.opponent.name);
  document.title = `LiveChat — ${profile.opponent.name}`;

  if (pinOverlay) pinOverlay.classList.add('unlocked');

  getAudioContext();
  preloadKeypressSounds();

  // Connect WebSocket
  connectWebSocket(userKey);
}

function lockApp() {
  isManualDisconnect = true;
  disconnectWebSocket();
  closeWebRTCCall(false);

  activeUser = null;
  sessionStorage.removeItem('chat_active_user');
  enteredPin = '';
  updatePinDotsUI();
  clearPinFeedback();

  if (pinOverlay) pinOverlay.classList.remove('unlocked');
  setPresenceOffline();
  isManualDisconnect = false;
}

// ─────────────────────────────────────────────────
//  WebSocket — Connection Management
// ─────────────────────────────────────────────────
function getWsUrl(userKey) {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws/${userKey}`;
}

function connectWebSocket(userKey) {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  clearTimeout(wsReconnectTimer);

  try {
    ws = new WebSocket(getWsUrl(userKey));
  } catch (e) {
    console.warn('WS connect failed:', e);
    scheduleReconnect(userKey);
    return;
  }

  ws.onopen = () => {
    console.log('[WS] connected as', userKey);
    wsReconnectDelay = 1000; // reset backoff on success
    showToast('Connected ✓', 'success');
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleWsMessage(msg);
    } catch (e) {
      console.warn('[WS] bad JSON', e);
    }
  };

  ws.onclose = (e) => {
    console.log('[WS] disconnected code:', e.code);
    ws = null;
    setPresenceOffline();
    if (!isManualDisconnect && activeUser) scheduleReconnect(activeUser);
  };

  ws.onerror = (e) => {
    console.warn('[WS] error', e);
  };
}

function disconnectWebSocket() {
  clearTimeout(wsReconnectTimer);
  if (ws) {
    ws.close();
    ws = null;
  }
}

function scheduleReconnect(userKey) {
  clearTimeout(wsReconnectTimer);
  wsReconnectTimer = setTimeout(() => {
    if (activeUser) {
      wsReconnectDelay = Math.min(wsReconnectDelay * 2, 30000);
      connectWebSocket(userKey);
    }
  }, wsReconnectDelay);
}

function wsSend(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
    return true;
  }
  return false;
}

// ─────────────────────────────────────────────────
//  WebSocket — Incoming Message Router
// ─────────────────────────────────────────────────
function handleWsMessage(msg) {
  switch (msg.type) {

    // ── Presence ──────────────────────────────────
    case 'presence':
      if (msg.user === currentPartner.key) {
        isOpponentOnline = msg.status === 'online';
        setPresenceUI(isOpponentOnline);
      }
      break;

    // ── Chat message ──────────────────────────────
    case 'chat':
      receiveIncomingMessage(msg.text, msg.time);
      break;

    // ── Image message ─────────────────────────────
    // ── Voice note ────────────────────────────────
    case 'voice':
      appendVoiceMessage(msg.duration, 'incoming');
      break;

    // ── Typing indicators ─────────────────────────
    case 'typing_start':
      showOpponentTyping();
      break;

    case 'typing_stop':
      hideOpponentTyping();
      break;

    // ── WebRTC Signaling ──────────────────────────
    case 'call_offer':
      handleIncomingOffer(msg.sdp);
      break;

    case 'call_answer':
      handleCallAnswer(msg.sdp);
      break;

    case 'call_ice':
      handleIceCandidate(msg.candidate);
      break;

    case 'call_end':
      closeWebRTCCall(false);
      showToast(`${currentPartner.name} ended the call`);
      break;

    case 'call_reject':
      closeWebRTCCall(false);
      showToast(`${currentPartner.name} rejected the call`);
      break;

    case 'call_busy':
      closeWebRTCCall(false);
      showToast(`${currentPartner.name} is busy`);
      break;
  }
}

// ─────────────────────────────────────────────────
//  Presence UI
// ─────────────────────────────────────────────────
function setPresenceUI(online) {
  if (avatarBadge) {
    avatarBadge.style.background = online ? '#22C55E' : '#D1D5DB';
  }
  if (userStatusEl && !opponentTyping) {
    userStatusEl.textContent = online ? 'Online' : 'Offline';
    userStatusEl.classList.toggle('is-typing', false);
  }
}

function setPresenceOffline() {
  isOpponentOnline = false;
  setPresenceUI(false);
}

// ─────────────────────────────────────────────────
//  Typing Indicators
// ─────────────────────────────────────────────────
function showOpponentTyping() {
  opponentTyping = true;
  clearTimeout(opponentTypingTimer);
  if (userStatusEl) {
    userStatusEl.textContent = 'typing...';
    userStatusEl.classList.add('is-typing');
  }
  // Auto-clear after 4s if no stop event
  opponentTypingTimer = setTimeout(hideOpponentTyping, 4000);
}

function hideOpponentTyping() {
  opponentTyping = false;
  if (userStatusEl) {
    userStatusEl.textContent = isOpponentOnline ? 'Online' : 'Offline';
    userStatusEl.classList.remove('is-typing');
  }
}

// ─────────────────────────────────────────────────
//  Incoming Chat Message (live-streaming animation)
// ─────────────────────────────────────────────────
function receiveIncomingMessage(text, timeStr) {
  hideOpponentTyping();

  const messageRow = document.createElement('div');
  messageRow.className = 'message-row incoming';

  const bubbleGroup = document.createElement('div');
  bubbleGroup.className = 'bubble-group';

  const bubble = document.createElement('div');
  bubble.className = 'bubble live-typing-bubble';

  const textNode   = document.createElement('span');
  textNode.className = 'streaming-text';
  const cursorNode = document.createElement('span');
  cursorNode.className = 'streaming-cursor';

  bubble.appendChild(textNode);
  bubble.appendChild(cursorNode);
  bubbleGroup.appendChild(bubble);
  messageRow.appendChild(bubbleGroup);

  chatMessages.insertBefore(messageRow, typingIndicator);
  scrollToBottom();

  // Stream text character by character
  let i = 0;
  function typeNext() {
    if (i < text.length) {
      i++;
      textNode.textContent = text.slice(0, i);
      playOpponentKeypressSound();
      const ch = text[i - 1];
      let delay = 22 + Math.random() * 28;
      if (ch === ' ')  delay += 30;
      if ('.,!?'.includes(ch)) delay += 100;
      setTimeout(typeNext, delay);
    } else {
      cursorNode.remove();
      bubble.classList.remove('live-typing-bubble');
      const timeEl = document.createElement('div');
      timeEl.className = 'message-time';
      timeEl.textContent = timeStr || formatCurrentTime();
      messageRow.appendChild(timeEl);
      scrollToBottom();
    }
  }
  typeNext();
}

// ─────────────────────────────────────────────────
//  Send Message
// ─────────────────────────────────────────────────
function handleSend() {
  const text = chatInput.value.trim();
  if (!text) return;

  appendMessage(text, 'outgoing');
  chatInput.value = '';
  chatInput.dispatchEvent(new Event('input'));
  emojiPopover.classList.remove('show');

  // Send typing_stop
  wsSend({ type: 'typing_stop' });
  clearTimeout(typingOutTimer);

  // Send the chat message
  const sent = wsSend({ type: 'chat', text, time: formatCurrentTime() });
  if (!sent) showToast('Not connected — message not delivered', 'error');
}

// ─────────────────────────────────────────────────
//  Append Message Bubble
// ─────────────────────────────────────────────────
function appendMessage(content, type = 'outgoing') {
  const messageRow = document.createElement('div');
  messageRow.className = `message-row ${type}`;

  const bubbleGroup = document.createElement('div');
  bubbleGroup.className = 'bubble-group';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = content;

  const timeEl = document.createElement('div');
  timeEl.className = 'message-time';
  timeEl.textContent = formatCurrentTime();

  bubbleGroup.appendChild(bubble);
  messageRow.appendChild(bubbleGroup);
  messageRow.appendChild(timeEl);

  chatMessages.insertBefore(messageRow, typingIndicator);
  scrollToBottom();
}

function scrollToBottom() {
  setTimeout(() => { chatMessages.scrollTop = chatMessages.scrollHeight; }, 40);
}

// ─────────────────────────────────────────────────
//  Voice Notes
// ─────────────────────────────────────────────────
function appendVoiceMessage(seconds, type = 'outgoing') {
  const durationText = formatDuration(seconds);
  const messageRow = document.createElement('div');
  messageRow.className = `message-row ${type}`;

  const bubbleGroup = document.createElement('div');
  bubbleGroup.className = 'bubble-group';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  const heights = [6,14,22,10,18,24,16,12,20,8,15,22,9,14];
  const barsHtml = heights.map(h => `<span style="height:${h}px;"></span>`).join('');

  bubble.innerHTML = `
    <div class="voice-bubble">
      <button class="voice-play-btn" type="button" aria-label="Play Voice Note">
        <svg class="play-icon" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 19 12 6 20 6 4"></polygon></svg>
        <svg class="pause-icon" style="display:none;" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>
        </svg>
      </button>
      <div class="voice-waveform">${barsHtml}</div>
      <span class="voice-duration">${durationText}</span>
    </div>`;

  const voiceBubble = bubble.querySelector('.voice-bubble');
  const playBtn     = bubble.querySelector('.voice-play-btn');
  const playIcon    = bubble.querySelector('.play-icon');
  const pauseIcon   = bubble.querySelector('.pause-icon');
  let isPlaying = false, playTimer = null;

  playBtn.addEventListener('click', () => {
    isPlaying = !isPlaying;
    if (isPlaying) {
      voiceBubble.classList.add('playing');
      playIcon.style.display  = 'none';
      pauseIcon.style.display = 'block';
      clearTimeout(playTimer);
      playTimer = setTimeout(() => {
        isPlaying = false;
        voiceBubble.classList.remove('playing');
        playIcon.style.display  = 'block';
        pauseIcon.style.display = 'none';
      }, seconds * 1000);
    } else {
      clearTimeout(playTimer);
      voiceBubble.classList.remove('playing');
      playIcon.style.display  = 'block';
      pauseIcon.style.display = 'none';
    }
  });

  const timeEl = document.createElement('div');
  timeEl.className   = 'message-time';
  timeEl.textContent = formatCurrentTime();

  bubbleGroup.appendChild(bubble);
  messageRow.appendChild(bubbleGroup);
  messageRow.appendChild(timeEl);
  chatMessages.insertBefore(messageRow, typingIndicator);
  scrollToBottom();
}

// ─────────────────────────────────────────────────
//  WebRTC — Audio Calls
// ─────────────────────────────────────────────────
async function startAudioCall() {
  if (isCallActive) { restoreCall(); return; }
  if (!isOpponentOnline) { showToast(`${currentPartner.name} is offline`, 'error'); return; }

  isCaller = true;
  isCallActive = true;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    showToast('Microphone access denied', 'error');
    isCallActive = false;
    return;
  }

  createPeerConnection();
  localStream.getTracks().forEach(t => peerConn.addTrack(t, localStream));

  const offer = await peerConn.createOffer();
  await peerConn.setLocalDescription(offer);
  wsSend({ type: 'call_offer', sdp: offer });

  openCallModal('Calling...');
}

async function handleIncomingOffer(sdp) {
  // If already in a call, reject
  if (isCallActive) {
    wsSend({ type: 'call_busy' });
    return;
  }

  // Show ringing overlay
  showIncomingCallUI();

  // Store offer to process after user accepts
  window._pendingOffer = sdp;
}

async function acceptCall() {
  hideIncomingCallUI();
  if (!window._pendingOffer) return;

  isCallActive = true;
  isCaller = false;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    showToast('Microphone access denied', 'error');
    wsSend({ type: 'call_reject' });
    isCallActive = false;
    return;
  }

  createPeerConnection();
  localStream.getTracks().forEach(t => peerConn.addTrack(t, localStream));

  await peerConn.setRemoteDescription(new RTCSessionDescription(window._pendingOffer));
  const answer = await peerConn.createAnswer();
  await peerConn.setLocalDescription(answer);
  wsSend({ type: 'call_answer', sdp: answer });

  window._pendingOffer = null;
  openCallModal('Connecting...');
}

function rejectCall() {
  hideIncomingCallUI();
  window._pendingOffer = null;
  wsSend({ type: 'call_reject' });
}

async function handleCallAnswer(sdp) {
  if (!peerConn) return;
  await peerConn.setRemoteDescription(new RTCSessionDescription(sdp));
}

async function handleIceCandidate(candidate) {
  if (!peerConn || !candidate) return;
  try {
    await peerConn.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (e) { /* ignore stale candidates */ }
}

function createPeerConnection() {
  peerConn = new RTCPeerConnection(RTC_CONFIG);

  peerConn.onicecandidate = (e) => {
    if (e.candidate) {
      wsSend({ type: 'call_ice', candidate: e.candidate.toJSON() });
    }
  };

  peerConn.ontrack = (e) => {
    if (!remoteAudioEl) {
      remoteAudioEl = new Audio();
      remoteAudioEl.autoplay = true;
    }
    remoteAudioEl.srcObject = e.streams[0];
  };

  peerConn.onconnectionstatechange = () => {
    const state = peerConn.connectionState;
    if (state === 'connected') {
      startCallTimer();
      if (callStatus)    callStatus.textContent = '00:00';
      if (callStatusDot) callStatusDot.style.background = '#10B981';
    }
    if (state === 'disconnected' || state === 'failed' || state === 'closed') {
      closeWebRTCCall(false);
    }
  };
}

function closeWebRTCCall(sendEndSignal = true) {
  if (sendEndSignal && isCallActive) {
    wsSend({ type: 'call_end' });
  }

  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  if (peerConn)    { peerConn.close(); peerConn = null; }
  if (remoteAudioEl) { remoteAudioEl.srcObject = null; remoteAudioEl = null; }

  isCallActive    = false;
  isCallMinimized = false;
  isMicMuted      = false;
  clearInterval(callTimer);
  callTimer   = null;
  callSeconds = 0;

  if (callModal)          callModal.classList.remove('active');
  if (minimizedCallBanner) minimizedCallBanner.classList.remove('active');
  if (voiceCallBtn)       voiceCallBtn.classList.remove('in-call');
  hideIncomingCallUI();
}

function openCallModal(statusText) {
  if (!callModal) return;
  callName.textContent  = currentPartner.name;
  callAvatar.src        = currentPartner.avatar;
  callStatus.textContent = statusText;
  if (callStatusDot) callStatusDot.style.background = '#F59E0B';
  callModal.classList.add('active');
  if (voiceCallBtn) voiceCallBtn.classList.add('in-call');
  minimizedCallBanner && minimizedCallBanner.classList.remove('active');
  if (callMicToggleBtn) callMicToggleBtn.classList.remove('active');
  if (micLabel)         micLabel.textContent = 'Mute';
  if (callSpeakerBtn)   callSpeakerBtn.classList.remove('active');
}

function startCallTimer() {
  clearInterval(callTimer);
  callSeconds = 0;
  callTimer = setInterval(() => {
    callSeconds++;
    const mins = Math.floor(callSeconds / 60).toString().padStart(2, '0');
    const secs = (callSeconds % 60).toString().padStart(2, '0');
    const t = `${mins}:${secs}`;
    if (callStatus)        callStatus.textContent = t;
    if (minimizedCallTimer) minimizedCallTimer.textContent = t;
  }, 1000);
}

function minimizeCall() {
  if (!isCallActive) return;
  isCallMinimized = true;
  callModal.classList.remove('active');
  minimizedCallBanner.classList.add('active');
  if (minimizedCallTimer) minimizedCallTimer.textContent = callStatus.textContent;
}

function restoreCall() {
  if (!isCallActive) return;
  isCallMinimized = false;
  minimizedCallBanner.classList.remove('active');
  callModal.classList.add('active');
}

// ─────────────────────────────────────────────────
//  Incoming Call UI
// ─────────────────────────────────────────────────
function showIncomingCallUI() {
  if (!incomingCallOverlay) return;
  if (incomingCallerName)   incomingCallerName.textContent  = currentPartner.name;
  if (incomingCallerAvatar) incomingCallerAvatar.src        = currentPartner.avatar;
  incomingCallOverlay.classList.add('active');

  // Auto-reject after 30s if not answered
  window._incomingCallTimeout = setTimeout(() => {
    if (incomingCallOverlay.classList.contains('active')) rejectCall();
  }, 30000);
}

function hideIncomingCallUI() {
  clearTimeout(window._incomingCallTimeout);
  if (incomingCallOverlay) incomingCallOverlay.classList.remove('active');
}

// ─────────────────────────────────────────────────
//  Avatar / Presence UI
// ─────────────────────────────────────────────────
function applyOpponentProfile(url, name) {
  if (userNameEl)  userNameEl.textContent = name;
  if (callName)    callName.textContent   = name;
  if (callAvatar)  callAvatar.src         = url;
  currentPartner.avatar = url;
  currentPartner.name   = name;

  if (avatarImg) {
    avatarImg.style.opacity = '0.3';
    const tmp = new Image();
    tmp.onload  = () => { avatarImg.src = url; avatarImg.style.opacity = '1'; };
    tmp.onerror = () => { avatarImg.style.opacity = '1'; };
    tmp.src = url;
  }
  if (incomingCallerAvatar) incomingCallerAvatar.src = url;
  if (incomingCallerName)   incomingCallerName.textContent = name;
}

// ─────────────────────────────────────────────────
//  Event Listeners Setup
// ─────────────────────────────────────────────────
function setupEventListeners() {
  // Sound toggle
  if (soundToggleBtn) {
    const onIcon  = soundToggleBtn.querySelector('.sound-on-icon');
    const offIcon = soundToggleBtn.querySelector('.sound-off-icon');
    const updateSoundUI = () => {
      soundToggleBtn.classList.toggle('muted', !soundEnabled);
      if (onIcon)  onIcon.style.display  = soundEnabled ? 'block' : 'none';
      if (offIcon) offIcon.style.display = soundEnabled ? 'none'  : 'block';
      soundToggleBtn.title = soundEnabled ? 'Typing sound ON (click to mute)' : 'Typing sound OFF (click to enable)';
    };
    updateSoundUI();
    soundToggleBtn.addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      localStorage.setItem('chat_typing_sound', soundEnabled);
      updateSoundUI();
    });
  }

  // Input — toggle mic/send icon + send typing events
  chatInput.addEventListener('input', () => {
    const text = chatInput.value.trim();
    // Toggle mic ↔ send icon
    if (text.length > 0) {
      actionBtn.classList.add('send-mode');
      actionIcon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
    } else {
      actionBtn.classList.remove('send-mode');
      if (!isRecording) setMicIconDefault();
    }
    // Typing indicator events
    if (text.length > 0) {
      wsSend({ type: 'typing_start' });
      clearTimeout(typingOutTimer);
      typingOutTimer = setTimeout(() => wsSend({ type: 'typing_stop' }), 2000);
    } else {
      clearTimeout(typingOutTimer);
      wsSend({ type: 'typing_stop' });
    }
  });

  // Enter to send
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });

  // Send/Mic button
  actionBtn.addEventListener('click', () => {
    if (chatInput.value.trim()) handleSend();
    else toggleVoiceRecording();
  });

  // Cancel recording
  if (cancelRecordBtn) cancelRecordBtn.addEventListener('click', (e) => { e.stopPropagation(); cancelVoiceRecording(); });

  // Lock app
  if (lockAppBtn) lockAppBtn.addEventListener('click', lockApp);

  // Call button
  if (voiceCallBtn) {
    voiceCallBtn.addEventListener('click', () => {
      if (isCallActive) restoreCall();
      else startAudioCall();
    });
  }

  // Incoming call accept/reject
  if (acceptCallBtn) acceptCallBtn.addEventListener('click', acceptCall);
  if (rejectCallBtn) rejectCallBtn.addEventListener('click', rejectCall);

  // Active call controls
  if (endCallBtn)       endCallBtn.addEventListener('click',       () => closeWebRTCCall(true));
  if (callMinimizeBtn)  callMinimizeBtn.addEventListener('click',  minimizeCall);
  if (callChatBackBtn)  callChatBackBtn.addEventListener('click',  minimizeCall);
  if (minimizedCallBanner) {
    minimizedCallBanner.addEventListener('click', (e) => {
      if (!e.target.closest('#minimizedEndCallBtn')) restoreCall();
    });
  }
  if (minimizedEndCallBtn) minimizedEndCallBtn.addEventListener('click', (e) => { e.stopPropagation(); closeWebRTCCall(true); });

  if (callMicToggleBtn) {
    callMicToggleBtn.addEventListener('click', () => {
      isMicMuted = !isMicMuted;
      callMicToggleBtn.classList.toggle('active', isMicMuted);
      if (micLabel) micLabel.textContent = isMicMuted ? 'Unmute' : 'Mute';
      if (localStream) localStream.getAudioTracks().forEach(t => { t.enabled = !isMicMuted; });
    });
  }
  if (callSpeakerBtn) callSpeakerBtn.addEventListener('click', () => callSpeakerBtn.classList.toggle('active'));

  // Emoji
  if (emojiBtn) {
    emojiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      emojiPopover.classList.toggle('show');
    });
    document.querySelectorAll('.emoji-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        chatInput.value += btn.textContent;
        chatInput.dispatchEvent(new Event('input'));
        emojiPopover.classList.remove('show');
        chatInput.focus();
      });
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#emojiPopover') && !e.target.closest('#emojiBtn')) {
        emojiPopover.classList.remove('show');
      }
    });
  }

}


// ─────────────────────────────────────────────────
//  Voice Recording
// ─────────────────────────────────────────────────
function toggleVoiceRecording() {
  if (!isRecording) startVoiceRecording();
  else stopAndSendVoiceRecording();
}

function startVoiceRecording() {
  isRecording = true;
  recordingSeconds = 0;
  recordingTimer.textContent = '0:00';
  inputNormalContent.style.display = 'none';
  inputRecordingContent.style.display = 'flex';
  actionBtn.classList.add('recording-active');
  actionIcon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="3"></rect></svg>`;
  clearInterval(recordingInterval);
  recordingInterval = setInterval(() => {
    recordingSeconds++;
    recordingTimer.textContent = formatDuration(recordingSeconds);
  }, 1000);
}

function stopAndSendVoiceRecording() {
  clearInterval(recordingInterval);
  const dur = recordingSeconds > 0 ? recordingSeconds : 1;
  isRecording = false;
  inputRecordingContent.style.display = 'none';
  inputNormalContent.style.display = 'flex';
  setMicIconDefault();

  appendVoiceMessage(dur, 'outgoing');
  wsSend({ type: 'voice', duration: dur });
}

function cancelVoiceRecording() {
  clearInterval(recordingInterval);
  isRecording = false;
  inputRecordingContent.style.display = 'none';
  inputNormalContent.style.display = 'flex';
  setMicIconDefault();
}

function setMicIconDefault() {
  actionBtn.classList.remove('recording-active', 'send-mode');
  actionIcon.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>`;
}

// ─────────────────────────────────────────────────
//  Keyboard UI Handling
// ─────────────────────────────────────────────────
function setupKeyboardUIHandling() {
  if (window.visualViewport) {
    const onVP = () => {
      if (chatApp) chatApp.style.height = `${window.visualViewport.height}px`;
      scrollToBottom();
    };
    window.visualViewport.addEventListener('resize', onVP);
    window.visualViewport.addEventListener('scroll', onVP);
  }
  chatInput.addEventListener('focus', () => {
    inputPill.classList.add('focused');
    emojiPopover.classList.remove('show');
    setTimeout(scrollToBottom, 250);
  });
  chatInput.addEventListener('blur', () => inputPill.classList.remove('focused'));
}

// ─────────────────────────────────────────────────
//  Toast Notification
// ─────────────────────────────────────────────────
let toastTimer = null;
function showToast(message, type = 'info') {
  let toast = document.getElementById('liveToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'liveToast';
    document.getElementById('chatApp').appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `live-toast live-toast--${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

// ─────────────────────────────────────────────────
//  Keypress Sound System
// ─────────────────────────────────────────────────
function getAudioContext() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

async function preloadKeypressSounds() {
  if (audioBuffersLoaded) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const buffers = await Promise.all(SOUND_FILES.map(async (f) => {
      const res = await fetch(`${soundBasePath}${f}`);
      const ab  = await res.arrayBuffer();
      return ctx.decodeAudioData(ab);
    }));
    KEYPRESS_AUDIO_BUFFERS.push(...buffers);
    audioBuffersLoaded = true;
  } catch (e) { /* silent */ }
}

const fallbackAudio = SOUND_FILES.map((f) => {
  const a = new Audio(`${soundBasePath}${f}`);
  a.volume = 0.55;
  return a;
});

['click','keydown','touchstart','mousedown'].forEach(ev =>
  window.addEventListener(ev, () => { getAudioContext(); preloadKeypressSounds(); }, { once: true, passive: true })
);

function playOpponentKeypressSound() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  let idx = Math.floor(Math.random() * SOUND_FILES.length);
  if (idx === lastSoundIndex) idx = (idx + 1) % SOUND_FILES.length;
  lastSoundIndex = idx;

  if (ctx && audioBuffersLoaded && KEYPRESS_AUDIO_BUFFERS[idx]) {
    try {
      const src  = ctx.createBufferSource();
      const gain = ctx.createGain();
      src.buffer = KEYPRESS_AUDIO_BUFFERS[idx];
      gain.gain.value = 0.55 * (0.96 + Math.random() * 0.08);
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start(0);
    } catch (_) { /* ignore */ }
  } else {
    const clone = fallbackAudio[idx].cloneNode();
    clone.volume = 0.5;
    clone.play().catch(() => {});
  }
}

// ─────────────────────────────────────────────────
//  Utility
// ─────────────────────────────────────────────────
function formatCurrentTime() {
  const now = new Date();
  let h = now.getHours();
  const m = now.getMinutes().toString().padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}

function formatDuration(sec) {
  return `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, '0')}`;
}
