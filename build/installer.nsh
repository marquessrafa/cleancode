; Antes de instalar/atualizar: encerra o helper de sensores da tarefa agendada (CleanCodeSensors).
; Na 1.4.0 ele rodava direto da pasta do app e ficava aberto, travando cc-lhm.exe na atualização.
!macro customInit
  nsExec::Exec 'schtasks.exe /End /TN CleanCodeSensors'
  Pop $0
  Sleep 1500
!macroend

; Integração com o menu de contexto do Explorer (por usuário)
!macro customInstall
  WriteRegStr HKCU "Software\Classes\Directory\shell\CleanCode" "" "Analisar com CleanCode"
  WriteRegStr HKCU "Software\Classes\Directory\shell\CleanCode" "Icon" '"$INSTDIR\CleanCode.exe",0'
  WriteRegStr HKCU "Software\Classes\Directory\shell\CleanCode\command" "" '"$INSTDIR\CleanCode.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\Drive\shell\CleanCode" "" "Analisar com CleanCode"
  WriteRegStr HKCU "Software\Classes\Drive\shell\CleanCode" "Icon" '"$INSTDIR\CleanCode.exe",0'
  WriteRegStr HKCU "Software\Classes\Drive\shell\CleanCode\command" "" '"$INSTDIR\CleanCode.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\CleanCode" "" "Analisar com CleanCode"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\CleanCode" "Icon" '"$INSTDIR\CleanCode.exe",0'
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\CleanCode\command" "" '"$INSTDIR\CleanCode.exe" "%V"'
!macroend

!macro customUnInstall
  nsExec::Exec 'schtasks.exe /End /TN CleanCodeSensors'
  Pop $0
  DeleteRegKey HKCU "Software\Classes\Directory\shell\CleanCode"
  DeleteRegKey HKCU "Software\Classes\Drive\shell\CleanCode"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\CleanCode"
!macroend
