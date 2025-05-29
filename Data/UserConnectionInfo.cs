namespace ZOOM_RIPOFF.Data
{
    public class UserConnectionInfo
    {
        public string ConnectionId { get; set; } = default!;
        public string UserId { get; set; } = default!;
        public string UserName { get; set; } = default!;
        public bool IsVideoEnabled { get; set; } = false;
        public bool IsMicrophoneEnabled { get; set; } = false;
        public string AvatarUrl { get; set; } = "/avatars/default.png";
        public bool HasActiveStream { get; set; } // Indicates if the user has an active media stream
        public bool IsScreenShareEnabled { get; set; }
    }
}
