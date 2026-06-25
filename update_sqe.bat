@echo off
REM ============================================================
REM  One command to refresh the SQE All-Indices site and push.
REM  Regenerates data.js + holdings.js from the workbook (same
REM  source state, no mismatch) and pushes to Smcresearch/SQE-.
REM  Run from this folder:  update_sqe
REM ============================================================
"%~dp0host\Scripts\python.exe" "%~dp0update_sqe.py" --extract %*
echo.
pause
