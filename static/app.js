// LiveChat — Real-time WebSocket Client
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

const soundToggleBtn     = document.getElementById('soundToggleBtn');
const clearChatBtn       = document.getElementById('clearChatBtn');
const lockAppBtn         = document.getElementById('lockAppBtn');
const pinOverlay         = document.getElementById('pinOverlay');
const pinDotsContainer   = document.getElementById('pinDots');
const pinFeedback        = document.getElementById('pinFeedback');
const pinBackspaceBtn    = document.getElementById('pinBackspaceBtn');

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
      name: 'Mr. IC',
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

// Typing state
let typingOutTimer    = null;
let opponentTyping    = false;
let opponentTypingTimer = null;
let lastLocalTextLength = 0;

// Sound
let soundEnabled = localStorage.getItem('chat_typing_sound') !== 'false';
let audioCtx     = null;
let KEYPRESS_AUDIO_BUFFERS = [];
let audioBuffersLoaded = false;
let lastSoundIndex = -1;
const soundBasePath = (window.location.pathname.includes('/static/') ? 'keypresssound/' : 'static/keypresssound/');
const SOUND_FILES = [
  'keypress-001.wav','keypress-002.wav','keypress-003.wav','keypress-004.wav',
  'keypress-005.wav','keypress-006.wav','keypress-007.wav','keypress-008.wav'
];

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
    key.addEventListener('click', (e) => {
      e.preventDefault();
      const digit = key.getAttribute('data-digit');
      if (digit !== null) {
        handlePinDigit(digit);
      }
    });
  });

  const backBtn = pinBackspaceBtn || document.getElementById('pinBackspaceBtn');
  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      e.preventDefault();
      handlePinBackspace();
    });
  }

  window.addEventListener('keydown', (e) => {
    const overlay = pinOverlay || document.getElementById('pinOverlay');
    if (overlay && !overlay.classList.contains('unlocked')) {
      let digit = null;
      if (e.key >= '0' && e.key <= '9') {
        digit = e.key;
      } else if (e.code && /^Numpad[0-9]$/.test(e.code)) {
        digit = e.code.replace('Numpad', '');
      }

      if (digit !== null) {
        e.preventDefault();
        handlePinDigit(digit);
        const btn = document.querySelector(`.pin-key[data-digit="${digit}"]`);
        if (btn) {
          btn.classList.add('active-press');
          setTimeout(() => btn.classList.remove('active-press'), 120);
        }
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        handlePinBackspace();
        const bBtn = pinBackspaceBtn || document.getElementById('pinBackspaceBtn');
        if (bBtn) {
          bBtn.classList.add('active-press');
          setTimeout(() => bBtn.classList.remove('active-press'), 120);
        }
      } else if (e.key === 'Enter' && enteredPin.length === 4) {
        e.preventDefault();
        verifyPin();
      }
    }
  });
}

function handlePinDigit(digit) {
  if (enteredPin.length >= 4) return;
  clearPinFeedback();
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

  // Load chat history from server database immediately
  loadChatHistory(userKey);

  // Connect WebSocket
  connectWebSocket(userKey);
}

function lockApp() {
  isManualDisconnect = true;
  disconnectWebSocket();

  activeUser = null;
  sessionStorage.removeItem('chat_active_user');
  enteredPin = '';
  updatePinDotsUI();
  clearPinFeedback();

  // Clear rendered message bubbles on lock
  document.querySelectorAll('#chatMessages .message-row').forEach(row => row.remove());
  if (currentLiveIncomingRow) {
    currentLiveIncomingRow = null;
  }
  lastOpponentTextLength = 0;
  hideOpponentTyping();

  if (pinOverlay) pinOverlay.classList.remove('unlocked');
  setPresenceOffline();
  isManualDisconnect = false;
}

// ─────────────────────────────────────────────────
//  Chat History & Persistence
// ─────────────────────────────────────────────────
function formatTimeFromIso(isoString) {
  if (!isoString) return formatCurrentTime();
  try {
    const cleanStr = isoString.includes('T') ? isoString : isoString.replace(' ', 'T') + 'Z';
    const date = new Date(cleanStr);
    if (isNaN(date.getTime())) return formatCurrentTime();
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const strMinutes = minutes < 10 ? '0' + minutes : minutes;
    return `${hours}:${strMinutes} ${ampm}`;
  } catch (e) {
    return formatCurrentTime();
  }
}

