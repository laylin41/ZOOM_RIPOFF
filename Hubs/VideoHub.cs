using Microsoft.AspNetCore.SignalR;
using System.Threading.Tasks;

public class VideoHub : Hub
{
    public async Task SendOffer(string toConnectionId, string offer)
    {
        await Clients.Client(toConnectionId).SendAsync("ReceiveOffer", Context.ConnectionId, offer);
    }

    public async Task SendAnswer(string toConnectionId, string answer)
    {
        await Clients.Client(toConnectionId).SendAsync("ReceiveAnswer", Context.ConnectionId, answer);
    }

    public async Task SendIceCandidate(string toConnectionId, string candidate)
    {
        await Clients.Client(toConnectionId).SendAsync("ReceiveIceCandidate", Context.ConnectionId, candidate);
    }

    public async Task GetConnectionId()
    {
        await Clients.Caller.SendAsync("ReceiveConnectionId", Context.ConnectionId);
    }
}
