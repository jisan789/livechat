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
const inputRecordingContent = document.getElementById('inputRecordingContent');
const recordingTimer        = document.getElementById('recordingTimer');
const cancelRecordBtn       = document.getElementById('cancelRecordBtn');

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
  if (isRecording) {
    cancelVoiceRecording();
  }
  if (currentlyPlayingVoiceAudio) {
    try { currentlyPlayingVoiceAudio.pause(); } catch (_) {}
    currentlyPlayingVoiceAudio = null;
  }
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
      } else if (msg.msg_type === 'voice' && msg.text_content) {
        appendVoiceMessage(msg.text_content, msg.media_duration || 1, type, timeStr, msgIdStr);
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

    // ── Voice note (Live WebSocket) ───────────────
    case 'voice':
      receiveIncomingVoice(msg.audio, msg.duration, msg.time, msg.id, msg.waveform);
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

    // ── Flying Balloon Emoji Reaction ─────────────
    case 'flying_emoji':
      createFlyingBalloon(msg.emoji);
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
//  Typing Indicators & Live Keystroke Sea-Wave Stream
// ─────────────────────────────────────────────────
let currentLiveIncomingRow = null;
let targetOpponentText = '';
let displayedOpponentChars = [];
let waveStreamingTimeout = null;

function resetWaveStream() {
  if (waveStreamingTimeout) {
    clearTimeout(waveStreamingTimeout);
    waveStreamingTimeout = null;
  }
  targetOpponentText = '';
  displayedOpponentChars = [];
}

function processNextWaveChar(textNode) {
  if (!textNode || !currentLiveIncomingRow) {
    waveStreamingTimeout = null;
    return;
  }

  const targetChars = Array.from(targetOpponentText);
  const currentLen = displayedOpponentChars.length;

  // Fully caught up with incoming wave
  if (currentLen >= targetChars.length) {
    waveStreamingTimeout = null;
    return;
  }

  // Handle backspace or text replacement
  const expectedPrefix = displayedOpponentChars.join('');
  if (!targetOpponentText.startsWith(expectedPrefix)) {
    displayedOpponentChars = targetChars.slice(0, currentLen);
    textNode.textContent = displayedOpponentChars.join('');
  }

  // Get next character in the sea wave flow
  const nextChar = targetChars[displayedOpponentChars.length];
  if (nextChar !== undefined) {
    displayedOpponentChars.push(nextChar);

    const charSpan = document.createElement('span');
    charSpan.className = 'wave-char';
    charSpan.textContent = nextChar;
    textNode.appendChild(charSpan);

    playOpponentLiveSound();
    scrollToBottom();
  }

  // Flow cadence: natural sea wave speed (~38ms), adaptive for faster chunks
  const remaining = targetChars.length - displayedOpponentChars.length;
  if (remaining > 0) {
    const delay = remaining > 12 ? 15 : (remaining > 5 ? 24 : 38);
    waveStreamingTimeout = setTimeout(() => {
      processNextWaveChar(textNode);
    }, delay);
  } else {
    waveStreamingTimeout = null;
  }
}

function handleOpponentLiveTyping(text) {
  clearTimeout(opponentTypingTimer);

  if (!text || text.length === 0) {
    resetWaveStream();
    if (currentLiveIncomingRow) {
      currentLiveIncomingRow.remove();
      currentLiveIncomingRow = null;
    }
    hideOpponentTyping();
    return;
  }

  targetOpponentText = text;

  // Update status to typing...
  opponentTyping = true;
  if (userStatusEl) {
    userStatusEl.textContent = 'typing...';
    userStatusEl.classList.add('is-typing');
  }
  if (typingIndicator) {
    typingIndicator.classList.remove('active');
  }

  // Create tranquil incoming bubble if it does not exist yet
  if (!currentLiveIncomingRow) {
    currentLiveIncomingRow = document.createElement('div');
    currentLiveIncomingRow.className = 'message-row incoming live-typing-row';

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
    const targetChars = Array.from(text);

    // If opponent deleted/backspaced text
    if (targetChars.length < displayedOpponentChars.length) {
      if (waveStreamingTimeout) {
        clearTimeout(waveStreamingTimeout);
        waveStreamingTimeout = null;
      }
      displayedOpponentChars = targetChars;
      textNode.textContent = text;
      scrollToBottom();
    } else if (!waveStreamingTimeout) {
      // Begin rolling wave of characters
      processNextWaveChar(textNode);
    }
  }

  // Auto-cleanup after 10s of silence if abandoned
  opponentTypingTimer = setTimeout(() => {
    resetWaveStream();
    if (currentLiveIncomingRow) {
      currentLiveIncomingRow.remove();
      currentLiveIncomingRow = null;
    }
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
  resetWaveStream();
  document.querySelectorAll('#chatMessages .message-row').forEach(row => row.remove());
  if (currentLiveIncomingRow) {
    currentLiveIncomingRow.remove();
    currentLiveIncomingRow = null;
  }
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
    resetWaveStream();
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
//  Voice Messaging (Live WebSocket & Real Audio)
// ─────────────────────────────────────────────────
const MIC_ICON_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>`;

const SEND_ICON_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;

// Speech-pattern natural waveform (32 bars)
const DEFAULT_SPEECH_WAVEFORM = [
  6, 10, 16, 22, 14, 8, 12, 20, 26, 18, 12, 16, 24, 28, 20, 14, 18, 22, 26, 16, 10, 14, 22, 18, 12, 16, 20, 14, 8, 12, 16, 10
];

let currentlyPlayingVoiceAudio = null;
let currentlyPlayingVoiceReset = null;

function appendVoiceMessage(audioData, seconds, type = 'outgoing', timeStr = null, messageId = null, customWaveform = null) {
  if (messageId && document.querySelector(`#chatMessages .message-row[data-msg-id="${messageId}"]`)) {
    return;
  }

  const durationSec = Math.max(1, Math.round(Number(seconds) || 1));
  const durationText = formatDuration(durationSec);
  const messageRow = document.createElement('div');
  messageRow.className = `message-row ${type}`;
  if (messageId) {
    messageRow.dataset.msgId = messageId;
  }

  const bubbleGroup = document.createElement('div');
  bubbleGroup.className = 'bubble-group';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  // Build 32 waveform bars (from custom mic samples or realistic speech contour)
  let barHeights = DEFAULT_SPEECH_WAVEFORM;
  if (Array.isArray(customWaveform) && customWaveform.length >= 8) {
    barHeights = customWaveform;
  }
  const barsHtml = barHeights.map(h => `<span class="waveform-bar" style="height:${Math.max(4, Math.min(26, h))}px;"></span>`).join('');

  bubble.innerHTML = `
    <div class="voice-bubble">
      <button class="voice-play-btn" type="button" aria-label="Play Voice Note" title="Play">
        <svg class="play-icon" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="6 4 19 12 6 20 6 4"></polygon>
        </svg>
        <svg class="pause-icon" style="display:none;" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16"></rect>
          <rect x="14" y="4" width="4" height="16"></rect>
        </svg>
      </button>
      <div class="voice-waveform" title="Click to seek">${barsHtml}</div>
      <span class="voice-duration">${durationText}</span>
    </div>`;

  const timeEl = document.createElement('div');
  timeEl.className = 'message-time';
  timeEl.textContent = timeStr || formatCurrentTime();

  bubbleGroup.appendChild(bubble);
  messageRow.appendChild(bubbleGroup);
  messageRow.appendChild(timeEl);

  chatMessages.insertBefore(messageRow, typingIndicator);
  scrollToBottom();

  const voiceBubble        = bubble.querySelector('.voice-bubble');
  const playBtn            = bubble.querySelector('.voice-play-btn');
  const playIcon           = bubble.querySelector('.play-icon');
  const pauseIcon          = bubble.querySelector('.pause-icon');
  const durationEl         = bubble.querySelector('.voice-duration');
  const waveformContainer  = bubble.querySelector('.voice-waveform');
  const waveformBars       = bubble.querySelectorAll('.waveform-bar');

  let audio = null;
  if (audioData) {
    try {
      audio = new Audio(audioData);
    } catch (e) {
      console.warn('[Voice] Audio init failed:', e);
    }
  }

  function resetAudioUI() {
    voiceBubble.classList.remove('playing');
    playIcon.style.display = 'block';
    pauseIcon.style.display = 'none';
    durationEl.textContent = durationText;
    waveformBars.forEach(b => b.classList.remove('played'));
    if (currentlyPlayingVoiceAudio === audio) {
      currentlyPlayingVoiceAudio = null;
      currentlyPlayingVoiceReset = null;
    }
  }

  if (audio) {
    audio.addEventListener('timeupdate', () => {
      const dur = audio.duration && !isNaN(audio.duration) ? audio.duration : durationSec;
      const progress = Math.min(1, Math.max(0, audio.currentTime / dur));
      const activeBarCount = Math.floor(progress * waveformBars.length);
      waveformBars.forEach((bar, idx) => {
        bar.classList.toggle('played', idx <= activeBarCount);
      });
      durationEl.textContent = formatDuration(Math.floor(audio.currentTime));
    });

    audio.addEventListener('ended', resetAudioUI);

    audio.addEventListener('pause', () => {
      if (!audio.ended) {
        voiceBubble.classList.remove('playing');
        playIcon.style.display = 'block';
        pauseIcon.style.display = 'none';
      }
    });

    audio.addEventListener('error', () => {
      resetAudioUI();
      showToast('Could not play voice note', 'error');
    });
  }

  // Interactive Click-to-Seek on waveform
  waveformContainer.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!audio) return;
    const rect = waveformContainer.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const progress = Math.max(0, Math.min(1, clickX / rect.width));
    const dur = audio.duration && !isNaN(audio.duration) ? audio.duration : durationSec;
    audio.currentTime = progress * dur;
    durationEl.textContent = formatDuration(Math.floor(audio.currentTime));

    const activeBarCount = Math.floor(progress * waveformBars.length);
    waveformBars.forEach((bar, idx) => {
      bar.classList.toggle('played', idx <= activeBarCount);
    });

    if (audio.paused) {
      playBtn.click();
    }
  });

  playBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!audio) {
      showToast('No audio stream available', 'error');
      return;
    }

    if (audio.paused) {
      if (currentlyPlayingVoiceAudio && currentlyPlayingVoiceAudio !== audio) {
        try { currentlyPlayingVoiceAudio.pause(); } catch (_) {}
        if (currentlyPlayingVoiceReset) currentlyPlayingVoiceReset();
      }

      currentlyPlayingVoiceAudio = audio;
      currentlyPlayingVoiceReset = resetAudioUI;

      audio.play().then(() => {
        voiceBubble.classList.add('playing');
        playIcon.style.display = 'none';
        pauseIcon.style.display = 'block';
      }).catch(err => {
        console.warn('[Voice] Play error:', err);
        resetAudioUI();
        showToast('Playback permission or format error', 'error');
      });
    } else {
      audio.pause();
      voiceBubble.classList.remove('playing');
      playIcon.style.display = 'block';
      pauseIcon.style.display = 'none';
    }
  });
}

