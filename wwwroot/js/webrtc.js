let localStream = null;
window.startMedia = async function (videoElementId = "localVideo", enableVideo = true, enableAudio = true) {
    try {
        if (localStream) stopMedia();

        // Always request both, then disable unused tracks after
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        // Disable video/audio tracks based on flags
        localStream.getVideoTracks().forEach(track => {
            track.enabled = enableVideo;
        });

        localStream.getAudioTracks().forEach(track => {
            track.enabled = enableAudio;
        });

        const video = document.getElementById(videoElementId);
        if (video) {
            video.srcObject = localStream;
            await video.play();
        }

        return true;
    } catch (err) {
        console.error("Error accessing media devices:", err);
        return false;
    }
};

window.stopMedia = async function () {
    if (!localStream) return;
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
}
