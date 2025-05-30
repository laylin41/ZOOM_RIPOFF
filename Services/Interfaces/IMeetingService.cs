using ZOOM_RIPOFF.Data.Models;

namespace ZOOM_RIPOFF.Services.Interfaces
{
    public interface IMeetingService
    {
        Task<string> GenerateUniqueMeetingIdAsync();
        Task<bool> CreateMeetingAsync(Meeting meeting);
        Task<bool> MeetingExistsAsync(string meetingId);
        Task<Meeting?> GetMeetingByIdAsync(string meetingId);
        Task DeleteMeetingAsync(string meetingId);
        Task<List<Meeting>> GetMeetingsByUserId(string userId);
        Task UpdateMeetingStatus(int Id, bool isActive);
        Task<bool> CheckMeetingIdExists(string meetingId);
    }
}
