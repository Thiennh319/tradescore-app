using System.Text;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace TradeScore.WebLauncher;

internal sealed class MainForm : Form
{
    private readonly WebView2 _webView = new() { Dock = DockStyle.Fill };
    private readonly string _startUrl;
    private readonly string _userDataDir;
    private readonly string _appRoot;
    private bool _allowClose;

    private static readonly HashSet<string> SafeSubdirs = new(StringComparer.Ordinal)
    {
        "journal",
        "market-raw",
    };

    private static readonly HashSet<string> SafePrefixes = new(StringComparer.Ordinal)
    {
        "journal",
        "market_raw",
    };

    public MainForm(string startUrl, string userDataDir, string appRoot)
    {
        _startUrl = startUrl;
        _userDataDir = userDataDir;
        _appRoot = appRoot;
        Text = "TradeScore";
        Width = 1280;
        Height = 860;
        MinimumSize = new Size(960, 640);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(11, 14, 17);
        Icon = SystemIcons.Application;
        Controls.Add(_webView);
        Load += OnFormLoad;
        FormClosing += OnFormClosing;
    }

    private async void OnFormLoad(object? sender, EventArgs e)
    {
        try
        {
            Directory.CreateDirectory(_userDataDir);
            var env = await CoreWebView2Environment.CreateAsync(null, _userDataDir);
            await _webView.EnsureCoreWebView2Async(env);
            _webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
            _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
            _webView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;
            _webView.Source = new Uri(_startUrl);
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"Không mở được WebView2.\n\n{ex.Message}\n\nCài WebView2 Runtime:\nhttps://developer.microsoft.com/microsoft-edge/webview2/",
                "TradeScore",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            Close();
        }
    }

    private void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            var json = e.WebMessageAsJson;
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (!root.TryGetProperty("type", out var typeEl)) return;
            var type = typeEl.GetString();

            string subdir;
            string filePrefix;
            string resultType;

            if (type == "JOURNAL_JSONL_APPEND")
            {
                subdir = "journal";
                filePrefix = "journal";
                resultType = "JOURNAL_JSONL_APPEND_RESULT";
            }
            else if (type == "DISK_JSONL_APPEND")
            {
                subdir = root.TryGetProperty("subdir", out var sd) ? sd.GetString() ?? "" : "";
                filePrefix = root.TryGetProperty("filePrefix", out var fp) ? fp.GetString() ?? "" : "";
                resultType = "DISK_JSONL_APPEND_RESULT";
                if (!SafeSubdirs.Contains(subdir) || !SafePrefixes.Contains(filePrefix))
                {
                    var badId = root.TryGetProperty("requestId", out var br)
                        ? br.GetString() ?? ""
                        : "";
                    PostJsonlResult(resultType, badId, ok: false, error: "UNSAFE_PATH");
                    return;
                }
            }
            else
            {
                return;
            }

            var requestId = root.TryGetProperty("requestId", out var ridEl)
                ? ridEl.GetString() ?? ""
                : "";
            var date = root.TryGetProperty("date", out var dateEl)
                ? dateEl.GetString() ?? ""
                : "";

            if (!IsSafeJournalDate(date))
            {
                PostJsonlResult(resultType, requestId, ok: false, error: "INVALID_DATE");
                return;
            }

            if (!root.TryGetProperty("lines", out var linesEl) || linesEl.ValueKind != JsonValueKind.Array)
            {
                PostJsonlResult(resultType, requestId, ok: false, error: "MISSING_LINES");
                return;
            }

            var lines = new List<string>();
            foreach (var item in linesEl.EnumerateArray())
            {
                if (item.ValueKind == JsonValueKind.String)
                {
                    var line = item.GetString();
                    if (!string.IsNullOrEmpty(line)) lines.Add(line);
                }
            }

            var dir = Path.Combine(_appRoot, "data", subdir);
            Directory.CreateDirectory(dir);
            var path = Path.Combine(dir, $"{filePrefix}_{date}.jsonl");

            if (lines.Count > 0)
            {
                var sb = new StringBuilder();
                foreach (var line in lines)
                {
                    sb.Append(line);
                    if (!line.EndsWith('\n')) sb.Append('\n');
                }
                File.AppendAllText(path, sb.ToString(), new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
            }

            PostJsonlResult(resultType, requestId, ok: true, path: path);
        }
        catch (Exception ex)
        {
            try
            {
                PostJsonlResult("DISK_JSONL_APPEND_RESULT", "", ok: false, error: ex.Message);
            }
            catch
            {
                // ignore nested failure
            }
        }
    }

    private static bool IsSafeJournalDate(string date)
    {
        if (string.IsNullOrEmpty(date) || date.Length != 10) return false;
        if (date[4] != '-' || date[7] != '-') return false;
        for (var i = 0; i < date.Length; i++)
        {
            if (i == 4 || i == 7) continue;
            if (!char.IsDigit(date[i])) return false;
        }
        return true;
    }

    private void PostJsonlResult(string resultType, string requestId, bool ok, string? error = null, string? path = null)
    {
        var payload = new Dictionary<string, object?>
        {
            ["type"] = resultType,
            ["requestId"] = requestId,
            ["ok"] = ok,
        };
        if (error != null) payload["error"] = error;
        if (path != null) payload["path"] = path;
        var json = JsonSerializer.Serialize(payload);
        _webView.CoreWebView2?.PostWebMessageAsJson(json);
    }

    private async void OnFormClosing(object? sender, FormClosingEventArgs e)
    {
        if (_allowClose) return;

        e.Cancel = true;
        try
        {
            if (_webView.CoreWebView2 != null)
            {
                await _webView.CoreWebView2.ExecuteScriptAsync(
                    """
                    (async () => {
                      try {
                        document.dispatchEvent(new Event('visibilitychange'));
                        window.dispatchEvent(new Event('pagehide'));
                        if (typeof window.__tradescoreFlushPersist === 'function') {
                          await window.__tradescoreFlushPersist();
                        }
                      } catch (_) {}
                    })();
                    """);
                await Task.Delay(350);
            }
        }
        catch
        {
            // ignore — localStorage đã ghi từng lần thao tác
        }

        _allowClose = true;
        Close();
    }
}
