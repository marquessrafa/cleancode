// cc-lhm: lê todos os sensores com a LibreHardwareMonitorLib e escreve JSON.
//   cc-lhm --once                  imprime uma leitura e sai
//   cc-lhm --loop                  imprime uma leitura por linha a cada segundo (stdout)
//   cc-lhm --loop --out <arquivo>  grava a leitura no arquivo a cada segundo (tarefa agendada elevada)
//                                  e sai sozinho quando o CleanCode fecha (o app reabre a tarefa ao precisar).
//                                  Assim nada fica rodando à toa e o instalador consegue atualizar o helper.
//
// Abertura em etapas (issue #1 e regressão da 1.4.12 em PCs Intel):
// - O helper abre primeiro as peças seguras (placa de vídeo, discos, bateria e fonte). Depois, numa thread separada
//   e com tempo limite, ele abre o processador, a memória, a placa-mãe e os controladores.
// - A leitura só começa depois que essa abertura termina. A LibreHardwareMonitorLib não aceita ler uma peça enquanto
//   abre outra: na 1.4.12 as duas coisas aconteciam ao mesmo tempo, e o helper caía sem gravar nenhuma leitura.
//   Só quando a abertura passa de 20 segundos o helper começa a ler as peças seguras sem esperar o resto.
// - Antes de abrir uma etapa, e durante as primeiras leituras, o helper grava um marcador. Se o processo cair nesse
//   intervalo, a próxima execução deixa essa etapa de fora por um dia, e o resto continua funcionando.
// - Cada passo e cada erro vão para o arquivo lhm.log, ao lado da leitura (tarefa elevada) ou em
//   %LOCALAPPDATA%\CleanCode\lhm (helper comum). O estado de cada etapa vai no JSON ("groups").
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
    /// <summary>
    /// Escapa um texto para o JSON. Todo caractere de controle (abaixo de 0x20) vira \u00XX: um byte nulo cru no nome
    /// de um pente de memória deixava o JSON inválido, e o app descartava a leitura inteira (1.4.12 a 1.4.17).
    /// </summary>
    static string Esc(string s)
    {
        var sb = new StringBuilder((s ?? "").Length + 8);
        foreach (var ch in s ?? "")
        {
            if (ch == '"') sb.Append("\\\"");
            else if (ch == '\\') sb.Append("\\\\");
            else if (ch < 0x20) sb.Append("\\u").Append(((int)ch).ToString("x4"));
            else sb.Append(ch);
        }
        return sb.ToString();
    }
    /// <summary>
    /// Limpa o nome de uma peça ou de um sensor. Alguns nomes vêm do chip de identificação do pente de memória (SPD)
    /// com bytes nulos e lixo depois do nome, por exemplo "Corsair - CMT32GX5M2X6200C36\0\0\u001aA". O nome é cortado
    /// no primeiro byte nulo, e os outros caracteres de controle saem. Um sufixo como " (#3)" depois do lixo é mantido.
    /// </summary>
    static string Clean(string s)
    {
        if (string.IsNullOrEmpty(s)) return s ?? "";
        var suffix = "";
        var m = System.Text.RegularExpressions.Regex.Match(s, @"\s\(#\d+\)$");
        if (m.Success && s.IndexOf('\0') >= 0 && s.IndexOf('\0') < m.Index) { suffix = m.Value; s = s.Substring(0, m.Index); }
        int z = s.IndexOf('\0');
        if (z >= 0) s = s.Substring(0, z);
        var sb = new StringBuilder(s.Length);
        foreach (var ch in s) if (ch >= 0x20 && ch != 0x7f) sb.Append(ch);
        return (sb.ToString().Trim() + suffix).Trim();
    }
    static string Num(float? v) => v.HasValue && !float.IsNaN(v.Value) && !float.IsInfinity(v.Value) ? v.Value.ToString("0.###", CultureInfo.InvariantCulture) : "null";

    // estado de cada etapa: "pending", "ok", "timeout", "skipped" (travou ou caiu antes) ou "error: mensagem"
    static readonly ConcurrentDictionary<string, string> Groups = new ConcurrentDictionary<string, string>();
    // peças cuja atualização travou: deixam de ser atualizadas, para não parar as outras leituras
    static readonly ConcurrentDictionary<string, bool> Stuck = new ConcurrentDictionary<string, bool>();

    static readonly string MarkerDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CleanCode", "lhm");
    static string Marker(string group) => Path.Combine(MarkerDir, "opening-" + group);
    static readonly string[] RiskyGroups = { "cpu", "memory", "motherboard", "controller" };

    // registro de cada passo (lhm.log); recomeça quando passa de 256 KB
    static string LogFile;
    static readonly object LogLock = new object();
    static void Log(string m)
    {
        if (LogFile == null) return;
        try { lock (LogLock) File.AppendAllText(LogFile, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff") + "  " + m + Environment.NewLine, new UTF8Encoding(false)); } catch { /* sem registro */ }
    }
    static void StartLog(string dir)
    {
        try
        {
            Directory.CreateDirectory(dir);
            LogFile = Path.Combine(dir, "lhm.log");
            if (File.Exists(LogFile) && new FileInfo(LogFile).Length > 256 * 1024) File.Delete(LogFile);
        }
        catch { LogFile = null; }
    }

    static void Hw(StringBuilder sb, IHardware h)
    {
        sb.Append("{\"name\":\"").Append(Esc(Clean(h.Name))).Append("\",\"type\":\"").Append(h.HardwareType).Append("\",\"id\":\"").Append(Esc(h.Identifier.ToString()))
          .Append("\",\"stuck\":").Append(Stuck.ContainsKey(h.Identifier.ToString()) ? "true" : "false").Append(",\"sensors\":[");
        bool first = true;
        foreach (var s in h.Sensors)
        {
            if (!first) sb.Append(','); first = false;
            sb.Append("{\"name\":\"").Append(Esc(Clean(s.Name))).Append("\",\"type\":\"").Append(s.SensorType).Append("\",\"value\":").Append(Num(s.Value))
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
        if (!t.Join(4000)) { Stuck[id] = true; Log("a atualização de " + h.Name + " passou de 4 segundos; essa peça deixa de ser atualizada"); }
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
            if (!CheckMarker(name, marker, out int crashes)) return;
            Directory.CreateDirectory(MarkerDir);
            WriteMarker(marker, crashes);
        }
        catch { /* sem pasta de marcadores: abre mesmo assim */ }
        var sw = Stopwatch.StartNew();
        try { enable(); Groups[name] = "ok"; Log("etapa " + name + ": aberta em " + sw.ElapsedMilliseconds + " ms"); }
        catch (Exception e) { Groups[name] = "error: " + e.Message; Log("etapa " + name + ": erro " + e); }
        // o marcador continua até as primeiras leituras terminarem (ver ClearMarkers)
    }

    // ---------- marcadores de queda ----------
    // Cada marcador guarda quem o criou: "pid|início do processo|versão do helper|quedas seguidas".
    // Na 1.4.15, o marcador guardava só a hora. Quando duas cópias do helper abriam ao mesmo tempo (a tarefa de
    // administrador e o helper comum do app), uma via o marcador da outra, achava que era uma queda e deixava a peça
    // de fora por um dia. Agora o helper:
    // - ignora marcadores de outra versão do helper;
    // - espera a outra cópia terminar quando o dono do marcador ainda está rodando;
    // - só deixa a peça de fora depois de duas quedas seguidas. Uma única queda pode ser o processo encerrado de fora
    //   (por exemplo, pelo instalador de uma atualização).
    static readonly string Build = BuildId();
    static string BuildId()
    {
        try { return File.GetLastWriteTimeUtc(typeof(Program).Assembly.Location).Ticks.ToString(); } catch { return "0"; }
    }
    static long StartTicks(Process p) { try { return p.StartTime.ToUniversalTime().Ticks; } catch { return 0; } }
    static void WriteMarker(string marker, int crashes)
    {
        var me = Process.GetCurrentProcess();
        File.WriteAllText(marker, me.Id + "|" + StartTicks(me) + "|" + Build + "|" + crashes);
    }
    /// <summary>O processo que criou o marcador ainda está rodando?</summary>
    static bool OwnerAlive(int pid, long start)
    {
        if (pid <= 0 || pid == Process.GetCurrentProcess().Id) return false;
        try { var p = Process.GetProcessById(pid); if (p.HasExited) return false; var st = StartTicks(p); return st == 0 || start == 0 || st == start; }
        catch (ArgumentException) { return false; } // não existe mais
        catch { return true; } // sem acesso ao processo: considera que ainda roda
    }
    static bool ReadMarker(string marker, out int pid, out long start, out string build, out int crashes)
    {
        pid = 0; start = 0; build = ""; crashes = 0;
        try
        {
            var parts = File.ReadAllText(marker).Trim().Split('|');
            if (parts.Length < 4) return false; // marcador antigo (1.4.12 a 1.4.15): só tinha a hora
            int.TryParse(parts[0], out pid); long.TryParse(parts[1], out start); build = parts[2]; int.TryParse(parts[3], out crashes);
            return true;
        }
        catch { return false; }
    }
    /// <summary>
    /// Decide se a etapa pode abrir. Devolve false quando ela deve ficar de fora nesta execução.
    /// crashes: quantas quedas seguidas já aconteceram (vai no novo marcador).
    /// </summary>
    static bool CheckMarker(string name, string marker, out int crashes)
    {
        crashes = 0;
        if (!File.Exists(marker)) return true;
        if (!ReadMarker(marker, out int pid, out long start, out string build, out int prev) || build != Build)
        {
            Log("etapa " + name + ": marcador de outra versão do helper; ele é ignorado");
            return true;
        }
        if (OwnerAlive(pid, start))
        {
            // outra cópia do helper está abrindo esta peça agora: espera ela terminar (até 30 segundos)
            Log("etapa " + name + ": outra cópia do helper (processo " + pid + ") está abrindo esta peça; esperando");
            var sw = Stopwatch.StartNew();
            while (File.Exists(marker) && OwnerAlive(pid, start) && sw.Elapsed.TotalSeconds < 30) Thread.Sleep(250);
            if (!File.Exists(marker)) return true; // a outra cópia abriu e leu sem cair
            if (OwnerAlive(pid, start)) { Groups[name] = "timeout"; Log("etapa " + name + ": a outra cópia passou de 30 segundos; esta cópia segue sem a peça"); return false; }
        }
        // o dono do marcador não está mais rodando: ele caiu (ou foi encerrado) no meio da abertura ou das primeiras leituras
        crashes = prev + 1;
        var recent = DateTime.UtcNow - File.GetLastWriteTimeUtc(marker) < TimeSpan.FromDays(1);
        if (crashes >= 2 && recent)
        {
            Groups[name] = "skipped";
            Log("etapa " + name + ": pulada, porque caiu " + crashes + " vezes seguidas (tenta de novo em um dia)");
            return false;
        }
        if (!recent) crashes = 1;
        Log("etapa " + name + ": a execução anterior caiu ou foi encerrada nesta etapa (" + crashes + "ª vez); tentando de novo");
        return true;
    }

    /// <summary>
    /// Apaga os marcadores das etapas que terminaram de abrir e já passaram pelas primeiras leituras sem cair.
    /// Uma etapa pulada ou que ainda não terminou de abrir (tempo esgotado) mantém o marcador: assim, se ela
    /// travar ou cair depois, a próxima execução deixa essa etapa de fora por um dia.
    /// </summary>
    static void ClearMarkers()
    {
        foreach (var g in RiskyGroups)
        {
            if (!Groups.TryGetValue(g, out var st) || !(st == "ok" || st.StartsWith("error"))) continue;
            try
            {
                // só apaga o marcador desta cópia do helper (outra cópia pode estar no meio da abertura)
                var m = Marker(g);
                if (ReadMarker(m, out int pid, out long _, out string _, out int _) && pid != Process.GetCurrentProcess().Id) continue;
                File.Delete(m);
            }
            catch { /* */ }
        }
    }

    static bool AppRunning()
    {
        try { return Process.GetProcessesByName("CleanCode").Length > 0; } catch { return true; }
    }

    [HandleProcessCorruptedStateExceptions, SecurityCritical]
    static int Main(string[] args)
    {
        // autoteste do JSON: o nome de pente de memória que chegou com bytes nulos num PC real (1.4.17)
        if (args.Contains("--selftest"))
        {
            var raw = "Corsair - CMT32GX5M2X6200C36\0\0\0\0\0\u001aA\u001aA\0} (#3)";
            var w = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true };
            w.WriteLine("{\"clean\":\"" + Esc(Clean(raw)) + "\",\"raw\":\"" + Esc(raw) + "\",\"quote\":\"" + Esc("a\"b\\c\td") + "\"}");
            Environment.Exit(0);
        }
        bool once = args.Contains("--once");
        int oi = Array.IndexOf(args, "--out");
        string outFile = oi >= 0 && oi + 1 < args.Length ? args[oi + 1] : null;
        StartLog(outFile != null ? Path.GetDirectoryName(outFile) : MarkerDir);
        AppDomain.CurrentDomain.UnhandledException += (s, e) => Log("erro inesperado, o helper vai fechar: " + e.ExceptionObject);
        bool pawnio = PawnIoInstalled();
        Log("início: " + string.Join(" ", args) + "  admin=" + IsAdmin() + "  pawnio=" + pawnio + "  versão=" + typeof(Computer).Assembly.GetName().Version);

        // 1ª etapa: peças que não dependem de acesso direto ao hardware
        var c = new Computer
        {
            IsGpuEnabled = true, IsStorageEnabled = true, IsBatteryEnabled = true, IsPsuEnabled = true,
            IsCpuEnabled = false, IsMemoryEnabled = false, IsMotherboardEnabled = false, IsControllerEnabled = false, IsNetworkEnabled = false,
        };
        var sw = Stopwatch.StartNew();
        try { c.Open(); Groups["base"] = "ok"; Log("etapa base: aberta em " + sw.ElapsedMilliseconds + " ms"); }
        catch (Exception e) { Groups["base"] = "error: " + e.Message; Log("etapa base: erro " + e); }

        // 2ª etapa: processador, memória, placa-mãe e controladores, numa thread separada e com tempo limite.
        // A leitura espera essa etapa terminar (até 20 segundos), para nunca ler e abrir peças ao mesmo tempo.
        foreach (var g in RiskyGroups) Groups[g] = "pending";
        var risky = new Thread(() =>
        {
            OpenGroup("cpu", () => c.IsCpuEnabled = true);
            OpenGroup("memory", () => c.IsMemoryEnabled = true);
            OpenGroup("motherboard", () => c.IsMotherboardEnabled = true);
            OpenGroup("controller", () => c.IsControllerEnabled = true);
        }) { IsBackground = true };
        risky.Start();
        if (!risky.Join(20000))
        {
            foreach (var g in RiskyGroups) Groups.AddOrUpdate(g, "timeout", (k, v) => v == "pending" ? "timeout" : v);
            Log("a abertura do processador, da memória ou da placa-mãe passou de 20 segundos; a leitura começa sem esperar");
        }

        if (outFile != null) { try { Directory.CreateDirectory(Path.GetDirectoryName(outFile)); } catch { /* */ } }
        var started = Stopwatch.StartNew(); int missing = 0, reads = 0;
        var stdout = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true };
        do
        {
            string json;
            try { json = Snapshot(c, pawnio); } catch (Exception e) { json = "{\"error\":\"" + Esc(e.Message) + "\"}"; Log("erro na leitura: " + e); }
            reads++;
            if (reads == 1) Log("primeira leitura: " + json.Length + " bytes; etapas " + string.Join(", ", Groups.Select(kv => kv.Key + "=" + kv.Value)));
            // três leituras sem cair: as etapas abertas são seguras neste PC
            if (reads == 3) { ClearMarkers(); Log("três leituras sem erro"); }
            if (outFile != null)
            {
                // o app pode estar lendo o arquivo neste instante: se a troca falhar, tenta na próxima volta
                try
                {
                    var tmp = outFile + ".tmp";
                    File.WriteAllText(tmp, json, new UTF8Encoding(false));
                    if (File.Exists(outFile)) File.Replace(tmp, outFile, null); else File.Move(tmp, outFile);
                }
                catch (Exception e) { if (reads <= 3) Log("falha ao gravar a leitura: " + e.Message); }
            }
            else
            {
                try { stdout.WriteLine(json); } catch { break; } // o app fechou a saída
            }
            if (!once) Thread.Sleep(1000);
            // modo tarefa: encerra quando o CleanCode não está mais aberto (duas checagens seguidas),
            // com uma folga no início para o app abrir depois do logon
            if (outFile != null && started.Elapsed.TotalSeconds > 30)
            {
                missing = AppRunning() ? 0 : missing + 1;
                if (missing >= 2) { Log("o CleanCode fechou; o helper também fecha"); break; }
            }
        } while (!once);
        if (once && reads < 3) ClearMarkers();
        // uma etapa travada não pode impedir o processo de sair
        if (!risky.IsAlive) { try { c.Close(); } catch { /* */ } }
        Environment.Exit(0);
        return 0;
    }
}
