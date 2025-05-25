window.WebRTCInterop = {
    localStreams: {},
    remoteStreams: {},
    peerConnections: {},
    dotNetObjects: {},
    iceCandidateBuffers: {}, // Buffer ICE candidates per user pair

    // Initialize WebRTC
    init: function (userId, dotNetObject) {
        this.dotNetObjects[userId] = dotNetObject;
        this.peerConnections[userId] = {};
        this.localStreams[userId] = null;
        this.remoteStreams[userId] = {};
        this.iceCandidateBuffers[userId] = {};
        console.log(`WebRTCInterop initialized for user ${userId}`);
    },

    // Start media stream
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
            throw error; // Propagate error to Blazor
        }
    },

    // Set local stream to video element
    setLocalStream: async function (userId, videoElementId) {
        const videoElement = document.getElementById(videoElementId);
        if (videoElement && this.localStreams[userId]) {
            videoElement.srcObject = this.localStreams[userId];
            await videoElement.play().catch(error => console.error(`Error playing video for ${videoElementId}: ${error}`));
            console.log(`Set local stream for ${videoElementId} `);
            return true;
        }
        console.warn(`Video element ${ videoElementId } not found or no local stream for user ${ userId }`);
        return false;
    },

    // Set remote stream to video element
   setRemoteStream: async function (toUserId, fromUserId, videoElementId) {
        const videoElement = document.getElementById(videoElementId);
        if (videoElement && this.remoteStreams[toUserId]?.[fromUserId]) {
            videoElement.srcObject = this.remoteStreams[toUserId][fromUserId];
            await videoElement.play().catch(error => console.error(`Error playing video for ${ videoElementId }: ${ error } `));
            console.log(`Set remote stream from ${ fromUserId } for ${ videoElementId }`);
            return true;
        }
        console.warn(`Video element ${ videoElementId } not found or no remote stream from ${ fromUserId } for user ${ toUserId }`);
        return false;
    },

    // Check if video element exists
    elementExists: function (elementId) {
        return !!document.getElementById(elementId);
    },

    // Create a peer connection
    createPeerConnection: function (fromUserId, remoteUserId) {
        console.log("inside create peer connection")
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }]
        });

        if (!this.peerConnections[fromUserId]) {
            this.peerConnections[fromUserId] = {};
        }
        if (!this.iceCandidateBuffers[fromUserId]) {
            this.iceCandidateBuffers[fromUserId] = {};
        }
        this.peerConnections[fromUserId][remoteUserId] = pc;
        this.iceCandidateBuffers[fromUserId][remoteUserId] = [];

        if (this.localStreams[fromUserId]) {
            this.localStreams[fromUserId].getTracks().forEach(track => {
                pc.addTrack(track, this.localStreams[fromUserId]);
            });
        }
 
        // Handle remote stream
        pc.ontrack = (event) => {
            const stream = event.streams[0];
            console.log(`ontrack fired for ${fromUserId} from ${remoteUserId}: ${stream.id}`);
            if (!this.remoteStreams[fromUserId]) {
                this.remoteStreams[fromUserId] = {};
            }
            this.remoteStreams[fromUserId][remoteUserId] = stream;
            const dotNetObject = this.dotNetObjects[fromUserId];
            if (dotNetObject) {
                dotNetObject.invokeMethodAsync('OnRemoteStream', remoteUserId, stream.id)
                    .catch(error => console.error(`Error invoking OnRemoteStream for ${remoteUserId}: ${error}`));
            }
        };

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log(`Generated ICE candidate for ${remoteUserId} for from ${fromUserId}`);
                if (pc.remoteDescription) {
                    const dotNetObject = this.dotNetObjects[fromUserId];
                    if (dotNetObject) {
                        dotNetObject.invokeMethodAsync('SendIceCandidate', remoteUserId, JSON.stringify(event.candidate))
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

    applyBufferedIceCandidates: async function (fromUserId, toUserId) {
        const pc = this.peerConnections[fromUserId]?.[toUserId];
        const buffer = this.iceCandidateBuffers[fromUserId]?.[toUserId] || [];
        for (const candidate of buffer) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
                console.log(`Applied buffered ICE candidate for ${toUserId}`);
            } catch (error) {
                console.error(`Error applying buffered ICE candidate for ${toUserId}: ${error}`);
            } 
        }
        this.iceCandidateBuffers[fromUserId][toUserId] = [];
    },

    // Handle incoming offer
    handleOffer: async function (fromUserId, toUserId, offer) {
        console.log(`Handling offer from ${fromUserId} to ${toUserId}`);
        if (!this.peerConnections[toUserId]) {
            this.peerConnections[toUserId] = {};
        }
        if (!this.peerConnections[toUserId][fromUserId]) {
            this.createPeerConnection(toUserId, fromUserId);
        }
        const pc = this.peerConnections[toUserId][fromUserId];
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(offer)));
            await this.applyBufferedIceCandidates(toUserId, fromUserId);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            console.log(`Created answer for ${fromUserId}`);
            return JSON.stringify(answer);
        } catch (error) {
            console.error(`Error handling offer from ${fromUserId}: ${error}`);
            return null;
        }
    },

    // Handle incoming answer
    handleAnswer: async function (fromUserId, toUserId, answer) {
        console.log(`Handling answer from ${fromUserId} to ${toUserId}`);
        const pc = this.peerConnections[toUserId]?.[fromUserId];
        if (pc) {
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(answer)));
                await this.applyBufferedIceCandidates(toUserId, fromUserId);
                console.log(`Applied answer from ${fromUserId}`);
            } catch (error) {
                console.error(`Error handling answer from ${fromUserId}: ${error}`);
            }
        } else {
            console.error(`No peer connection for ${fromUserId} to ${toUserId}`);
        }
    },

    // Handle incoming ICE candidate
    handleIceCandidate: async function (fromUserId, toUserId, candidate) {
        console.log(`Handling ICE candidate from ${fromUserId} to ${toUserId}`);
        const pc = this.peerConnections[toUserId]?.[fromUserId];
        if (pc) {
            try {
                if (pc.remoteDescription) {
                    await pc.addIceCandidate(new RTCIceCandidate(JSON.parse(candidate)));
                    console.log(`Applied ICE candidate from ${fromUserId}`);
                } else {
                    if (!this.iceCandidateBuffers[toUserId]) {
                        this.iceCandidateBuffers[toUserId] = {};
                    }
                    if (!this.iceCandidateBuffers[toUserId][fromUserId]) {
                        this.iceCandidateBuffers[toUserId][fromUserId] = [];
                    }
                    this.iceCandidateBuffers[toUserId][fromUserId].push(JSON.parse(candidate));
                    console.log(`Buffered ICE candidate from ${fromUserId}`);
                }
            } catch (error) {
                console.error(`Error handling ICE candidate from ${fromUserId}: ${error}`);
            }
        } else {
            console.error(`No peer connection for ${fromUserId} to ${toUserId}`);
        }
    },

    // Start offer for a remote user
    startOffer: async function (remoteUserId, fromUserId) {
        console.log(`[${fromUserId}] Starting offer to ${remoteUserId}`);
        if (this.peerConnections[fromUserId]?.[remoteUserId]) {
            console.log(`[${fromUserId}] Peer connection already exists for ${remoteUserId}, skipping creation`);
            return;
        }
        const pc = this.createPeerConnection(fromUserId, remoteUserId);
        console.log(`[${fromUserId}] CreatePeerConnection ended ${pc ? 'successfully' : 'failed'}`);
        if (!pc) {
            console.error(`[${fromUserId}] Failed to create peer connection for ${remoteUserId}`);
            return;
        }
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            console.log(`[${fromUserId}] Created and set offer for ${remoteUserId}`);
            const dotNetObject = this.dotNetObjects[fromUserId];
            if (dotNetObject && typeof dotNetObject.invokeMethodAsync === 'function') {
                await dotNetObject.invokeMethodAsync('SendOffer', remoteUserId, JSON.stringify(offer));
                console.log(`[${fromUserId}] Sent offer to ${remoteUserId}`);
            } else {
                console.error(`[${fromUserId}] Invalid or missing dotNetObject for ${fromUserId}`);
                // Attempt to notify Blazor to re-initialize
                console.warn(`[${fromUserId}] Re-initialization of dotNetObject may be required`);
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
        }
    },

    // Close peer connection
    closePeerConnection: function (fromUserId, toUserId) {
        if (this.peerConnections[fromUserId]?.[toUserId]) {
            this.peerConnections[fromUserId][toUserId].close();
            delete this.peerConnections[fromUserId][toUserId];
            console.log(`Closed peer connection for ${toUserId} from ${fromUserId}`);
        }
    },

    dispose: function (userId) {
        this.stopMedia(userId);
        if (this.peerConnections[userId]) {
            Object.keys(this.peerConnections[userId]).forEach(toUserId => {
                this.closePeerConnection(userId, toUserId);
            });
            delete this.peerConnections[userId];
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