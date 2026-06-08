@echo off
echo Compiling crypto_tool.cpp...
g++ -O3 crypto_tool.cpp -o crypto_tool.exe -lbcrypt -lcrypt32
if %ERRORLEVEL% equ 0 (
    echo Compilation successful! Created crypto_tool.exe.
) else (
    echo Compilation failed!
    exit /b %ERRORLEVEL%
)