async function loadChatHistory(userKey) {
  if (!userKey) return;
  try {
    const res = await fetch(`/api/messages/${encodeURIComponent(userKey)}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data.messages) return;

    const existingMsgIds = new Set();
    document.querySelectorAll('#chatMessages .message-row[data-msg-id]').forEach(row => {
      existingMsgIds.add(row.dataset.msgId);
    });

    let appendedAny = false;
    for (const msg of data.messages) {
      const msgIdStr = String(msg.id);
      if (existingMsgIds.has(msgIdStr)) {
        continue;
      }

      const isOutgoing = msg.sender === userKey;
      const type = isOutgoing ? 'outgoing' : 'incoming';
      const timeStr = msg.client_time || formatTimeFromIso(msg.created_at);

      if (msg.msg_type === 'chat') {
        appendMessage(msg.text_content, type, timeStr, msgIdStr);
        appendedAny = true;
      }
      existingMsgIds.add(msgIdStr);
    }

    if (appendedAny) {
      scrollToBottom();
    }
  } catch (err) {
    console.warn('[DB] Failed to load chat history:', err);
  }
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
    loadChatHistory(userKey);
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
      receiveIncomingMessage(msg.text, msg.time, msg.id);
      break;

    // ── Chat cleared ──────────────────────────────
    case 'chat_cleared':
      clearChatDOM();
      showToast('Chat history cleared', 'info');
      break;

    // ── Live real-time typing preview ─────────────
    case 'live_typing':
      handleOpponentLiveTyping(msg.text);
      break;

    // ── Typing indicators ─────────────────────────
    case 'typing_start':
      showOpponentTyping();
      break;

    case 'typing_stop':
      hideOpponentLivePreview();
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
//  Typing Indicators & Live Keystroke Stream
// ─────────────────────────────────────────────────
let currentLiveIncomingRow = null;
let lastOpponentTextLength = 0;

function handleOpponentLiveTyping(text) {
  clearTimeout(opponentTypingTimer);

  if (!text || text.length === 0) {
    if (currentLiveIncomingRow) {
      currentLiveIncomingRow.remove();
      currentLiveIncomingRow = null;
    }
    lastOpponentTextLength = 0;
    hideOpponentTyping();
    return;
  }

  // Update status to typing...
  opponentTyping = true;
  if (userStatusEl) {
    userStatusEl.textContent = 'typing...';
    userStatusEl.classList.add('is-typing');
  }
  if (typingIndicator) {
    typingIndicator.classList.remove('active');
  }

  // Create standard incoming bubble if it does not exist yet
  if (!currentLiveIncomingRow) {
    currentLiveIncomingRow = document.createElement('div');
    currentLiveIncomingRow.className = 'message-row incoming';

    const bubbleGroup = document.createElement('div');
    bubbleGroup.className = 'bubble-group';

    const bubble = document.createElement('div');
    bubble.className = 'bubble live-typing-bubble';

    const textNode = document.createElement('span');
    textNode.className = 'streaming-text';

    const cursorNode = document.createElement('span');
    cursorNode.className = 'streaming-cursor';

    bubble.appendChild(textNode);
    bubble.appendChild(cursorNode);
    bubbleGroup.appendChild(bubble);
    currentLiveIncomingRow.appendChild(bubbleGroup);

    chatMessages.insertBefore(currentLiveIncomingRow, typingIndicator);
  }

  const textNode = currentLiveIncomingRow.querySelector('.streaming-text');
  if (textNode) {
    textNode.textContent = text;
  }

  // Play subtle keypress sound as characters are typed by opponent
  if (text.length !== lastOpponentTextLength) {
    playKeypressSound();
  }
  lastOpponentTextLength = text.length;

  scrollToBottom();

  // Auto-cleanup after 10s of silence if abandoned
  opponentTypingTimer = setTimeout(() => {
    if (currentLiveIncomingRow) {
      currentLiveIncomingRow.remove();
      currentLiveIncomingRow = null;
    }
    lastOpponentTextLength = 0;
    hideOpponentTyping();
  }, 10000);
}

function showOpponentTyping() {
  opponentTyping = true;
  clearTimeout(opponentTypingTimer);
  if (userStatusEl) {
    userStatusEl.textContent = 'typing...';
    userStatusEl.classList.add('is-typing');
  }
  if (!currentLiveIncomingRow && typingIndicator) {
    typingIndicator.classList.add('active');
    scrollToBottom();
  }
  opponentTypingTimer = setTimeout(hideOpponentTyping, 4000);
}

function hideOpponentTyping() {
  opponentTyping = false;
  if (userStatusEl) {
    userStatusEl.textContent = isOpponentOnline ? 'Online' : 'Offline';
    userStatusEl.classList.remove('is-typing');
  }
  if (typingIndicator) {
    typingIndicator.classList.remove('active');
  }
}

function clearChatDOM() {
  document.querySelectorAll('#chatMessages .message-row').forEach(row => row.remove());
  if (currentLiveIncomingRow) {
    currentLiveIncomingRow.remove();
    currentLiveIncomingRow = null;
  }
  lastOpponentTextLength = 0;
  hideOpponentTyping();
}

// ─────────────────────────────────────────────────
//  Incoming Chat Message
// ─────────────────────────────────────────────────
function receiveIncomingMessage(text, timeStr, messageId = null) {
  hideOpponentTyping();

  if (messageId && document.querySelector(`#chatMessages .message-row[data-msg-id="${messageId}"]`)) {
    return;
  }

  // If the message was already being typed live, finalize that exact bubble!
  if (currentLiveIncomingRow) {
    const bubble = currentLiveIncomingRow.querySelector('.bubble');
    const textNode = currentLiveIncomingRow.querySelector('.streaming-text');
    const cursorNode = currentLiveIncomingRow.querySelector('.streaming-cursor');

    if (textNode) textNode.textContent = text;
    if (cursorNode) cursorNode.remove();
    if (bubble) bubble.classList.remove('live-typing-bubble');

    const timeEl = document.createElement('div');
    timeEl.className = 'message-time';
    timeEl.textContent = timeStr || formatCurrentTime();
    currentLiveIncomingRow.appendChild(timeEl);

    if (messageId) {
      currentLiveIncomingRow.dataset.msgId = messageId;
    }

    currentLiveIncomingRow = null;
    lastOpponentTextLength = 0;
    scrollToBottom();
    return;
  }

  // Otherwise, append standard incoming message bubble
  appendMessage(text, 'incoming', timeStr, messageId);
}

// ─────────────────────────────────────────────────
//  Send Message
// ─────────────────────────────────────────────────
function handleSend() {
  const text = chatInput.value.trim();
  if (!text) return;

  const clientTime = formatCurrentTime();
  appendMessage(text, 'outgoing', clientTime);
  chatInput.value = '';
  lastLocalTextLength = 0;
  chatInput.dispatchEvent(new Event('input'));
  emojiPopover.classList.remove('show');

  // Retain focus so virtual keyboard does not close
  chatInput.focus({ preventScroll: true });
  setTimeout(() => { chatInput.focus({ preventScroll: true }); }, 10);
  setTimeout(() => { chatInput.focus({ preventScroll: true }); }, 50);

  // Clear live typing preview on opponent's screen
  wsSend({ type: 'live_typing', text: '' });
  wsSend({ type: 'typing_stop' });
  clearTimeout(typingOutTimer);

  // Send the chat message
  const sent = wsSend({ type: 'chat', text, time: clientTime });
  if (!sent) showToast('Saved — will sync when connected', 'info');
}

// ─────────────────────────────────────────────────
//  Append Message Bubble
// ─────────────────────────────────────────────────
function appendMessage(content, type = 'outgoing', timeStr = null, messageId = null) {
  if (messageId && document.querySelector(`#chatMessages .message-row[data-msg-id="${messageId}"]`)) {
    return;
  }
  const messageRow = document.createElement('div');
  messageRow.className = `message-row ${type}`;
  if (messageId) {
    messageRow.dataset.msgId = messageId;
  }

  const bubbleGroup = document.createElement('div');
  bubbleGroup.className = 'bubble-group';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = content;

  const timeEl = document.createElement('div');
  timeEl.className = 'message-time';
  timeEl.textContent = timeStr || formatCurrentTime();

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
//  Avatar / Presence UI
// ─────────────────────────────────────────────────
function applyOpponentProfile(url, name) {
  if (userNameEl)  userNameEl.textContent = name;
  currentPartner.avatar = url;
  currentPartner.name   = name;

  if (avatarImg) {
    avatarImg.style.opacity = '0.3';
    const tmp = new Image();
    tmp.onload  = () => { avatarImg.src = url; avatarImg.style.opacity = '1'; };
    tmp.onerror = () => { avatarImg.style.opacity = '1'; };
    tmp.src = url;
  }
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

  // Input — send live typing events in real time & play keystroke audio
  function sendLiveTypingEvent() {
    const rawVal = chatInput.value;

    // Play subtle typing sound for local keystrokes (at 50% volume)
    if (rawVal.length !== lastLocalTextLength) {
      if (rawVal.length > 0) {
        playKeypressSound();
      }
      lastLocalTextLength = rawVal.length;
    }

    // Stream keystrokes live to opponent before message is sent
    if (rawVal.length > 0) {
      wsSend({ type: 'live_typing', text: rawVal });
      clearTimeout(typingOutTimer);
      typingOutTimer = setTimeout(() => {
        wsSend({ type: 'live_typing', text: '' });
        wsSend({ type: 'typing_stop' });
      }, 5000);
    } else {
      clearTimeout(typingOutTimer);
      wsSend({ type: 'live_typing', text: '' });
      wsSend({ type: 'typing_stop' });
    }
  }

  chatInput.addEventListener('input', sendLiveTypingEvent);
  chatInput.addEventListener('keyup', sendLiveTypingEvent);

  // Helper to send message while keeping focus on input (keeps mobile keyboard open)
  function executeSend() {
    if (chatInput.value.trim()) {
      handleSend();
      chatInput.focus({ preventScroll: true });
      setTimeout(() => { chatInput.focus({ preventScroll: true }); }, 10);
    }
  }

  // Enter to send (desktop and mobile virtual keyboards)
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      executeSend();
    }
  });

  // Prevent send button from stealing focus from chatInput (which closes mobile keyboards)
  let lastTouchSendTime = 0;

  actionBtn.addEventListener('pointerdown', (e) => {
    if (chatInput.value.trim()) {
      e.preventDefault();
    }
  });

  actionBtn.addEventListener('mousedown', (e) => {
    if (chatInput.value.trim()) {
      e.preventDefault();
    }
  });

  actionBtn.addEventListener('touchstart', (e) => {
    if (chatInput.value.trim()) {
      e.preventDefault();
      lastTouchSendTime = Date.now();
      executeSend();
    }
  }, { passive: false });

  // Send button click
  actionBtn.addEventListener('click', (e) => {
    if (Date.now() - lastTouchSendTime < 500) {
      return; // Already handled by touchstart
    }
    if (chatInput.value.trim()) {
      executeSend();
    }
  });

  // Lock app
  if (lockAppBtn) lockAppBtn.addEventListener('click', lockApp);

  // Clear chat (empties messages.json on PHP receiver and local DB)
  if (clearChatBtn) {
    clearChatBtn.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to clear all chat messages? This will empty messages.json on the server.')) {
        return;
      }
      try {
        const res = await fetch('/api/messages/clear', { method: 'POST' });
        if (res.ok) {
          clearChatDOM();
          showToast('Chat history cleared ✓', 'info');
        } else {
          showToast('Failed to clear chat', 'error');
        }
      } catch (err) {
        showToast('Error clearing chat', 'error');
      }
    });
  }

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
  a.volume = 0.25;
  return a;
});

['click','keydown','touchstart','mousedown'].forEach(ev =>
  window.addEventListener(ev, () => { getAudioContext(); preloadKeypressSounds(); }, { once: true, passive: true })
);

function playKeypressSound() {
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
      // 50% volume for subtle and comfortable mechanical key clicks
      gain.gain.value = 0.25 * (0.96 + Math.random() * 0.08);
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start(0);
    } catch (_) { /* ignore */ }
  } else {
    const clone = fallbackAudio[idx].cloneNode();
    clone.volume = 0.25;
    clone.play().catch(() => {});
  }
}

const playOpponentKeypressSound = playKeypressSound;

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
