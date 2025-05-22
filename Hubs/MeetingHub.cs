using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;
using ZOOM_RIPOFF.Data;
using ZOOM_RIPOFF.Data.Models;

namespace ZOOM_RIPOFF.Hubs
{
    public class MeetingHub : Hub
    {
        // Зберігаємо підключених користувачів до кімнат
        // Зберігаємо список учасників по кімнатах
        private static readonly ConcurrentDictionary<string, List<UserConnectionInfo>> RoomUsers = new();
        // Зберігаємо повідомлення чату по кімнатах
        private static readonly ConcurrentDictionary<string, List<ChatMessage>> ChatMessages = new();
        private static readonly ConcurrentDictionary<string, List<ChatMessage>> PrivateChats = new();

        public async Task JoinMeeting(string roomId, string userId, string userName, string avatarUrl)
        {
            var connectionId = Context.ConnectionId;
            //Console.WriteLine($"JoinedMeeting for id: {userId}, conId:{connectionId}");

            await Groups.AddToGroupAsync(connectionId, roomId);

            var user = new UserConnectionInfo
            {
                ConnectionId = connectionId,
                UserId = userId,
                UserName = userName,
                IsVideoEnabled = false,
                IsMicrophoneEnabled = false,
                AvatarUrl = avatarUrl
            };

            // Додаємо до кімнати
            RoomUsers.AddOrUpdate(roomId,
                _ => new List<UserConnectionInfo> { user },
                (_, list) =>
                {
                    lock (list)
                    {
                        var existing = list.FirstOrDefault(u => u.UserId == user.UserId);
                        if (existing != null)
                        {
                            list.Remove(existing);
                            Clients.Group(roomId).SendAsync("UserLeft", existing.ConnectionId, existing.UserName).Wait();
                        }
                        list.Add(user);
                        Clients.Group(roomId).SendAsync("UserJoined", user).Wait();
                    }
                    return list;
                });

            var usersInRoom = RoomUsers[roomId]
                .Where(u => u.ConnectionId != connectionId)
                .ToList();

            await Clients.Client(connectionId).SendAsync("CurrentUsers", usersInRoom);

            var chatHistory = new List<ChatMessage>();

            if (!ChatMessages.Keys.Any(rid => rid == roomId))
            {
                ChatMessages.TryAdd(roomId, new List<ChatMessage>());
            }

            lock (ChatMessages[roomId])
            {
                chatHistory = ChatMessages[roomId].ToList();
            }

            await Clients.Client(connectionId).SendAsync("SendChatHistory", chatHistory);
        }

        public async Task SendFileMessage(string roomId, ChatMessage fileMessage)
        {
            if (!string.IsNullOrEmpty(fileMessage.ToUserId))
            {
                if (RoomUsers.TryGetValue(roomId, out List<UserConnectionInfo> roomUsers))
                {
                    var targetUser = roomUsers.FirstOrDefault(u => u.UserId == fileMessage.ToUserId);
                    if (targetUser != null)
                    {
                        await Clients.Client(targetUser.ConnectionId).SendAsync("ReceiveFileMessage", fileMessage);
                        await Clients.Caller.SendAsync("ReceiveFileMessage", fileMessage);
                    }
                } 
            }
            else
            {
                await Clients.Group(roomId).SendAsync("ReceiveFileMessage", fileMessage);
            }
        }

        public async Task SendChatMessage(string roomId, string senderId, string senderName, string message)
        {
            var chatMessage = new ChatMessage
            {
                SenderId = senderId,
                SenderName = senderName,
                Content = message,
                Timestamp = DateTime.UtcNow
            };

            var list = ChatMessages.GetOrAdd(roomId, _ => new List<ChatMessage>());
            lock (list)
            {
                list.Add(chatMessage);
            }

            await Clients.Group(roomId).SendAsync("ReceiveChatMessage", chatMessage);
        }

        public async Task SendPrivateMessage(string roomId, string senderId, string receiverId, string message)
        {
            if (!RoomUsers.TryGetValue(roomId, out var users))
                return;

            var sender = users.FirstOrDefault(u => u.UserId == senderId);
            var receiver = users.FirstOrDefault(u => u.UserId == receiverId);

            if (sender == null || receiver == null)
                return;

            var chatMessage = new ChatMessage
            {
                SenderId = senderId,
                SenderName = sender.UserName,
                Content = message,
                Timestamp = DateTime.UtcNow
            };

            string key = GetPrivateChatKey(senderId, receiverId);
            var list = PrivateChats.GetOrAdd(key, _ => new List<ChatMessage>());
            lock (list)
            {
                list.Add(chatMessage);
            }

            await Clients.Client(sender.ConnectionId)
                .SendAsync("ReceivePrivateMessage", receiverId, chatMessage);
            await Clients.Client(receiver.ConnectionId)
                .SendAsync("ReceivePrivateMessage", senderId, chatMessage);
        }

