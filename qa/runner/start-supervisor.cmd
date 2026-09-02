@echo off
REM Work-PC autonomous QA supervisor - Task Scheduler entrypoint.
REM Kept deliberately dumb: resolve node, run the supervisor, append output to a log.
REM All real logic lives in supervisor.mjs so it stays testable without Task Scheduler.
setlocal

set "RUNNER=%~dp0"
set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"

if not exist "%RUNNER%logs" mkdir "%RUNNER%logs"

cd /d "%RUNNER%..\.."
"%NODE_EXE%" "%RUNNER%supervisor.mjs" >> "%RUNNER%logs\supervisor-stdout.log" 2>&1
exit /b %ERRORLEVEL%
