using Microsoft.AspNetCore.SignalR;

namespace ZOOM_RIPOFF.Hubs
{
    public class MeetingHub : Hub
    {
        public async Task SendMessage(string user, string message)
        {
            await Clients.All.SendAsync("ReceiveMessage", user, message);
        }
    }

}
