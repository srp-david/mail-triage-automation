using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;

// Compiled only by build-windows-setup.ps1. The embedded ZIP is a candidate
// payload; manage.mjs still verifies its complete manifest before activation.
internal static class Setup
{
    private const string PayloadSha256 = "__PAYLOAD_SHA256__";
    private static readonly string TempBase = Path.GetFullPath(Path.GetTempPath()).TrimEnd('\\') + "\\";

    private static int Main(string[] args)
    {
        string home = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MailTriagePilot");
        bool shortcuts = true;
        bool waitForStop = false, restart = false;
        for (int i = 0; i < args.Length; i++)
        {
            if ((args[i] == "--home" || args[i] == "--test-home") && i + 1 < args.Length) home = Path.GetFullPath(args[++i]);
            else if (args[i] == "--no-shortcuts") shortcuts = false;
            else if (args[i] == "--wait-for-stop") waitForStop = true;
            else if (args[i] == "--restart") restart = true;
            else { Console.Error.WriteLine("Usage: MailTriageSetup.exe [--home PATH --no-shortcuts --wait-for-stop --restart]"); return 2; }
        }
        string stage = Path.GetFullPath(Path.Combine(Path.GetTempPath(), "MailTriageSetup-" + Guid.NewGuid().ToString("N")));
        if (!stage.StartsWith(TempBase, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("UNSAFE_TEMP_PATH");
        try
        {
            Directory.CreateDirectory(stage);
            string zipPath = Path.Combine(stage, "payload.zip");
            using (Stream embedded = Assembly.GetExecutingAssembly().GetManifestResourceStream("Payload.zip"))
            {
                if (embedded == null) throw new InvalidOperationException("PAYLOAD_MISSING");
                using (FileStream output = new FileStream(zipPath, FileMode.CreateNew)) embedded.CopyTo(output);
            }
            if (!string.Equals(Sha256(zipPath), PayloadSha256, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("PAYLOAD_CHECKSUM_MISMATCH");
            string payload = Path.Combine(stage, "payload");
            Extract(zipPath, payload);
            if (waitForStop)
            {
                for (int attempt = 0; attempt < 120 && File.Exists(Path.Combine(home, "app.lock")); attempt++)
                    System.Threading.Thread.Sleep(500);
                if (File.Exists(Path.Combine(home, "app.lock"))) throw new InvalidOperationException("APP_STOP_TIMEOUT");
            }
            Console.WriteLine("설치 파일 검증을 마쳤습니다. 앱을 설치합니다.");
            Run(Path.Combine(payload, "node.exe"),
                Quote(Path.Combine(payload, "installer", "manage.mjs")) + " install " + Quote(home) + " " + Quote(payload) + " --candidate", payload);
            string settings = Path.Combine(home, "config", "settings.json");
            if (!File.Exists(settings)) WriteFirstSettings(settings);
            if (shortcuts) CreateShortcuts(home);
            if (restart)
            {
                try { StartInstalled(home); }
                catch
                {
                    Run(Path.Combine(payload, "node.exe"), Quote(Path.Combine(payload, "installer", "manage.mjs")) + " rollback " + Quote(home), payload);
                    StartInstalled(home);
                    throw new InvalidOperationException("UPDATE_RESTART_FAILED_ROLLED_BACK");
                }
            }
            Console.WriteLine("설치가 완료되었습니다. 시작 메뉴의 'Mail Triage 실행'을 사용하세요.");
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine("설치 실패: " + error.Message);
            return 1;
        }
        finally
        {
            // This directory was constructed under TEMP with a unique fixed prefix.
            if (stage.StartsWith(TempBase + "MailTriageSetup-", StringComparison.OrdinalIgnoreCase) && Directory.Exists(stage))
                try { Directory.Delete(stage, true); } catch { Console.Error.WriteLine("임시 설치 파일을 정리하지 못했습니다: " + stage); }
        }
    }

    private static string Sha256(string path)
    {
        using (SHA256 hash = SHA256.Create())
        using (FileStream file = File.OpenRead(path)) return BitConverter.ToString(hash.ComputeHash(file)).Replace("-", "").ToLowerInvariant();
    }

    private static void Extract(string zipPath, string destination)
    {
        Directory.CreateDirectory(destination);
        string prefix = Path.GetFullPath(destination).TrimEnd('\\') + "\\";
        long total = 0;
        int count = 0;
        using (ZipArchive archive = ZipFile.OpenRead(zipPath))
        foreach (ZipArchiveEntry entry in archive.Entries)
        {
            if (++count > 10000 || (total += entry.Length) > 750L * 1024 * 1024) throw new InvalidOperationException("PAYLOAD_TOO_LARGE");
            string name = entry.FullName.Replace('/', '\\');
            if (name.StartsWith("\\") || name.IndexOf(':') >= 0 || name.Split('\\').Contains("..")) throw new InvalidOperationException("UNSAFE_PAYLOAD_PATH");
            string target = Path.GetFullPath(Path.Combine(destination, name));
            if (!target.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("UNSAFE_PAYLOAD_PATH");
            if (entry.Name.Length == 0) { Directory.CreateDirectory(target); continue; }
            Directory.CreateDirectory(Path.GetDirectoryName(target));
            using (Stream input = entry.Open())
            using (FileStream output = new FileStream(target, FileMode.CreateNew)) input.CopyTo(output);
        }
    }

    private static string Quote(string value) { return "\"" + value + "\""; }
    private static void Run(string executable, string arguments, string workingDirectory)
    {
        ProcessStartInfo start = new ProcessStartInfo(executable, arguments);
        start.WorkingDirectory = workingDirectory;
        start.UseShellExecute = false;
        start.CreateNoWindow = true;
        start.RedirectStandardOutput = true;
        start.RedirectStandardError = true;
        using (Process child = Process.Start(start))
        {
            string output = child.StandardOutput.ReadToEnd();
            string error = child.StandardError.ReadToEnd();
            child.WaitForExit();
            if (child.ExitCode != 0) throw new InvalidOperationException("APP_INSTALL_FAILED " + error.Trim());
            Console.WriteLine(output.Trim());
        }
    }

    private static string Json(string value)
    {
        StringBuilder result = new StringBuilder("\"");
        foreach (char c in value)
        {
            if (c == '"' || c == '\\') result.Append('\\').Append(c);
            else if (c < 32) throw new InvalidOperationException("INVALID_SERVER_SETTING");
            else result.Append(c);
        }
        return result.Append('"').ToString();
    }

    private static void WriteFirstSettings(string path)
    {
        Console.WriteLine("첫 설치: 공용 서버 주소를 입력하세요. 비밀번호나 토큰은 입력하지 않습니다.");
        Console.Write("공용 API URL (https://.../functions/v1/history): ");
        string history = (Console.ReadLine() ?? "").Trim();
        Console.Write("인증 issuer URL (https://.../history-auth): ");
        string issuer = (Console.ReadLine() ?? "").Trim();
        Uri api, auth;
        if (!Uri.TryCreate(history, UriKind.Absolute, out api) || api.Scheme != Uri.UriSchemeHttps ||
            !Uri.TryCreate(issuer, UriKind.Absolute, out auth) || auth.Scheme != Uri.UriSchemeHttps ||
            api.UserInfo.Length != 0 || auth.UserInfo.Length != 0)
            throw new InvalidOperationException("HTTPS_SERVER_SETTINGS_REQUIRED");
        string content = "{\"localPort\":43180,\"historyUrl\":" + Json(history) +
            ",\"auth\":{\"mode\":\"username\",\"issuer\":" + Json(issuer) +
            ",\"audience\":\"mail-triage\"},\"evidenceRoots\":{}}";
        using (FileStream file = new FileStream(path, FileMode.CreateNew))
        using (StreamWriter writer = new StreamWriter(file, new UTF8Encoding(false))) writer.Write(content);
    }

    private static void CreateShortcuts(string home)
    {
        string menu = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Mail Triage");
        Directory.CreateDirectory(menu);
        string script = Path.Combine(home, "control.ps1");
        if (!File.Exists(script)) throw new InvalidOperationException("CONTROL_SCRIPT_MISSING");
        Shortcut(menu, "Mail Triage 실행", script, "start");
        Shortcut(menu, "Mail Triage 작업 중지", script, "pause");
        Shortcut(menu, "Mail Triage 앱 종료", script, "quit");
    }

    private static void Shortcut(string menu, string title, string script, string action)
    {
        Type kind = Type.GetTypeFromProgID("WScript.Shell");
        if (kind == null) throw new InvalidOperationException("SHORTCUT_UNAVAILABLE");
        dynamic shell = Activator.CreateInstance(kind);
        dynamic link = shell.CreateShortcut(Path.Combine(menu, title + ".lnk"));
        link.TargetPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
        link.Arguments = "-NoProfile -ExecutionPolicy Bypass -File " + Quote(script) + " " + action;
        link.WorkingDirectory = Path.GetDirectoryName(script);
        link.WindowStyle = 7;
        link.Description = title;
        link.Save();
    }

    private static void StartInstalled(string home)
    {
        string powershell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
        Run(powershell, "-NoProfile -ExecutionPolicy Bypass -File " + Quote(Path.Combine(home, "control.ps1")) + " start", home);
    }
}
