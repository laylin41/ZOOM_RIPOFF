using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace ZOOM_RIPOFF.Components.Pages
{
    [Route("auth")]
    public class AuthController : Controller
    {
        private readonly SignInManager<IdentityUser> _signInManager;

        public AuthController(SignInManager<IdentityUser> signInManager)
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

            var user = new IdentityUser { UserName = email, Email = email };
            var result = await _signInManager.UserManager.CreateAsync(user, password);

            if (result.Succeeded)
            {
                await _signInManager.SignInAsync(user, false);
                return Redirect("/");
            }

            var errorMessage = string.Join(";", result.Errors.Select(e => e.Description));
            return Redirect($"/register?error={Uri.EscapeDataString(errorMessage)}");
        }

    }
}
