import { fetchHistoricalBars } from '../handlers/polygonAPI.js';

export interface RelativeStrengthResult {
  symbol: string;
  date: string;
  stockReturn12M: number;
  spyReturn12M: number;
  relativeReturn: number;
  rsRating: number;
  rsRank: number;
  totalStocks: number;
}

// Full FxPro symbol universe - all available US stocks (~1,098 symbols)
// NYSE symbols (.N suffix on FxPro MT5)
const FXPRO_NYSE = [
  'A', 'AA', 'AAP', 'ABBV', 'ABEV', 'ABM', 'ABT', 'ACN', 'ACHR', 'ADM', 'ADNT', 'AEE', 'AEO', 'AEP', 'AER', 'AES', 'AFL', 'AG', 'AGCO', 'AGG', 'AGL', 'AGO', 'AI', 'AIG', 'AIT', 'AJG', 'AL', 'ALB', 'ALC', 'ALK', 'ALL', 'ALLE', 'ALLY', 'ALSN', 'AMC', 'AME', 'AMRC', 'AMN', 'AMP', 'AMT', 'ANET', 'ANF', 'AON', 'AOS', 'APA', 'APD', 'APH', 'APTV', 'AR', 'ARDT', 'ARE', 'ARKB', 'ARMK', 'ASAN', 'ATHM', 'ATO', 'ATR', 'AU', 'AUB', 'AVB', 'AVY', 'AWK', 'AXL', 'AXP', 'AZO',
  'B', 'BA', 'BABA', 'BAC', 'BAH', 'BAK', 'BALL', 'BANC', 'BARK', 'BAX', 'BB', 'BBBY', 'BBY', 'BC', 'BCC', 'BCH', 'BCS', 'BDC', 'BDX', 'BEKE', 'BEN', 'BEP', 'BEPC', 'BFAM', 'BG', 'BHC', 'BHP', 'BIL', 'BILL', 'BIO', 'BIPC', 'BIRK', 'BJ', 'BK', 'BKE', 'BKH', 'BKU', 'BKV', 'BLK', 'BLND', 'BMY', 'BNL', 'BOX', 'BR', 'BRBR', 'BRKb', 'BRSL', 'BSX', 'BUD', 'BURL', 'BWA', 'BX', 'BXP',
  'C', 'CABO', 'CAG', 'CAH', 'CARR', 'CARS', 'CAT', 'CB', 'CBOE', 'CBRE', 'CC', 'CCI', 'CDE', 'CE', 'CF', 'CFG', 'CHD', 'CHGG', 'CHPT', 'CHWY', 'CI', 'CIEN', 'CIG', 'CL', 'CLF', 'CLVT', 'CLX', 'CMA', 'CMG', 'CMI', 'CMS', 'CNC', 'CNH', 'CNMD', 'CNM', 'CNO', 'CNP', 'CNX', 'COF', 'COHR', 'COMP', 'CON', 'COP', 'COR', 'COTY', 'COUR', 'CPA', 'CPAY', 'CPNG', 'CPRI', 'CPT', 'CRBG', 'CRCL', 'CRI', 'CRL', 'CRM', 'CRS', 'CSTM', 'CTRA', 'CTS', 'CTVA', 'CVE', 'CVS', 'CVX', 'CW', 'CWH', 'CWK', 'CX', 'CXM', 'CYH',
  'D', 'DAL', 'DAN', 'DAR', 'DBA', 'DBC', 'DD', 'DDL', 'DE', 'DELL', 'DEO', 'DG', 'DGX', 'DHI', 'DHR', 'DIN', 'DINO', 'DIS', 'DLR', 'DOC', 'DOCN', 'DOCS', 'DOLE', 'DOV', 'DOW', 'DQ', 'DRI', 'DT', 'DTM', 'DUK', 'DVA', 'DVN', 'DXC',
  'EB', 'ECL', 'ED', 'EFX', 'EG', 'EGO', 'EIX', 'EL', 'ELAN', 'ELV', 'EMBJ', 'EMN', 'EMR', 'EOG', 'EPAM', 'EQH', 'EQNR', 'EQR', 'EQT', 'ES', 'ESI', 'ESS', 'ET', 'ETN', 'ETR', 'ETSY', 'EXPD', 'EXR',
  'F', 'FBIN', 'FBTC', 'FCX', 'FDS', 'FDX', 'FE', 'FIG', 'FIGS', 'FIS', 'FLOC', 'FLR', 'FMC', 'FNF', 'FRT', 'FSLY', 'FTI', 'FTV', 'FUBO', 'FVRR', 'FXI',
  'GAP', 'GBTC', 'GBTG', 'GD', 'GDDY', 'GE', 'GES', 'GFI', 'GGB', 'GGG', 'GIS', 'GL', 'GLD', 'GLW', 'GM', 'GMED', 'GME', 'GNRC', 'GNW', 'GOTU', 'GPC', 'GPN', 'GPK', 'GRMN', 'GS', 'GWW',
  'H', 'HAL', 'HAS', 'HAYW', 'HCA', 'HD', 'HEI', 'HES', 'HGV', 'HIG', 'HII', 'HL', 'HLF', 'HLT', 'HMC', 'HMY', 'HOG', 'HOUS', 'HP', 'HPE', 'HPQ', 'HRB', 'HRL', 'HST', 'HSY', 'HTT', 'HUBS', 'HUM', 'HUN', 'HUYA', 'HWM',
  'IAG', 'IBM', 'ICE', 'IEFA', 'IEMG', 'IEX', 'IFF', 'IGT', 'IJH', 'INFY', 'INGM', 'INVH', 'IOT', 'IP', 'IQV', 'IR', 'IRM', 'IT', 'ITW', 'IVV', 'IVZ', 'IWD', 'IWF', 'IWM',
  'J', 'JBI', 'JCI', 'JD', 'JKS', 'JMIA', 'JNJ', 'JPM',
  'KEY', 'KEYS', 'KGC', 'KIM', 'KLAR', 'KLC', 'KMI', 'KMX', 'KNX', 'KO', 'KR', 'KRMN', 'KSS', 'KT', 'KVYO',
  'L', 'LB', 'LDOS', 'LEG', 'LEN', 'LEVI', 'LH', 'LHX', 'LLY', 'LMND', 'LMT', 'LNC', 'LNT', 'LOMA', 'LOW', 'LPL', 'LTH', 'LU', 'LUMN', 'LUV', 'LVWR', 'LVS', 'LW', 'LYB', 'LYV',
  'M', 'MA', 'MAA', 'MAS', 'MAT', 'MCD', 'MCK', 'MCO', 'MDT', 'MET', 'MGM', 'MHK', 'MIR', 'MKC', 'MKL', 'MLM', 'MMC', 'MMM', 'MO', 'MOH', 'MOS', 'MPC', 'MRK', 'MS', 'MSCI', 'MSGS', 'MSI', 'MTB', 'MTDR', 'MTG', 'MUR', 'NCLH',
  'NCLH', 'NEM', 'NET', 'NEE', 'NI', 'NKE', 'NMAX', 'NOC', 'NOK', 'NOV', 'NOW', 'NRG', 'NSC', 'NU', 'NUE', 'NVO', 'NVR', 'NVS', 'NYT',
  'O', 'OGN', 'OKE', 'OKLO', 'OLN', 'OMC', 'OPFI', 'OPLN', 'OPTU', 'ORA', 'ORCL', 'OSCR', 'OTIS', 'OVV', 'OXY',
  'PAAS', 'PAM', 'PANW', 'PATH', 'PAYC', 'PBF', 'PBI', 'PCOR', 'PCG', 'PD', 'PEG', 'PFE', 'PG', 'PGR', 'PH', 'PHM', 'PII', 'PINS', 'PKG', 'PLD', 'PLNT', 'PM', 'PNC', 'PNR', 'PNW', 'PPG', 'PPL', 'PRGO', 'PRI', 'PRU', 'PSA', 'PSTG', 'PSX', 'PVH', 'PWR', 'PX', 'PXD',
  'QSR', 'QTWO',
  'RACE', 'RBLX', 'RCL', 'RDDT', 'RERE', 'RES', 'RF', 'RH', 'RHI', 'RJF', 'RKT', 'RL', 'RMD', 'RNG', 'ROK', 'ROL', 'RRC', 'RSG', 'RTX', 'RUN', 'RVTY', 'RYAN',
  'S', 'SARO', 'SBH', 'SBS', 'SBSW', 'SCCO', 'SCHD', 'SCHH', 'SCHW', 'SE', 'SEB', 'SEE', 'SG', 'SGI', 'SHAK', 'SHCO', 'SHW', 'SID', 'SKLZ', 'SLB', 'SLV', 'SM', 'SMG', 'SNA', 'SNAP', 'SNOW', 'SO', 'SONY', 'SOXL', 'SPG', 'SPGI', 'SPOT', 'SPY', 'SQM', 'SSB', 'STE', 'STVN', 'STT', 'STZ', 'SU', 'SUI', 'SVOL', 'SWK', 'SYF', 'SYK', 'SYY',
  'T', 'TAK', 'TAL', 'TAP', 'TDG', 'TDY', 'TECK', 'TEL', 'TEVA', 'TFC', 'TFX', 'TGT', 'TIMB', 'TJX', 'TKO', 'TKR', 'TM', 'TME', 'TMO', 'TPR', 'TRGP', 'TREX', 'TRV', 'TRU', 'TSM', 'TSN', 'TT', 'TTAM', 'TUYA', 'TV', 'TWLO', 'TXT', 'TYL',
  'U', 'UA', 'UAA', 'UBER', 'UDR', 'UGP', 'UHS', 'UMC', 'UNH', 'UNM', 'UNP', 'UPS', 'URI', 'USB', 'UTZ', 'UVV',
  'V', 'VAC', 'VALE', 'VEA', 'VEEV', 'VFC', 'VG', 'VGT', 'VICI', 'VIG', 'VIK', 'VIPS', 'VLO', 'VMC', 'VNO', 'VNQ', 'VO', 'VOO', 'VSCO', 'VST', 'VTI', 'VTR', 'VTV', 'VTEX', 'VUG', 'VWO', 'VZ',
  'W', 'WAB', 'WAT', 'WBA', 'WBD', 'WCC', 'WCN', 'WEC', 'WELL', 'WEX', 'WFC', 'WHR', 'WIT', 'WM', 'WMB', 'WRB', 'WST', 'WTM', 'WU', 'WY',
  'XLK', 'XLRE', 'XOM', 'XPO', 'XYL', 'XYZ',
  'YETI', 'YMM', 'YOU', 'YPF', 'YUM', 'YUMC',
  'ZBH', 'ZH', 'ZIP', 'ZTO', 'ZTS'
];

