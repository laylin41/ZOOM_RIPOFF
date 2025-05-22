let localStream;
let peerConnection;
let connectionId;
let hubConnection;

const config = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

window.startVideo = async function (localVideoId, remoteVideoId) {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById(localVideoId).srcObject = localStream;

    hubConnection = new signalR.HubConnectionBuilder()
        .withUrl("/meetinghub")
        .build();

    hubConnection.on("ReceiveConnectionId", (id) => {
        connectionId = id;
        console.log("My connectionId:", connectionId);
    });

    hubConnection.on("ReceiveOffer", async (fromId, offer) => {
        await createPeer(remoteVideoId);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(offer)));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        hubConnection.invoke("SendAnswer", fromId, JSON.stringify(answer));
    });

    hubConnection.on("ReceiveAnswer", async (fromId, answer) => {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(answer)));
    });

    hubConnection.on("ReceiveIceCandidate", async (fromId, candidate) => {
        if (candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(JSON.parse(candidate)));
        }
    });

    await hubConnection.start();
    await hubConnection.invoke("GetConnectionId");
};

async function createPeer(remoteVideoId) {
    peerConnection = new RTCPeerConnection(config);

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            hubConnection.invoke("SendIceCandidate", targetConnectionId, JSON.stringify(event.candidate));
        }
    };

    peerConnection.ontrack = (event) => {
        document.getElementById(remoteVideoId).srcObject = event.streams[0];
    };

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });
}

let targetConnectionId = null;

window.callUser = async function (remoteId) {
    targetConnectionId = remoteId;
    await createPeer("remoteVideo");
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    hubConnection.invoke("SendOffer", remoteId, JSON.stringify(offer));
};

window.getMyId = function () {
    return connectionId;
};
