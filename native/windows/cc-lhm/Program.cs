// cc-lhm: lê todos os sensores com a LibreHardwareMonitorLib e escreve JSON.
//   cc-lhm --once                  imprime uma leitura e sai
//   cc-lhm --loop                  imprime uma leitura por linha a cada segundo (stdout)
//   cc-lhm --loop --out <arquivo>  grava a leitura no arquivo a cada segundo (tarefa agendada elevada)
//                                  e sai sozinho quando o CleanCode fecha (o app reabre a tarefa ao precisar).
//                                  Assim nada fica rodando à toa e o instalador consegue atualizar o helper.
//
// Abertura em etapas (issue #1): em alguns PCs, abrir o processador ou a placa-mãe trava ou derruba o processo,
// principalmente quando o helper roda como administrador sem o driver PawnIO. Antes, esse problema fazia todas as
// leituras sumirem. Agora o helper abre primeiro as peças seguras (placa de vídeo, discos, memória e bateria) e
// já começa a escrever leituras. Depois, numa thread separada e com tempo limite, ele abre o processador, a
// placa-mãe e os controladores. Se uma dessas peças travar ou derrubar o processo, ela fica de fora por um dia,
// e o resto continua funcionando. O estado de cada etapa vai no JSON ("groups") para o app explicar o que houve.
using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.ExceptionServices;
using System.Security;
using System.Text;
using System.Threading;
using System.Diagnostics;
using LibreHardwareMonitor.Hardware;

