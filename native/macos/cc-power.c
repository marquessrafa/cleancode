// cc-power: consumo e frequência no Apple Silicon sem senha, pelo IOReport (a mesma fonte de
// ferramentas como macmon/asitop). Imprime uma linha JSON por segundo:
//   {"cpuW":..,"gpuW":..,"aneW":..,"dramW":..,"clusters":[{"name":"ECPU","mhz":..,"active":..}],"gpuMhz":..,"gpuActive":..}
// As tabelas de frequência (DVFS) vêm do IORegistry (AppleARMIODevice "pmgr", voltage-states*).
// Uso: cc-power [--once]
#include <CoreFoundation/CoreFoundation.h>
#include <IOKit/IOKitLib.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

typedef struct IOReportSubscription *IOReportSubscriptionRef;
extern CFDictionaryRef IOReportCopyChannelsInGroup(CFStringRef, CFStringRef, uint64_t, uint64_t, uint64_t);
extern void IOReportMergeChannels(CFDictionaryRef, CFDictionaryRef, CFTypeRef);
extern IOReportSubscriptionRef IOReportCreateSubscription(void *, CFMutableDictionaryRef, CFMutableDictionaryRef *, uint64_t, CFTypeRef);
extern CFDictionaryRef IOReportCreateSamples(IOReportSubscriptionRef, CFMutableDictionaryRef, CFTypeRef);
extern CFDictionaryRef IOReportCreateSamplesDelta(CFDictionaryRef, CFDictionaryRef, CFTypeRef);
extern CFStringRef IOReportChannelGetGroup(CFDictionaryRef);
extern CFStringRef IOReportChannelGetSubGroup(CFDictionaryRef);
extern CFStringRef IOReportChannelGetChannelName(CFDictionaryRef);
extern CFStringRef IOReportChannelGetUnitLabel(CFDictionaryRef);
extern int64_t IOReportSimpleGetIntegerValue(CFDictionaryRef, int32_t);
extern int32_t IOReportStateGetCount(CFDictionaryRef);
extern CFStringRef IOReportStateGetNameForIndex(CFDictionaryRef, int32_t);
extern int64_t IOReportStateGetResidency(CFDictionaryRef, int32_t);

static void cstr(CFStringRef s, char *out, size_t n) { out[0] = 0; if (s) CFStringGetCString(s, out, (CFIndex)n, kCFStringEncodingUTF8); }

// tabela DVFS: pares (frequência, tensão) de 32 bits; normaliza para MHz
static int dvfs(const char *key, double *mhz, int max) {
  int n = 0;
  io_iterator_t it;
  if (IOServiceGetMatchingServices(kIOMainPortDefault, IOServiceMatching("AppleARMIODevice"), &it) != KERN_SUCCESS) return 0;
  io_object_t e;
  while ((e = IOIteratorNext(it))) {
    io_name_t name; IORegistryEntryGetName(e, name);
    if (strcmp(name, "pmgr") == 0) {
      CFStringRef k = CFStringCreateWithCString(NULL, key, kCFStringEncodingUTF8);
      CFTypeRef d = IORegistryEntryCreateCFProperty(e, k, kCFAllocatorDefault, 0);
      CFRelease(k);
      if (d && CFGetTypeID(d) == CFDataGetTypeID()) {
        const uint8_t *p = CFDataGetBytePtr(d); CFIndex len = CFDataGetLength(d);
        for (CFIndex i = 0; i + 8 <= len && n < max; i += 8) {
          uint32_t f; memcpy(&f, p + i, 4);
          double v = f > 1e8 ? f / 1e6 : f > 1e5 ? f / 1e3 : f;
          if (v > 0) mhz[n++] = v;
        }
      }
      if (d) CFRelease(d);
    }
    IOObjectRelease(e);
  }
  IOObjectRelease(it);
  return n;
}

static double energyToW(int64_t v, const char *unit, double dt) {
  double j = (double)v;
  if (strcmp(unit, "mJ") == 0) j /= 1e3; else if (strcmp(unit, "uJ") == 0) j /= 1e6; else if (strcmp(unit, "nJ") == 0) j /= 1e9;
  double w = dt > 0.2 ? j / dt : 0;
  return w < 0 || w > 400 ? 0 : w; // descarta leituras impossíveis (contador reiniciado ou intervalo curto)
}

// frequência média ponderada pela residência dos estados ativos (exclui IDLE/DOWN/OFF)
static void residency(CFDictionaryRef ch, const double *tab, int ntab, double *mhz, double *active) {
  int32_t n = IOReportStateGetCount(ch);
  double total = 0, act = 0, wsum = 0; int k = 0;
  for (int32_t i = 0; i < n; i++) {
    char sn[64]; cstr(IOReportStateGetNameForIndex(ch, i), sn, sizeof sn);
    double r = (double)IOReportStateGetResidency(ch, i);
    total += r;
    if (strstr(sn, "IDLE") || strstr(sn, "DOWN") || strstr(sn, "OFF")) continue;
    act += r;
    if (k < ntab) wsum += r * tab[k];
    k++;
  }
  *mhz = act > 0 ? wsum / act : 0;
  *active = total > 0 ? act / total : 0;
}

