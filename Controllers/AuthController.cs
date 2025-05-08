using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ZOOM_RIPOFF.Data.Models;

namespace ZOOM_RIPOFF.Controllers
{
    [Route("auth")]
    public class AuthController : Controller
    {
        private readonly SignInManager<AppUser> _signInManager;

        public AuthController(SignInManager<AppUser> signInManager)
        {
            _signInManager = signInManager;
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromForm] string email, [FromForm] string password)
        {
            var result = await _signInManager.PasswordSignInAsync(email, password, false, false);
            if (result.Succeeded)
            {
                return Redirect("/");
            }
            return Redirect("/login?error=1");
        }

        [HttpPost("logout")]
        public async Task<IActionResult> Logout()
        {
            await _signInManager.SignOutAsync();
            return Redirect("/");
        }

        [HttpPost("register")]
        public async Task<IActionResult> Register([FromForm] string email, [FromForm] string password, [FromForm] string confirmPassword)
        {
            if (password != confirmPassword)
            {
                return Redirect("/register?error=PasswordsDoNotMatch");
            }

            var user = new AppUser { UserName = email, Email = email, DisplayName = email, PersonalMeetingId = await GenerateMeetingIdRNG() };
            var result = await _signInManager.UserManager.CreateAsync(user, password);

            if (result.Succeeded)
            {
                await _signInManager.SignInAsync(user, false);
                return Redirect("/");
            }

            var errorMessage = string.Join(";", result.Errors.Select(e => e.Description));
            return Redirect($"/register?error={Uri.EscapeDataString(errorMessage)}");
        }

        [Authorize]
        [HttpPost("update-profile")]
        public async Task<IActionResult> UpdateProfile([FromForm] string email, [FromForm] string displayName)
        {
            var user = await _signInManager.UserManager.GetUserAsync(User);
            if (user == null) return Redirect("/profile?error=UserNotFound");

            user.Email = email;
            user.UserName = email;
            if (user is AppUser appUser)
                appUser.DisplayName = displayName;

            var result = await _signInManager.UserManager.UpdateAsync(user);
            if (!result.Succeeded)
            {
                var msg = string.Join(";", result.Errors.Select(e => e.Description));
                return Redirect($"/profile?error={Uri.EscapeDataString(msg)}");
            }

            return Redirect("/profile?success=ProfileUpdated");
        }

        [Authorize]
        [HttpPost("change-password")]
        public async Task<IActionResult> ChangePassword([FromForm] string oldPassword, [FromForm] string newPassword)
        {
            var user = await _signInManager.UserManager.GetUserAsync(User);
            if (user == null) return Redirect("/profile?error=UserNotFound");

            var result = await _signInManager.UserManager.ChangePasswordAsync(user, oldPassword, newPassword);
            if (!result.Succeeded)
            {
                var msg = string.Join(";", result.Errors.Select(e => e.Description));
                return Redirect($"/profile?error={Uri.EscapeDataString(msg)}");
            }

            return Redirect("/profile?success=PasswordChanged");
        }

        [Authorize]
        [HttpPost("upload-avatar")]
        public async Task<IActionResult> UploadAvatar(IFormFile avatar)
        {
            var user = await _signInManager.UserManager.GetUserAsync(User);
            if (user is not AppUser appUser) return Redirect("/profile?error=UserNotFound");

            if (avatar != null && avatar.Length > 0)
            {
                var oldAvatarPath = appUser.AvatarUrl != null
                    ? Path.Combine("wwwroot", appUser.AvatarUrl.TrimStart('/'))
                    : null;

                var ext = Path.GetExtension(avatar.FileName);
                var fileName = $"{Guid.NewGuid()}{ext}";
                var path = Path.Combine("wwwroot", "avatars", fileName);

                Directory.CreateDirectory(Path.GetDirectoryName(path)!);
                using var stream = new FileStream(path, FileMode.Create);
                await avatar.CopyToAsync(stream);

                appUser.AvatarUrl = $"/avatars/{fileName}";
                await _signInManager.UserManager.UpdateAsync(appUser);

                if (!string.IsNullOrEmpty(oldAvatarPath) && System.IO.File.Exists(oldAvatarPath))
                {
                    try
                    {
                        System.IO.File.Delete(oldAvatarPath);
                    }
                    catch
                    {
                        Console.WriteLine("Catched in UploadAvatar - Deleting old avatar");
                    }
                }
            }

            return Redirect("/profile?success=AvatarUpdated");
        }

        [Authorize]
        [HttpPost("generate-meeting-id")]
        public async Task<IActionResult> GenerateMeetingId()
        {
            var user = await _signInManager.UserManager.GetUserAsync(User);
            if (user is not AppUser appUser) return Redirect("/profile?error=UserNotFound");

            appUser.PersonalMeetingId = await GenerateMeetingIdRNG();
            await _signInManager.UserManager.UpdateAsync(appUser);

            return Redirect("/profile?success=MeetingIDGenerated");
        }

        private async Task<string> GenerateMeetingIdRNG()
        {
            string newId;
            var random = new Random();

            do
            {
                // Генеруємо у форматі 10-значного числа з пробілами: "123 456 7890"
                var raw = random.Next(1000000000, int.MaxValue).ToString();
                newId = $"{raw.Substring(0, 3)} {raw.Substring(3, 3)} {raw.Substring(6, 4)}";

                // Перевіряємо, чи вже такий ID існує
            } while (await _signInManager.UserManager.Users.AnyAsync(u => u.PersonalMeetingId == newId));

            return newId;
        }

    }
}
