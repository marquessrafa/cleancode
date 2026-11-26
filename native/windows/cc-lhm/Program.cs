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
using System.Runtime.InteropServices;
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
            sb.Append("{\"name\":\"").Append(Esc(Clean(s.Name))).Append("\",\"id\":\"").Append(Esc(s.Identifier.ToString())).Append("\",\"type\":\"").Append(s.SensorType).Append("\",\"value\":").Append(Num(s.Value))
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

    static string Snapshot(Computer c, bool pawnio, bool fanControl = false)
    {
        IHardware[] list;
        try { list = c.Hardware.ToArray(); } catch { list = new IHardware[0]; }
        foreach (var h in list) UpdateWithTimeout(h);
        // o controle das ventoinhas usa as leituras que acabaram de chegar (só no modo tarefa, que roda como administrador)
        if (fanControl) { try { Fans.Tick(list); } catch (Exception e) { Log("erro no controle das ventoinhas: " + e.Message); } }
        var sb = new StringBuilder(64 * 1024);
        sb.Append("{\"at\":").Append(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()).Append(",\"admin\":")
          .Append(IsAdmin() ? "true" : "false").Append(",\"pawnio\":").Append(pawnio ? "true" : "false").Append(",\"groups\":{");
        bool first = true;
        foreach (var kv in Groups) { if (!first) sb.Append(','); first = false; sb.Append('"').Append(kv.Key).Append("\":\"").Append(Esc(kv.Value)).Append('"'); }
        sb.Append("},\"fanControl\":").Append(fanControl ? "true" : "false").Append(",\"adlx\":").Append(fanControl && Adlx.Ready ? "true" : "false").Append(",\"fans\":[").Append(fanControl ? Fans.StatusJson() : "").Append("],\"hardware\":[");
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

    // ---------- controle das ventoinhas (só na tarefa de administrador) ----------
    // O app grava o pedido em %LOCALAPPDATA%\CleanCode\fans.txt. A tarefa roda com a mesma conta, então lê a mesma pasta,
    // e só essa conta (e os administradores) consegue gravar nela. Uma linha por item, separada por tabulação:
    //   until <hora em ms>                                    até quando o pedido vale (o app renova a cada 3 segundos)
    //   fixed <id do controle> <porcentagem>                  velocidade fixa
    //   curve <id do controle> <id da temperatura> t:p,t:p    curva de velocidade pela temperatura
    // Proteções:
    // - Quando o pedido vence (o app travou ou fechou) ou some, cada ventoinha volta ao modo automático da placa.
    // - Se o processador ou a placa de vídeo chegar a 90 °C, as ventoinhas controladas vão para 100% até cair para 85 °C.
    // - Ao fechar, o helper devolve cada ventoinha ao modo automático.
    // ---------- ventoinha das placas AMD pelo ADLX ----------
    // A LibreHardwareMonitorLib 0.9.6 só controla placas AMD pela interface antiga do driver (ADL2_Overdrive5_FanSpeed_Set),
    // que as placas recentes ignoram sem dar erro. O ADLX é o SDK novo da AMD e vem dentro do próprio driver
    // (amdadlx64.dll, em System32). O helper chama o driver direto, sem código de terceiros: cada interface do ADLX é um
    // objeto com uma tabela de funções (vtable), na ordem dos cabeçalhos públicos do SDK (IGPUTuning.h,
    // IGPUManualFanTuning.h, ISystem.h e ICollections.h).
    // - Velocidade: a curva de ventoinha do driver (5 pontos de temperatura e velocidade) recebe a mesma velocidade em
    //   todos os pontos. O Zero RPM é desligado enquanto o CleanCode controla, para a ventoinha girar de verdade.
    // - Volta ao automático: os pontos e o Zero RPM voltam exatamente ao que eram antes. O helper não usa ResetToFactory,
    //   porque ele também apagaria os ajustes de desempenho que a pessoa fez no AMD Software.
    internal static class Adlx
    {
        [DllImport("amdadlx64.dll", CallingConvention = CallingConvention.Cdecl)] static extern int ADLXQueryFullVersion(out ulong version);
        [DllImport("amdadlx64.dll", CallingConvention = CallingConvention.Cdecl)] static extern int ADLXInitialize(ulong version, out IntPtr system);
        [DllImport("amdadlx64.dll", CallingConvention = CallingConvention.Cdecl)] static extern int ADLXTerminate();

        [StructLayout(LayoutKind.Sequential)] internal struct IntRange { public int Min, Max, Step; }

        [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int FnRelease(IntPtr self);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int FnQueryInterface(IntPtr self, [MarshalAs(UnmanagedType.LPWStr)] string id, out IntPtr result);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int FnGetPtr(IntPtr self, out IntPtr result);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate uint FnSize(IntPtr self);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int FnAt(IntPtr self, uint index, out IntPtr result);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int FnGpuBool(IntPtr self, IntPtr gpu, out byte result);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int FnGpuPtr(IntPtr self, IntPtr gpu, out IntPtr result);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int FnRanges(IntPtr self, out IntRange speed, out IntRange temperature);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int FnSetPtr(IntPtr self, IntPtr value);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int FnValid(IntPtr self, IntPtr states, out int errorIndex);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int FnGetBool(IntPtr self, out byte result);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int FnSetBool(IntPtr self, byte value);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int FnGetInt(IntPtr self, out int result);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int FnSetInt(IntPtr self, int value);

        // posições na vtable (0 = primeira função)
        const int Release_ = 1, QueryInterface_ = 2;
        const int System_GetGPUs = 1, System_GetGPUTuningServices = 8;
        const int List_Size = 3, GpuList_At = 11, StateList_At = 11;
        const int Tuning_IsSupportedManualFanTuning = 10, Tuning_GetManualFanTuning = 16;
        const int Fan_GetRanges = 3, Fan_GetStates = 4, Fan_IsValidStates = 6, Fan_SetStates = 7, Fan_IsSupportedZeroRPM = 8, Fan_GetZeroRPM = 9, Fan_SetZeroRPM = 10;
        const int State_GetSpeed = 3, State_SetSpeed = 4, State_GetTemperature = 5, State_SetTemperature = 6;

        static T Fn<T>(IntPtr obj, int index) where T : class => Marshal.GetDelegateForFunctionPointer<T>(Marshal.ReadIntPtr(Marshal.ReadIntPtr(obj), index * IntPtr.Size));
        static void Rel(IntPtr obj) { if (obj != IntPtr.Zero) Fn<FnRelease>(obj, Release_)(obj); }

        internal class Gpu { public IntPtr Fan; public IntRange Speed, Temp; public bool HasZeroRpm; public List<int[]> Original; public byte OriginalZeroRpm; public bool Touched; }
        static readonly List<Gpu> Gpus = new List<Gpu>();
        static bool tried;
        static IntPtr system, tuning;
        internal static string Error = "";

        /// <summary>Abre o ADLX uma vez. Devolve false quando não há driver da AMD com ADLX neste PC.</summary>
        internal static bool Init()
        {
            if (tried) return system != IntPtr.Zero;
            tried = true;
            try
            {
                // o próprio driver diz a versão que ele entende, e o helper pede exatamente essa
                int r = ADLXQueryFullVersion(out var version);
                if (r != 0) { Error = "versão " + r; return false; }
                r = ADLXInitialize(version, out system);
                if ((r != 0 && r != 1 && r != 2) || system == IntPtr.Zero) { Error = "início " + r; system = IntPtr.Zero; return false; }
                r = Fn<FnGetPtr>(system, System_GetGPUTuningServices)(system, out tuning);
                if (r != 0 || tuning == IntPtr.Zero) { Error = "ajustes " + r; return true; }
                r = Fn<FnGetPtr>(system, System_GetGPUs)(system, out var list);
                if (r != 0 || list == IntPtr.Zero) { Error = "placas " + r; return true; }
                uint n = Fn<FnSize>(list, List_Size)(list);
                for (uint i = 0; i < n; i++)
                {
                    var g = new Gpu();
                    Gpus.Add(g);
                    if (Fn<FnAt>(list, GpuList_At)(list, i, out var gpu) != 0 || gpu == IntPtr.Zero) continue;
                    if (Fn<FnGpuBool>(tuning, Tuning_IsSupportedManualFanTuning)(tuning, gpu, out var supported) != 0 || supported == 0) continue;
                    if (Fn<FnGpuPtr>(tuning, Tuning_GetManualFanTuning)(tuning, gpu, out var iface) != 0 || iface == IntPtr.Zero) continue;
                    // a interface volta como IADLXInterface: pede a de ventoinha pelo nome
                    if (Fn<FnQueryInterface>(iface, QueryInterface_)(iface, "IADLXManualFanTuning", out var fan) == 0 && fan != IntPtr.Zero) { g.Fan = fan; Rel(iface); }
                    else g.Fan = iface;
                    Fn<FnRanges>(g.Fan, Fan_GetRanges)(g.Fan, out g.Speed, out g.Temp);
                    g.HasZeroRpm = Fn<FnGetBool>(g.Fan, Fan_IsSupportedZeroRPM)(g.Fan, out var zero) == 0 && zero != 0;
                }
                Rel(list);
                return true;
            }
            catch (DllNotFoundException) { Error = "sem driver da AMD com ADLX"; }
            catch (EntryPointNotFoundException) { Error = "ADLX antigo"; }
            catch (Exception e) { Error = e.Message; }
            system = IntPtr.Zero;
            return false;
        }

        /// <summary>Alguma placa AMD aceita o controle manual da ventoinha pelo ADLX?</summary>
        internal static bool Ready => Init() && Gpus.Any((g) => g.Fan != IntPtr.Zero);
        static Gpu ByControl(string id)
        {
            // "/gpu-amd/0/control/0": a placa AMD número 0, na mesma ordem do ADLX
            var parts = id.Split('/');
            if (parts.Length < 3 || parts[1] != "gpu-amd" || !int.TryParse(parts[2], out var index)) return null;
            return Init() && index < Gpus.Count && Gpus[index].Fan != IntPtr.Zero ? Gpus[index] : null;
        }
        internal static bool Handles(string id) => ByControl(id) != null;

        static List<int[]> ReadStates(IntPtr fan)
        {
            if (Fn<FnGetPtr>(fan, Fan_GetStates)(fan, out var list) != 0 || list == IntPtr.Zero) return null;
            var states = new List<int[]>();
            uint n = Fn<FnSize>(list, List_Size)(list);
            for (uint i = 0; i < n; i++)
            {
                if (Fn<FnAt>(list, StateList_At)(list, i, out var st) != 0 || st == IntPtr.Zero) continue;
                Fn<FnGetInt>(st, State_GetSpeed)(st, out var speed);
                Fn<FnGetInt>(st, State_GetTemperature)(st, out var temp);
                states.Add(new[] { speed, temp });
                Rel(st);
            }
            Rel(list);
            return states;
        }
        /// <summary>Lê a curva atual, troca cada ponto pelo que <paramref name="map"/> devolve, confere e grava. Devolve null quando deu certo.</summary>
        static string WriteStates(IntPtr fan, Func<int, int[], int[]> map)
        {
            if (Fn<FnGetPtr>(fan, Fan_GetStates)(fan, out var list) != 0 || list == IntPtr.Zero) return "sem curva";
            try
            {
                uint n = Fn<FnSize>(list, List_Size)(list);
                for (uint i = 0; i < n; i++)
                {
                    if (Fn<FnAt>(list, StateList_At)(list, i, out var st) != 0 || st == IntPtr.Zero) continue;
                    Fn<FnGetInt>(st, State_GetSpeed)(st, out var speed);
                    Fn<FnGetInt>(st, State_GetTemperature)(st, out var temp);
                    var v = map((int)i, new[] { speed, temp });
                    Fn<FnSetInt>(st, State_SetSpeed)(st, v[0]);
                    Fn<FnSetInt>(st, State_SetTemperature)(st, v[1]);
                    Rel(st);
                }
                int r = Fn<FnValid>(fan, Fan_IsValidStates)(fan, list, out var bad);
                if (r != 0 || bad != -1) return "curva inválida no ponto " + bad + " (" + r + ")";
                r = Fn<FnSetPtr>(fan, Fan_SetStates)(fan, list);
                return r == 0 ? null : "o driver recusou a curva (" + r + ")";
            }
            finally { Rel(list); }
        }

        /// <summary>Coloca a ventoinha da placa em <paramref name="pct"/>%. Devolve null quando deu certo, ou o motivo do erro.</summary>
        internal static string Set(string id, float pct)
        {
            var g = ByControl(id);
            if (g == null) return "a placa não aceita o controle pelo ADLX";
            if (!g.Touched)
            {
                g.Original = ReadStates(g.Fan);
                if (g.Original == null) return "não deu para ler a curva da placa";
                if (g.HasZeroRpm) Fn<FnGetBool>(g.Fan, Fan_GetZeroRPM)(g.Fan, out g.OriginalZeroRpm);
                g.Touched = true;
            }
            int lo = g.Speed.Min, hi = g.Speed.Max > lo ? g.Speed.Max : 100, step = g.Speed.Step > 0 ? g.Speed.Step : 1;
            int speed = (int)Math.Round(Math.Max(lo, Math.Min(hi, pct)) / step) * step;
            speed = Math.Max(lo, Math.Min(hi, speed));
            // 0% pedido (na velocidade fixa ou num ponto da curva) quer dizer Zero RPM, do mesmo jeito que no modo automático:
            // a curva original da placa volta e o Zero RPM fica ligado. Assim o driver para a ventoinha enquanto a placa está
            // fria e só volta a girar quando ela esquenta. (Com a curva toda no mínimo, o driver ligava a ventoinha com a placa
            // ainda morna.) Acima de 0%, o Zero RPM fica desligado, para a ventoinha girar na velocidade pedida.
            if (pct < 0.5f && g.HasZeroRpm)
            {
                var orig = g.Original;
                var err0 = WriteStates(g.Fan, (i, s) => i < orig.Count ? orig[i] : s);
                Fn<FnSetBool>(g.Fan, Fan_SetZeroRPM)(g.Fan, 1);
                return err0;
            }
            if (g.HasZeroRpm) Fn<FnSetBool>(g.Fan, Fan_SetZeroRPM)(g.Fan, 0);
            return WriteStates(g.Fan, (i, s) => new[] { speed, s[1] });
        }

        /// <summary>Devolve a curva e o Zero RPM ao que eram antes de o CleanCode assumir.</summary>
        internal static string Restore(string id)
        {
            var g = ByControl(id);
            if (g == null || !g.Touched) return null;
            var orig = g.Original;
            var err = WriteStates(g.Fan, (i, s) => i < orig.Count ? orig[i] : s);
            if (g.HasZeroRpm) Fn<FnSetBool>(g.Fan, Fan_SetZeroRPM)(g.Fan, g.OriginalZeroRpm);
            g.Touched = false;
            return err;
        }

        internal static void Shutdown()
        {
            if (system == IntPtr.Zero) return;
            try { foreach (var g in Gpus) Rel(g.Fan); Rel(tuning); ADLXTerminate(); } catch { /* o processo vai fechar mesmo assim */ }
            system = IntPtr.Zero;
        }

        /// <summary>Diagnóstico só de leitura (cc-lhm --adlx-probe): o que o ADLX informa sobre cada placa AMD.</summary>
        internal static string Probe()
        {
            var sb = new StringBuilder();
            bool ok = Init();
            sb.AppendLine("adlx: " + (ok ? "ok" : "falhou") + (Error.Length > 0 ? " (" + Error + ")" : ""));
            for (int i = 0; i < Gpus.Count; i++)
            {
                var g = Gpus[i];
                if (g.Fan == IntPtr.Zero) { sb.AppendLine("placa " + i + ": sem controle manual da ventoinha"); continue; }
                sb.AppendLine("placa " + i + ": velocidade " + g.Speed.Min + "-" + g.Speed.Max + "% (passo " + g.Speed.Step + "), temperatura " + g.Temp.Min + "-" + g.Temp.Max + " °C, zero rpm " + (g.HasZeroRpm ? "sim" : "não"));
                if (g.HasZeroRpm && Fn<FnGetBool>(g.Fan, Fan_GetZeroRPM)(g.Fan, out var z) == 0) sb.AppendLine("  zero rpm ligado: " + (z != 0 ? "sim" : "não"));
                var states = ReadStates(g.Fan);
                if (states != null) sb.AppendLine("  curva: " + string.Join(", ", states.Select((s) => s[1] + " °C = " + s[0] + "%")));
            }
            return sb.ToString();
        }
    }

    internal static class Fans
    {
        internal class Want { public string Mode; public string Id; public float Value; public string Source; public List<KeyValuePair<float, float>> Points; public string Sig; }
        class State { public string Id; public string Mode; public float Pct = -1; public float Read = -1; public string Error; }

        static readonly object L = new object();
        static readonly Dictionary<string, IControl> Touched = new Dictionary<string, IControl>();
        static readonly Dictionary<string, float> Applied = new Dictionary<string, float>();
        static List<State> Status = new List<State>();
        // conferência: quantas leituras seguidas a placa informou um valor diferente do pedido, e as ventoinhas que a placa
        // recusou (com o pedido recusado; um pedido diferente tenta de novo)
        static readonly Dictionary<string, int> Mismatch = new Dictionary<string, int>();
        static readonly Dictionary<string, string> Refused = new Dictionary<string, string>();
        // ventoinhas soltas há pouco: depois de 3 segundos, o registro anota o que a placa informa
        static readonly Dictionary<string, KeyValuePair<IControl, int>> Released = new Dictionary<string, KeyValuePair<IControl, int>>();
        const float Tolerance = 8f; const int MismatchLimit = 6;
        // conferência pelo RPM: algumas ventoinhas aceitam o comando no registro, mas não mudam de velocidade (por exemplo, uma
        // ventoinha controlada por outro aparelho, que só manda o RPM para a placa). Quando o pedido fica 25 pontos ou mais longe
        // do valor de antes, a tarefa espera 8 segundos e confere se o RPM subiu (ou desceu) pelo menos 10%.
        class RpmCheck { public float Pct; public float Rpm; public int Since; public bool Verified; }
        static readonly Dictionary<string, RpmCheck> RpmRef = new Dictionary<string, RpmCheck>();
        static bool emergency, lastValid;
        const float HotOn = 90f, HotOff = 85f;

        static string ConfigPath => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CleanCode", "fans.txt");
        static float F(string s) { float.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var v); return v; }

        internal static List<Want> Parse(string text, out long until)
        {
            until = 0;
            var list = new List<Want>();
            foreach (var raw in (text ?? "").Split('\n'))
            {
                var p = raw.TrimEnd('\r').Split('\t');
                var sig = raw.TrimEnd('\r');
                if (p.Length >= 2 && p[0] == "until") long.TryParse(p[1], out until);
                else if (p.Length >= 3 && p[0] == "fixed") list.Add(new Want { Mode = "fixed", Id = p[1], Value = F(p[2]), Sig = sig });
                else if (p.Length >= 4 && p[0] == "curve")
                {
                    var pts = new List<KeyValuePair<float, float>>();
                    foreach (var pair in p[3].Split(','))
                    {
                        var tp = pair.Split(':');
                        if (tp.Length == 2) pts.Add(new KeyValuePair<float, float>(F(tp[0]), F(tp[1])));
                    }
                    pts.Sort((a, b) => a.Key.CompareTo(b.Key));
                    if (pts.Count > 0) list.Add(new Want { Mode = "curve", Id = p[1], Source = p[2], Points = pts, Sig = sig });
                }
            }
            return list;
        }

        /// <summary>Porcentagem da curva para uma temperatura: reta entre os pontos vizinhos, e o primeiro ou o último ponto fora deles.</summary>
        internal static float Interp(List<KeyValuePair<float, float>> pts, float temp)
        {
            if (temp <= pts[0].Key) return pts[0].Value;
            for (int i = 1; i < pts.Count; i++)
            {
                if (temp <= pts[i].Key)
                {
                    var a = pts[i - 1]; var b = pts[i];
                    return b.Key - a.Key <= 0 ? b.Value : a.Value + (b.Value - a.Value) * (temp - a.Key) / (b.Key - a.Key);
                }
            }
            return pts[pts.Count - 1].Value;
        }

        static void Walk(IHardware h, Dictionary<string, IControl> controls, Dictionary<string, ISensor> sensors, Dictionary<string, ISensor> fanOf, ref float hot)
        {
            foreach (var s in h.Sensors)
            {
                var id = s.Identifier.ToString();
                sensors[id] = s;
                if (s.Control != null)
                {
                    controls[id] = s.Control;
                    // o RPM de cada saída: o sensor de ventoinha da mesma peça, com o mesmo nome (por exemplo, "Fan #2")
                    var fan = h.Sensors.FirstOrDefault((y) => y.SensorType == SensorType.Fan && y.Name == s.Name);
                    if (fan != null) fanOf[id] = fan;
                }
                if (s.SensorType == SensorType.Temperature && s.Value.HasValue && s.Value.Value > 0 && s.Value.Value < 125)
                {
                    var t = h.HardwareType;
                    bool cpu = t == HardwareType.Cpu && (s.Name == "CPU Package" || s.Name == "Core Max" || s.Name.Contains("Tctl"));
                    bool gpu = (t == HardwareType.GpuAmd || t == HardwareType.GpuNvidia || t == HardwareType.GpuIntel) && s.Name == "GPU Core";
                    if ((cpu || gpu) && s.Value.Value > hot) hot = s.Value.Value;
                }
            }
            foreach (var sub in h.SubHardware) Walk(sub, controls, sensors, fanOf, ref hot);
        }

        internal static void Tick(IHardware[] list)
        {
            lock (L)
            {
                var controls = new Dictionary<string, IControl>();
                var sensors = new Dictionary<string, ISensor>();
                var fanOf = new Dictionary<string, ISensor>();
                float hot = 0;
                foreach (var h in list) Walk(h, controls, sensors, fanOf, ref hot);
                // 3 segundos depois de soltar uma ventoinha, o registro anota o que a placa informa (para conferir se ela voltou)
                foreach (var id in Released.Keys.ToList())
                {
                    var r = Released[id];
                    if (r.Value > 1) { Released[id] = new KeyValuePair<IControl, int>(r.Key, r.Value - 1); continue; }
                    Released.Remove(id);
                    Log("ventoinha " + id + ": 3 segundos depois de voltar ao modo automático, a placa informa " + Pct(r.Key.Sensor?.Value) + " e " + Rpm(fanOf, id));
                }

                List<Want> wants;
                long until = 0;
                try { wants = File.Exists(ConfigPath) ? Parse(File.ReadAllText(ConfigPath), out until) : new List<Want>(); }
                catch { wants = new List<Want>(); }
                bool valid = until >= DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                if (!valid) wants.Clear();
                if (lastValid && !valid && Touched.Count > 0) Log("o CleanCode parou de confirmar o controle das ventoinhas; elas voltam ao modo automático");
                lastValid = valid;

                if (!emergency && hot >= HotOn && wants.Count > 0) { emergency = true; Log("proteção: a temperatura chegou a " + hot.ToString("0", CultureInfo.InvariantCulture) + " °C; as ventoinhas controladas vão para 100%"); }
                else if (emergency && hot < HotOff) { emergency = false; Log("proteção: a temperatura caiu para " + hot.ToString("0", CultureInfo.InvariantCulture) + " °C; as ventoinhas voltam à configuração escolhida"); }

                var status = new List<State>();
                var keep = new HashSet<string>();
                foreach (var w in wants)
                {
                    var st = new State { Id = w.Id, Mode = w.Mode };
                    status.Add(st);
                    if (Refused.TryGetValue(w.Id, out var refusedSig))
                    {
                        if (refusedSig == w.Sig) { st.Error = "refused"; continue; } // a placa recusou este pedido: a ventoinha fica no automático
                        Refused.Remove(w.Id); // um pedido diferente: tenta de novo
                    }
                    if (!controls.TryGetValue(w.Id, out var ctl)) { st.Error = "notfound"; continue; }
                    try
                    {
                        // placa de vídeo AMD: a velocidade vai pelo ADLX, e a leitura do controle da biblioteca não acompanha
                        // (ela lê pela interface antiga). Nesse caso, só a conferência pelo RPM vale.
                        bool amd = Adlx.Handles(w.Id);
                        // conferência: a placa informa o valor que o CleanCode aplicou na leitura anterior?
                        var read = ctl.Sensor?.Value;
                        if (read.HasValue) st.Read = read.Value;
                        if (!amd && Touched.ContainsKey(w.Id) && Applied.TryGetValue(w.Id, out var was) && read.HasValue)
                        {
                            if (Math.Abs(read.Value - was) > Tolerance) Mismatch[w.Id] = (Mismatch.TryGetValue(w.Id, out var m) ? m : 0) + 1;
                            else Mismatch.Remove(w.Id);
                            if (Mismatch.TryGetValue(w.Id, out var misses) && misses >= MismatchLimit)
                            {
                                Log("ventoinha " + w.Id + ": a placa informa " + Pct(read) + " em vez de " + Pct(was) + " há " + misses + " segundos; a placa não obedece, e a ventoinha volta ao modo automático");
                                Mismatch.Remove(w.Id); Refused[w.Id] = w.Sig; st.Error = "refused";
                                continue; // fica fora de keep: a ventoinha é solta logo abaixo
                            }
                        }
                        float pct;
                        if (w.Mode == "fixed") pct = w.Value;
                        else if (sensors.TryGetValue(w.Source ?? "", out var src) && src.Value.HasValue && src.Value.Value > 0) pct = Interp(w.Points, src.Value.Value);
                        else { st.Error = "nosource"; continue; } // sem a temperatura: a ventoinha fica (ou volta) no modo automático
                        if (emergency) { pct = 100; st.Mode = "emergency"; }
                        // na curva, a velocidade sobe na hora e desce até 3 pontos por segundo, para a ventoinha não ficar oscilando
                        else if (w.Mode == "curve" && Applied.TryGetValue(w.Id, out var before) && pct < before - 3) pct = before - 3;
                        // placa AMD: o 0% precisa chegar até o ADLX (ele vira Zero RPM), então o mínimo da biblioteca não corta o pedido
                        float lo = amd ? 0 : Math.Max(0, ctl.MinSoftwareValue), hi = ctl.MaxSoftwareValue > lo ? Math.Min(100, ctl.MaxSoftwareValue) : 100;
                        pct = Math.Max(lo, Math.Min(hi, pct));
                        bool changed = false;
                        if (!Applied.TryGetValue(w.Id, out var prev) || Math.Abs(prev - pct) >= 0.5f || (!amd && ctl.ControlMode != ControlMode.Software))
                        {
                            changed = true;
                            if (!Touched.ContainsKey(w.Id) && read.HasValue && fanOf.TryGetValue(w.Id, out var fanBefore) && fanBefore.Value.HasValue)
                                RpmRef[w.Id] = new RpmCheck { Pct = read.Value, Rpm = fanBefore.Value.Value };
                            if (amd) { var err = Adlx.Set(w.Id, pct); if (err != null) throw new Exception("ADLX: " + err); }
                            else ctl.SetSoftware(pct);
                            Applied[w.Id] = pct;
                            if (!Touched.ContainsKey(w.Id)) { Touched[w.Id] = ctl; Released.Remove(w.Id); Log("ventoinha " + w.Id + ": o CleanCode assumiu o controle (" + w.Mode + "); antes, a placa informava " + Pct(read) + " e " + Rpm(fanOf, w.Id)); }
                        }
                        // conferência pelo RPM (uma vez por ventoinha, depois de uma mudança grande)
                        if (RpmRef.TryGetValue(w.Id, out var rc) && !rc.Verified && fanOf.TryGetValue(w.Id, out var fanNow) && fanNow.Value.HasValue)
                        {
                            rc.Since = changed ? 0 : rc.Since + 1;
                            float rpmNow = fanNow.Value.Value, delta = pct - rc.Pct;
                            if (rc.Since >= 8 && Math.Abs(delta) >= 25 && rc.Rpm > 0 && rpmNow > 0)
                            {
                                bool followed = delta > 0 ? rpmNow >= rc.Rpm * 1.10f : rpmNow <= rc.Rpm * 0.90f;
                                if (!followed)
                                {
                                    Log("ventoinha " + w.Id + ": o pedido foi de " + Pct(rc.Pct) + " para " + Pct(pct) + ", mas o RPM foi de " + rc.Rpm.ToString("0", CultureInfo.InvariantCulture) + " para " + rpmNow.ToString("0", CultureInfo.InvariantCulture) + "; a ventoinha não segue o controle da placa e volta ao modo automático");
                                    Refused[w.Id] = w.Sig; st.Error = "norpm"; RpmRef.Remove(w.Id);
                                    continue; // fica fora de keep: a ventoinha é solta logo abaixo
                                }
                                rc.Verified = true;
                            }
                        }
                        st.Pct = pct;
                        keep.Add(w.Id);
                    }
                    catch (Exception e) { st.Error = "error: " + e.Message; }
                }
                // as ventoinhas que saíram do pedido (ou ficaram sem temperatura) voltam ao modo automático
                foreach (var id in Touched.Keys.Where((k) => !keep.Contains(k)).ToList()) Release(id, "voltou ao modo automático");
                Status = status;
            }
        }

        static string Pct(float? v) => v.HasValue ? v.Value.ToString("0", CultureInfo.InvariantCulture) + "%" : "sem leitura";
        static string Rpm(Dictionary<string, ISensor> fanOf, string id) => fanOf.TryGetValue(id, out var f) && f.Value.HasValue ? f.Value.Value.ToString("0", CultureInfo.InvariantCulture) + " RPM" : "sem RPM";

        static void Release(string id, string why)
        {
            var ctl = Touched[id];
            var before = ctl.Sensor?.Value;
            try
            {
                if (Adlx.Handles(id)) { var err = Adlx.Restore(id); if (err != null) throw new Exception("ADLX: " + err); }
                else ctl.SetDefault();
            }
            catch (Exception e) { Log("ventoinha " + id + ": não voltou ao modo automático (" + e.Message + ")"); }
            Touched.Remove(id); Applied.Remove(id); Mismatch.Remove(id); RpmRef.Remove(id);
            Released[id] = new KeyValuePair<IControl, int>(ctl, 3);
            Log("ventoinha " + id + ": " + why + " (estava em " + Pct(before) + ")");
        }

        internal static void RestoreAll(string why)
        {
            lock (L) { foreach (var id in Touched.Keys.ToList()) Release(id, "voltou ao modo automático, porque " + why); }
        }

        internal static string StatusJson()
        {
            lock (L)
            {
                return string.Join(",", Status.Select((s) => "{\"id\":\"" + Esc(s.Id) + "\",\"mode\":\"" + s.Mode + "\",\"pct\":" + (s.Pct < 0 ? "null" : s.Pct.ToString("0.#", CultureInfo.InvariantCulture))
                    + ",\"read\":" + (s.Read < 0 ? "null" : s.Read.ToString("0.#", CultureInfo.InvariantCulture))
                    + ",\"error\":" + (s.Error == null ? "null" : "\"" + Esc(s.Error) + "\"") + "}"));
            }
        }

        internal static string SelfTest()
        {
            var text = "until\t1700000000000\r\nfixed\t/lpc/nct6798d/0/control/1\t45\ncurve\t/gpu-amd/0/control/0\t/gpu-amd/0/temperature/0\t70:100,30:20,50:40\nlixo\n";
            var list = Parse(text, out var until);
            var curve = list.First((w) => w.Mode == "curve").Points;
            string n(float v) => v.ToString("0.##", CultureInfo.InvariantCulture);
            return "{\"until\":" + until + ",\"count\":" + list.Count + ",\"fixed\":" + n(list[0].Value) + ",\"at20\":" + n(Interp(curve, 20)) + ",\"at40\":" + n(Interp(curve, 40))
                + ",\"at60\":" + n(Interp(curve, 60)) + ",\"at90\":" + n(Interp(curve, 90)) + "}";
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
        // autoteste do controle das ventoinhas: lê um pedido de exemplo e calcula as curvas, sem tocar no hardware
        if (args.Contains("--fan-selftest"))
        {
            var w = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true };
            w.WriteLine(Fans.SelfTest());
            Environment.Exit(0);
        }
        // diagnóstico do ADLX (placas AMD): só lê, não muda nada. Com --adlx-test <porcentagem>, coloca a ventoinha da
        // primeira placa AMD nessa velocidade por 8 segundos, mostra a curva e devolve tudo ao que era antes.
        if (args.Contains("--adlx-probe") || args.Contains("--adlx-test"))
        {
            var w = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true };
            w.Write(Adlx.Probe());
            int ti = Array.IndexOf(args, "--adlx-test");
            if (ti >= 0 && ti + 1 < args.Length && float.TryParse(args[ti + 1], NumberStyles.Float, CultureInfo.InvariantCulture, out var testPct) && Adlx.Handles("/gpu-amd/0/control/0"))
            {
                w.WriteLine("teste: " + (Adlx.Set("/gpu-amd/0/control/0", testPct) ?? "ok, " + testPct.ToString(CultureInfo.InvariantCulture) + "% por 8 segundos"));
                w.Write(Adlx.Probe());
                Thread.Sleep(8000);
                w.WriteLine("volta: " + (Adlx.Restore("/gpu-amd/0/control/0") ?? "ok"));
                w.Write(Adlx.Probe());
            }
            Adlx.Shutdown();
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
        // só a tarefa de administrador controla as ventoinhas. Antes de fechar, ela devolve cada ventoinha ao modo automático.
        bool fanControl = outFile != null && !once && IsAdmin();
        if (fanControl)
        {
            AppDomain.CurrentDomain.ProcessExit += (s, e) => Fans.RestoreAll("o helper está fechando");
            AppDomain.CurrentDomain.UnhandledException += (s, e) => Fans.RestoreAll("erro inesperado no helper");
        }
        do
        {
            string json;
            try { json = Snapshot(c, pawnio, fanControl); } catch (Exception e) { json = "{\"error\":\"" + Esc(e.Message) + "\"}"; Log("erro na leitura: " + e); }
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
        if (fanControl) { Fans.RestoreAll("o helper está fechando"); Adlx.Shutdown(); }
        // uma etapa travada não pode impedir o processo de sair
        if (!risky.IsAlive) { try { c.Close(); } catch { /* */ } }
        Environment.Exit(0);
        return 0;
    }
}
