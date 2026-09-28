using System;
using System.Drawing;
using System.IO;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal sealed class TrayState
{
    public string label { get; set; }
    public bool canPause { get; set; }
    public bool canResume { get; set; }
    public bool busy { get; set; }
    public string message { get; set; }
    public string updateLabel { get; set; }
}

internal sealed class TrayContext : ApplicationContext
{
    private readonly Control dispatcher = new Control();
    private readonly NotifyIcon icon;
    private readonly ToolStripMenuItem status = new ToolStripMenuItem("앱에 연결하는 중");
    private readonly ToolStripMenuItem open = new ToolStripMenuItem("화면 열기");
    private readonly ToolStripMenuItem settings = new ToolStripMenuItem("환경설정");
    private readonly ToolStripMenuItem updates = new ToolStripMenuItem("업데이트 확인");
    private readonly ToolStripMenuItem pause = new ToolStripMenuItem("작업 중지");
    private readonly ToolStripMenuItem resume = new ToolStripMenuItem("작업 재개");
    private readonly ToolStripMenuItem quit = new ToolStripMenuItem("앱 종료");
    private bool closing;
    private bool busy;

    public TrayContext()
    {
        IntPtr handle = dispatcher.Handle;
        status.Enabled = pause.Enabled = resume.Enabled = false;
        ContextMenuStrip menu = new ContextMenuStrip();
        menu.Items.AddRange(new ToolStripItem[] { status, new ToolStripSeparator(), open, settings, updates,
            new ToolStripSeparator(), pause, resume, new ToolStripSeparator(), quit });
        icon = new NotifyIcon { Text = "메일 분석실", Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath), ContextMenuStrip = menu, Visible = true };
        open.Click += delegate { Send("open"); };
        settings.Click += delegate { Send("settings"); };
        updates.Click += delegate { Send("updates"); };
        pause.Click += delegate { Send("pause"); };
        resume.Click += delegate { Send("resume"); };
        quit.Click += delegate { Send("quit"); };
        icon.DoubleClick += delegate { Send("open"); };
        Thread reader = new Thread(ReadState);reader.IsBackground = true;reader.Start();
        Console.WriteLine("ready");Console.Out.Flush();
    }
    private void Send(string command)
    {
        if (closing || busy) return;
        busy = true;open.Enabled = settings.Enabled = updates.Enabled = pause.Enabled = resume.Enabled = quit.Enabled = false;
        try { Console.WriteLine(command);Console.Out.Flush(); }
        catch { ExitThread(); }
    }
    private void ReadState()
    {
        try
        {
            string line;JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 8192 };
            while ((line = Console.ReadLine()) != null)
            {
                if (line.Length > 8192) break;
                TrayState state = json.Deserialize<TrayState>(line);
                dispatcher.BeginInvoke((Action)(() => Apply(state)));
            }
        }
        catch { }
        try { dispatcher.BeginInvoke((Action)(() => ExitThread())); } catch { }
    }
    private void Apply(TrayState state)
    {
        if (closing || state == null) return;
        busy = state.busy;
        status.Text = state.label ?? "상태 확인 필요";
        string text = "메일 분석실 · " + status.Text;icon.Text = text.Length > 63 ? text.Substring(0, 63) : text;
        updates.Text = state.updateLabel ?? "업데이트 확인";
        open.Enabled = settings.Enabled = updates.Enabled = quit.Enabled = !busy;
        pause.Enabled = !busy && state.canPause;resume.Enabled = !busy && state.canResume;
        if (!String.IsNullOrEmpty(state.message))
        { icon.BalloonTipTitle = "메일 분석실";icon.BalloonTipText = state.message;icon.ShowBalloonTip(5000); }
    }
    protected override void ExitThreadCore()
    {
        if (!closing) { closing = true;icon.Visible = false;icon.Icon.Dispose();icon.ContextMenuStrip.Dispose();icon.Dispose();dispatcher.Dispose(); }
        base.ExitThreadCore();
    }
}
internal static class TrayProgram
{
    [STAThread]
    private static void Main()
    {
        // A WinExe has redirected pipes but no console code page to change.
        Console.SetIn(new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false)));
        Console.SetOut(new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true });
        Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new TrayContext());
    }
}