static class Program
{
    static string Esc(string s) => (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", " ").Replace("\r", " ");
    static string Num(float? v) => v.HasValue && !float.IsNaN(v.Value) && !float.IsInfinity(v.Value) ? v.Value.ToString("0.###", CultureInfo.InvariantCulture) : "null";

    // estado de cada etapa: "pending", "ok", "timeout", "skipped" (travou ou caiu antes) ou "error: mensagem"
    static readonly ConcurrentDictionary<string, string> Groups = new ConcurrentDictionary<string, string>();
    // peças cuja atualização travou: deixam de ser atualizadas, para não parar as outras leituras
    static readonly ConcurrentDictionary<string, bool> Stuck = new ConcurrentDictionary<string, bool>();

    static readonly string MarkerDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CleanCode", "lhm");
    static string Marker(string group) => Path.Combine(MarkerDir, "opening-" + group);

    static void Hw(StringBuilder sb, IHardware h)
    {
        sb.Append("{\"name\":\"").Append(Esc(h.Name)).Append("\",\"type\":\"").Append(h.HardwareType).Append("\",\"id\":\"").Append(Esc(h.Identifier.ToString()))
          .Append("\",\"stuck\":").Append(Stuck.ContainsKey(h.Identifier.ToString()) ? "true" : "false").Append(",\"sensors\":[");
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

    /// <summary>Atualiza uma peça com tempo limite. Se a atualização travar, a peça é marcada e não é mais atualizada.</summary>
    static void UpdateWithTimeout(IHardware h)
    {
        var id = h.Identifier.ToString();
        if (Stuck.ContainsKey(id)) return;
        var t = new Thread(() =>
        {
            try { h.Update(); foreach (var sub in h.SubHardware) sub.Update(); } catch { /* leitura falhou nesta rodada */ }
        }) { IsBackground = true };
        t.Start();
        if (!t.Join(4000)) Stuck[id] = true;
    }

    static string Snapshot(Computer c, bool pawnio)
    {
        IHardware[] list;
        try { list = c.Hardware.ToArray(); } catch { list = new IHardware[0]; }
        foreach (var h in list) UpdateWithTimeout(h);
        var sb = new StringBuilder(64 * 1024);
        sb.Append("{\"at\":").Append(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()).Append(",\"admin\":")
          .Append(IsAdmin() ? "true" : "false").Append(",\"pawnio\":").Append(pawnio ? "true" : "false").Append(",\"groups\":{");
        bool first = true;
        foreach (var kv in Groups) { if (!first) sb.Append(','); first = false; sb.Append('"').Append(kv.Key).Append("\":\"").Append(Esc(kv.Value)).Append('"'); }
        sb.Append("},\"hardware\":[");
        first = true;
        foreach (var h in list)
        {
            var part = new StringBuilder();
            try { Hw(part, h); } catch { continue; }
            if (!first) sb.Append(','); first = false;
            sb.Append(part);
        }
        sb.Append("]}");
        return sb.ToString();
    }

    static bool IsAdmin()
    {
        try { return new System.Security.Principal.WindowsPrincipal(System.Security.Principal.WindowsIdentity.GetCurrent()).IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator); }
        catch { return false; }
    }

    /// <summary>Mesma checagem da LibreHardwareMonitorLib: chave de desinstalação do PawnIO.</summary>
    static bool PawnIoInstalled()
    {
        foreach (var key in new[] { @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PawnIO", @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\PawnIO" })
        {
            try { using (var k = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(key)) if (k?.GetValue("DisplayVersion") != null) return true; } catch { /* sem acesso */ }
        }
        return false;
    }

    /// <summary>Abre uma etapa. Antes de abrir, grava um marcador; se o processo cair no meio, a próxima execução pula a etapa por um dia.</summary>
    [HandleProcessCorruptedStateExceptions, SecurityCritical]
    static void OpenGroup(string name, Action enable)
    {
        var marker = Marker(name);
        try
        {
            if (File.Exists(marker) && DateTime.UtcNow - File.GetLastWriteTimeUtc(marker) < TimeSpan.FromDays(1)) { Groups[name] = "skipped"; return; }
            Directory.CreateDirectory(MarkerDir);
            File.WriteAllText(marker, DateTime.UtcNow.ToString("o"));
        }
        catch { /* sem pasta de marcadores: abre mesmo assim */ }
        try { enable(); Groups[name] = "ok"; }
        catch (Exception e) { Groups[name] = "error: " + e.Message; }
        try { File.Delete(marker); } catch { /* */ }
    }

    static bool AppRunning()
    {
        try { return Process.GetProcessesByName("CleanCode").Length > 0; } catch { return true; }
    }

    [HandleProcessCorruptedStateExceptions, SecurityCritical]
    static int Main(string[] args)
    {
        bool once = args.Contains("--once");
        int oi = Array.IndexOf(args, "--out");
        string outFile = oi >= 0 && oi + 1 < args.Length ? args[oi + 1] : null;
        bool pawnio = PawnIoInstalled();

        // 1ª etapa: peças que não dependem de acesso direto ao hardware
        var c = new Computer
        {
            IsGpuEnabled = true, IsMemoryEnabled = true, IsStorageEnabled = true, IsBatteryEnabled = true, IsPsuEnabled = true,
            IsCpuEnabled = false, IsMotherboardEnabled = false, IsControllerEnabled = false, IsNetworkEnabled = false,
        };
        try { c.Open(); Groups["base"] = "ok"; } catch (Exception e) { Groups["base"] = "error: " + e.Message; }

        // 2ª etapa: processador, placa-mãe e controladores, numa thread separada e com tempo limite
        foreach (var g in new[] { "cpu", "motherboard", "controller" }) Groups[g] = "pending";
        var risky = new Thread(() =>
        {
            OpenGroup("cpu", () => c.IsCpuEnabled = true);
            OpenGroup("motherboard", () => c.IsMotherboardEnabled = true);
            OpenGroup("controller", () => c.IsControllerEnabled = true);
        }) { IsBackground = true };
        risky.Start();
        var riskyStarted = Stopwatch.StartNew();
        // na leitura única, espera a 2ª etapa por até 20 segundos
        if (once) risky.Join(20000);

        if (outFile != null) Directory.CreateDirectory(Path.GetDirectoryName(outFile));
        var started = Stopwatch.StartNew(); int missing = 0;
        var stdout = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true };
        do
        {
            // etapas que passaram de 20 segundos sem terminar contam como travadas
            if (risky.IsAlive && riskyStarted.Elapsed.TotalSeconds > 20)
                foreach (var g in new[] { "cpu", "motherboard", "controller" }) Groups.AddOrUpdate(g, "timeout", (k, v) => v == "pending" ? "timeout" : v);

            string json;
            try { json = Snapshot(c, pawnio); } catch (Exception e) { json = "{\"error\":\"" + Esc(e.Message) + "\"}"; }
            if (outFile != null)
            {
                var tmp = outFile + ".tmp";
                File.WriteAllText(tmp, json, new UTF8Encoding(false));
                if (File.Exists(outFile)) File.Replace(tmp, outFile, null); else File.Move(tmp, outFile);
            }
            else stdout.WriteLine(json);
            if (!once) Thread.Sleep(1000);
            // modo tarefa: encerra quando o CleanCode não está mais aberto (duas checagens seguidas),
            // com uma folga no início para o app abrir depois do logon
            if (outFile != null && started.Elapsed.TotalSeconds > 30)
            {
                missing = AppRunning() ? 0 : missing + 1;
                if (missing >= 2) break;
            }
        } while (!once);
        // uma etapa travada não pode impedir o processo de sair
        if (!risky.IsAlive) { try { c.Close(); } catch { /* */ } }
        Environment.Exit(0);
        return 0;
    }
}
