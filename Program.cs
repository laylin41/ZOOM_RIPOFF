using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using MudBlazor.Services;
using ZOOM_RIPOFF.Components;
using ZOOM_RIPOFF.Hubs;
using ZOOM_RIPOFF.Components.Data;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// Додати стандартну авторизацію та реєстрацію
builder.Services.AddIdentity<AppUser, IdentityRole>(options => options.SignIn.RequireConfirmedAccount = false)
    .AddEntityFrameworkStores<ApplicationDbContext>()
    .AddDefaultTokenProviders();

builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

builder.Services.AddAuthorizationCore(); // важливо
builder.Services.AddCascadingAuthenticationState();

builder.Services.AddMudServices();

builder.Services.AddSignalR();

builder.Services.AddAuthentication()
    .AddCookie(); 

builder.Services.AddLogging();

builder.Services.AddControllers();

builder.Services.AddHttpClient();


var app = builder.Build();

app.MapHub<MeetingHub>("/meetinghub");

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseHttpsRedirection();

app.UseStaticFiles();
app.UseAntiforgery();


app.MapControllers();

// Для використання авторизації
app.UseAuthentication();
app.UseAuthorization();

app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

app.Run();
