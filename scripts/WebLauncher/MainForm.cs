using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace TradeScore.WebLauncher;

internal sealed class MainForm : Form
{
    private readonly WebView2 _webView = new() { Dock = DockStyle.Fill };
    private readonly string _startUrl;
    private readonly string _userDataDir;
    private bool _allowClose;

    public MainForm(string startUrl, string userDataDir)
    {
        _startUrl = startUrl;
        _userDataDir = userDataDir;
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