function receiveIncomingVoice(audioData, duration, timeStr, messageId = null, waveform = null) {
  hideOpponentTyping();

  if (messageId && document.querySelector(`#chatMessages .message-row[data-msg-id="${messageId}"]`)) {
    return;
  }

  playOpponentKeypressSound();
  appendVoiceMessage(audioData, duration, 'incoming', timeStr, messageId, waveform);
}

// ─────────────────────────────────────────────────
//  Voice Recording (MediaRecorder & Live WebSocket)
// ─────────────────────────────────────────────────
let mediaRecorder = null;
let audioChunks = [];
let recordStream = null;
let recordingInterval = null;
let recordingSeconds = 0;
let isRecording = false;
let isRecordCancelled = false;

// Real-time audio analyser for microphone volume reactivity
let micAnalyser = null;
let micSource = null;
let micAnimFrame = null;
let recordedWaveformSamples = [];

function startLiveMicVisualizer(stream) {
  recordedWaveformSamples = [];
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    micSource = ctx.createMediaStreamSource(stream);
    micAnalyser = ctx.createAnalyser();
    micAnalyser.fftSize = 64;
    micAnalyser.smoothingTimeConstant = 0.65;
    micSource.connect(micAnalyser);

    const dataArray = new Uint8Array(micAnalyser.frequencyBinCount);
    const liveSpans = document.querySelectorAll('.recording-live-waveform span');

    function drawWave() {
      if (!isRecording) return;
      micAnalyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;

      // Sample volume periodically for natural chat bubble waveform contour
      if (Math.random() < 0.25) {
        const normH = Math.round(5 + (avg / 128) * 20);
        recordedWaveformSamples.push(normH);
      }

      if (liveSpans.length > 0) {
        liveSpans.forEach((span, i) => {
          const bin = Math.min(dataArray.length - 1, i * 2);
          const val = dataArray[bin] || avg;
          const h = Math.max(4, Math.min(22, (val / 255) * 22));
          span.style.height = `${h}px`;
        });
      }

      micAnimFrame = requestAnimationFrame(drawWave);
    }

    micAnimFrame = requestAnimationFrame(drawWave);
  } catch (err) {
    console.warn('[Visualizer] Mic visualizer init error:', err);
  }
}

