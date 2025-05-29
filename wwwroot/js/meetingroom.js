window.WebRTCInterop = {
    localStreams: {},
    screenStreams: {},
    remoteStreams: {},
    peerConnections: {},
    screenPeerConnections: {}, // Додано для трансляції екрану
    dotNetObjects: {},
    iceCandidateBuffers: {},

    init: function (userId, dotNetObject) {
        this.dotNetObjects[userId] = dotNetObject;
        this.peerConnections[userId] = {};
        this.screenPeerConnections[userId] = {}; // Ініціалізація для екрану
        this.localStreams[userId] = null;
        this.screenStreams[userId] = null;
        this.remoteStreams[userId] = {};
        this.iceCandidateBuffers[userId] = {};
        console.log(`WebRTCInterop initialized for user ${userId}`);
    },

    startMedia: async function (userId, videoEnabled, audioEnabled) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: videoEnabled,
                audio: audioEnabled
            });
            this.localStreams[userId] = stream;
            console.log(`Local stream initialized for user ${userId}: ${stream.id}`);
            return true;
        } catch (error) {
            console.error(`Error accessing media devices for user ${userId}: ${error.name}: ${error.message}`);
            throw error;
        }
    },

    startScreenShare: async function (userId) {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });
            this.screenStreams[userId] = stream;
            console.log(`Screen share stream initialized for user ${userId}: ${stream.id}`);
            stream.getVideoTracks()[0].onended = () => {
                console.log(`Screen share stopped for user ${userId}`);
                this.stopScreenShare(userId);
                this.dotNetObjects[userId]?.invokeMethodAsync('ToggleScreenShare')
                    .catch(error => console.error(`Error invoking ToggleScreenShare: ${error}`));
            };
            return true;
        } catch (error) {
            console.error(`Error starting screen share for user ${userId}: ${error.name}: ${error.message}`);
            throw error;
        }
    },

    stopScreenShare: function (userId) {
        if (this.screenStreams[userId]) {
            this.screenStreams[userId].getTracks().forEach(track => track.stop());
            this.screenStreams[userId] = null;
            console.log(`Stopped screen share for user ${userId}`);
            // Закриваємо всі screenPeerConnections
            if (this.screenPeerConnections[userId]) {
                Object.keys(this.screenPeerConnections[userId]).forEach(toUserId => {
                    this.screenPeerConnections[userId][toUserId].close();
                    delete this.screenPeerConnections[userId][toUserId];
                });
            }
        }
    },

    stopMedia: function (userId) {
        if (this.localStreams[userId]) {
            this.localStreams[userId].getTracks().forEach(track => track.stop());
            this.localStreams[userId] = null;
            console.log(`Stopped media for user ${userId}`);
        }
    },

    setLocalStream: async function (userId, videoElementId) {
        const videoElement = document.getElementById(videoElementId);
        const isScreenShare = videoElementId.startsWith('screen-');
        const stream = isScreenShare ? this.screenStreams[userId] : this.localStreams[userId];
        if (videoElement && stream) {
            videoElement.srcObject = stream;
            await videoElement.play().catch(error => console.error(`Error playing video for ${videoElementId}: ${error}`));
            console.log(`Set ${isScreenShare ? 'screen' : 'local'} stream for ${videoElementId}`);
            return true;
        }
        console.warn(`Video element ${videoElementId} not found or no ${isScreenShare ? 'screen' : 'local'} stream for user ${userId}`);
        return false;
    },

    setRemoteStream: async function (toUserId, fromUserId, videoElementId) {
        const videoElement = document.getElementById(videoElementId);
        const isScreenShare = videoElementId.startsWith('screen-');
        const streamKey = isScreenShare ? `${fromUserId}-screen` : fromUserId;
        if (videoElement && this.remoteStreams[toUserId]?.[streamKey]) {
            videoElement.srcObject = this.remoteStreams[toUserId][streamKey];
            await videoElement.play().catch(error => console.error(`Error playing video for ${videoElementId}: ${error}`));
            console.log(`Set remote ${isScreenShare ? 'screen' : 'camera'} stream from ${fromUserId} for ${videoElementId}`);
            return true;
        }
        console.warn(`Video element ${videoElementId} not found or no remote stream from ${fromUserId} for user ${toUserId}`);
        return false;
    },

    elementExists: function (elementId) {
        return !!document.getElementById(elementId);
    },

    createPeerConnection: function (fromUserId, remoteUserId, isScreenShare = false) {
        console.log(`Creating peer connection from ${fromUserId} to ${remoteUserId} (screen: ${isScreenShare})`);
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }]
        });

        const connections = isScreenShare ? this.screenPeerConnections : this.peerConnections;
        if (!connections[fromUserId]) {
            connections[fromUserId] = {};
        }
        if (!this.iceCandidateBuffers[fromUserId]) {
            this.iceCandidateBuffers[fromUserId] = {};
        }
        connections[fromUserId][remoteUserId] = pc;
        this.iceCandidateBuffers[fromUserId][remoteUserId] = [];

        const stream = isScreenShare ? this.screenStreams[fromUserId] : this.localStreams[fromUserId];
        if (stream) {
            stream.getTracks().forEach(track => {
                pc.addTrack(track, stream);
            });
        }

        pc.ontrack = (event) => {
            const stream = event.streams[0];
            console.log(`ontrack fired for ${fromUserId} from ${remoteUserId}: ${stream.id} (screen: ${isScreenShare})`);
            if (!this.remoteStreams[fromUserId]) {
                this.remoteStreams[fromUserId] = {};
            }
            this.remoteStreams[fromUserId][isScreenShare ? `${remoteUserId}-screen` : remoteUserId] = stream;
            const dotNetObject = this.dotNetObjects[fromUserId];
            if (dotNetObject) {
                dotNetObject.invokeMethodAsync('OnRemoteStream', remoteUserId, stream.id, isScreenShare)
                    .catch(error => console.error(`Error invoking OnRemoteStream for ${remoteUserId}: ${error}`));
            }
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log(`Generated ICE candidate for ${remoteUserId} from ${fromUserId} (screen: ${isScreenShare})`);
                if (pc.remoteDescription) {
                    const dotNetObject = this.dotNetObjects[fromUserId];
                    if (dotNetObject) {
                        dotNetObject.invokeMethodAsync('SendIceCandidate', remoteUserId, JSON.stringify(event.candidate), isScreenShare)
                            .catch(error => console.error(`Error sending ICE candidate for ${remoteUserId}: ${error}`));
                    }
                } else {
                    this.iceCandidateBuffers[fromUserId][remoteUserId].push(event.candidate);
                    console.log(`Buffered ICE candidate for ${remoteUserId}`);
                }
            }
        };

        return pc;
    },

    applyBufferedIceCandidates: async function (fromUserId, toUserId, isScreenShare = false) {
        const connections = isScreenShare ? this.screenPeerConnections : this.peerConnections;
        const pc = connections[fromUserId]?.[toUserId];
        const buffer = this.iceCandidateBuffers[fromUserId]?.[toUserId] || [];
        for (const candidate of buffer) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
                console.log(`Applied buffered ICE candidate for ${toUserId} (screen: ${isScreenShare})`);
            } catch (error) {
                console.error(`Error applying buffered ICE candidate for ${toUserId}: ${error}`);
            }
        }
        this.iceCandidateBuffers[fromUserId][toUserId] = [];
    },

    handleOffer: async function (fromUserId, toUserId, offer, isScreenShare = false) {
        console.log(`Handling offer from ${fromUserId} to ${toUserId} (screen: ${isScreenShare})`);
        const connections = isScreenShare ? this.screenPeerConnections : this.peerConnections;
        if (!connections[toUserId]) {
            connections[toUserId] = {};
        }
        if (!connections[toUserId][fromUserId]) {
            this.createPeerConnection(toUserId, fromUserId, isScreenShare);
        }
        const pc = connections[toUserId][fromUserId];
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(offer)));
            await this.applyBufferedIceCandidates(toUserId, fromUserId, isScreenShare);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            console.log(`Created answer for ${fromUserId} (screen: ${isScreenShare})`);
            return JSON.stringify(answer);
        } catch (error) {
            console.error(`Error handling offer from ${fromUserId}: ${error}`);
            return null;
        }
    },

    handleAnswer: async function (fromUserId, toUserId, answer, isScreenShare = false) {
        console.log(`Handling answer from ${fromUserId} to ${toUserId} (screen: ${isScreenShare})`);
        const connections = isScreenShare ? this.screenPeerConnections : this.peerConnections;
        const pc = connections[toUserId]?.[fromUserId];
        if (pc) {
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(answer)));
                await this.applyBufferedIceCandidates(toUserId, fromUserId, isScreenShare);
                console.log(`Applied answer from ${fromUserId} (screen: ${isScreenShare})`);
            } catch (error) {
                console.error(`Error handling answer from ${fromUserId}: ${error}`);
            }
        } else {
            console.error(`No peer connection for ${fromUserId} to ${toUserId} (screen: ${isScreenShare})`);
        }
    },

    handleIceCandidate: async function (fromUserId, toUserId, candidate, isScreenShare = false) {
        console.log(`Handling ICE candidate from ${fromUserId} to ${toUserId} (screen: ${isScreenShare})`);
        const connections = isScreenShare ? this.screenPeerConnections : this.peerConnections;
        const pc = connections[toUserId]?.[fromUserId];
        if (pc) {
            try {
                if (pc.remoteDescription) {
                    await pc.addIceCandidate(new RTCIceCandidate(JSON.parse(candidate)));
                    console.log(`Applied ICE candidate from ${fromUserId} (screen: ${isScreenShare})`);
                } else {
                    if (!this.iceCandidateBuffers[toUserId]) {
                        this.iceCandidateBuffers[toUserId] = {};
                    }
                    if (!this.iceCandidateBuffers[toUserId][fromUserId]) {
                        this.iceCandidateBuffers[toUserId][fromUserId] = [];
                    }
                    this.iceCandidateBuffers[toUserId][fromUserId].push(JSON.parse(candidate));
                    console.log(`Buffered ICE candidate from ${fromUserId} (screen: ${isScreenShare})`);
                }
            } catch (error) {
                console.error(`Error handling ICE candidate from ${fromUserId}: ${error}`);
            }
        } else {
            console.error(`No peer connection for ${fromUserId} to ${toUserId} (screen: ${isScreenShare})`);
        }
    },

    startOffer: async function (remoteUserId, fromUserId, isScreenShare = false) {
        console.log(`[${fromUserId}] Starting offer to ${remoteUserId} (screen: ${isScreenShare})`);
        const connections = isScreenShare ? this.screenPeerConnections : this.peerConnections;
        if (connections[fromUserId]?.[remoteUserId]) {
            console.log(`[${fromUserId}] Peer connection already exists for ${remoteUserId}, skipping creation`);
            return;
        }
        const pc = this.createPeerConnection(fromUserId, remoteUserId, isScreenShare);
        if (!pc) {
            console.error(`[${fromUserId}] Failed to create peer connection for ${remoteUserId}`);
            return;
        }
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            console.log(`[${fromUserId}] Created and set offer for ${remoteUserId} (screen: ${isScreenShare})`);
            const dotNetObject = this.dotNetObjects[fromUserId];
            if (dotNetObject && typeof dotNetObject.invokeMethodAsync === 'function') {
                await dotNetObject.invokeMethodAsync('SendOffer', remoteUserId, JSON.stringify(offer), isScreenShare);
                console.log(`[${fromUserId}] Sent offer to ${remoteUserId} (screen: ${isScreenShare})`);
            } else {
                console.error(`[${fromUserId}] Invalid or missing dotNetObject for ${fromUserId}`);
            }
        } catch (error) {
            console.error(`[${fromUserId}] Error creating offer for ${remoteUserId}: ${error}`);
        }
    },

    stopMedia: function (userId) {
        if (this.localStreams[userId]) {
            this.localStreams[userId].getTracks().forEach(track => track.stop());
            this.localStreams[userId] = null;
            console.log(`Stopped media for user ${userId}`);
            if (this.peerConnections[userId]) {
                Object.keys(this.peerConnections[userId]).forEach(toUserId => {
                    this.closePeerConnection(userId, toUserId, false);
                });
            }
        }
    },

    closePeerConnection: function (fromUserId, toUserId, isScreenShare = false) {
        const connections = isScreenShare ? this.screenPeerConnections : this.peerConnections;
        if (connections[fromUserId]?.[toUserId]) {
            connections[fromUserId][toUserId].close();
            delete connections[fromUserId][toUserId];
            console.log(`Closed peer connection for ${toUserId} from ${fromUserId} (screen: ${isScreenShare})`);
        }
    },

    dispose: function (userId) {
        this.stopMedia(userId);
        this.stopScreenShare(userId);
        if (this.peerConnections[userId]) {
            Object.keys(this.peerConnections[userId]).forEach(toUserId => {
                this.closePeerConnection(userId, toUserId, false);
            });
            delete this.peerConnections[userId];
        }
        if (this.screenPeerConnections[userId]) {
            Object.keys(this.screenPeerConnections[userId]).forEach(toUserId => {
                this.closePeerConnection(userId, toUserId, true);
            });
            delete this.screenPeerConnections[userId];
        }
        if (this.remoteStreams[userId]) {
            delete this.remoteStreams[userId];
        }
        if (this.iceCandidateBuffers[userId]) {
            delete this.iceCandidateBuffers[userId];
        }
        delete this.dotNetObjects[userId];
        console.log(`WebRTCInterop disposed for user ${userId}`);
    }
};