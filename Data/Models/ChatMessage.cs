namespace ZOOM_RIPOFF.Data.Models
{
    public class ChatMessage
    {
        public string SenderId { get; set; }
        public string SenderName { get; set; }
        public string Content { get; set; }
        public DateTime Timestamp { get; set; }
        public string FileName { get; set; } = default!;
        public string FileContentBase64 { get; set; } = default!;
        // added only after filesUpload, base messages do not use this (pass userId to signalR as parameter). null = public
        public string? ToUserId { get; set; } 
        public bool IsFile { get; set; } = false;
    }
}