        private static string GetPrivateChatKey(string userId1, string userId2)
        {
            return string.CompareOrdinal(userId1, userId2) < 0
                ? $"{userId1}-{userId2}"
                : $"{userId2}-{userId1}";
        }

        public async Task UpdateStatus(string roomId, string statusType, bool isEnabled, string userId)
        {
            var connectionId = Context.ConnectionId;

            if (RoomUsers.TryGetValue(roomId, out var users))
            {
                var user = users.FirstOrDefault(u => u.UserId == userId);
                if (user != null)
                {
                    if (statusType == "video")
                        user.IsVideoEnabled = isEnabled;
                    else if (statusType == "microphone")
                        user.IsMicrophoneEnabled = isEnabled;
                    //Console.WriteLine($"Hub: Status changed conId: {connectionId}, roomId:{roomId}, userId:{userId} ");

                    // Повідомляємо інших про зміну
                    await Clients.Group(roomId).SendAsync("UserStatusChanged", connectionId, statusType, isEnabled);
                }
            }
        }

        public async Task LeaveMeeting(string roomId, string userId, string userName)
        {
            var connectionId = Context.ConnectionId;
            //Console.WriteLine($"LeaveMeeting called for userId: {userId}, userName: {userName}, connectionId: {connectionId}");

            try
            {
                await RemoveUser(roomId, userId, userName, connectionId, isExplicitLeave: true);
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex.Message + $"Error in LeaveMeeting for userId: {userId}, roomId: {roomId}");
            }
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            var connectionId = Context.ConnectionId;
            //Console.WriteLine($"OnDisconnectedAsync called for connectionId: {connectionId}");

            try
            {
                string? removedRoomId = null;
                UserConnectionInfo? removedUser = null;

                foreach (var kvp in RoomUsers)
                {
                    var roomId = kvp.Key;
                    var users = kvp.Value;

                    lock (users)
                    {
                        var user = users.FirstOrDefault(u => u.ConnectionId == connectionId);
                        if (user != null)
                        {
                            removedRoomId = roomId;
                            removedUser = user;
                            break;
                        }
                    }
                }

                if (removedRoomId != null && removedUser != null)
                {
                    await RemoveUser(removedRoomId, removedUser.UserId, removedUser.UserName, connectionId, isExplicitLeave: false);
                }
                else
                {
                    Console.WriteLine($"No user found for connectionId: {connectionId} in any room");
                }

                await base.OnDisconnectedAsync(exception);
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex.Message + $"Error in OnDisconnectedAsync for connectionId: {connectionId}");
            }
        }

        private async Task RemoveUser(string roomId, string userId, string userName, string connectionId, bool isExplicitLeave)
        {
            if (RoomUsers.TryGetValue(roomId, out var users))
            {
                lock (users)
                {
                    var user = users.FirstOrDefault(u => u.UserId == userId && u.ConnectionId == connectionId);
                    if (user != null)
                    {
                        users.Remove(user);
                        //Console.WriteLine($"Removed user {userName} from room {roomId} (Explicit: {isExplicitLeave})");

                        if (users.Count == 0)
                        {
                            RoomUsers.TryRemove(roomId, out _);
                            //Console.WriteLine($"Removed empty room {roomId}");
                            ChatMessages.TryRemove(roomId, out _);
                            // TODO: Мітинг розібратись коли вона стає неактивною
                        }

                        Clients.Group(roomId).SendAsync("UserLeft", connectionId, userName).Wait();

                        CleanUpPrivateChatsForUser(userId, roomId);
                    }
                    else
                    {
                        Console.WriteLine($"UserId: {userId} or connectionId: {connectionId} not found in room {roomId}");
                    }
                }

                if (isExplicitLeave)
                {
                    await Groups.RemoveFromGroupAsync(connectionId, roomId);
                }
            }
            else
            {
                Console.WriteLine($"Room {roomId} not found for user removal");
            }
        }

        private void CleanUpPrivateChatsForUser(string userId, string roomId)
        {
            if (!RoomUsers.TryGetValue(roomId, out var usersInRoom))
                return;

            var currentUserIds = usersInRoom.Select(u => u.UserId).ToHashSet();
            var keysToRemove = new List<string>();

            foreach (var key in PrivateChats.Keys)
            {
                if (!key.Contains(userId)) continue;

                var parts = key.Split('-');
                if (parts.Length != 2) continue;

                string userA = parts[0];
                string userB = parts[1];

                // If *neither* user is still in the room, we remove the private chat
                if (!currentUserIds.Contains(userA) && !currentUserIds.Contains(userB))
                {
                    keysToRemove.Add(key);
                }
            }

            foreach (var key in keysToRemove)
            {
                PrivateChats.TryRemove(key, out _);
                // Console.WriteLine($"Cleaned up private chat: {key}");
            }
        }

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
    }
}