// NASDAQ symbols (.O suffix on FxPro MT5)
const FXPRO_NASDAQ = [
  'AAPL', 'ABNB', 'ACGL', 'ADBE', 'ADI', 'ADP', 'ADSK', 'AFRM', 'AKAM', 'ALGM', 'ALGN', 'ALKS', 'ALNY', 'AMAT', 'AMCX', 'AMD', 'AMGN', 'AMZN', 'ANGI', 'APP', 'APPN', 'ARGX', 'ARM', 'ARRY', 'ASML', 'AVGO', 'AVIR', 'AXON', 'AXSM',
  'BANF', 'BANR', 'BATRA', 'BCPC', 'BCRX', 'BCYC', 'BIDU', 'BIIB', 'BILI', 'BKR', 'BL', 'BLDP', 'BLKB', 'BMBL', 'BMRN', 'BNTX', 'BOKF', 'BPOP', 'BRKR', 'BRZE', 'BSY', 'BYND', 'BZ',
  'CACC', 'CAR', 'CBRL', 'CCCC', 'CDNS', 'CDW', 'CERT', 'CFLT', 'CGEM', 'CGC', 'CHKP', 'CHRW', 'CHTR', 'CIGI', 'CINF', 'CLBT', 'CLNE', 'CLOV', 'CME', 'CMCSA', 'CNDT', 'CNOB', 'COIN', 'COMM', 'COST', 'CPRT', 'CPB', 'CROX', 'CRSP', 'CRSR', 'CRUS', 'CRVL', 'CRWD', 'CSCO', 'CSGP', 'CSIQ', 'CSX', 'CTAS', 'CTSH', 'CVAC', 'CWST', 'CYBR',
  'DASH', 'DDOG', 'DJT', 'DKNG', 'DLO', 'DLTR', 'DNUT', 'DOCU', 'DOO', 'DOX', 'DPZ', 'DRVN', 'DUOL', 'DXCM', 'DYN',
  'EA', 'EBAY', 'EBC', 'ENPH', 'EQIX', 'ERAS', 'ESLT', 'EVCM', 'EVRG', 'EWBC', 'EXC', 'EXAS', 'EXEL',
  'FA', 'FANG', 'FAST', 'FCEL', 'FFIV', 'FISV', 'FITB', 'FIVE', 'FIVN', 'FLEX', 'FLNC', 'FOLD', 'FOXA', 'FROG', 'FSLR', 'FSV', 'FTNT',
  'GDRX', 'GEN', 'GEVO', 'GFS', 'GH', 'GILD', 'GLBE', 'GLPI', 'GNTX', 'GO', 'GOOGL', 'GPRE', 'GRPN', 'GT', 'GTLB', 'GTM',
  'HAS', 'HBAN', 'HCM', 'HEPS', 'HIMX', 'HOLX', 'HON', 'HOOD', 'HRMY', 'HSIC', 'HST', 'HTHT',
  'IAC', 'IART', 'IBIT', 'ICUI', 'IDXX', 'ILMN', 'INCY', 'INDI', 'INNV', 'INO', 'INTA', 'INTC', 'INTU', 'IPGP', 'IQ', 'IRBT', 'ISRG',
  'JACK', 'JAMF', 'JAZZ', 'JBHT', 'JBLU', 'JD', 'JKHY',
  'KDP', 'KHC', 'KLAC', 'KTOS', 'KYMR',
  'LAMR', 'LCID', 'LECO', 'LFST', 'LI', 'LINE', 'LITE', 'LKQ', 'LNT', 'LRCX', 'LSCC', 'LSTR', 'LULU', 'LX', 'LYEL', 'LYFT', 'LZ',
  'MAR', 'MARA', 'MASI', 'MAT', 'MCHP', 'MDLN', 'MDLZ', 'MELI', 'META', 'MIDD', 'MKTX', 'MLCO', 'MNDY', 'MNST', 'MNY', 'MOMO', 'MQ', 'MRNA', 'MRVI', 'MRVL', 'MSFT', 'MSTR', 'MTCH', 'MU', 'MVIS',
  'NAVI', 'NBIS', 'NBIX', 'NCNO', 'NDAQ', 'NDSN', 'NFLX', 'NFE', 'NICE', 'NTES', 'NTAP', 'NTNX', 'NTRA', 'NTRS', 'NVAX', 'NVCR', 'NVDA', 'NWL', 'NWSA', 'NXPI',
  'OCGN', 'ODFL', 'OKTA', 'OLED', 'OLLI', 'ON', 'OPEN', 'OPK', 'ORLY', 'OS', 'OTEX', 'OTLY',
  'PAYO', 'PAX', 'PCAR', 'PCTY', 'PCVX', 'PDD', 'PECO', 'PENN', 'PEP', 'PFG', 'PLAY', 'PLTK', 'PLTR', 'PLUG', 'PNFP', 'PODD', 'PONY', 'POOL', 'PRVA', 'PSKY', 'PTC', 'PTEN', 'PTON', 'PYPL', 'PZZA',
  'QCOM', 'QDEL', 'QLYS', 'QQQ', 'QRVO', 'QS',
  'REG', 'REGN', 'RENT', 'RGEN', 'RGLD', 'RIOT', 'RIVN', 'RKLB', 'ROKU', 'ROP', 'ROST', 'RPRX', 'RUN', 'RVMD', 'RXT', 'RXRX',
  'SAIL', 'SANA', 'SBAC', 'SBUX', 'SDGR', 'SEDG', 'SFD', 'SFIX', 'SFM', 'SHC', 'SHLS', 'SHOP', 'SIRI', 'SLM', 'SMCI', 'SNCY', 'SNPS', 'SNY', 'SOFI', 'SOUN', 'SPLK', 'SRPT', 'SSNC', 'STLD', 'STNE', 'STX', 'SWKS', 'SWIM', 'SYNA',
  'TASK', 'TCOM', 'TEAM', 'TECH', 'TEM', 'TER', 'THRY', 'TLRY', 'TLT', 'TMUS', 'TNDM', 'TRIP', 'TRMB', 'TROW', 'TSCO', 'TSLA', 'TTD', 'TTAN', 'TTWO', 'TW', 'TXG', 'TXN',
  'UAL', 'UCTT', 'UDMY', 'ULCC', 'ULTA', 'UPST', 'URBN', 'UTHR',
  'VCIT', 'VFS', 'VICR', 'VIR', 'VITL', 'VLY', 'VNQI', 'VRSK', 'VRSN', 'VRTX', 'VTRS', 'VXUS',
  'WAY', 'WB', 'WBD', 'WBTN', 'WDAY', 'WDC', 'WEN', 'WGS', 'WING', 'WIX', 'WKHS', 'WMG', 'WMT', 'WOOF', 'WRD', 'WTFC', 'WTW',
  'XEL', 'XMTR', 'XRAY', 'XRX',
  'Z', 'ZBRA', 'ZION', 'ZM', 'ZS'
];

