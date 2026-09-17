// WebRTC Manager for Video/Voice Calls and Screen Sharing
class WebRTCManager {
    constructor() {
        this.localStream = null;
        this.screenStream = null;
        this.peerConnections = {}; // targetClientId -> RTCPeerConnection
        this.isAudioMuted = false;
        this.isVideoOff = false;
        this.isScreenSharing = false;
        this.inCall = false;
        this.onSignalCallback = null;
        this.onCallStateChange = null;

        this.rtcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        };
    }

    setSignalCallback(callback) {
        this.onSignalCallback = callback;
    }

    setCallStateCallback(callback) {
        this.onCallStateChange = callback;
    }

    async initLocalMedia(video = true, audio = true) {
        try {
            if (this.localStream) {
                this.stopLocalMedia();
            }
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: video ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } : false,
                audio: { echoCancellation: true, noiseSuppression: true }
            });
            const localVideo = document.getElementById('local-video');
            if (localVideo) {
                localVideo.srcObject = this.localStream;
            }
            return this.localStream;
        } catch (err) {
            console.warn("Could not acquire requested camera/mic:", err);
            // Fallback to audio only if video camera is unavailable or denied
            if (video) {
                try {
                    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    const localVideo = document.getElementById('local-video');
                    if (localVideo) localVideo.srcObject = null;
                    this.isVideoOff = true;
                    return this.localStream;
                } catch (audioErr) {
                    console.error("Microphone access also denied or unavailable:", audioErr);
                    throw audioErr;
                }
            }
            throw err;
        }
    }

    stopLocalMedia() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
        }
        const localVideo = document.getElementById('local-video');
        if (localVideo) localVideo.srcObject = null;
    }

    createPeerConnection(targetClientId, targetName = "Peer") {
        if (this.peerConnections[targetClientId]) {
            return this.peerConnections[targetClientId];
        }

        const pc = new RTCPeerConnection(this.rtcConfig);
        this.peerConnections[targetClientId] = pc;

        // Add local tracks to peer connection
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream);
            });
        }

        // Send ICE candidate to peer
        pc.onicecandidate = (event) => {
            if (event.candidate && this.onSignalCallback) {
                this.onSignalCallback(targetClientId, 'candidate', event.candidate);
            }
        };

        // Render remote track
        pc.ontrack = (event) => {
            const remoteStream = event.streams[0];
            this.renderRemoteVideo(targetClientId, targetName, remoteStream);
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                this.removeRemoteVideo(targetClientId);
                delete this.peerConnections[targetClientId];
                if (Object.keys(this.peerConnections).length === 0 && !this.inCall) {
                    this.endCall(false);
                }
            }
        };

        return pc;
    }

    async startCallWithPeer(targetClientId, targetName, withVideo = true) {
        try {
            await this.initLocalMedia(withVideo, true);
            this.inCall = true;
            if (this.onCallStateChange) this.onCallStateChange(true);

            const pc = this.createPeerConnection(targetClientId, targetName);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            if (this.onSignalCallback) {
                this.onSignalCallback(targetClientId, 'offer', offer);
            }
            window.soundEngine.startRing();
        } catch (err) {
            console.error("Failed to start call:", err);
            alert("Could not access camera/microphone. Please ensure permissions are granted.");
            this.endCall(false);
        }
    }

    async handleSignal(senderId, senderName, subType, signal) {
        if (subType === 'offer') {
            window.soundEngine.startRing();
            // Show incoming call modal / prompt or auto-accept if in call
            const accept = window.confirm(`Incoming video/voice call from ${senderName}. Accept?`);
            window.soundEngine.stopRing();

            if (!accept) {
                if (this.onSignalCallback) {
                    this.onSignalCallback(senderId, 'reject', null);
                }
                return;
            }

            try {
                await this.initLocalMedia(true, true);
                this.inCall = true;
                if (this.onCallStateChange) this.onCallStateChange(true);

                const pc = this.createPeerConnection(senderId, senderName);
                await pc.setRemoteDescription(new RTCSessionDescription(signal));

                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                if (this.onSignalCallback) {
                    this.onSignalCallback(senderId, 'answer', answer);
                }
                window.soundEngine.playCallConnected();
            } catch (err) {
                console.error("Error answering call:", err);
                this.endCall(false);
            }

        } else if (subType === 'answer') {
            window.soundEngine.stopRing();
            window.soundEngine.playCallConnected();
            const pc = this.peerConnections[senderId];
            if (pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(signal));
            }

        } else if (subType === 'candidate') {
            const pc = this.peerConnections[senderId];
            if (pc && signal) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(signal));
                } catch (e) {
                    console.warn("Error adding ICE candidate:", e);
                }
            }

        } else if (subType === 'reject') {
            window.soundEngine.stopRing();
            window.soundEngine.playCallEnded();
            alert(`${senderName} declined the call.`);
            this.endCall(false);

        } else if (subType === 'end') {
            this.removeRemoteVideo(senderId);
            if (this.peerConnections[senderId]) {
                this.peerConnections[senderId].close();
                delete this.peerConnections[senderId];
            }
            if (Object.keys(this.peerConnections).length === 0) {
                this.endCall(false);
            }
        }
    }

    renderRemoteVideo(peerId, peerName, stream) {
        const container = document.getElementById('remote-videos');
        if (!container) return;

        let videoCard = document.getElementById(`remote-card-${peerId}`);
        if (!videoCard) {
            videoCard = document.createElement('div');
            videoCard.id = `remote-card-${peerId}`;
            videoCard.className = 'video-tile glass-card';
            videoCard.innerHTML = `
                <video id="remote-video-${peerId}" autoplay playsinline></video>
                <div class="video-overlay">
                    <span class="user-tag"><i class="badge-dot"></i> ${peerName}</span>
                </div>
            `;
            container.appendChild(videoCard);
        }
        const videoEl = document.getElementById(`remote-video-${peerId}`);
        if (videoEl) {
            videoEl.srcObject = stream;
        }
    }

    removeRemoteVideo(peerId) {
        const videoCard = document.getElementById(`remote-card-${peerId}`);
        if (videoCard) {
            videoCard.remove();
        }
    }

    toggleAudio() {
        if (!this.localStream) return;
        const audioTrack = this.localStream.getAudioTracks()[0];
        if (audioTrack) {
            this.isAudioMuted = !this.isAudioMuted;
            audioTrack.enabled = !this.isAudioMuted;
        }
        return this.isAudioMuted;
    }

    toggleVideo() {
        if (!this.localStream) return;
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (videoTrack) {
            this.isVideoOff = !this.isVideoOff;
            videoTrack.enabled = !this.isVideoOff;
        }
        return this.isVideoOff;
    }

    async toggleScreenShare() {
        if (this.isScreenSharing) {
            // Stop screen sharing and revert to camera
            if (this.screenStream) {
                this.screenStream.getTracks().forEach(t => t.stop());
                this.screenStream = null;
            }
            const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
            const newVideoTrack = cameraStream.getVideoTracks()[0];

            for (const pc of Object.values(this.peerConnections)) {
                const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) {
                    sender.replaceTrack(newVideoTrack);
                }
            }
            const localVideo = document.getElementById('local-video');
            if (localVideo) localVideo.srcObject = cameraStream;
            this.localStream = cameraStream;
            this.isScreenSharing = false;
        } else {
            // Start screen share
            try {
                this.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                const screenTrack = this.screenStream.getVideoTracks()[0];

                for (const pc of Object.values(this.peerConnections)) {
                    const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
                    if (sender) {
                        sender.replaceTrack(screenTrack);
                    }
                }

                const localVideo = document.getElementById('local-video');
                if (localVideo) localVideo.srcObject = this.screenStream;

                screenTrack.onended = () => {
                    if (this.isScreenSharing) this.toggleScreenShare();
                };

                this.isScreenSharing = true;
            } catch (err) {
                console.warn("Screen share cancelled or failed:", err);
            }
        }
        return this.isScreenSharing;
    }

    endCall(broadcast = true) {
        if (broadcast && this.onSignalCallback) {
            for (const peerId of Object.keys(this.peerConnections)) {
                this.onSignalCallback(peerId, 'end', null);
            }
        }

        window.soundEngine.stopRing();
        window.soundEngine.playCallEnded();

        for (const peerId of Object.keys(this.peerConnections)) {
            try {
                this.peerConnections[peerId].close();
            } catch (e) {}
        }
        this.peerConnections = {};

        this.stopLocalMedia();
        this.inCall = false;
        this.isScreenSharing = false;

        const remoteContainer = document.getElementById('remote-videos');
        if (remoteContainer) remoteContainer.innerHTML = '';

        if (this.onCallStateChange) {
            this.onCallStateChange(false);
        }
    }
}

window.webRTCManager = new WebRTCManager();
