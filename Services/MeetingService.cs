using System.Security.Cryptography;
using System;
using ZOOM_RIPOFF.Services.Interfaces;
using Microsoft.EntityFrameworkCore;
using System.Text;
using ZOOM_RIPOFF.Data.Models;

namespace ZOOM_RIPOFF.Services
{
    public class MeetingService : IMeetingService
    {
        private static readonly SemaphoreSlim _semaphore = new SemaphoreSlim(1, 1);
        private readonly ApplicationDbContext _context;

        public MeetingService(ApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<string> GenerateUniqueMeetingIdAsync()
        {
            string id;
            do
            {
                id = GenerateSafeId();
            }
            while (await _context.Meetings.AnyAsync(m => m.MeetingId == id));

            return id;
        }

        private static string GenerateSafeId(int length = 10)
        {
            const string chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
            var data = new byte[length];
            RandomNumberGenerator.Fill(data);
            var result = new StringBuilder(length);
            foreach (var b in data)
                result.Append(chars[b % chars.Length]);
            return result.ToString();
        }

        public async Task<Meeting> CreateMeetingAsync(Meeting meeting)
        {
            _context.Meetings.Add(meeting);
            await _context.SaveChangesAsync();

            return meeting;
        }
        public async Task<bool> MeetingExistsAsync(string meetingId)
        {
            return await _context.Meetings.AnyAsync(m => m.MeetingId == meetingId);
        }

        public async Task<Meeting?> GetMeetingByIdAsync(string meetingId)
        {
            return await _context.Meetings.FirstOrDefaultAsync(m => m.MeetingId == meetingId);
        }

        public async Task DeleteMeetingAsync(string meetingId)
        {
            var meeting = await _context.Meetings.FindAsync(meetingId);
            if (meeting != null)
            {
                _context.Meetings.Remove(meeting);
                await _context.SaveChangesAsync();
            }
        }

        public async Task<List<Meeting>> GetMeetingsByUserId(string userId)
        {
            return await _context.Meetings.Where(m => m.OwnerId == userId).ToListAsync();
        }

        public async Task UpdateMeetingStatus(int Id, bool isActive)
        {
            var meeting = await _context.Meetings.FirstOrDefaultAsync(m => m.Id == Id);
            if (meeting != null)
            {
                meeting.IsActive = isActive;
                await _context.SaveChangesAsync();
            }
        }

        public async Task<bool> CheckMeetingIdExists(string meetingId)
        {
            await _semaphore.WaitAsync();  
            try
            {
                var inMeetings = await _context.Meetings.AnyAsync(m => m.MeetingId == meetingId);
                var inUsers = await _context.Users.AnyAsync(u => u.PersonalMeetingId == meetingId);
                return inMeetings && inUsers;
            }
            finally
            {
                _semaphore.Release(); 
            }
        }
    }
}

