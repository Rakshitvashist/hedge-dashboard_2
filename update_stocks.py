"""
update_stocks.py
----------------
Updates all stock CSVs in the TOTAL_STOCKS folder with the latest daily data.

Usage:
    python update_stocks.py

Requirements:
    pip install yfinance pandas
"""

import os
import re
import pandas as pd
import yfinance as yf
from datetime import datetime, timedelta
import time

# ── Config ──────────────────────────────────────────────────────────────────
STOCKS_DIR = os.environ.get("TOTAL_STOCKS_DIR", "TOTAL_STOCKS")  # local project folder (run from project root)
NSE_SUFFIX = ".NS"          # yfinance NSE suffix
SLEEP_BETWEEN = 0.2         # seconds between API calls to avoid rate-limiting
DATE_FMT_CSV  = "%d-%m-%Y"  # format used inside the CSVs  (DD-MM-YYYY)
# ────────────────────────────────────────────────────────────────────────────


def parse_last_date(csv_path: str):
    """Return the last date present in the CSV (skip empty trailing lines)."""
    try:
        # Read only the tail to avoid loading huge files
        with open(csv_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        # Walk backwards to find the last non-blank data row
        for line in reversed(lines):
            line = line.strip()
            if not line:
                continue
            parts = line.split(",")
            if len(parts) < 6:
                continue
            date_str = parts[5].strip()
            try:
                return datetime.strptime(date_str, DATE_FMT_CSV)
            except ValueError:
                continue
    except Exception as e:
        print(f"    ⚠  Could not parse date from {csv_path}: {e}")
    return None


def get_static_cols(csv_path: str) -> dict:
    """
    Read Company, Industry, Symbol, Series, ISIN from the second row of the CSV.
    Returns a dict with those values.
    """
    try:
        with open(csv_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        for line in lines[1:]:           # skip header row
            line = line.strip()
            if not line:
                continue
            parts = line.split(",")
            if len(parts) < 6:
                continue
            return {
                "Company": parts[0],
                "Industry": parts[1],
                "Symbol":   parts[2],
                "Series":   parts[3],
                "ISIN":     parts[4],
            }
    except Exception:
        pass
    return {}


def fetch_new_data(ticker_symbol: str, start_date: datetime):
    """
    Fetch daily OHLCV data from yfinance for the given ticker
    starting the day AFTER start_date up to today.
    """
    fetch_from = start_date + timedelta(days=1)
    fetch_to   = datetime.today() + timedelta(days=1)   # inclusive of today

    try:
        ticker = yf.Ticker(ticker_symbol)
        df = ticker.history(
            start=fetch_from.strftime("%Y-%m-%d"),
            end=fetch_to.strftime("%Y-%m-%d"),
            interval="1d",
            auto_adjust=True,
            actions=True,
        )
        return df if not df.empty else None
    except Exception as e:
        print(f"    ⚠  yfinance error for {ticker_symbol}: {e}")
        return None


def get_existing_dates(csv_path: str) -> set:
    """Read all dates already in the CSV to prevent duplicate appends."""
    dates = set()
    try:
        with open(csv_path, "r", encoding="utf-8") as f:
            next(f)  # skip header
            for line in f:
                line = line.strip()
                if not line:
                    continue
                parts = line.split(",")
                if len(parts) >= 6:
                    dates.add(parts[5].strip())
    except Exception:
        pass
    return dates


def append_new_rows(csv_path: str, static: dict, new_df: pd.DataFrame) -> int:
    """
    Append the new rows to the CSV file, skipping any dates already present.
    Returns the number of rows appended.
    """
    existing_dates = get_existing_dates(csv_path)
    rows_added = 0
    try:
        with open(csv_path, "a", encoding="utf-8", newline="") as f:
            for date_idx, row in new_df.iterrows():
                date_str = date_idx.strftime(DATE_FMT_CSV)
                if date_str in existing_dates:
                    continue  # already in file — skip to prevent duplicates
                open_  = row.get("Open",  0.0)
                high_  = row.get("High",  0.0)
                low_   = row.get("Low",   0.0)
                close_ = row.get("Close", 0.0)
                vol_   = int(row.get("Volume", 0))
                div_   = row.get("Dividends",    0.0)
                split_ = row.get("Stock Splits", 0.0)

                line = (
                    f"{static['Company']},"
                    f"{static['Industry']},"
                    f"{static['Symbol']},"
                    f"{static['Series']},"
                    f"{static['ISIN']},"
                    f"{date_str},"
                    f"{open_},"
                    f"{high_},"
                    f"{low_},"
                    f"{close_},"
                    f"{vol_},"
                    f"{div_},"
                    f"{split_}\n"
                )
                f.write(line)
                existing_dates.add(date_str)
                rows_added += 1
    except Exception as e:
        print(f"    Warn: Could not write to {csv_path}: {e}")
    return rows_added


def main():
    csv_files = sorted(
        f for f in os.listdir(STOCKS_DIR) if f.endswith(".csv")
    )
    total = len(csv_files)
    print(f"\n{'='*60}")
    print(f"  Stock Data Updater — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  Found {total} CSV files in:\n  {STOCKS_DIR}")
    print(f"{'='*60}\n")

    updated   = 0
    skipped   = 0
    errors    = 0
    total_new = 0

    for i, fname in enumerate(csv_files, 1):
        csv_path = os.path.join(STOCKS_DIR, fname)

        # Extract symbol from filename, e.g. "RELIANCE_1d_max.csv" → "RELIANCE"
        symbol_raw = fname.replace("_1d_max.csv", "")

        # yfinance ticker for NSE
        yf_ticker = symbol_raw + NSE_SUFFIX

        print(f"[{i:>4}/{total}] {symbol_raw:<20}", end=" ", flush=True)

        # --- Parse last date in the file ---
        last_date = parse_last_date(csv_path)
        if last_date is None:
            print("FAIL  Could not determine last date -- skipped")
            errors += 1
            continue

        today = datetime.today().replace(hour=0, minute=0, second=0, microsecond=0)
        if last_date >= today:
            print(f"OK   Already up-to-date ({last_date.strftime(DATE_FMT_CSV)})")
            skipped += 1
            continue

        print(f"last={last_date.strftime(DATE_FMT_CSV)} -> fetching...", end=" ", flush=True)

        # --- Read static meta columns from file ---
        static = get_static_cols(csv_path)
        if not static:
            print("FAIL  Could not read static columns -- skipped")
            errors += 1
            continue

        # Override symbol from the CSV's own Symbol column (handles special chars)
        actual_symbol = static.get("Symbol", symbol_raw)
        yf_ticker = actual_symbol + NSE_SUFFIX

        # --- Fetch new data ---
        new_df = fetch_new_data(yf_ticker, last_date)

        if new_df is None or new_df.empty:
            print("-- no new data")
            skipped += 1
            time.sleep(SLEEP_BETWEEN)
            continue

        # --- Append to file ---
        n = append_new_rows(csv_path, static, new_df)
        total_new += n
        updated += 1
        print(f"OK  +{n} rows")

        time.sleep(SLEEP_BETWEEN)

    print(f"\n{'='*60}")
    print(f"  Done!  Updated: {updated}  |  Skipped/up-to-date: {skipped}  |  Errors: {errors}")
    print(f"  Total new rows written: {total_new}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
