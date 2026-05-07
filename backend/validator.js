const fs = require('fs');
const path = require('path');

/**
 * Validator for SOM Institutional Dashboard Data
 * Checks for mathematical consistency and unit errors.
 */

const DATA_PATH = path.join(__dirname, '../data.js');

function validate() {
  console.log("🔍 Starting Data Validation...");

  let content;
  try {
    content = fs.readFileSync(DATA_PATH, 'utf8');
  } catch (e) {
    console.error("❌ Error: data.js not found at " + DATA_PATH);
    return;
  }

  // Extract the object from data.js (assuming 'const DASHBOARD_DATA = { ... };')
  const jsonMatch = content.match(/const DASHBOARD_DATA = (\{[\s\S]*\});/);
  if (!jsonMatch) {
    console.error("❌ Error: Could not parse DASHBOARD_DATA from data.js");
    return;
  }

  let DASHBOARD_DATA;
  try {
    // We use eval here carefully as it's a local script and the file is JS, not JSON.
    // In a production app, we would use JSON files.
    DASHBOARD_DATA = eval(`(${jsonMatch[1]})`);
  } catch (e) {
    console.error("❌ Error: Failed to eval DASHBOARD_DATA. Check for syntax errors.");
    return;
  }

  let totalErrors = 0;
  let totalWarnings = 0;

  for (const universe in DASHBOARD_DATA) {
    console.log(`\n📊 Validating Universe: ${universe}`);
    const data = DASHBOARD_DATA[universe];
    if (!data.layer_metrics) {
      console.log(`ℹ️  Skipping non-backtest key: ${universe}`);
      continue;
    }
    const layers = Object.keys(data.layer_metrics);

    layers.forEach(layer => {
      const metrics = data.layer_metrics[layer];
      const curves = data.equity_curves[layer];

      // 1. Check CAGR consistency
      if (metrics.CAGR > 500) {
        console.warn(`⚠️  Warning [${layer}]: CAGR is very high (${metrics.CAGR}%). Verify this is correct.`);
        totalWarnings++;
      }

      // 2. Check Total Return vs Equity Curve
      const finalEquity = curves[curves.length - 1];
      const calculatedTotalReturn = (finalEquity - 1) * 100;
      const reportedTotalReturn = metrics.Total_Return;
      const diff = Math.abs(calculatedTotalReturn - reportedTotalReturn);

      if (diff > 0.5) {
        console.error(`❌ Error [${layer}]: Total Return mismatch! Reported: ${reportedTotalReturn}%, Calculated from Curve: ${calculatedTotalReturn.toFixed(2)}%`);
        totalErrors++;
      }

      // 3. Check for mixed units (e.g., CAGR is 0.16 instead of 16.33)
      if (metrics.CAGR > 0 && metrics.CAGR < 1) {
        console.warn(`⚠️  Warning [${layer}]: CAGR is < 1. Is it a decimal? Dashboard expects percentages (e.g., 16.33).`);
        totalWarnings++;
      }
    });

    // 4. Check monthly detail vs equity curves
    if (data.monthly_detail.length !== data.equity_curves.months.length) {
       console.error(`❌ Error: Monthly detail count (${data.monthly_detail.length}) doesn't match month labels (${data.equity_curves.months.length}).`);
       totalErrors++;
    }
  }

  console.log(`\n🏁 Validation Finished.`);
  console.log(`Total Errors: ${totalErrors}`);
  console.log(`Total Warnings: ${totalWarnings}`);

  if (totalErrors > 0) {
    process.exit(1);
  }
}

validate();
