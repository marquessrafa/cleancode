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
  DeleteRegKey HKCU "Software\Classes\Directory\shell\CleanCode"
  DeleteRegKey HKCU "Software\Classes\Drive\shell\CleanCode"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\CleanCode"
!macroend
