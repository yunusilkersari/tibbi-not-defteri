@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================
echo   Tibbi Not Defteri - Masaustu Kurulumu
echo ============================================================
echo.
echo WebView2 bilesenleri indirilecek (tek seferlik) ve masaustune
echo kisayol olusturulacak. Lutfen bekleyin...
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0Defter.ps1" -Setup
echo.
echo Bu pencereyi kapatabilirsiniz.
pause >nul
