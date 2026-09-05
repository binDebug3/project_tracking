using System;
using System.IO;

namespace HoursPilot.Desktop;

internal static class DesktopLogger
{
    private static readonly string LogDirectory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "HoursPilot",
        "logs"
    );

    private static readonly string LogFilePath = Path.Combine(LogDirectory, "desktop.log");

    public static void Log(string message)
    {
        try
        {
            Directory.CreateDirectory(LogDirectory);
            File.AppendAllText(LogFilePath, $"{DateTime.Now:O} {message}{Environment.NewLine}");
        }
        catch
        {
            // Best effort only; logging should never crash the app.
        }
    }

    public static void LogException(string context, Exception exception)
    {
        Log($"{context}: {exception.GetType().FullName}: {exception.Message}{Environment.NewLine}{exception.StackTrace}");
    }
}
