# Durante a atualização: tira uma captura da tela a cada 1,5 s e registra os processos e a versão do CleanCode.
param([string]$Exe, [string]$Out, [int]$Seconds = 150)
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$sw = [Diagnostics.Stopwatch]::StartNew(); $n = 0
while ($sw.Elapsed.TotalSeconds -lt $Seconds) {
  try {
    $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
    $bmp.Save((Join-Path $Out ('shot-{0:D3}.png' -f $n)), [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()
  } catch { }
  $ver = try { (Get-Item $Exe -ErrorAction Stop).VersionInfo.ProductVersion } catch { 'sem exe' }
  $procs = (Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match 'CleanCode|powershell|setup|Windows-x64' } | ForEach-Object { "$($_.ProcessName)#$($_.Id)" }) -join ' '
  "{0,6:N1}s  versão={1}  processos: {2}" -f $sw.Elapsed.TotalSeconds, $ver, $procs | Add-Content (Join-Path $Out 'timeline.txt')
  $n++; Start-Sleep -Milliseconds 1500
}
