import yfinance as yf
import pandas as pd
import os
from datetime import datetime
import time
import sys

print("🚀 NIFTY 500 CSV → Daily OHLC CSVs")
print("📁 INPUT: Your CSV with 'Company Name','Industry','Symbol'")
print("📁 OUTPUT: nifty500/ → SYMBOL_1d_max.csv")

# STEP 1: INPUT CSV FILE (update path)
input_csv = "ind_nifty50list.csv"  # CHANGE TO YOUR FILE PATH

# STEP 2: Create output folder
output_folder = "nifty50_host"
os.makedirs(output_folder, exist_ok=True)

# STEP 3: Read CSV & extract Symbols
df = pd.read_csv(input_csv)
symbols = df['Symbol'].dropna().unique().tolist()
print(f"✅ Found {len(symbols)} symbols: {symbols[:5]}...")

success_count = 0
failed_symbols = []

for i, symbol in enumerate(symbols, 1):
    print(f"[{i:3d}/{len(symbols)}] {symbol:<12}", end=" ")
    
    full_symbol = f"{symbol}.NS"
    
    try:
        ticker = yf.Ticker(full_symbol)
        data = ticker.history(period="max", interval="1d")
        
        if len(data) > 0:
            # Format: DD-MM-YYYY
            data.index = data.index.strftime("%d-%m-%Y")
            data.reset_index(inplace=True)
            data.rename(columns={"Datetime": "Date"}, inplace=True)
            
            # Get metadata from input CSV
            row = df[df['Symbol'] == symbol].iloc[0]
            company = row['Company Name']
            industry = row['Industry']
            
            # Add metadata columns
            metadata = pd.DataFrame({
                "Symbol": [symbol] * len(data),
                "Company": [company] * len(data),
                "Industry": [industry] * len(data),
                "Index": ["NIFTY500"] * len(data)
            })
            
            # Combine
            final_df = pd.concat([metadata, data.reset_index(drop=True)], axis=1)
            
            # Save individual CSV
            filename = f"{symbol}_1d_max.csv"
            filepath = os.path.join(output_folder, filename)
            final_df.to_csv(filepath, index=False)
            
            print(f"✅ {len(data):,} days")
            success_count += 1
            
        else:
            print("⚠️  NO DATA")
            
    except Exception as e:
        print(f"❌ ERROR: {str(e)[:25]}")
        failed_symbols.append(symbol)
    
    # Rate limit
    time.sleep(0.3)

print(f"\n🎉 COMPLETE: {success_count}/{len(symbols)} → {output_folder}/")
print(f"📁 {success_count} CSV files ready!")
if failed_symbols:
    print(f"⚠️  Failed: {len(failed_symbols)} → {failed_symbols[:5]}")

print("\n📋 EACH CSV FORMAT:")
print("Symbol,Company,Industry,Index,Date,Open,High,Low,Close,Volume,Dividends,Stock Splits")
print("\n✅ PERFECT for your analysis pipeline!")