int main(int argc, char **argv) {
  int once = argc > 1 && strcmp(argv[1], "--once") == 0;
  double ecpu[32], pcpu[32], gpu[32];
  int ne = dvfs("voltage-states1-sram", ecpu, 32), np = dvfs("voltage-states5-sram", pcpu, 32), ng = dvfs("voltage-states9", gpu, 32);
  if (!ng) ng = dvfs("voltage-states9-sram", gpu, 32);

  CFDictionaryRef energy = IOReportCopyChannelsInGroup(CFSTR("Energy Model"), NULL, 0, 0, 0);
  CFDictionaryRef cpu = IOReportCopyChannelsInGroup(CFSTR("CPU Stats"), CFSTR("CPU Complex Performance States"), 0, 0, 0);
  CFDictionaryRef gpus = IOReportCopyChannelsInGroup(CFSTR("GPU Stats"), CFSTR("GPU Performance States"), 0, 0, 0);
  if (!energy) { printf("{\"error\":\"IOReport indisponível\"}\n"); return 1; }
  if (cpu) IOReportMergeChannels(energy, cpu, NULL);
  if (gpus) IOReportMergeChannels(energy, gpus, NULL);
  CFMutableDictionaryRef chans = CFDictionaryCreateMutableCopy(kCFAllocatorDefault, CFDictionaryGetCount(energy), energy);
  CFMutableDictionaryRef subbed = NULL;
  IOReportSubscriptionRef sub = IOReportCreateSubscription(NULL, chans, &subbed, 0, NULL);
  if (!sub) { printf("{\"error\":\"assinatura IOReport falhou\"}\n"); return 1; }

  CFDictionaryRef prev = IOReportCreateSamples(sub, subbed, NULL);
  CFAbsoluteTime tprev = CFAbsoluteTimeGetCurrent();
  for (;;) {
    usleep(once ? 400000 : 1000000);
    CFDictionaryRef cur = IOReportCreateSamples(sub, subbed, NULL);
    CFAbsoluteTime tcur = CFAbsoluteTimeGetCurrent();
    double dt = tcur - tprev;
    CFDictionaryRef delta = IOReportCreateSamplesDelta(prev, cur, NULL);
    CFRelease(prev); prev = cur; tprev = tcur;
    double cpuW = 0, gpuW = 0, aneW = 0, dramW = 0, gpuMhz = 0, gpuAct = 0;
    char clusters[1024] = ""; size_t cl = 0;
    CFArrayRef arr = delta ? CFDictionaryGetValue(delta, CFSTR("IOReportChannels")) : NULL;
    for (CFIndex i = 0; arr && i < CFArrayGetCount(arr); i++) {
      CFDictionaryRef ch = CFArrayGetValueAtIndex(arr, i);
      char grp[64], sg[96], nm[96], unit[16];
      cstr(IOReportChannelGetGroup(ch), grp, sizeof grp); cstr(IOReportChannelGetSubGroup(ch), sg, sizeof sg);
      cstr(IOReportChannelGetChannelName(ch), nm, sizeof nm); cstr(IOReportChannelGetUnitLabel(ch), unit, sizeof unit);
      if (strcmp(grp, "Energy Model") == 0) {
        double w = energyToW(IOReportSimpleGetIntegerValue(ch, 0), unit, dt);
        if (strstr(nm, "CPU Energy")) cpuW += w;
        else if (strcmp(nm, "GPU Energy") == 0 || strcmp(nm, "GPU") == 0) gpuW += w;
        else if (strncmp(nm, "ANE", 3) == 0) aneW += w;
        else if (strncmp(nm, "DRAM", 4) == 0) dramW += w;
      } else if (strcmp(grp, "CPU Stats") == 0) {
        int isE = nm[0] == 'E' || strstr(nm, "ECPU") != NULL;
        double mhz, act; residency(ch, isE ? ecpu : pcpu, isE ? ne : np, &mhz, &act);
        if (cl < sizeof clusters - 120) cl += (size_t)snprintf(clusters + cl, sizeof clusters - cl, "%s{\"name\":\"%s\",\"mhz\":%.0f,\"active\":%.3f}", cl ? "," : "", nm, mhz, act);
      } else if (strcmp(grp, "GPU Stats") == 0 && strstr(nm, "GPUPH")) {
        residency(ch, gpu, ng, &gpuMhz, &gpuAct);
      }
    }
    if (delta) CFRelease(delta);
    printf("{\"cpuW\":%.3f,\"gpuW\":%.3f,\"aneW\":%.3f,\"dramW\":%.3f,\"clusters\":[%s],\"gpuMhz\":%.0f,\"gpuActive\":%.3f,\"tables\":{\"e\":%d,\"p\":%d,\"g\":%d}}\n", cpuW, gpuW, aneW, dramW, clusters, gpuMhz, gpuAct, ne, np, ng);
    fflush(stdout);
    if (once) break;
  }
  return 0;
}
