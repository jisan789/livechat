// LiveChat Ultra - Main Client Application Logic
(() => {
    // --- State & Storage ---
    function generateId() {
        return 'u_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36).substring(4);
    }

    const urlParams = new URLSearchParams(window.location.search);
    let roomId = urlParams.get('room') || 'general';
    let clientId = localStorage.getItem('livechat_client_id');
    if (!clientId) {
        clientId = generateId();
        localStorage.setItem('livechat_client_id', clientId);
    }

    let username = localStorage.getItem('livechat_username') || `User_${clientId.slice(-4)}`;
    let avatar = localStorage.getItem('livechat_avatar') || '⚡';
    let ghostModeEnabled = localStorage.getItem('livechat_ghost_mode') === 'true';

    let socket = null;
    let reconnectTimeout = null;
    let pingInterval = null;
    let typingTimeout = null;
    let lastTypingSendTime = 0;
    const activeTypers = new Map(); // sender_id -> typingData

    // --- DOM Elements ---
    const messagesContainer = document.getElementById('messages-container');
    const chatInput = document.getElementById('chat-input');
    const btnSend = document.getElementById('btn-send');
    const typingDock = document.getElementById('typing-progress-dock');
    const typingUsername = document.getElementById('typing-username');
    const liveProgressBar = document.getElementById('live-progress-bar');
    const typingStats = document.getElementById('typing-stats');
    const ghostStreamBox = document.getElementById('ghost-stream-box');
    const ghostStreamText = document.getElementById('ghost-stream-text');
    const toggleGhostMode = document.getElementById('toggle-ghost-mode');
    const peerList = document.getElementById('peer-list');
    const peerCount = document.getElementById('peer-count');
    const currentRoomBadge = document.getElementById('current-room-badge');
    const chatRoomTitle = document.getElementById('chat-room-title');
    const myAvatar = document.getElementById('my-avatar');
    const myUsername = document.getElementById('my-username');
    const fileInput = document.getElementById('file-input');
    const btnAttach = document.getElementById('btn-attach');
    const btnQuickEmoji = document.getElementById('btn-quick-emoji');
    const btnShareRoom = document.getElementById('btn-share-room');
    const btnToggleSound = document.getElementById('btn-toggle-sound');
    const btnStartCall = document.getElementById('btn-start-call');
    const videoOverlayDock = document.getElementById('video-overlay-dock');
    const btnMinimizeCall = document.getElementById('btn-minimize-call');
    const btnToggleMic = document.getElementById('btn-toggle-mic');
    const btnToggleCamera = document.getElementById('btn-toggle-camera');
    const btnToggleScreen = document.getElementById('btn-toggle-screen');
    const btnHangup = document.getElementById('btn-hangup');
    const settingsModal = document.getElementById('settings-modal');
    const btnOpenSettings = document.getElementById('btn-open-settings');
    const btnSaveSettings = document.getElementById('btn-save-settings');
    const modalUsernameInput = document.getElementById('modal-username-input');
    const modalRoomInput = document.getElementById('modal-room-input');
    const avatarGrid = document.getElementById('avatar-grid');
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    const sidebar = document.getElementById('sidebar');

    // --- Init UI State ---
    function updateProfileUI() {
        myAvatar.textContent = avatar;
        myUsername.textContent = username;
        currentRoomBadge.textContent = `# ${roomId}`;
        chatRoomTitle.textContent = `# ${roomId}`;
        toggleGhostMode.checked = ghostModeEnabled;
        btnToggleSound.textContent = window.soundEngine.muted ? '🔇 Sound Off' : '🔔 Sound On';
    }
    updateProfileUI();

    // Responsive mobile sidebar toggle
    if (window.innerWidth <= 768) {
        btnToggleSidebar.style.display = 'block';
        btnToggleSidebar.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }

    // --- WebSocket Engine ---
    function connectWebSocket() {
        if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
            return;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/ws/${roomId}/${clientId}?username=${encodeURIComponent(username)}&avatar=${encodeURIComponent(avatar)}`;

        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
            console.log("⚡ LiveChat WebSocket Connected");
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
                reconnectTimeout = null;
            }

            // Keep connection alive across proxies and cloud load balancers (Render)
            if (pingInterval) clearInterval(pingInterval);
            pingInterval = setInterval(() => {
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({ type: 'ping' }));
                }
            }, 25000);
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleIncomingMessage(data);
            } catch (err) {
                console.error("Error parsing message:", err);
            }
        };

        socket.onclose = (event) => {
            console.warn("WebSocket closed. Attempting reconnect in 2s...", event);
            if (pingInterval) clearInterval(pingInterval);
            reconnectTimeout = setTimeout(connectWebSocket, 2000);
        };

        socket.onerror = (err) => {
            console.error("WebSocket error:", err);
            socket.close();
        };
    }

    // --- Message Router ---
    function handleIncomingMessage(msg) {
        switch (msg.type) {
            case 'chat':
                appendChatMessage(msg);
                if (msg.sender_id === clientId) {
                    window.soundEngine.playSent();
                } else {
                    window.soundEngine.playReceived();
                    // Clear sender's typing state upon sending message
                    activeTypers.delete(msg.sender_id);
                    renderTypingIndicators();
                }
                break;

            case 'typing_progress':
                handleTypingProgress(msg);
                break;

            case 'presence':
                handlePresenceUpdate(msg);
                break;

            case 'reaction':
                handleReaction(msg);
                break;

            case 'webrtc_signal':
                window.webRTCManager.handleSignal(msg.sender_id, msg.sender_name, msg.sub_type, msg.signal);
                break;

            case 'pong':
                // Server heartbeat received
                break;
        }
    }

    // --- Live Typing Progress Handler ---
    function handleTypingProgress(data) {
        if (data.sender_id === clientId) return;

        if (data.is_typing) {
            activeTypers.set(data.sender_id, {
                sender_name: data.sender_name,
                progress: data.progress,
                char_count: data.char_count,
                ghost_text: data.ghost_text,
                last_seen: Date.now()
            });
        } else {
            activeTypers.delete(data.sender_id);
        }

        renderTypingIndicators();
    }

    function renderTypingIndicators() {
        // Clean up expired typers (>3.5s idle)
        const now = Date.now();
        for (const [id, typer] of activeTypers.entries()) {
            if (now - typer.last_seen > 3500) {
                activeTypers.delete(id);
            }
        }

        if (activeTypers.size === 0) {
            typingDock.classList.add('hidden');
            ghostStreamBox.classList.add('hidden');
            liveProgressBar.style.width = '0%';
            return;
        }

        typingDock.classList.remove('hidden');

        // Grab latest active typer
        const typersArray = Array.from(activeTypers.values());
        const primaryTyper = typersArray[typersArray.length - 1];

        if (typersArray.length === 1) {
            typingUsername.textContent = primaryTyper.sender_name;
        } else {
            typingUsername.textContent = `${primaryTyper.sender_name} + ${typersArray.length - 1} other(s)`;
        }

        // Live progress percentage calculation
        const percent = Math.min(100, Math.max(10, primaryTyper.progress || (primaryTyper.char_count * 2)));
        liveProgressBar.style.width = `${percent}%`;
        typingStats.textContent = `${primaryTyper.char_count} chars (${percent}%)`;

        // Ghost Live Preview Stream
        if (primaryTyper.ghost_text !== null && primaryTyper.ghost_text !== undefined && primaryTyper.ghost_text.length > 0) {
            ghostStreamBox.classList.remove('hidden');
            ghostStreamText.textContent = primaryTyper.ghost_text;
        } else {
            ghostStreamBox.classList.add('hidden');
        }
    }

    // --- Typing Emitter with Throttling ---
    function emitTyping(isTyping) {
        if (!socket || socket.readyState !== WebSocket.OPEN) return;

        const text = chatInput.value;
        const charCount = text.length;
        // Progress heuristic: target average message of ~80 chars for 100%
        const progress = Math.min(100, Math.round((charCount / 80) * 100));

        const payload = {
            type: 'typing_progress',
            is_typing: isTyping && charCount > 0,
            char_count: charCount,
            progress: progress,
            ghost_text: (ghostModeEnabled && isTyping && charCount > 0) ? text : null
        };

        socket.send(JSON.stringify(payload));
    }

    chatInput.addEventListener('input', () => {
        // Auto-expand textarea
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';

        const now = Date.now();
        // Throttle rapid keystroke updates to ~75ms for super fast response
        if (now - lastTypingSendTime > 75) {
            emitTyping(true);
            lastTypingSendTime = now;
        }

        // Reset idle timeout
        if (typingTimeout) clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            emitTyping(false);
        }, 1500);
    });

    toggleGhostMode.addEventListener('change', (e) => {
        ghostModeEnabled = e.target.checked;
        localStorage.setItem('livechat_ghost_mode', ghostModeEnabled);
        if (chatInput.value.length > 0) {
            emitTyping(true);
        }
    });

    // --- Chat Renderers ---
    function formatTime(timestamp) {
        const d = new Date(timestamp * 1000);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function appendChatMessage(msg) {
        const isMine = msg.sender_id === clientId;
        const row = document.createElement('div');
        row.className = `message-bubble-row ${isMine ? 'mine' : ''}`;
        row.id = `msg-row-${msg.id}`;

        let fileHTML = '';
        if (msg.file) {
            if (msg.file.type && msg.file.type.startsWith('image/')) {
                fileHTML = `<img src="${msg.file.data}" alt="Media" class="attached-media" onclick="window.open(this.src, '_blank')">`;
            } else {
                fileHTML = `<a href="${msg.file.data}" download="${msg.file.name || 'download'}" style="color: var(--primary-cyan); font-weight:600; display:block; margin-top:6px;">📎 ${escapeHTML(msg.file.name || 'File Attachment')}</a>`;
            }
        }

        // Parse simple markdown (code backticks, bold, urls)
        let textContent = escapeHTML(msg.text);
        textContent = textContent.replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:4px; font-family:var(--font-mono);">$1</code>');
        textContent = textContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        textContent = textContent.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:var(--primary-cyan); text-decoration:underline;">$1</a>');

        row.innerHTML = `
            <div class="message-avatar">${msg.sender_avatar || '⚡'}</div>
            <div class="message-content-wrapper">
                <div class="message-meta">
                    <span class="sender-name">${escapeHTML(msg.sender_name)}</span>
                    <span>${formatTime(msg.timestamp)}</span>
                </div>
                <div class="message-bubble">
                    <div>${textContent}</div>
                    ${fileHTML}
                </div>
            </div>
        `;

        messagesContainer.appendChild(row);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // --- Sending Messages ---
    function sendMessage() {
        const text = chatInput.value.trim();
        if (!text && !pendingAttachment) return;

        const payload = {
            type: 'chat',
            id: 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
            text: text,
            file: pendingAttachment || null
        };

        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(payload));
        }

        chatInput.value = '';
        chatInput.style.height = 'auto';
        pendingAttachment = null;
        btnAttach.style.color = 'var(--text-muted)';

        emitTyping(false);
    }

    let pendingAttachment = null;

    btnSend.addEventListener('click', sendMessage);

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // --- File Attachment Handler ---
    btnAttach.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 8 * 1024 * 1024) {
            alert("File size exceeds 8MB limit for real-time delivery.");
            return;
        }

        const reader = new FileReader();
        reader.onload = (loadEvt) => {
            pendingAttachment = {
                name: file.name,
                type: file.type,
                size: file.size,
                data: loadEvt.target.result
            };
            btnAttach.style.color = 'var(--primary-cyan)';
            chatInput.placeholder = `Attached: ${file.name}. Type message and press Enter...`;
            chatInput.focus();
        };
        reader.readAsDataURL(file);
    });

    // Drag & drop support
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length > 0) {
            fileInput.files = e.dataTransfer.files;
            const event = new Event('change');
            fileInput.dispatchEvent(event);
        }
    });

    // Quick emoji picker
    const quickEmojis = ['🔥', '⚡', '🚀', '❤️', '😂', '👍', '🎉', '💯', '✨'];
    btnQuickEmoji.addEventListener('click', () => {
        const randomEmoji = quickEmojis[Math.floor(Math.random() * quickEmojis.length)];
        chatInput.value += randomEmoji;
        chatInput.focus();
        chatInput.dispatchEvent(new Event('input'));
    });

    // --- Presence Handler ---
    function handlePresenceUpdate(data) {
        if (data.event === 'join' && data.user && data.user.client_id !== clientId) {
            window.soundEngine.playJoin();
            appendSystemNotice(`${data.user.username} entered the room`);
        } else if (data.event === 'leave' && data.user && data.user.client_id !== clientId) {
            appendSystemNotice(`${data.user.username} left`);
        }

        if (data.members) {
            peerCount.textContent = data.members.length;
            renderPeerList(data.members);
        }
    }

    function appendSystemNotice(text) {
        const div = document.createElement('div');
        div.className = 'system-message';
        div.innerHTML = `<span>• ${escapeHTML(text)}</span>`;
        messagesContainer.appendChild(div);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function renderPeerList(members) {
        peerList.innerHTML = '';
        members.forEach(member => {
            const isMe = member.client_id === clientId;
            const item = document.createElement('div');
            item.className = `peer-item ${isMe ? 'current-user' : ''}`;
            item.innerHTML = `
                <div class="peer-avatar">
                    ${member.avatar || '⚡'}
                    <span class="status-dot"></span>
                </div>
                <div class="peer-info">
                    <div class="peer-name">${escapeHTML(member.username)} ${isMe ? '(You)' : ''}</div>
                    <div class="peer-status">${isMe ? 'Active now' : 'Online'}</div>
                </div>
                ${!isMe ? `<button class="call-peer-btn" data-peer-id="${member.client_id}" data-peer-name="${escapeHTML(member.username)}" title="Direct Video Call">📹 Call</button>` : ''}
            `;
            peerList.appendChild(item);
        });

        // Attach direct peer call handlers
        peerList.querySelectorAll('.call-peer-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetId = e.target.getAttribute('data-peer-id');
                const targetName = e.target.getAttribute('data-peer-name');
                startWebRTCCall(targetId, targetName);
            });
        });
    }

    // --- WebRTC Signaling Integration ---
    window.webRTCManager.setSignalCallback((targetId, subType, signal) => {
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        socket.send(JSON.stringify({
            type: 'webrtc_signal',
            sub_type: subType,
            target_id: targetId,
            signal: signal
        }));
    });

    window.webRTCManager.setCallStateCallback((inCall) => {
        if (inCall) {
            videoOverlayDock.classList.remove('hidden');
            btnStartCall.textContent = '📞 End Call';
            btnStartCall.style.borderColor = '#ef4444';
            btnStartCall.style.color = '#ef4444';
        } else {
            videoOverlayDock.classList.add('hidden');
            btnStartCall.textContent = '📹 Video Call';
            btnStartCall.style.borderColor = 'var(--primary-cyan)';
            btnStartCall.style.color = 'var(--primary-cyan)';
        }
    });

    async function startWebRTCCall(targetId = null, targetName = "Room") {
        if (window.webRTCManager.inCall) {
            window.webRTCManager.endCall(true);
            return;
        }

        // If targetId is provided, direct call. Otherwise call first active peer or wait for answers
        if (targetId) {
            await window.webRTCManager.startCallWithPeer(targetId, targetName, true);
        } else {
            // Find first other active peer in the room
            const otherPeerBtn = peerList.querySelector('.call-peer-btn');
            if (otherPeerBtn) {
                const pid = otherPeerBtn.getAttribute('data-peer-id');
                const pname = otherPeerBtn.getAttribute('data-peer-name');
                await window.webRTCManager.startCallWithPeer(pid, pname, true);
            } else {
                // Initialize local video and notify in chat
                await window.webRTCManager.initLocalMedia(true, true);
                window.webRTCManager.inCall = true;
                if (window.webRTCManager.onCallStateChange) window.webRTCManager.onCallStateChange(true);
                appendSystemNotice("Started video room. Waiting for peers to join...");
            }
        }
    }

    btnStartCall.addEventListener('click', () => startWebRTCCall());

    btnHangup.addEventListener('click', () => {
        window.webRTCManager.endCall(true);
    });

    btnMinimizeCall.addEventListener('click', () => {
        videoOverlayDock.classList.add('hidden');
    });

    btnToggleMic.addEventListener('click', () => {
        const isMuted = window.webRTCManager.toggleAudio();
        btnToggleMic.classList.toggle('active-off', isMuted);
        btnToggleMic.textContent = isMuted ? '🔇' : '🎙️';
    });

    btnToggleCamera.addEventListener('click', () => {
        const isOff = window.webRTCManager.toggleVideo();
        btnToggleCamera.classList.toggle('active-off', isOff);
        btnToggleCamera.textContent = isOff ? '🚫' : '📷';
    });

    btnToggleScreen.addEventListener('click', async () => {
        const isSharing = await window.webRTCManager.toggleScreenShare();
        btnToggleScreen.classList.toggle('active-off', !isSharing);
    });

    // --- UI Controls & Utilities ---
    btnToggleSound.addEventListener('click', () => {
        const isMuted = window.soundEngine.toggleMute();
        btnToggleSound.textContent = isMuted ? '🔇 Sound Off' : '🔔 Sound On';
    });

    btnShareRoom.addEventListener('click', () => {
        const roomUrl = `${window.location.origin}/?room=${encodeURIComponent(roomId)}`;
        navigator.clipboard.writeText(roomUrl).then(() => {
            const original = btnShareRoom.textContent;
            btnShareRoom.textContent = '✅ Copied!';
            setTimeout(() => { btnShareRoom.textContent = original; }, 2000);
        }).catch(() => {
            prompt("Share this room link with friends:", roomUrl);
        });
    });

    currentRoomBadge.addEventListener('click', () => btnShareRoom.click());

    // Window room switcher
    window.switchRoom = (newRoom) => {
        if (newRoom === roomId) return;
        window.location.href = `/?room=${encodeURIComponent(newRoom)}`;
    };

    // --- Settings Modal ---
    btnOpenSettings.addEventListener('click', () => {
        modalUsernameInput.value = username;
        modalRoomInput.value = roomId;

        avatarGrid.querySelectorAll('.avatar-opt').forEach(opt => {
            opt.classList.toggle('selected', opt.getAttribute('data-avatar') === avatar);
        });

        settingsModal.classList.remove('hidden');
    });

    avatarGrid.querySelectorAll('.avatar-opt').forEach(opt => {
        opt.addEventListener('click', () => {
            avatarGrid.querySelectorAll('.avatar-opt').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            avatar = opt.getAttribute('data-avatar');
        });
    });

    btnSaveSettings.addEventListener('click', () => {
        const newName = modalUsernameInput.value.trim();
        const newRoom = modalRoomInput.value.trim();

        if (newName) {
            username = newName;
            localStorage.setItem('livechat_username', username);
        }
        localStorage.setItem('livechat_avatar', avatar);

        settingsModal.classList.add('hidden');
        updateProfileUI();

        if (newRoom && newRoom !== roomId) {
            window.location.href = `/?room=${encodeURIComponent(newRoom)}`;
        } else {
            // Reconnect websocket with new profile
            if (socket) socket.close();
            connectWebSocket();
        }
    });

    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.add('hidden');
        }
    });

    // Start App!
    connectWebSocket();
})();
