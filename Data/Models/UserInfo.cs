namespace ZOOM_RIPOFF.Data.Models
{
    public class UserInfo
    {
        public string Id { get; set; } = default!;
        public string DisplayName { get; set; } = default!;
        public string AvatarUrl { get; set; } = "/avatars/default.png";
    }
}