function stopLiveMicVisualizer() {
  if (micAnimFrame) {
    cancelAnimationFrame(micAnimFrame);
    micAnimFrame = null;
  }
  if (micSource) {
    try { micSource.disconnect(); } catch (_) {}
    micSource = null;
  }
  if (micAnalyser) {
    try { micAnalyser.disconnect(); } catch (_) {}
    micAnalyser = null;
  }
  const liveSpans = document.querySelectorAll('.recording-live-waveform span');
  liveSpans.forEach(span => { span.style.height = ''; });
}

function getRecordedWaveformContour() {
  const targetCount = 32;
  if (recordedWaveformSamples.length >= 8) {
    const res = [];
    const step = recordedWaveformSamples.length / targetCount;
    for (let i = 0; i < targetCount; i++) {
      const idx = Math.min(recordedWaveformSamples.length - 1, Math.floor(i * step));
      res.push(Math.max(5, Math.min(26, recordedWaveformSamples[idx])));
    }
    return res;
  }
  return DEFAULT_SPEECH_WAVEFORM;
}

function getSupportedAudioMimeType() {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
    'audio/aac'
  ];
  for (const t of types) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) {
      return t;
    }
  }
  return '';
}

async function startVoiceRecording() {
  if (isRecording) return;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('Microphone access is not supported by your browser', 'error');
    return;
  }

  try {
    recordStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    console.error('[Voice] Mic access denied:', err);
    showToast('Microphone permission denied or unavailable', 'error');
    return;
  }

  const mimeType = getSupportedAudioMimeType();
  const options = mimeType ? { mimeType } : {};

  try {
    mediaRecorder = new MediaRecorder(recordStream, options);
  } catch (err) {
    try {
      mediaRecorder = new MediaRecorder(recordStream);
    } catch (e) {
      console.error('[Voice] MediaRecorder init error:', e);
      showToast('Could not initialize audio recorder', 'error');
      if (recordStream) recordStream.getTracks().forEach(t => t.stop());
      recordStream = null;
      return;
    }
  }

  audioChunks = [];
  isRecording = true;
  isRecordCancelled = false;
  recordingSeconds = 0;

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      audioChunks.push(e.data);
    }
  };

  mediaRecorder.onstop = () => {
    stopLiveMicVisualizer();

    if (recordStream) {
      recordStream.getTracks().forEach(t => t.stop());
      recordStream = null;
    }

    if (isRecordCancelled) {
      audioChunks = [];
      return;
    }

    if (audioChunks.length === 0) {
      return;
    }

    const recordedMimeType = (mediaRecorder && mediaRecorder.mimeType) || mimeType || 'audio/webm';
    const audioBlob = new Blob(audioChunks, { type: recordedMimeType });
    audioChunks = [];

    const finalDuration = Math.max(1, recordingSeconds);
    const waveformContour = getRecordedWaveformContour();

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Audio = reader.result;
      const clientTime = formatCurrentTime();

      appendVoiceMessage(base64Audio, finalDuration, 'outgoing', clientTime, null, waveformContour);

      // Sent via live WebSocket & persisted to PHP/DB storage in background
      wsSend({
        type: 'voice',
        audio: base64Audio,
        duration: finalDuration,
        waveform: waveformContour,
        time: clientTime
      });
    };
    reader.readAsDataURL(audioBlob);
  };

  mediaRecorder.start(200);

  // Start real-time audio visualizer on recording bars
  startLiveMicVisualizer(recordStream);

  if (recordingTimer) recordingTimer.textContent = '0:00';
  if (inputNormalContent) {
    inputNormalContent.style.opacity = '0';
    inputNormalContent.style.pointerEvents = 'none';
  }
  if (inputRecordingContent) inputRecordingContent.style.display = 'flex';
  chatInput.focus({ preventScroll: true });

  updateActionBtnState();

  clearInterval(recordingInterval);
  recordingInterval = setInterval(() => {
    recordingSeconds++;
    if (recordingTimer) {
      recordingTimer.textContent = formatDuration(recordingSeconds);
    }
  }, 1000);
}

