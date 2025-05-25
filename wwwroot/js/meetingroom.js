window.WebRTCInterop = {
    localStreams: {},
    peerConnections: {},
    dotNetObjects: {},

    // Initialize WebRTC
    init: function (userId, dotNetObject) {
        this.dotNetObjects[userId] = dotNetObject;
        this.peerConnections[userId] = {};
        this.localStreams[userId] = null;
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
            console.error(`Error accessing media devices for user ${userId}: ${error}`);
            return false;
        }
    },

    // Set local stream to video element
    setLocalStream: function (userId, videoElementId) {
        const videoElement = document.getElementById(videoElementId);
        if (videoElement && this.localStreams[userId]) {
            videoElement.srcObject = this.localStreams[userId];
            videoElement.play().catch(error => console.error(`Error playing video for ${videoElementId}: ${error}`));
            console.log(`Set local stream for ${videoElementId}`);
            return true;
        }
        console.warn(`Video element ${videoElementId} not found or no local stream for user ${userId}`);
        return false;
    },

    // Check if video element exists
    elementExists: function (elementId) {
        return !!document.getElementById(elementId);
    },

    // Create a peer connection
    createPeerConnection: function (fromUserId, remoteUserId) {
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        if (!this.peerConnections[fromUserId]) {
            this.peerConnections[fromUserId] = {};
        }
        this.peerConnections[fromUserId][remoteUserId] = pc;

        // Add local stream tracks
        if (this.localStreams[fromUserId]) {
            this.localStreams[fromUserId].getTracks().forEach(track => {
                pc.addTrack(track, this.localStreams[fromUserId]);
            });
        }

        // Handle remote stream
        pc.ontrack = (event) => {
            const stream = event.streams[0];
            const dotNetObject = this.dotNetObjects[fromUserId];
            if (dotNetObject) {
                dotNetObject.invokeMethodAsync('OnRemoteStream', remoteUserId, stream.id)
                    .catch(error => console.error(`Error invoking OnRemoteStream for ${remoteUserId}: ${error}`));
            } else {
                console.error(`dotNetObject is null for user ${fromUserId}`);
            }
        };

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log(`ICE candidate generated for ${remoteUserId} from ${fromUserId}`);
                const dotNetObject = this.dotNetObjects[fromUserId];
                if (dotNetObject) {
                    dotNetObject.invokeMethodAsync('SendIceCandidate', remoteUserId, JSON.stringify(event.candidate))
                        .catch(error => console.error(`Error invoking SendIceCandidate for ${remoteUserId}: ${error}`));
                } else {
                    console.error(`dotNetObject is null for user ${fromUserId} in onicecandidate`);
                }
            }
        };

        pc.onconnectionstatechange = () => {
            console.log("Connection state:", pc.connectionState);
        };

        return pc;
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
                await pc.addIceCandidate(new RTCIceCandidate(JSON.parse(candidate)));
                console.log(`Applied ICE candidate from ${fromUserId}`);
            } catch (error) {
                console.error(`Error handling ICE candidate from ${fromUserId}: ${error}`);
            }
        } else {
            console.error(`No peer connection for ${fromUserId} to ${toUserId}`);
        }
    },

    // Start offer for a remote user
    startOffer: async function (remoteUserId, fromUserId) {
        console.log(`Starting offer from ${fromUserId} to ${remoteUserId}`);
        const pc = this.createPeerConnection(fromUserId, remoteUserId);
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            console.log(`Created offer for ${remoteUserId} from ${fromUserId}`);
            const dotNetObject = this.dotNetObjects[fromUserId];
            if (dotNetObject) {
                await dotNetObject.invokeMethodAsync('SendOffer', remoteUserId, JSON.stringify(offer));
            } else {
                console.error(`dotNetObject is null for user ${fromUserId}`);
            }
        } catch (error) {
            console.error(`Error creating offer for ${remoteUserId}: ${error}`);
        }
    },

    // Stop media stream
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

    // Clean up all resources
    dispose: function (userId) {
        this.stopMedia(userId);
        if (this.peerConnections[userId]) {
            Object.keys(this.peerConnections[userId]).forEach(toUserId => {
                this.closePeerConnection(userId, toUserId);
            });
            delete this.peerConnections[userId];
        }
        delete this.dotNetObjects[userId];
        console.log(`WebRTCInterop disposed for user ${userId}`);
    }
};