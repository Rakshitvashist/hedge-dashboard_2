import os
import pandas as pd
import yfinance as yf
from datetime import datetime, timedelta

OUTPUT_FOLDER = "."  # saves NIFTY50_1d.csv, NIFTY500_1d.csv to project root

INDEX_MAP = {
    "NIFTY50":  "^NSEI",
    "NIFTY500": "^CRSLDX"
}

def parse_dates_robust(series):
    """Try both DD-MM-YYYY and YYYY-MM-DD (with optional time)."""
    parsed = pd.to_datetime(series, dayfirst=True, errors='coerce')
    # fill any that failed with ISO format
    mask = parsed.isna()
    if mask.any():
        parsed[mask] = pd.to_datetime(series[mask], format='%Y-%m-%d %H:%M:%S', errors='coerce')
        still_bad = parsed.isna()
        if still_bad.any():
            parsed[still_bad] = pd.to_datetime(series[still_bad], errors='coerce')
    return parsed

def download_range(yahoo_symbol, start, end):
    """Download yfinance data for a date range, return clean DataFrame."""
    raw = yf.download(yahoo_symbol, start=start, end=end,
                      interval="1d", auto_adjust=False, progress=False)
    if raw.empty:
        return pd.DataFrame()
    if isinstance(raw.columns, pd.MultiIndex):
        raw.columns = raw.columns.get_level_values(0)
    raw = raw.reset_index()
    if "Date" not in raw.columns:
        raw.rename(columns={raw.columns[0]: "Date"}, inplace=True)
    raw["Date"] = pd.to_datetime(raw["Date"]).dt.date  # keep as date object
    for col in ["Open", "High", "Low", "Close", "Adj Close", "Volume"]:
        if col not in raw.columns:
            raw[col] = 0
    return raw[["Date", "Open", "High", "Low", "Close", "Adj Close", "Volume"]]

# ─── MAIN LOOP ────────────────────────────────────────────────────────────────
for index_name, yahoo_symbol in INDEX_MAP.items():
    output_file = os.path.join(OUTPUT_FOLDER, f"{index_name}_1d.csv")
    print(f"\n[{index_name}] ({yahoo_symbol})")

    try:
        today = datetime.now().date()
        tomorrow = today + timedelta(days=1)

        if os.path.exists(output_file):
            # ── Read existing, normalize ALL dates to datetime.date ──
            existing = pd.read_csv(output_file)
            existing["_dt"] = parse_dates_robust(existing["Date"].astype(str))
            existing = existing.dropna(subset=["_dt"]).copy()
            existing["_dt"] = existing["_dt"].dt.date
            existing = existing.sort_values("_dt").reset_index(drop=True)

            last_date = existing["_dt"].iloc[-1]
            print(f"  Existing ends: {last_date} | Today: {today}")

            # Always re-fetch last 7 calendar days to correct stale intraday closes
            refetch_start = (last_date - timedelta(days=7)).strftime("%Y-%m-%d")
            refetch_end   = tomorrow.strftime("%Y-%m-%d")

            new_raw = download_range(yahoo_symbol, refetch_start, refetch_end)
            if new_raw.empty:
                print(f"  No new data returned — keeping existing file")
                continue

            # Trim existing to rows strictly before the refetch window
            cutoff = new_raw["Date"].min()
            existing_trimmed = existing[existing["_dt"] < cutoff].copy()

            # Build fresh combined DataFrame
            combined = pd.DataFrame({
                "Index Name": [index_name] * (len(existing_trimmed) + len(new_raw)),
                "Symbol":     [yahoo_symbol] * (len(existing_trimmed) + len(new_raw)),
            })

            # existing_trimmed rows
            old_part = existing_trimmed.copy()
            old_part["Date"] = old_part["_dt"].apply(lambda d: d.strftime("%d-%m-%Y"))
            for col in ["Open", "High", "Low", "Close", "Adj Close", "Volume"]:
                if col not in old_part.columns:
                    old_part[col] = 0

            # new rows
            new_part = new_raw.copy()
            new_part["Date"] = new_part["Date"].apply(lambda d: d.strftime("%d-%m-%Y"))

            final_df = pd.concat([
                old_part[["Index Name", "Symbol", "Date", "Open", "High", "Low", "Close", "Adj Close", "Volume"]].assign(**{"Index Name": index_name, "Symbol": yahoo_symbol}),
                new_part.assign(**{"Index Name": index_name, "Symbol": yahoo_symbol})[["Index Name", "Symbol", "Date", "Open", "High", "Low", "Close", "Adj Close", "Volume"]]
            ], ignore_index=True)

            final_df.to_csv(output_file, index=False)
            print(f"  Saved {len(final_df)} rows. Last date: {new_raw['Date'].max()}")

            # Quick sanity print
            last2 = new_raw.sort_values("Date").tail(2)
            if len(last2) >= 2:
                pc = float(last2.iloc[-2]["Close"])
                lc = float(last2.iloc[-1]["Close"])
                pd_ = last2.iloc[-2]["Date"]
                ld  = last2.iloc[-1]["Date"]
                apr_rows = existing[existing["_dt"] < datetime(today.year, today.month, 1).date()]
                apr30c = float(existing[existing["_dt"] < datetime(today.year, today.month, 1).date()].iloc[-1][next(c for c in existing.columns if c.lower() == "close")]) if not apr_rows.empty else 0
                print(f"  Daily ({pd_} -> {ld}): {(lc/pc-1)*100:+.4f}%")
                if apr30c:
                    print(f"  MTD   (Apr30={apr30c:.2f} -> {ld}={lc:.2f}): {(lc/apr30c-1)*100:+.4f}%")
        else:
            # ── Full download ──
            print(f"  File not found — full download...")
            raw = yf.download(yahoo_symbol, period="max", interval="1d",
                              auto_adjust=False, progress=False)
            new_raw = download_range.__wrapped__(yahoo_symbol, None, None) if False else None
            # manual for full download
            if isinstance(raw.columns, pd.MultiIndex):
                raw.columns = raw.columns.get_level_values(0)
            raw = raw.reset_index()
            if "Date" not in raw.columns:
                raw.rename(columns={raw.columns[0]: "Date"}, inplace=True)
            raw["Date"] = pd.to_datetime(raw["Date"]).dt.strftime("%d-%m-%Y")
            for col in ["Open", "High", "Low", "Close", "Adj Close", "Volume"]:
                if col not in raw.columns:
                    raw[col] = 0
            raw.insert(0, "Index Name", index_name)
            raw.insert(1, "Symbol", yahoo_symbol)
            raw[["Index Name","Symbol","Date","Open","High","Low","Close","Adj Close","Volume"]].to_csv(output_file, index=False)
            print(f"  Saved {len(raw)} rows")

    except Exception as e:
        import traceback
        print(f"  ERROR: {e}")
        traceback.print_exc()

print("\nDone.")