function stopAndSendVoiceRecording() {
  if (!isRecording) return;
  clearInterval(recordingInterval);
  isRecording = false;
  isRecordCancelled = false;

  stopLiveMicVisualizer();
  resetRecordingUI();

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
}

function cancelVoiceRecording() {
  if (!isRecording) return;
  clearInterval(recordingInterval);
  isRecording = false;
  isRecordCancelled = true;

  stopLiveMicVisualizer();
  resetRecordingUI();

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  } else if (recordStream) {
    recordStream.getTracks().forEach(t => t.stop());
    recordStream = null;
  }
  showToast('Recording cancelled', 'info');
}

function resetRecordingUI() {
  if (inputRecordingContent) inputRecordingContent.style.display = 'none';
  if (inputNormalContent) {
    inputNormalContent.style.opacity = '1';
    inputNormalContent.style.pointerEvents = 'auto';
  }
  updateActionBtnState();
  chatInput.focus({ preventScroll: true });
  setTimeout(() => { chatInput.focus({ preventScroll: true }); }, 10);
  setTimeout(() => { chatInput.focus({ preventScroll: true }); }, 50);
}

function updateActionBtnState() {
  if (!actionBtn || !actionIcon) return;

  if (isRecording) {
    actionBtn.classList.add('recording-active');
    actionBtn.classList.remove('mic-mode', 'send-mode');
    actionBtn.title = 'Send Voice Note';
    actionBtn.setAttribute('aria-label', 'Send Voice Note');
    actionIcon.innerHTML = SEND_ICON_SVG;
    return;
  }

  actionBtn.classList.remove('recording-active');
  const hasText = chatInput && chatInput.value.trim().length > 0;

  if (hasText) {
    actionBtn.classList.add('send-mode');
    actionBtn.classList.remove('mic-mode');
    actionBtn.title = 'Send';
    actionBtn.setAttribute('aria-label', 'Send message');
    actionIcon.innerHTML = SEND_ICON_SVG;
  } else {
    actionBtn.classList.add('mic-mode');
    actionBtn.classList.remove('send-mode');
    actionBtn.title = 'Record Voice';
    actionBtn.setAttribute('aria-label', 'Record voice message');
    actionIcon.innerHTML = MIC_ICON_SVG;
  }
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
    updateActionBtnState();

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

  // Action button handling (Mic by default, Send when text entered, Stop/Send when recording)
  let lastTouchActionTime = 0;

  actionBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
  });

  actionBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
  });

  function handleActionBtnTrigger() {
    if (isRecording) {
      stopAndSendVoiceRecording();
    } else if (chatInput.value.trim()) {
      executeSend();
    } else {
      startVoiceRecording();
    }
    chatInput.focus({ preventScroll: true });
    setTimeout(() => { chatInput.focus({ preventScroll: true }); }, 10);
    setTimeout(() => { chatInput.focus({ preventScroll: true }); }, 50);
  }

  actionBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    lastTouchActionTime = Date.now();
    handleActionBtnTrigger();
  }, { passive: false });

  actionBtn.addEventListener('click', (e) => {
    if (Date.now() - lastTouchActionTime < 500) {
      return; // Already handled by touchstart
    }
    handleActionBtnTrigger();
  });

  // Cancel voice recording
  if (cancelRecordBtn) {
    cancelRecordBtn.addEventListener('pointerdown', (e) => e.preventDefault());
    cancelRecordBtn.addEventListener('mousedown', (e) => e.preventDefault());
    cancelRecordBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      cancelVoiceRecording();
      chatInput.focus({ preventScroll: true });
    }, { passive: false });

    cancelRecordBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      cancelVoiceRecording();
      chatInput.focus({ preventScroll: true });
    });
  }

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

  if (emojiBtn) {
    emojiBtn.addEventListener('pointerdown', (e) => e.preventDefault());
    emojiBtn.addEventListener('mousedown', (e) => e.preventDefault());
    emojiBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      emojiPopover.classList.toggle('show');
      chatInput.focus({ preventScroll: true });
    }, { passive: false });

    emojiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      emojiPopover.classList.toggle('show');
      chatInput.focus({ preventScroll: true });
    });
  }

  if (emojiPopover) {
    emojiPopover.addEventListener('pointerdown', (e) => e.preventDefault());
    emojiPopover.addEventListener('mousedown', (e) => e.preventDefault());
    emojiPopover.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

    document.querySelectorAll('.emoji-btn').forEach(btn => {
      btn.addEventListener('pointerdown', (e) => e.preventDefault());
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        sendFlyingEmojiBalloon(btn.textContent.trim());
      }, { passive: false });

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        sendFlyingEmojiBalloon(btn.textContent.trim());
      });
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#emojiPopover') && !e.target.closest('#emojiBtn')) {
        emojiPopover.classList.remove('show');
      }
    });
  }

  // Set initial action button mode (Mic by default)
  updateActionBtnState();
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

