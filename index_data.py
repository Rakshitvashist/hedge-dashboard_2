import os
import pandas as pd
import yfinance as yf

# =========================================
# SETTINGS
# =========================================
OUTPUT_FOLDER = "index_data"
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

INDEX_MAP = {
    "NIFTY50": "^NSEI",
    "NIFTY500": "^CRSLDX"
}

# =========================================
# FUNCTION TO CLEAN yfinance OUTPUT
# =========================================
def normalize_yf_dataframe(df):
    if df.empty:
        return df

    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    df = df.reset_index()

    if "Date" not in df.columns:
        first_col = df.columns[0]
        df.rename(columns={first_col: "Date"}, inplace=True)

    df["Date"] = pd.to_datetime(df["Date"]).dt.strftime("%d-%m-%Y")

    expected_cols = ["Open", "High", "Low", "Close", "Adj Close", "Volume"]
    for col in expected_cols:
        if col not in df.columns:
            df[col] = 0

    return df[["Date", "Open", "High", "Low", "Close", "Adj Close", "Volume"]]

# =========================================
# DOWNLOAD LOOP
# =========================================
for index_name, yahoo_symbol in INDEX_MAP.items():
    print(f"\nDownloading {index_name} ({yahoo_symbol}) ...")

    try:
        raw_df = yf.download(
            tickers=yahoo_symbol,
            period="max",
            interval="1d",
            auto_adjust=False,
            progress=False
        )

        if raw_df.empty:
            print(f"❌ No data found for {index_name}")
            continue

        clean_df = normalize_yf_dataframe(raw_df)

        final_df = pd.DataFrame({
            "Index Name": [index_name] * len(clean_df),
            "Symbol": [yahoo_symbol] * len(clean_df),
            "Date": clean_df["Date"],
            "Open": clean_df["Open"],
            "High": clean_df["High"],
            "Low": clean_df["Low"],
            "Close": clean_df["Close"],
            "Adj Close": clean_df["Adj Close"],
            "Volume": clean_df["Volume"]
        })

        output_file = os.path.join(OUTPUT_FOLDER, f"{index_name}_1d.csv")
        final_df.to_csv(output_file, index=False)

        print(f"✅ Saved: {output_file}")
        print(f"Rows: {len(final_df)}")

    except Exception as e:
        print(f"❌ Error downloading {index_name}: {e}")

print("\nDone.")