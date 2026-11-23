// cc-sensors: lê os sensores de temperatura do Mac e imprime JSON numa linha.
// Apple Silicon: serviços HID de temperatura (IOHIDEventSystemClient, página 0xff00 / uso 5).
// Intel: chave TC0P/TC0D/TC0E do SMC (AppleSMC), quando não há sensores HID.
// Não precisa de root. Compilado no build do Mac (scripts/build-electron.mjs).
#include <CoreFoundation/CoreFoundation.h>
#include <IOKit/IOKitLib.h>
#include <stdio.h>
#include <string.h>

// ---------- HID (símbolos exportados pelo IOKit, sem header público) ----------
typedef struct __IOHIDEventSystemClient *IOHIDEventSystemClientRef;
typedef struct __IOHIDServiceClient *IOHIDServiceClientRef;
typedef struct __IOHIDEvent *IOHIDEventRef;
extern IOHIDEventSystemClientRef IOHIDEventSystemClientCreate(CFAllocatorRef allocator);
extern int IOHIDEventSystemClientSetMatching(IOHIDEventSystemClientRef client, CFDictionaryRef match);
extern CFArrayRef IOHIDEventSystemClientCopyServices(IOHIDEventSystemClientRef client);
extern CFTypeRef IOHIDServiceClientCopyProperty(IOHIDServiceClientRef service, CFStringRef key);
extern IOHIDEventRef IOHIDServiceClientCopyEvent(IOHIDServiceClientRef service, int64_t type, int32_t options, int64_t timestamp);
extern double IOHIDEventGetFloatValue(IOHIDEventRef event, int32_t field);

#define HID_TEMPERATURE 15
#define HID_FIELD(type) ((type) << 16)

static void json_escape(const char *s, char *out, size_t n) {
  size_t j = 0;
  for (size_t i = 0; s[i] && j + 2 < n; i++) {
    if (s[i] == '"' || s[i] == '\\') out[j++] = '\\';
    out[j++] = s[i];
  }
  out[j] = 0;
}

static CFNumberRef num(int v) { return CFNumberCreate(NULL, kCFNumberIntType, &v); }