// Combined universe - all FxPro US stocks (duplicates removed)
const RS_UNIVERSE = [...new Set([...FXPRO_NYSE, ...FXPRO_NASDAQ])];

async function calculate12MonthReturn(
  apiKey: string,
  symbol: string,
  endDate: string
): Promise<number | null> {
  const end = new Date(endDate);
  const start = new Date(endDate);
  start.setFullYear(start.getFullYear() - 1);
  
  try {
    const candles = await fetchHistoricalBars(
      apiKey,
      symbol,
      start.toISOString().split('T')[0],
      end.toISOString().split('T')[0],
      'day',
      1,
      300
    );
    
    if (candles.length < 200) return null;
    
    const oldestPrice = candles[0].close;
    const latestPrice = candles[candles.length - 1].close;
    
    return ((latestPrice - oldestPrice) / oldestPrice) * 100;
  } catch (error) {
    console.error(`[RS] Error fetching ${symbol}:`, error);
    return null;
  }
}

export async function calculateRelativeStrength(
  symbol: string,
  date: string,
  universe: string[] = RS_UNIVERSE
): Promise<RelativeStrengthResult | null> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    console.error('[RS] No Polygon API key');
    return null;
  }
  
  console.log(`[RS] Calculating relative strength for ${symbol} on ${date}`);
  
  const [stockReturn, spyReturn] = await Promise.all([
    calculate12MonthReturn(apiKey, symbol, date),
    calculate12MonthReturn(apiKey, 'SPY', date)
  ]);
  
  if (stockReturn === null || spyReturn === null) {
    return null;
  }
  
  const relativeReturn = stockReturn - spyReturn;
  
  const allReturns: { symbol: string; return12M: number }[] = [];
  
  for (const sym of universe) {
    const ret = await calculate12MonthReturn(apiKey, sym, date);
    if (ret !== null) {
      allReturns.push({ symbol: sym, return12M: ret });
    }
  }
  
  allReturns.sort((a, b) => b.return12M - a.return12M);
  
  const rank = allReturns.findIndex(s => s.symbol === symbol) + 1;
  const rsRating = Math.round(((allReturns.length - rank) / allReturns.length) * 99);
  
  return {
    symbol,
    date,
    stockReturn12M: Math.round(stockReturn * 100) / 100,
    spyReturn12M: Math.round(spyReturn * 100) / 100,
    relativeReturn: Math.round(relativeReturn * 100) / 100,
    rsRating,
    rsRank: rank,
    totalStocks: allReturns.length
  };
}

export async function getRSRankings(
  date: string,
  universe: string[] = RS_UNIVERSE
): Promise<{ symbol: string; return12M: number; rsRating: number }[]> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) return [];
  
  const allReturns: { symbol: string; return12M: number }[] = [];
  
  for (const sym of universe) {
    const ret = await calculate12MonthReturn(apiKey, sym, date);
    if (ret !== null) {
      allReturns.push({ symbol: sym, return12M: ret });
    }
  }
  
  allReturns.sort((a, b) => b.return12M - a.return12M);
  
  return allReturns.map((s, i) => ({
    symbol: s.symbol,
    return12M: Math.round(s.return12M * 100) / 100,
    rsRating: Math.round(((allReturns.length - i - 1) / allReturns.length) * 99)
  }));
}

export { RS_UNIVERSE };
