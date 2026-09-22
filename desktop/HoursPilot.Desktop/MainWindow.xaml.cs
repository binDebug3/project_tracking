using System;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows;
using Microsoft.Win32;
using Microsoft.Web.WebView2.Core;

namespace HoursPilot.Desktop;

/// <summary>
/// Interaction logic for MainWindow.xaml
/// </summary>
public partial class MainWindow : Window
{
    private readonly string settingsDirectory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "HoursPilot"
    );

    private string SettingsFilePath => Path.Combine(settingsDirectory, "csv-path.txt");

    private string? currentCsvPath;

    public MainWindow()
    {
        InitializeComponent();
        Loaded += MainWindowLoaded;
    }

    private async void MainWindowLoaded(object sender, RoutedEventArgs e)
    {
        try
        {
            var appIndexPath = Path.Combine(AppContext.BaseDirectory, "app", "index.html");
            DesktopLogger.Log($"Starting HoursPilot desktop host. BaseDirectory={AppContext.BaseDirectory}");
            DesktopLogger.Log($"Expected app index path: {appIndexPath}");

            if (!File.Exists(appIndexPath))
            {
                DesktopLogger.Log($"App index file missing: {appIndexPath}");
                MessageBox.Show(
                    $"Could not find app files at:{Environment.NewLine}{appIndexPath}",
                    "Time Sheet",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error
                );
                return;
            }

            DesktopLogger.Log("Ensuring WebView2 is initialized.");
            await Browser.EnsureCoreWebView2Async();

            if (Browser.CoreWebView2 is null)
            {
                DesktopLogger.Log("WebView2 CoreWebView2 is null after EnsureCoreWebView2Async.");
                MessageBox.Show("WebView2 failed to initialize. Please verify the WebView2 runtime is installed and try again.", "Time Sheet", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            Browser.CoreWebView2.WebMessageReceived += BrowserWebMessageReceived;
            await Browser.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(@"
                window.addEventListener('keydown', function (event) {
                    if (event.ctrlKey && event.key.toLowerCase() === 'w') {
                        event.preventDefault();
                        chrome.webview.postMessage({ type: 'close-app' });
                    }
                });
            ");

            var appUri = new Uri(appIndexPath, UriKind.Absolute);
            Browser.Source = appUri;
            DesktopLogger.Log($"Navigating to {appUri}.");
        }
        catch (Exception ex)
        {
            DesktopLogger.LogException("MainWindowLoaded startup failed", ex);
            MessageBox.Show(
                $"Time Sheet failed to start.{Environment.NewLine}{Environment.NewLine}{ex.GetType().Name}:{Environment.NewLine}{ex.Message}",
                "Time Sheet",
                MessageBoxButton.OK,
                MessageBoxImage.Error
            );
        }
    }

    private async void BrowserWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            using var json = JsonDocument.Parse(e.WebMessageAsJson);

            if (json.RootElement.ValueKind == JsonValueKind.String)
            {
                if (string.Equals(json.RootElement.GetString(), "close-app", StringComparison.Ordinal))
                {
                    Close();
                }
                return;
            }

            if (!json.RootElement.TryGetProperty("type", out var typeProperty))
            {
                return;
            }

            var type = typeProperty.GetString();
            switch (type)
            {
                case "close-app":
                    Close();
                    break;
                case "csv-init":
                    await HandleCsvInitAsync();
                    break;
                case "csv-pick":
                    await HandleCsvPickAsync();
                    break;
                case "csv-write":
                    await HandleCsvWriteAsync(json.RootElement);
                    break;
            }
        }
        catch (Exception ex)
        {
            DesktopLogger.LogException("BrowserWebMessageReceived failed", ex);
            PostStatus("CSV backend initialization failed. Using local storage only.");
        }
    }

    private async Task HandleCsvInitAsync()
    {
        currentCsvPath = LoadRememberedCsvPath();
        if (string.IsNullOrWhiteSpace(currentCsvPath) || !File.Exists(currentCsvPath))
        {
            PostStatus("No CSV connected", connected: false);
            return;
        }

        await PostCsvLoadedAsync(currentCsvPath);
    }

    private async Task HandleCsvPickAsync()
    {
        var dialog = new OpenFileDialog
        {
            Filter = "CSV files (*.csv)|*.csv|All files (*.*)|*.*",
            CheckFileExists = true,
            Multiselect = false,
            InitialDirectory = GetInitialCsvDirectory()
        };

        if (dialog.ShowDialog(this) != true)
        {
            PostStatus("CSV connection canceled.", connected: !string.IsNullOrWhiteSpace(currentCsvPath), fileName: currentCsvPath is null ? null : Path.GetFileName(currentCsvPath));
            return;
        }

        currentCsvPath = dialog.FileName;
        RememberCsvPath(currentCsvPath);
        await PostCsvLoadedAsync(currentCsvPath);
    }

    private async Task HandleCsvWriteAsync(JsonElement root)
    {
        if (string.IsNullOrWhiteSpace(currentCsvPath))
        {
            PostStatus("No CSV connected", connected: false);
            return;
        }

        var csvText = root.TryGetProperty("csvText", out var csvProperty) ? csvProperty.GetString() ?? string.Empty : string.Empty;
        await File.WriteAllTextAsync(currentCsvPath, csvText);
        var rowCount = root.TryGetProperty("rowCount", out var rowCountProperty) ? rowCountProperty.GetInt32() : 0;
        PostStatus($"Auto-synced {rowCount} entries.", connected: true, fileName: Path.GetFileName(currentCsvPath));
    }

    private async Task PostCsvLoadedAsync(string csvPath)
    {
        var csvText = await File.ReadAllTextAsync(csvPath);
        var payload = JsonSerializer.Serialize(new
        {
            type = "csv-loaded",
            fileName = Path.GetFileName(csvPath),
            csvText
        });
        Browser.CoreWebView2.PostWebMessageAsJson(payload);
    }

    private void PostStatus(string status, bool connected = false, string? fileName = null)
    {
        var payload = JsonSerializer.Serialize(new
        {
            type = "csv-status",
            status,
            connected,
            fileName
        });
        Browser.CoreWebView2.PostWebMessageAsJson(payload);
    }

    private string? LoadRememberedCsvPath()
    {
        try
        {
            Directory.CreateDirectory(settingsDirectory);
            if (File.Exists(SettingsFilePath))
            {
                var rememberedPath = File.ReadAllText(SettingsFilePath).Trim();
                if (!string.IsNullOrWhiteSpace(rememberedPath) && File.Exists(rememberedPath))
                {
                    return rememberedPath;
                }
            }

            var bundledSample = Path.Combine(AppContext.BaseDirectory, "app", "data", "synthetic-two-weeks.csv");
            return File.Exists(bundledSample) ? bundledSample : null;
        }
        catch
        {
            return null;
        }
    }

    private void RememberCsvPath(string csvPath)
    {
        Directory.CreateDirectory(settingsDirectory);
        File.WriteAllText(SettingsFilePath, csvPath);
    }

    private string GetInitialCsvDirectory()
    {
        if (!string.IsNullOrWhiteSpace(currentCsvPath))
        {
            var currentDirectory = Path.GetDirectoryName(currentCsvPath);
            if (!string.IsNullOrWhiteSpace(currentDirectory) && Directory.Exists(currentDirectory))
            {
                return currentDirectory;
            }
        }

        var bundledDirectory = Path.Combine(AppContext.BaseDirectory, "app", "data");
        if (Directory.Exists(bundledDirectory))
        {
            return bundledDirectory;
        }

        return Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
    }
}
