using System;
using System.Configuration;
using System.Data;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Threading;

namespace HoursPilot.Desktop;

/// <summary>
/// Interaction logic for App.xaml
/// </summary>
public partial class App : Application
{
    public App()
    {
        DispatcherUnhandledException += App_DispatcherUnhandledException;
        AppDomain.CurrentDomain.UnhandledException += CurrentDomain_UnhandledException;
        TaskScheduler.UnobservedTaskException += TaskScheduler_UnobservedTaskException;
    }

    private void App_DispatcherUnhandledException(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        DesktopLogger.LogException("DispatcherUnhandledException", e.Exception);
        e.Handled = true;
    }

    private void CurrentDomain_UnhandledException(object sender, UnhandledExceptionEventArgs e)
    {
        if (e.ExceptionObject is Exception exception)
        {
            DesktopLogger.LogException("AppDomain.UnhandledException", exception);
        }
        else
        {
            DesktopLogger.Log($"AppDomain.UnhandledException: {e.ExceptionObject}");
        }
    }

    private void TaskScheduler_UnobservedTaskException(object? sender, UnobservedTaskExceptionEventArgs e)
    {
        DesktopLogger.LogException("UnobservedTaskException", e.Exception);
        e.SetObserved();
    }
}

