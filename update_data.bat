@echo off
REM ==================================================================
REM  ADD THE NEWEST DATA to both SQE dashboards (routine update).
REM
REM  Refreshes the latest prices from yfinance (INCREMENTAL — only new
REM  days are appended, old data is never re-fetched), regenerates the
REM  data, and pushes BOTH repos. No backtest rebuild (fast).
REM     - Smcresearch/SQE-           (All Indices)
REM     - Smcresearch/SQE-ProQuant-  (Nifty 500 + All Indices)
REM
REM  Run from this folder (PowerShell):  .\update_data.bat
REM                              (cmd):  update_data
REM
REM  NOTE: once a NEW MONTH closes (new portfolio formed), run
REM        update_sqe instead to also re-run the backtests.
REM ==================================================================
"%~dp0host\Scripts\python.exe" "%~dp0update_sqe.py" --prices %*
echo.
pause
