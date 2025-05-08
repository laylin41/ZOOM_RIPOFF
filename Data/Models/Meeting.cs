using ZOOM_RIPOFF.Data.Models;

namespace ZOOM_RIPOFF.Data.Models
{
    public class Meeting
    {
        public int Id { get; set; }
        public string MeetingId { get; set; } = string.Empty;
        public string MeetingName { get; set; } = string.Empty;
        public string OwnerId { get; set; } = string.Empty;
        public AppUser? Owner { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public bool IsActive { get; set; } = true;
        public DateTime? ScheduledToStartAt { get; set; } = null;
    }
}
