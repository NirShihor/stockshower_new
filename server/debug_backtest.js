const fs = require("fs");
const path = require("path");

const DAILY_DIR = "data_cache/daily";
const SWING_SYMBOLS = ["AAPL", "MSFT", "AMZN", "GOOGL", "META", "NVDA", "TSLA"];

function getTradingDays(startDate, endDate) {
  const days = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const current = new Date(start);
  
  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      days.push(current.toISOString().split("T")[0]);
    }
    current.setDate(current.getDate() + 1);
  }
  
  return days;
}

function loadDailyCache(date) {
  const cachePath = path.join(DAILY_DIR, date + ".json");
  const result = new Map();
  
  if (fs.existsSync(cachePath)) {
    const data = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
    for (const bar of data) {
      result.set(bar.symbol, bar);
    }
  } else {
    console.log("Cache file not found:", cachePath);
  }
  
  return result;
}

const allDays = getTradingDays("2024-10-01", "2025-01-02");
console.log("Total trading days:", allDays.length);

const testDate = allDays[60];
console.log("Test date (day 60):", testDate);

if (!testDate) {
  console.log("Not enough days - need at least 66");
  process.exit(1);
}

const cache = loadDailyCache(testDate);
console.log("Cache size for", testDate, ":", cache.size);

let found = 0;
for (const sym of SWING_SYMBOLS) {
  if (cache.has(sym)) {
    found++;
  }
}
console.log("Found symbols:", found, "/", SWING_SYMBOLS.length);

// Check if we can get historical bars
function getHistoricalBars(symbol, endDate, lookback) {
  const endIdx = allDays.indexOf(endDate);
  if (endIdx < 0) return [];
  
  const bars = [];
  const startIdx = Math.max(0, endIdx - lookback + 1);
  
  for (let i = startIdx; i <= endIdx; i++) {
    const dayData = loadDailyCache(allDays[i]);
    const bar = dayData.get(symbol);
    if (bar) bars.push(bar);
  }
  
  return bars;
}

const aaplBars = getHistoricalBars("AAPL", testDate, 60);
console.log("AAPL historical bars:", aaplBars.length);