/** Lista sensores HID; devolve a quantidade lida. Acumula máximos por grupo. */
static int read_hid(double *cpu, double *gpu, double *battery, double *ssd, int print) {
  const void *keys[] = { CFSTR("PrimaryUsagePage"), CFSTR("PrimaryUsage") };
  CFNumberRef page = num(0xff00), usage = num(5);
  const void *vals[] = { page, usage };
  CFDictionaryRef match = CFDictionaryCreate(NULL, keys, vals, 2, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
  CFRelease(page); CFRelease(usage);
  IOHIDEventSystemClientRef client = IOHIDEventSystemClientCreate(kCFAllocatorDefault);
  if (!client) { CFRelease(match); return 0; }
  IOHIDEventSystemClientSetMatching(client, match);
  CFArrayRef services = IOHIDEventSystemClientCopyServices(client);
  int count = 0, first = 1;
  if (services) {
    for (CFIndex i = 0; i < CFArrayGetCount(services); i++) {
      IOHIDServiceClientRef svc = (IOHIDServiceClientRef)CFArrayGetValueAtIndex(services, i);
      CFStringRef name = (CFStringRef)IOHIDServiceClientCopyProperty(svc, CFSTR("Product"));
      if (!name) continue;
      char buf[128] = "";
      CFStringGetCString(name, buf, sizeof buf, kCFStringEncodingUTF8);
      CFRelease(name);
      IOHIDEventRef ev = IOHIDServiceClientCopyEvent(svc, HID_TEMPERATURE, 0, 0);
      if (!ev) continue;
      double t = IOHIDEventGetFloatValue(ev, HID_FIELD(HID_TEMPERATURE));
      CFRelease(ev);
      if (t <= 0 || t > 150) continue; // leitura inválida
      count++;
      // agrupamento por nome do sensor
      if (strstr(buf, "ACC") || strstr(buf, "tdie") || strstr(buf, "CPU")) { if (t > *cpu) *cpu = t; }
      else if (strstr(buf, "GPU")) { if (t > *gpu) *gpu = t; }
      else if (strstr(buf, "battery") || strstr(buf, "Battery")) { if (t > *battery) *battery = t; }
      else if (strstr(buf, "NAND") || strstr(buf, "SSD")) { if (t > *ssd) *ssd = t; }
      if (print) {
        char esc[160];
        json_escape(buf, esc, sizeof esc);
        printf("%s{\"name\":\"%s\",\"c\":%.1f}", first ? "" : ",", esc, t);
        first = 0;
      }
    }
    CFRelease(services);
  }
  CFRelease(client);
  CFRelease(match);
  return count;
}

// ---------- SMC (Macs Intel) ----------
typedef struct { unsigned char major, minor, build, reserved; unsigned short release; } SMCVers;
typedef struct { unsigned short version, length; unsigned int cpuPLimit, gpuPLimit, memPLimit; } SMCPLimit;
typedef struct { unsigned int dataSize, dataType; unsigned char dataAttributes; } SMCKeyInfo;
typedef struct {
  unsigned int key; SMCVers vers; SMCPLimit pLimitData; SMCKeyInfo keyInfo;
  unsigned char result, status, data8; unsigned int data32; unsigned char bytes[32];
} SMCParam;

static unsigned int fourcc(const char *s) { return (unsigned)s[0] << 24 | (unsigned)s[1] << 16 | (unsigned)s[2] << 8 | (unsigned)s[3]; }

static int smc_call(io_connect_t c, SMCParam *in, SMCParam *out) {
  size_t outSize = sizeof(SMCParam);
  return IOConnectCallStructMethod(c, 2, in, sizeof(SMCParam), out, &outSize);
}

static double smc_temp(io_connect_t c, const char *key) {
  SMCParam in, out;
  memset(&in, 0, sizeof in); memset(&out, 0, sizeof out);
  in.key = fourcc(key);
  in.data8 = 9; // ler informações da chave
  if (smc_call(c, &in, &out) != kIOReturnSuccess || out.result != 0) return 0;
  in.keyInfo.dataSize = out.keyInfo.dataSize;
  in.data8 = 5; // ler valor
  memset(&out, 0, sizeof out);
  if (smc_call(c, &in, &out) != kIOReturnSuccess || out.result != 0) return 0;
  // tipo sp78: inteiro com sinal de 8 bits + fração de 8 bits
  return (double)(signed char)out.bytes[0] + out.bytes[1] / 256.0;
}

static double read_smc_cpu(void) {
  io_service_t svc = IOServiceGetMatchingService(kIOMainPortDefault, IOServiceMatching("AppleSMC"));
  if (!svc) return 0;
  io_connect_t conn = 0;
  kern_return_t kr = IOServiceOpen(svc, mach_task_self(), 0, &conn);
  IOObjectRelease(svc);
  if (kr != kIOReturnSuccess) return 0;
  double best = 0;
  const char *keys[] = { "TC0P", "TC0D", "TC0E", "TC0F", "TCXC" };
  for (int i = 0; i < 5; i++) { double t = smc_temp(conn, keys[i]); if (t > 0 && t < 150 && t > best) best = t; }
  IOServiceClose(conn);
  return best;
}

int main(int argc, char **argv) {
  int list = argc > 1 && strcmp(argv[1], "--list") == 0;
  double cpu = 0, gpu = 0, battery = 0, ssd = 0;
  printf("{\"sensors\":[");
  int n = read_hid(&cpu, &gpu, &battery, &ssd, list);
  printf("],");
  const char *source = n > 0 ? "hid" : "none";
  if (cpu <= 0) { double s = read_smc_cpu(); if (s > 0) { cpu = s; source = "smc"; } }
  printf("\"source\":\"%s\",\"count\":%d", source, n);
  if (cpu > 0) printf(",\"cpu\":%.1f", cpu);
  if (gpu > 0) printf(",\"gpu\":%.1f", gpu);
  if (battery > 0) printf(",\"battery\":%.1f", battery);
  if (ssd > 0) printf(",\"ssd\":%.1f", ssd);
  printf("}\n");
  return 0;
}
