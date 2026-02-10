import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

async function main() {
  console.log('Testing Yahoo Finance UK data...\n');

  const symbols = ['BP.L', 'SHEL.L', 'HSBA.L', 'AZN.L', 'LLOY.L'];

  for (const symbol of symbols) {
    try {
      const result = await yahooFinance.historical(symbol, {
        period1: '2024-01-01',
        period2: '2024-12-31',
        interval: '1d'
      });

      if (result.length > 0) {
        console.log(`${symbol}: ${result.length} candles`);
        console.log(`  First: ${result[0].date.toISOString().split('T')[0]} - Close: ${result[0].close}, Vol: ${result[0].volume}`);
        console.log(`  Last:  ${result[result.length-1].date.toISOString().split('T')[0]} - Close: ${result[result.length-1].close}, Vol: ${result[result.length-1].volume}`);
      } else {
        console.log(`${symbol}: No data`);
      }
    } catch (error: any) {
      console.log(`${symbol}: ERROR - ${error.message}`);
    }
    console.log('');
  }
}

main().catch(console.error);
