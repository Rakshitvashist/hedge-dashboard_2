# ==============================================================================
# Institutional Hedge Strategy - Automated Daily Pipeline (Institutional_Run)
# ==============================================================================

# Set UTF-8 encoding so Python emoji/unicode print statements don't crash
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = "utf-8"

Write-Host "`n[*] Starting Institutional_Run Pipeline..." -ForegroundColor Cyan

# 1. Download Stock Data (Nifty 50, Nifty 500 & Total 759 universe)
Write-Host "`n[1/5] Downloading Stock Data..." -ForegroundColor Yellow
python data_set_nifty5.py
python data_set_nifty500.py
# Keep the broad 759-stock universe (TOTAL_STOCKS) current as well
python update_stocks.py

# 2. Download Index Data (Spot & Futures)
Write-Host "`n[2/5] Downloading Index Data..." -ForegroundColor Yellow
python index_data.py

# Reminder for Manual Bond Update (non-blocking)
Write-Host "`n[NOTE] Make sure 'India 1-Year Bond Yield Historical Data.csv' is up to date." -ForegroundColor Yellow

# 3. Run Strategy Engine (Generate Reports)
Write-Host "`n[3/5] Running SOM Hedge Backtester..." -ForegroundColor Yellow
# Run for Nifty 50
$env:STOCKS_FOLDER = "nifty50_host"
$env:BENCHMARK_FILE = "NIFTY50_1d.csv"
$env:OUTPUT_FILE = "Hedge_nifty50.xlsx"
$env:DEEP_DIVE_FILE = "Hedge_Institutional_Deep_Dive_nifty50.xlsx"
python som_hedge.py

# Run for Nifty 500
$env:STOCKS_FOLDER = "nifty500_host"
$env:BENCHMARK_FILE = "NIFTY500_1d.csv"
$env:OUTPUT_FILE = "Hedge_nifty500.xlsx"
$env:DEEP_DIVE_FILE = "Hedge_Institutional_Deep_Dive_nifty500.xlsx"
python som_hedge.py

# Run for Total 759 universe (TOTAL_STOCKS, benchmarked against Nifty 500)
$env:STOCKS_FOLDER = "TOTAL_STOCKS"
$env:BENCHMARK_FILE = "NIFTY500_1d.csv"
$env:OUTPUT_FILE = "Hedge_Pro_Summary_759.xlsx"
$env:DEEP_DIVE_FILE = "Hedge_Institutional_Deep_Dive_759.xlsx"
python som_hedge.py

# 4. Extract Dashboard Data
Write-Host "`n[4/5] Extracting Data for Web Dashboard..." -ForegroundColor Yellow
python extract_dashboard_data.py

# 5. Push to GitHub
Write-Host "`n[5/5] Deploying to GitHub..." -ForegroundColor Yellow
git add .
git commit -m "Daily Automated Update: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
git push

Write-Host "`n✅ Pipeline Completed! Your dashboard should be live in ~60 seconds." -ForegroundColor Green
Write-Host "URL: https://github.com/<your-username>/hedge-dashboard" -ForegroundColor Gray
