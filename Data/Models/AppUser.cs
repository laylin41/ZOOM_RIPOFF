using Microsoft.AspNetCore.Identity;

namespace ZOOM_RIPOFF.Data.Models
{
    public class AppUser : IdentityUser
    {
        public string? DisplayName { get; set; }
        public string? AvatarUrl { get; set; }
        public string? PersonalMeetingId { get; set; }
    }
}
