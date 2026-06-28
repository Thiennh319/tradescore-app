using System.Net;
using System.Text;

namespace TradeScore.WebLauncher;

/// <summary>Phục vụ thư mục web tĩnh (Expo export) — không cần Node.js.</summary>
internal sealed class StaticWebServer : IDisposable
{
    private static readonly Dictionary<string, string> MimeTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".html"] = "text/html; charset=utf-8",
        [".htm"] = "text/html; charset=utf-8",
        [".js"] = "application/javascript; charset=utf-8",
        [".mjs"] = "application/javascript; charset=utf-8",
        [".css"] = "text/css; charset=utf-8",
        [".json"] = "application/json; charset=utf-8",
        [".png"] = "image/png",
        [".jpg"] = "image/jpeg",
        [".jpeg"] = "image/jpeg",
        [".gif"] = "image/gif",
        [".svg"] = "image/svg+xml",
        [".ico"] = "image/x-icon",
        [".woff"] = "font/woff",
        [".woff2"] = "font/woff2",
        [".ttf"] = "font/ttf",
        [".map"] = "application/json",
        [".webp"] = "image/webp",
    };

    private readonly HttpListener _listener = new();
    private readonly string _webRoot;
    private readonly int _port;
    private CancellationTokenSource? _cts;

    public StaticWebServer(string webRoot, int port)
    {
        _webRoot = Path.GetFullPath(webRoot);
        _port = port;
    }

    public string BaseUrl => $"http://127.0.0.1:{_port}/";

    public void Start()
    {
        if (!Directory.Exists(_webRoot))
        {
            throw new DirectoryNotFoundException($"Không tìm thấy thư mục web: {_webRoot}");
        }

        _cts = new CancellationTokenSource();
        _listener.Prefixes.Add(BaseUrl);
        _listener.Start();
        _ = Task.Run(() => ListenLoop(_cts.Token));
    }

    public void Stop()
    {
        _cts?.Cancel();
        if (_listener.IsListening)
        {
            _listener.Stop();
        }
    }

    public void Dispose()
    {
        Stop();
        _listener.Close();
        _cts?.Dispose();
    }

    private async Task ListenLoop(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            HttpListenerContext? ctx = null;
            try
            {
                ctx = await _listener.GetContextAsync().WaitAsync(token);
                await HandleRequest(ctx);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch
            {
                if (ctx != null)
                {
                    ctx.Response.StatusCode = 500;
                    ctx.Response.Close();
                }
            }
        }
    }

    private async Task HandleRequest(HttpListenerContext ctx)
    {
        var path = ctx.Request.Url?.AbsolutePath ?? "/";
        if (path == "/") path = "/index.html";

        var relative = path.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
        var filePath = Path.GetFullPath(Path.Combine(_webRoot, relative));

        if (!filePath.StartsWith(_webRoot, StringComparison.OrdinalIgnoreCase))
        {
            ctx.Response.StatusCode = 403;
            ctx.Response.Close();
            return;
        }

        if (!File.Exists(filePath))
        {
            filePath = Path.Combine(_webRoot, "index.html");
            if (!File.Exists(filePath))
            {
                ctx.Response.StatusCode = 404;
                var msg = Encoding.UTF8.GetBytes("404 — chưa export web (TradeScore-web-v1/index.html)");
                ctx.Response.ContentType = "text/plain; charset=utf-8";
                await ctx.Response.OutputStream.WriteAsync(msg);
                ctx.Response.Close();
                return;
            }
        }

        var ext = Path.GetExtension(filePath);
        ctx.Response.ContentType = MimeTypes.GetValueOrDefault(ext, "application/octet-stream");
        ctx.Response.StatusCode = 200;

        await using var fs = File.OpenRead(filePath);
        ctx.Response.ContentLength64 = fs.Length;
        await fs.CopyToAsync(ctx.Response.OutputStream);
        ctx.Response.Close();
    }
}
