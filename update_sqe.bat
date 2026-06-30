@echo off
REM ==================================================================
REM  ONE COMMAND to update BOTH SQE dashboards with fresh data.
REM
REM  Refreshes live prices (yfinance) -> re-runs the backtests
REM  (START_MONTH 2019-12) -> regenerates data.js + each site's
REM  holdings.js -> commits & pushes BOTH repos:
REM     - Smcresearch/SQE-           (All Indices)
REM     - Smcresearch/SQE-ProQuant-  (Nifty 500 + All Indices)
REM  The main Rakshitvashist dashboard is left untouched.
REM
REM  Run from this folder (PowerShell):  .\update_sqe.bat
REM                              (cmd):  update_sqe
REM ==================================================================
"%~dp0host\Scripts\python.exe" "%~dp0update_sqe.py" --extract %*
echo.
pause
