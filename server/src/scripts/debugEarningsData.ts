import 'dotenv/config';
import axios from 'axios';

const SYMBOLS_TO_CHECK = ['CRWD', 'META', 'MSFT', 'NVDA'];

async function debugEarnings() {
  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    console.error('FMP_API_KEY not set');
    return;
  }

  for (const symbol of SYMBOLS_TO_CHECK) {
    console.log('\n' + '='.repeat(70));
    console.log(`RAW EARNINGS DATA FOR ${symbol}`);
    console.log('='.repeat(70));

    const response = await axios.get(
      `https://financialmodelingprep.com/stable/income-statement`,
      {
        params: {
          symbol: symbol,
          period: 'quarter',
          limit: 12,
          apikey: apiKey
        },
        timeout: 10000
      }
    );

    const statements = response.data;

    if (!statements || statements.length < 8) {
      console.log(`Not enough data for ${symbol}`);
      continue;
    }

    console.log(`\nQuarterly EPS data (most recent first):`);
    console.log('-'.repeat(70));

    for (let i = 0; i < Math.min(8, statements.length); i++) {
      const s = statements[i];
      console.log(`[${i}] ${s.date} | EPS: ${s.eps?.toFixed(2) ?? 'N/A'} | EPS Diluted: ${s.epsDiluted?.toFixed(2) ?? 'N/A'} | Revenue: $${(s.revenue / 1e9).toFixed(2)}B`);
    }

    const latest = statements[0];
    const sameQuarterLastYear = statements[4];

    console.log('\n--- COMPARISON ---');
    console.log(`Latest Quarter [0]: ${latest.date} | EPS: ${latest.eps?.toFixed(2)}`);
    console.log(`Same Qtr Last Yr [4]: ${sameQuarterLastYear.date} | EPS: ${sameQuarterLastYear.eps?.toFixed(2)}`);

    const latestEps = latest.eps || latest.epsDiluted;
    const lastYearEps = sameQuarterLastYear.eps || sameQuarterLastYear.epsDiluted;

    if (lastYearEps && lastYearEps !== 0) {
      const qGrowth = ((latestEps - lastYearEps) / Math.abs(lastYearEps)) * 100;
      console.log(`\nCalculated C (quarterly growth): ${qGrowth.toFixed(1)}%`);
    }

    // Annual calc
    const latestYearEps = statements.slice(0, 4).reduce((sum: number, q: any) => sum + (q.eps || 0), 0);
    const prevYearEps = statements.slice(4, 8).reduce((sum: number, q: any) => sum + (q.eps || 0), 0);

    console.log(`\nAnnual EPS (TTM):`);
    console.log(`Latest 4 quarters: ${latestYearEps.toFixed(2)}`);
    console.log(`Previous 4 quarters: ${prevYearEps.toFixed(2)}`);

    if (prevYearEps !== 0) {
      const annualGrowth = ((latestYearEps - prevYearEps) / Math.abs(prevYearEps)) * 100;
      console.log(`Calculated A (annual growth): ${annualGrowth.toFixed(1)}%`);
    }

    await new Promise(r => setTimeout(r, 300));
  }
}

debugEarnings().catch(console.error);
