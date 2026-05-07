# ==============================================================================
# Institutional Hedge Strategy - Automated Daily Pipeline (Institutional_Run)
# ==============================================================================

Write-Host "`n[*] Starting Institutional_Run Pipeline..." -ForegroundColor Cyan

# 1. Download Stock Data (Nifty 50 & Nifty 500)
Write-Host "`n[1/5] Downloading Stock Data..." -ForegroundColor Yellow
python data_set_nifty5.py
python data_set_nifty500.py

# 2. Download Index Data (Spot & Futures)
Write-Host "`n[2/5] Downloading Index Data..." -ForegroundColor Yellow
python index_data.py

# Reminder for Manual Bond Update
Write-Host "`n[!] ATTENTION: Please ensure 'India 1-Year Bond Yield Historical Data.csv' is updated manually if needed." -ForegroundColor Magenta
Write-Host "Press any key to continue after checking bond data..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

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