function playOpponentLiveSound() {
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
      // Ultra-gentle, peaceful whisper gain (0.11) for tranquil opponent typing ambiance
      gain.gain.value = 0.11 * (0.95 + Math.random() * 0.1);
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start(0);
    } catch (_) { /* ignore */ }
  } else if (fallbackAudio && fallbackAudio[idx]) {
    const clone = fallbackAudio[idx].cloneNode();
    clone.volume = 0.11;
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

// ─────────────────────────────────────────────────
//  Floating Balloon Emoji Reactions
// ─────────────────────────────────────────────────
let lastEmojiTapTime = 0;

function getBalloonsContainer() {
  let container = document.getElementById('floatingBalloonsContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'floatingBalloonsContainer';
    container.className = 'floating-balloons-container';
    (chatApp || document.body).appendChild(container);
  }
  return container;
}

function createFlyingBalloon(emojiChar) {
  if (!emojiChar) return;
  const container = getBalloonsContainer();

  // Release a buoyant cluster: 1 lead balloon + 2 companion balloons
  const count = 3;
  const baseLeft = 15 + Math.random() * 70; // 15% to 85% width

  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const balloon = document.createElement('div');
      balloon.className = 'flying-balloon';

      const isLead = (i === 0);
      const size = isLead ? (36 + Math.floor(Math.random() * 8)) : (24 + Math.floor(Math.random() * 8));
      const leftOffset = isLead ? 0 : (Math.random() * 34 - 17);
      const leftPos = Math.max(8, Math.min(92, baseLeft + leftOffset));

      const duration = (2.6 + Math.random() * 0.8).toFixed(2);
      const sway1 = (12 + Math.random() * 16) * (Math.random() > 0.5 ? 1 : -1);
      const sway2 = -sway1 * (0.8 + Math.random() * 0.3);
      const sway3 = (10 + Math.random() * 14) * (Math.random() > 0.5 ? 1 : -1);
      const sway4 = -sway3 * (0.7 + Math.random() * 0.4);
      const rot1 = (4 + Math.random() * 8) * (sway1 > 0 ? 1 : -1);
      const rot2 = -rot1 * 0.8;
      const rot3 = (3 + Math.random() * 6) * (sway3 > 0 ? 1 : -1);
      const rot4 = -rot3;

      balloon.style.left = `${leftPos}%`;
      balloon.style.setProperty('--fly-duration', `${duration}s`);
      balloon.style.setProperty('--balloon-size', `${size}px`);
      balloon.style.setProperty('--sway-1', `${sway1}px`);
      balloon.style.setProperty('--sway-2', `${sway2}px`);
      balloon.style.setProperty('--sway-3', `${sway3}px`);
      balloon.style.setProperty('--sway-4', `${sway4}px`);
      balloon.style.setProperty('--rot-1', `${rot1}deg`);
      balloon.style.setProperty('--rot-2', `${rot2}deg`);
      balloon.style.setProperty('--rot-3', `${rot3}deg`);
      balloon.style.setProperty('--rot-4', `${rot4}deg`);

      balloon.innerHTML = `
        <span class="balloon-emoji" aria-hidden="true">${emojiChar}</span>
        <div class="balloon-string" aria-hidden="true"></div>
      `;

      balloon.addEventListener('animationend', () => {
        balloon.remove();
      });

      setTimeout(() => {
        if (balloon.parentNode) balloon.remove();
      }, (parseFloat(duration) + 0.6) * 1000);

      container.appendChild(balloon);
    }, i * 85);
  }
}

function sendFlyingEmojiBalloon(emojiChar) {
  if (!emojiChar) return;
  const now = Date.now();
  if (now - lastEmojiTapTime < 50) return;
  lastEmojiTapTime = now;

  // 1. Instantly trigger floating balloons on own chat inbox
  createFlyingBalloon(emojiChar);

  // 2. Broadcast to opponent via live WebSocket (zero server delay)
  wsSend({
    type: 'flying_emoji',
    emoji: emojiChar
  });

  // 4. Do NOT input emoji into chatInput, and preserve virtual keyboard focus
  chatInput.focus({ preventScroll: true });
  setTimeout(() => { chatInput.focus({ preventScroll: true }); }, 10);
  setTimeout(() => { chatInput.focus({ preventScroll: true }); }, 50);
}

