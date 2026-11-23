// cc-lhm: lê todos os sensores com a LibreHardwareMonitorLib e escreve JSON.
//   cc-lhm --once                  imprime uma leitura e sai
//   cc-lhm --loop                  imprime uma leitura por linha a cada segundo (stdout)
//   cc-lhm --loop --out <arquivo>  grava a leitura no arquivo a cada segundo (tarefa agendada elevada)
using System;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using LibreHardwareMonitor.Hardware;

class UpdateVisitor : IVisitor
{
    public void VisitComputer(IComputer computer) => computer.Traverse(this);
    public void VisitHardware(IHardware hardware) { hardware.Update(); foreach (var sub in hardware.SubHardware) sub.Accept(this); }
    public void VisitSensor(ISensor sensor) { }
    public void VisitParameter(IParameter parameter) { }
}

static class Program
{
    static string Esc(string s) => (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", " ").Replace("\r", " ");
    static string Num(float? v) => v.HasValue && !float.IsNaN(v.Value) && !float.IsInfinity(v.Value) ? v.Value.ToString("0.###", CultureInfo.InvariantCulture) : "null";

    static void Hw(StringBuilder sb, IHardware h)
    {
        sb.Append("{\"name\":\"").Append(Esc(h.Name)).Append("\",\"type\":\"").Append(h.HardwareType).Append("\",\"id\":\"").Append(Esc(h.Identifier.ToString())).Append("\",\"sensors\":[");
        bool first = true;
        foreach (var s in h.Sensors)
        {
            if (!first) sb.Append(','); first = false;
            sb.Append("{\"name\":\"").Append(Esc(s.Name)).Append("\",\"type\":\"").Append(s.SensorType).Append("\",\"value\":").Append(Num(s.Value))
              .Append(",\"min\":").Append(Num(s.Min)).Append(",\"max\":").Append(Num(s.Max)).Append('}');
        }
        sb.Append("],\"sub\":[");
        first = true;
        foreach (var sub in h.SubHardware) { if (!first) sb.Append(','); first = false; Hw(sb, sub); }
        sb.Append("]}");
    }

    static string Snapshot(Computer c)
    {
        c.Accept(new UpdateVisitor());
        var sb = new StringBuilder(64 * 1024);
        sb.Append("{\"at\":").Append(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()).Append(",\"admin\":")
          .Append(new System.Security.Principal.WindowsPrincipal(System.Security.Principal.WindowsIdentity.GetCurrent()).IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator) ? "true" : "false")
          .Append(",\"hardware\":[");
        bool first = true;
        foreach (var h in c.Hardware) { if (!first) sb.Append(','); first = false; Hw(sb, h); }
        sb.Append("]}");
        return sb.ToString();
    }

    static int Main(string[] args)
    {
        bool once = args.Contains("--once");
        int oi = Array.IndexOf(args, "--out");
        string outFile = oi >= 0 && oi + 1 < args.Length ? args[oi + 1] : null;
        var c = new Computer
        {
            IsCpuEnabled = true, IsGpuEnabled = true, IsMemoryEnabled = true, IsMotherboardEnabled = true,
            IsControllerEnabled = true, IsStorageEnabled = true, IsBatteryEnabled = true, IsPsuEnabled = true, IsNetworkEnabled = false,
        };
        try { c.Open(); } catch (Exception e) { Console.Error.WriteLine(e.Message); }
        if (outFile != null) Directory.CreateDirectory(Path.GetDirectoryName(outFile));
        var stdout = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true };
        do
        {
            string json;
            try { json = Snapshot(c); } catch (Exception e) { json = "{\"error\":\"" + Esc(e.Message) + "\"}"; }
            if (outFile != null)
            {
                var tmp = outFile + ".tmp";
                File.WriteAllText(tmp, json, new UTF8Encoding(false));
                if (File.Exists(outFile)) File.Replace(tmp, outFile, null); else File.Move(tmp, outFile);
            }
            else stdout.WriteLine(json);
            if (!once) Thread.Sleep(1000);
        } while (!once);
        c.Close();
        return 0;
    }
}
