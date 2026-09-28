param([Parameter(Mandatory=$true)][string]$TrayDirectory)
$ErrorActionPreference='Stop'
$root=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$output=(Resolve-Path -LiteralPath $TrayDirectory).Path
$harness=Join-Path $output 'TrayTest.cs'
$executable=Join-Path $output 'TrayTest.exe'
$source=@'
using System;
using System.Reflection;
using System.Windows.Forms;
internal static class TrayTest {
    static object Field(TrayContext context,string name) { return typeof(TrayContext).GetField(name,BindingFlags.NonPublic|BindingFlags.Instance).GetValue(context); }
    static void Check(bool result,string name) { if(!result)throw new Exception(name); }
    [STAThread] static int Main() {
        Console.InputEncoding=new System.Text.UTF8Encoding(false);Console.OutputEncoding=new System.Text.UTF8Encoding(false);
        Application.EnableVisualStyles();var context=new TrayContext();var timer=new Timer { Interval=100 };int result=0;
        timer.Tick+=delegate {
            timer.Stop();try {
                var apply=typeof(TrayContext).GetMethod("Apply",BindingFlags.NonPublic|BindingFlags.Instance);
                var state=new TrayState {label="synthetic",canPause=true,canResume=false};apply.Invoke(context,new object[]{state});
                Check(((NotifyIcon)Field(context,"icon")).Visible,"visible");
                Check(((ToolStripMenuItem)Field(context,"pause")).Enabled,"pause enabled");
                Check(!((ToolStripMenuItem)Field(context,"resume")).Enabled,"resume disabled");
                state.updateLabel="new update";apply.Invoke(context,new object[]{state});
                Check(((ToolStripMenuItem)Field(context,"updates")).Text=="new update","update label");
                foreach(string name in new[]{"open","settings","updates","pause","resume","quit"}) {
                    state.canResume=true;apply.Invoke(context,new object[]{state});((ToolStripMenuItem)Field(context,name)).PerformClick();
                    Check(!((ToolStripMenuItem)Field(context,"quit")).Enabled,"busy disabled");
                }
                context.ExitThread();Check(!((NotifyIcon)Field(context,"icon")).Visible,"hidden after exit");
                Console.WriteLine("native-menu-passed");
            }catch(Exception error){Console.Error.WriteLine(error);result=1;context.ExitThread();}
        };
        timer.Start();Application.Run(context);timer.Dispose();return result;
    }
}
'@
[IO.File]::WriteAllText($harness,$source,(New-Object Text.UTF8Encoding($false)))
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $compiler /nologo /target:exe /platform:x64 /main:TrayTest "/out:$executable" "/win32icon:$(Join-Path $output 'mail-triage.ico')" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll (Join-Path $root 'installer/windows/tray.cs') $harness
if($LASTEXITCODE -ne 0){throw 'TRAY_TEST_BUILD_FAILED'}
$start=New-Object Diagnostics.ProcessStartInfo
$start.FileName=$executable;$start.UseShellExecute=$false;$start.CreateNoWindow=$true
$start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
$process=[Diagnostics.Process]::Start($start)
try {
    if(-not $process.WaitForExit(15000)) { $process.Kill();throw 'TRAY_TEST_TIMEOUT' }
    $actual=$process.StandardOutput.ReadToEnd().Trim();$errors=$process.StandardError.ReadToEnd()
    if($process.ExitCode -ne 0 -or ($actual -replace "`r",'') -ne "ready`nopen`nsettings`nupdates`npause`nresume`nquit`nnative-menu-passed"){throw "TRAY_MENU_TEST_FAILED $actual $errors"}
}finally{$process.Dispose()}
$start.FileName=Join-Path $output 'mail-triage-tray.exe'
$process=[Diagnostics.Process]::Start($start)
try {
    $ready=$process.StandardOutput.ReadLineAsync()
    if(-not $ready.Wait(15000) -or $ready.Result -ne 'ready'){throw 'TRAY_READY_FAILED'}
    $process.StandardInput.WriteLine('{"label":"synthetic","canPause":true,"canResume":false,"busy":false}')
    $process.StandardInput.Close()
    if(-not $process.WaitForExit(5000)){throw 'TRAY_PARENT_PIPE_CLOSE_FAILED'}
    if($process.ExitCode -ne 0){throw 'TRAY_PROCESS_FAILED'}
}finally{if(-not $process.HasExited){$process.Kill()};$process.Dispose()}
[pscustomobject]@{nativeMenuCommands=$true;busyGuard=$true;iconCleanup=$true;parentPipeExit=$true;desktopClickVerified=$false}|ConvertTo-Json -Compress
