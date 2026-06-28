using System.Diagnostics;
using System.Net;

namespace TradeScore.WebLauncher;

internal static class Program
{
    private const int Port = 5173;

    [STAThread]
    private static int Main()
    {
        ApplicationConfiguration.Initialize();

        var appRoot = ResolveAppRoot();
        var webDir = Path.Combine(appRoot, "TradeScore-web-v1");
        var indexPath = Path.Combine(webDir, "index.html");

        if (!File.Exists(indexPath))
        {
            MessageBox.Show(
                "Chưa có bản web trong thư mục TradeScore-web-v1.\n\n" +
                "Trong thư mục project chạy:\n" +
                "  npm run build:web-exe\n\n" +
                "Hoặc export thủ công:\n" +
                "  npx expo export --platform web --output-dir TradeScore-web-v1",
                "TradeScore",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return 1;
        }

        StaticWebServer? server = null;
        try
        {
            server = new StaticWebServer(webDir, Port);
            server.Start();
        }
        catch (HttpListenerException ex)
        {
            var url = $"http://127.0.0.1:{Port}/";
            if (IsServerUp(url))
            {
                return OpenExisting(url);
            }

            MessageBox.Show(
                $"Không khởi động được server cổng {Port}.\n\n{ex.Message}",
                "TradeScore",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return 1;
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "TradeScore", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }

        try
        {
            Application.Run(new MainForm(server.BaseUrl, ResolveUserDataDir(appRoot)));
            return 0;
        }
        finally
        {
            server.Dispose();
        }
    }

    private static string ResolveUserDataDir(string appRoot)
    {
        // Phase 1: localStorage/IndexedDB WebView2 — cố định cạnh EXE, không mất khi tắt app
        return Path.Combine(appRoot, "TradeScore-data", "webview");
    }

    private static string ResolveAppRoot()
    {
        var exeDir = Path.GetDirectoryName(Environment.ProcessPath);
        if (!string.IsNullOrEmpty(exeDir))
        {
            return exeDir;
        }

        return AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
    }

    private static bool IsServerUp(string url)
    {
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
            using var res = http.GetAsync(url).GetAwaiter().GetResult();
            return res.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    private static int OpenExisting(string url)
    {
        try
        {
            Application.Run(new MainForm(url, ResolveUserDataDir(ResolveAppRoot())));
            return 0;
        }
        catch
        {
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            return 0;
        }
    }
}
