// @ts-nocheck
import { Request, Response } from 'express';
import axios from 'axios';
import * as dotenv from 'dotenv';
import OpenAI from 'openai';
import {
  getMarketstackPreviousClose,
  getMarketstackTickerDetails,
  getMarketstackHistoricalData,
  getMarketstackIntradayData,
  getMarketstackRealTimePrice,
  getMarketstackBulkEOD,
  convertMarketstackToPolygonFormat,
  convertMarketstackIntradayToPolygonFormat
} from './marketstackAPI.js';
import { getMarketContext, formatMarketContextForAI, MarketContext } from '../services/marketContextService.js';
import { analyzeGold } from '../services/goldBreakoutService.js';

/**
 * Generate CAN SLIM outlook algorithmically based on market regime
 * This replaces the OpenAI-generated outlook to ensure consistency with the scanner
 */
function generateAlgorithmicCanSlimOutlook(
	marketContext: MarketContext,
	market: 'US' | 'UK'
): string {
	const { regime, regimeReason, spy, qqq, vix } = marketContext;

	const indexName = market === 'UK' ? 'FTSE proxy' : 'SPY';
	const techName = market === 'UK' ? 'UK large cap' : 'QQQ';

	let rating: string;
	let positionSizing: string;
	let action: string;
	let scannerStatus: string;

	if (regime === 'risk-on') {
		rating = 'GOOD - Conditions favorable for swing trade breakouts';
		positionSizing = '50-75% in new positions';
		action = 'Scanner ACTIVE. Enter new positions in leading stocks breaking out of proper bases. Hold existing winners and trail stops.';
		scannerStatus = 'Scanner will execute trades when valid setups are found.';
	} else if (regime === 'risk-off') {
		rating = 'AVOID - High-risk environment for new positions';
		positionSizing = '0-25% maximum exposure';
		action = 'Scanner PAUSED. Avoid new entries. Tighten stops on existing positions or move to cash. Consider gold as alternative.';
		scannerStatus = 'Scanner paused due to unfavorable conditions. Gold fallback may activate.';
	} else {
		// neutral
		rating = 'CAUTION - Mixed signals, unclear direction';
		positionSizing = '25-50% with reduced size';
		action = 'Scanner PAUSED. Wait for clearer trend confirmation. Hold existing positions with tight stops.';
		scannerStatus = 'Scanner paused - waiting for regime to turn risk-on.';
	}

	const trendInfo = `${indexName}: ${spy.trend} (${spy.changePercent >= 0 ? '+' : ''}${spy.changePercent.toFixed(1)}% today, ${spy.aboveEma20 ? 'above' : 'below'} 20 EMA). ${techName}: ${qqq.trend} (${qqq.changePercent >= 0 ? '+' : ''}${qqq.changePercent.toFixed(1)}% today).`;

	const vixInfo = `VIX: ${vix.current.toFixed(1)} (${vix.current < 15 ? 'low/complacent' : vix.current > 25 ? 'high/fearful' : vix.current > 20 ? 'elevated' : 'moderate'}).`;

	return `REGIME: ${regime.toUpperCase()} - ${regimeReason}

Environment Rating: ${rating}

Position Sizing: ${positionSizing}

Action: ${action}

Market Data: ${trendInfo} ${vixInfo}

Status: ${scannerStatus}`;
}

// Load environment variables
dotenv.config();

// Configuration: Set to 'marketstack' to use Marketstack API, 'polygon' for Polygon.io
const DATA_PROVIDER = 'polygon'; // Change this to switch providers

// FxPro NYSE symbols - all .N suffix stocks available on FxPro MT5
const FXPRO_NYSE_SYMBOLS = [
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

// FxPro NASDAQ symbols - all .O suffix stocks available on FxPro MT5
const FXPRO_NASDAQ_SYMBOLS = [
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

// Pattern scanner watchlist - uses all FxPro symbols (NASDAQ + NYSE)
const PATTERN_SCANNER_WATCHLIST = [...FXPRO_NASDAQ_SYMBOLS, ...FXPRO_NYSE_SYMBOLS];

// Helper function to check if symbol is in pattern scanner watchlist
function isInPatternScannerWatchlist(symbol: string): boolean {
  return PATTERN_SCANNER_WATCHLIST.includes(symbol);
}

// MT5 symbol filtering - same logic as used in metaApiRestHandler
function isMT5Tradeable(symbol: string): boolean {
  // Common NASDAQ stocks that are available on MT5
  const nasdaqStocks = ['AAPL', 'TSLA', 'MSFT', 'AMZN', 'GOOGL', 'META', 'NVDA', 'NFLX', 'ADBE', 'CRM', 'PYPL', 'INTC', 'CSCO', 'CMCSA', 'PEP', 'COST', 'TMUS', 'AVGO', 'TXN', 'QCOM', 'INTU', 'AMAT', 'AMD', 'SBUX', 'GILD', 'BKNG', 'MDLZ', 'ADP', 'ISRG', 'REGN', 'VRTX', 'LRCX', 'ATVI', 'FISV', 'CSX', 'ORLY', 'BIIB', 'KLAC', 'KDP', 'VRSK', 'CTSH', 'CTAS', 'SNPS', 'CDNS', 'MELI', 'ASML', 'TEAM', 'ADSK', 'WDAY', 'SPLK', 'OKTA', 'ZM', 'DOCU', 'PTON', 'ZS'];
  
  // Common NYSE stocks that are available on MT5
  const nyseStocks = ['JNJ', 'JPM', 'V', 'PG', 'HD', 'MA', 'BAC', 'WMT', 'DIS', 'KO', 'PFE', 'MRK', 'UNH', 'CVX', 'XOM', 'VZ', 'T', 'MMM', 'CAT', 'BA', 'IBM', 'GE', 'GM', 'F', 'C', 'WFC', 'BRK.B', 'ABBV', 'TMO', 'ACN', 'NKE', 'CRM', 'LLY', 'DHR', 'MDT', 'ABT', 'BMY', 'AMGN', 'PM', 'NEE', 'COST', 'LOW', 'UNP', 'HON', 'IBM', 'SPGI', 'LIN', 'RTX', 'QCOM', 'SBUX', 'GS', 'BLK', 'AXP', 'BKNG', 'GILD', 'MS', 'AMD', 'NOW', 'AMT', 'ELV', 'PLD', 'BA', 'SYK', 'TJX', 'ZTS', 'BDX', 'SO', 'MMC', 'DUK', 'BSX', 'AON', 'APH', 'SHW', 'CMG', 'MU', 'DE', 'ICE', 'USB', 'NOC', 'EMR', 'PSA', 'GD', 'TGT', 'ITW', 'PNC', 'ECL', 'NSC', 'MCO', 'FCX', 'SPG', 'EOG', 'FIS', 'GM', 'COF', 'PSX', 'VLO', 'CL', 'SLB', 'OXY', 'MPC', 'KMI', 'WM', 'HAL', 'D', 'AEP', 'EXC', 'XEL'];
  
  // Check if symbol is in our known tradeable lists
  return nasdaqStocks.includes(symbol) || nyseStocks.includes(symbol);
}

function convertToMT5Symbol(symbol: string): string {
  // Common NASDAQ stocks that need .O suffix
  const nasdaqStocks = ['AAPL', 'TSLA', 'MSFT', 'AMZN', 'GOOGL', 'META', 'NVDA', 'NFLX', 'ISRG'];
  
  // Common NYSE stocks that need .N suffix  
  const nyseStocks = ['JNJ', 'JPM', 'V', 'PG', 'HD', 'MA', 'BAC', 'WMT', 'DIS', 'KO', 'PFE', 'MRK', 'UNH', 'CVX', 'XOM', 'VZ', 'T', 'MMM', 'CAT', 'BA', 'IBM', 'GE', 'GM', 'F', 'RTX', 'DHR', 'BSX'];
  
  if (nasdaqStocks.includes(symbol)) {
    return `${symbol}.O`;
  } else if (nyseStocks.includes(symbol)) {
    return `${symbol}.N`;
  }
  
  // For other symbols, return as-is
  return symbol;
}

// Polygon.io interfaces
interface PolygonBar {
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
  v: number; // volume
  vw: number; // volume weighted average price
  t: number; // timestamp
  n: number; // number of transactions
}

interface PolygonAggregatesResponse {
  ticker: string;
  queryCount: number;
  resultsCount: number;
  adjusted: boolean;
  results: PolygonBar[];
  status: string;
  request_id: string;
  count: number;
  next_url?: string;
}

interface PolygonTickerDetails {
  ticker: string;
  name: string;
  market: string;
  locale: string;
  primary_exchange: string;
  type: string;
  active: boolean;
  currency_name: string;
  cik?: string;
  composite_figi?: string;
  share_class_figi?: string;
  market_cap?: number;
  phone_number?: string;
  address?: {
    address1?: string;
    city?: string;
    state?: string;
    postal_code?: string;
  };
  description?: string;
  sic_code?: string;
  sic_description?: string;
  ticker_root?: string;
  homepage_url?: string;
  total_employees?: number;
  list_date?: string;
  branding?: {
    logo_url?: string;
    icon_url?: string;
  };
  share_class_shares_outstanding?: number;
  weighted_shares_outstanding?: number;
}

interface PolygonTickerDetailsResponse {
  status: string;
  request_id: string;
  results: PolygonTickerDetails;
}

interface PolygonPreviousCloseResponse {
  ticker: string;
  queryCount: number;
  resultsCount: number;
  adjusted: boolean;
  results: PolygonBar[];
  status: string;
  request_id: string;
}

interface EnhancedStockData {
  symbol: string;
  currentPrice: number;
  livePrice?: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  previousClose: number;
  volume: number;
  marketCap: number;
  twentyDayHigh: number;
  twentyDayLow?: number;
  gapPercentage: number;
  companyName: string;
  exchange: string;
  currency: string;
  first15MinHigh?: number;
  first15MinLow?: number;
  first15MinClose?: number;
  premarketHigh?: number;
  premarketLow?: number;
}

interface MarketStatus {
  status: 'OPEN' | 'CLOSED' | 'PRE-MARKET' | 'AFTER HOURS';
  reason: string;
  color: string;
}


interface GapUpStock {
	stockSymbol: string;
	currentPrice: string;
	livePrice?: string;
	twentyDayHigh: string;
	gapPercentage: string;
	analysis: string;
	suitable: boolean;
	isBlueChip?: boolean;
	openPrice?: string;
	highPrice?: string;
	lowPrice?: string;
	previousClose?: string;
	volume?: number;
	marketCap?: number;
	companyName?: string;
	exchange?: string;
	first15MinHigh?: string;
	first15MinLow?: string;
	first15MinClose?: string;
	premarketHigh?: string;
	premarketLow?: string;
}

interface ScanResult {
	stocks: GapUpStock[];
	totalFound: number;
	timestamp: Date;
	scanDuration?: string;
	status: 'completed' | 'partial' | 'timeout';
	processedCount: number;
	totalCount: number;
	batchInfo?: {
		preFilteredCount: number;
		batchesProcessed: number;
		totalBatches: number;
		twentyDayHighCalculated: number;
		optimizationUsed: boolean;
	};
}

// Polygon.io helper functions
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';
const POLYGON_BASE_URL = 'https://api.polygon.io';

// US Market Holidays (fixed dates and observed dates)
function getUSMarketHolidays(year: number): Set<string> {
	const holidays = new Set<string>();
	
	// New Year's Day (Jan 1, or observed on nearest weekday)
	const newYear = new Date(year, 0, 1);
	holidays.add(getObservedDate(newYear));
	
	// Martin Luther King Jr. Day (3rd Monday of January)
	holidays.add(getNthWeekdayOfMonth(year, 0, 1, 3));
	
	// Presidents Day (3rd Monday of February)
	holidays.add(getNthWeekdayOfMonth(year, 1, 1, 3));
	
	// Good Friday (Friday before Easter Sunday) - varies each year
	const easter = getEasterDate(year);
	const goodFriday = new Date(easter);
	goodFriday.setDate(easter.getDate() - 2);
	holidays.add(goodFriday.toISOString().split('T')[0]);
	
	// Memorial Day (last Monday of May)
	holidays.add(getLastWeekdayOfMonth(year, 4, 1));
	
	// Juneteenth (June 19, or observed)
	const juneteenth = new Date(year, 5, 19);
	holidays.add(getObservedDate(juneteenth));
	
	// Independence Day (July 4, or observed)
	const july4 = new Date(year, 6, 4);
	holidays.add(getObservedDate(july4));
	
	// Labor Day (1st Monday of September)
	holidays.add(getNthWeekdayOfMonth(year, 8, 1, 1));
	
	// Thanksgiving (4th Thursday of November)
	holidays.add(getNthWeekdayOfMonth(year, 10, 4, 4));
	
	// Christmas (Dec 25, or observed)
	const christmas = new Date(year, 11, 25);
	holidays.add(getObservedDate(christmas));
	
	return holidays;
}

function getObservedDate(date: Date): string {
	const day = date.getDay();
	if (day === 0) { // Sunday -> Monday
		date.setDate(date.getDate() + 1);
	} else if (day === 6) { // Saturday -> Friday
		date.setDate(date.getDate() - 1);
	}
	return date.toISOString().split('T')[0];
}

function getNthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): string {
	const firstDay = new Date(year, month, 1);
	let count = 0;
	for (let day = 1; day <= 31; day++) {
		const d = new Date(year, month, day);
		if (d.getMonth() !== month) break;
		if (d.getDay() === weekday) {
			count++;
			if (count === n) return d.toISOString().split('T')[0];
		}
	}
	return '';
}

function getLastWeekdayOfMonth(year: number, month: number, weekday: number): string {
	const lastDay = new Date(year, month + 1, 0);
	for (let day = lastDay.getDate(); day >= 1; day--) {
		const d = new Date(year, month, day);
		if (d.getDay() === weekday) return d.toISOString().split('T')[0];
	}
	return '';
}

function getEasterDate(year: number): Date {
	// Anonymous Gregorian algorithm
	const a = year % 19;
	const b = Math.floor(year / 100);
	const c = year % 100;
	const d = Math.floor(b / 4);
	const e = b % 4;
	const f = Math.floor((b + 8) / 25);
	const g = Math.floor((b - f + 1) / 3);
	const h = (19 * a + b - d - g + 15) % 30;
	const i = Math.floor(c / 4);
	const k = c % 4;
	const l = (32 + 2 * e + 2 * i - h - k) % 7;
	const m = Math.floor((a + 11 * h + 22 * l) / 451);
	const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
	const day = ((h + l - 7 * m + 114) % 31) + 1;
	return new Date(year, month, day);
}

function isUSMarketHoliday(dateStr: string): boolean {
	const date = new Date(dateStr);
	const year = date.getFullYear();
	const holidays = getUSMarketHolidays(year);
	return holidays.has(dateStr);
}

function getPreviousTradingDay(fromDate: Date): string {
	const date = new Date(fromDate);
	date.setDate(date.getDate() - 1);
	
	// Keep going back until we find a valid trading day
	for (let i = 0; i < 10; i++) {
		const dateStr = date.toISOString().split('T')[0];
		const dayOfWeek = date.getDay();
		
		if (dayOfWeek !== 0 && dayOfWeek !== 6 && !isUSMarketHoliday(dateStr)) {
			return dateStr;
		}
		date.setDate(date.getDate() - 1);
	}
	
	return date.toISOString().split('T')[0];
}

function getMostRecentTradingDay(): { today: string; yesterday: string } {
	const now = new Date();
	let checkDate = new Date(now);
	
	// Find the most recent trading day
	for (let i = 0; i < 10; i++) {
		const dateStr = checkDate.toISOString().split('T')[0];
		const dayOfWeek = checkDate.getDay();
		
		if (dayOfWeek !== 0 && dayOfWeek !== 6 && !isUSMarketHoliday(dateStr)) {
			const yesterday = getPreviousTradingDay(checkDate);
			return { today: dateStr, yesterday };
		}
		checkDate.setDate(checkDate.getDate() - 1);
	}
	
	// Fallback
	return { 
		today: checkDate.toISOString().split('T')[0], 
		yesterday: getPreviousTradingDay(checkDate) 
	};
}

// OpenAI configuration
const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

// Market status helper function
function getMarketStatus(exchange?: string): MarketStatus {
	const now = new Date();
	const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
	const currentHour = easternTime.getHours();
	const currentMinute = easternTime.getMinutes();
	const dayOfWeek = easternTime.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
	
	// Check if it's a weekend
	if (dayOfWeek === 0 || dayOfWeek === 6) {
		return { status: 'CLOSED', reason: 'Weekend', color: '#e74c3c' };
	}
	
	// US markets (NYSE, NASDAQ) are typically open 9:30 AM - 4:00 PM ET
	const marketOpenTime = 9 * 60 + 30; // 9:30 AM in minutes
	const marketCloseTime = 16 * 60; // 4:00 PM in minutes
	const currentTimeInMinutes = currentHour * 60 + currentMinute;
	
	if (currentTimeInMinutes >= marketOpenTime && currentTimeInMinutes < marketCloseTime) {
		return { status: 'OPEN', reason: 'Regular Hours', color: '#27ae60' };
	} else if (currentTimeInMinutes >= 16 * 60 && currentTimeInMinutes < 20 * 60) {
		return { status: 'AFTER HOURS', reason: 'Extended Trading', color: '#f39c12' };
	} else if (currentTimeInMinutes >= 4 * 60 && currentTimeInMinutes < marketOpenTime) {
		return { status: 'PRE-MARKET', reason: 'Extended Trading', color: '#f39c12' };
	} else {
		return { status: 'CLOSED', reason: 'After Hours', color: '#e74c3c' };
	}
}

// Blue chip companies (S&P 100 + major companies)
const BLUE_CHIP_STOCKS = new Set([
	// Tech Giants
	'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'META', 'TSLA', 'NVDA', 'ORCL', 'CRM', 'ADBE', 'NFLX', 'CSCO', 'INTC', 'AMD', 'QCOM', 'AVGO', 'TXN',
	
	// Financial Services
	'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'USB', 'BLK', 'SCHW', 'AXP', 'V', 'MA', 'PYPL',
	
	// Healthcare & Pharma
	'JNJ', 'UNH', 'PFE', 'ABBV', 'MRK', 'LLY', 'TMO', 'ABT', 'DHR', 'CVS', 'MDT', 'BMY', 'AMGN', 'GILD', 'ISRG',
	
	// Consumer Goods
	'WMT', 'HD', 'PG', 'KO', 'PEP', 'COST', 'MCD', 'NKE', 'SBUX', 'TGT', 'LOW', 'TJX',
	
	// Industrial
	'BA', 'UPS', 'HON', 'UNP', 'CAT', 'GE', 'MMM', 'LMT', 'RTX', 'DE', 'FDX',
	
	// Energy
	'XOM', 'CVX', 'COP', 'SLB',
	
	// Telecom & Utilities
	'VZ', 'T', 'TMUS', 'NEE', 'DUK', 'SO', 'D',
	
	// Others
	'BRK.A', 'BRK.B', 'SPY', 'QQQ', 'DIS', 'IBM', 'WBA'
]);

// Interface for grouped daily bars response
interface GroupedDailyBar {
	T: string; // ticker symbol
	c: number; // close price
	h: number; // high price
	l: number; // low price
	o: number; // open price
	v: number; // volume
	vw: number; // volume weighted average price
	n?: number; // number of transactions
	otc?: boolean; // OTC flag
}

interface GroupedDailyResponse {
	status: string;
	request_id: string;
	adjusted: boolean;
	queryCount: number;
	resultsCount: number;
	results: GroupedDailyBar[];
}

// Track API requests
let stockAnalysisRequestCounter = 0;
let stockAnalysisRequestLog: Array<{timestamp: Date, endpoint: string, caller?: string}> = [];

async function makePolygonRequest(endpoint: string, params: Record<string, string> = {}): Promise<any> {
	try {
		// Log the request
		stockAnalysisRequestCounter++;
		const logEntry = {timestamp: new Date(), endpoint, caller: new Error().stack?.split('\n')[2]?.trim()};
		stockAnalysisRequestLog.push(logEntry);
		
		// Keep only last 100 entries
		if (stockAnalysisRequestLog.length > 100) {
			stockAnalysisRequestLog = stockAnalysisRequestLog.slice(-100);
		}
		
		console.log(`[Polygon API - stockAnalysis] Request #${stockAnalysisRequestCounter}: ${endpoint}`);
		console.log(`[Polygon API - stockAnalysis] Called from: ${logEntry.caller}`);
		
		// Log request rate
		const now = new Date();
		const lastHour = stockAnalysisRequestLog.filter(r => (now.getTime() - r.timestamp.getTime()) < 60 * 60 * 1000);
		console.log(`[Polygon API - stockAnalysis] Requests in last hour: ${lastHour.length}`);
		
		const url = `${POLYGON_BASE_URL}${endpoint}`;
		const response = await axios.get(url, {
			params: {
				...params,
				apikey: POLYGON_API_KEY
			}
		});

		if (response.data.status === 'ERROR') {
			console.error(`[Polygon API - stockAnalysis] Error response: ${response.data.error}`);
			throw new Error(response.data.error || 'Polygon API error');
		}

		return response.data;
	} catch (error: any) {
		console.error(`[Polygon API - stockAnalysis] Request failed:`, error.message);
		if (error.response?.status === 429) {
			console.error(`[Polygon API - stockAnalysis] RATE LIMIT EXCEEDED!`);
		}
		throw error;
	}
}

async function getPolygonPreviousClose(symbol: string): Promise<PolygonBar | null> {
	const data = await makePolygonRequest(`/v2/aggs/ticker/${symbol}/prev`) as PolygonPreviousCloseResponse;
	return data.results && data.results.length > 0 ? data.results[0] : null;
}

async function getPolygonTickerDetails(symbol: string): Promise<PolygonTickerDetails | null> {
	try {
		const data = await makePolygonRequest(`/v3/reference/tickers/${symbol}`) as PolygonTickerDetailsResponse;
		return data.results || null;
	} catch (error) {
		console.warn(`No ticker details available for ${symbol}`);
		return null;
	}
}

async function getPolygonDailyBars(symbol: string, from: string, to: string): Promise<PolygonBar[]> {
	const data = await makePolygonRequest(`/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}`, {
		adjusted: 'true',
		sort: 'asc',
		limit: '50000'
	}) as PolygonAggregatesResponse;
	
	console.log(`Daily bars for ${symbol}: ${data.resultsCount} results`);
	return data.results || [];
}

async function getPolygonIntradayBars(symbol: string, multiplier: number, timespan: string, from: string, to: string): Promise<PolygonBar[]> {
	try {
		console.log(`Making intraday request: /v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${from}/${to}`);
		
		const data = await makePolygonRequest(`/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${from}/${to}`, {
			adjusted: 'true',
			sort: 'asc',
			limit: '50000'
		}) as PolygonAggregatesResponse;
		
		console.log(`${timespan} bars for ${symbol}: ${data.resultsCount} results`);
		return data.results || [];
	} catch (error) {
		console.error(`Intraday request failed for ${symbol}:`, error);
		throw error;
	}
}

async function getPolygonLivePrice(symbol: string): Promise<number | null> {
	try {
		// Try to get the last trade price
		const data = await makePolygonRequest(`/v2/last/trade/${symbol}`);
		if (data.results && data.results.price) {
			console.log(`Live price for ${symbol}: $${data.results.price}`);
			return data.results.price;
		}
		
		// Fallback to last quote
		const quoteData = await makePolygonRequest(`/v1/last_quote/stocks/${symbol}`);
		if (quoteData.last && quoteData.last.bid && quoteData.last.ask) {
			const midPrice = (quoteData.last.bid + quoteData.last.ask) / 2;
			console.log(`Live price for ${symbol} (from quote): $${midPrice}`);
			return midPrice;
		}
		
		return null;
	} catch (error: any) {
		// Check if it's a 403 authorization error (subscription doesn't include live data)
		if (error.response?.status === 403) {
			console.warn(`Live price not available for ${symbol} - subscription doesn't include real-time data`);
		} else {
			console.warn(`Could not get live price for ${symbol}:`, error.message);
		}
		return null;
	}
}

async function getPolygonGroupedDaily(date: string): Promise<GroupedDailyBar[]> {
	try {
		console.log(`Getting grouped daily bars for ${date}`);
		
		const data = await makePolygonRequest(`/v2/aggs/grouped/locale/us/market/stocks/${date}`, {
			adjusted: 'true',
			include_otc: 'false'
		}) as GroupedDailyResponse;
		
		console.log(`Market-wide scan: ${data.resultsCount} stocks found for ${date}`);
		return data.results || [];
	} catch (error) {
		console.error(`Grouped daily request failed for ${date}:`, error);
		throw error;
	}
}

// ================== UNIFIED DATA PROVIDER FUNCTIONS ==================
// Hybrid approach: Use Polygon.io for bulk operations, Marketstack for real-time prices only

async function getPreviousClose(symbol: string): Promise<PolygonBar | null> {
	// Always use Polygon.io for bulk operations
	return getPolygonPreviousClose(symbol);
}

async function getTickerDetails(symbol: string): Promise<any> {
	// Always use Polygon.io for bulk operations
	return getPolygonTickerDetails(symbol);
}

async function getDailyBars(symbol: string, from: string, to: string): Promise<PolygonBar[]> {
	// Always use Polygon.io for bulk operations
	return getPolygonDailyBars(symbol, from, to);
}

async function getIntradayBars(symbol: string, multiplier: number, timespan: string, from: string, to: string): Promise<PolygonBar[]> {
	// Always use Polygon.io for bulk operations
	return getPolygonIntradayBars(symbol, multiplier, timespan, from, to);
}

async function getUnifiedLivePrice(symbol: string): Promise<number | null> {
	// Always use marketstack for live prices (better pricing for real-time data)
	return getMarketstackRealTimePrice(symbol);
}

async function getGroupedDaily(date: string): Promise<GroupedDailyBar[]> {
	// Always use Polygon.io for bulk market scanning (better for bulk operations)
	return getPolygonGroupedDaily(date);
}

// ================== END UNIFIED FUNCTIONS ==================

function calculate20DayHigh(bars: PolygonBar[]): number {
	console.log('Calculating 20-day high, bars count:', bars.length);
	if (!bars || bars.length === 0) {
		console.log('No bars data available');
		return 0;
	}

	// Sort by timestamp descending (most recent first) and take the most recent 20 bars
	// Since we already excluded today's data from the API call, these are all previous days
	const sortedBars = bars.sort((a, b) => b.t - a.t).slice(0, 20);
	console.log('Number of bars for 20-day calc:', sortedBars.length);
	
	if (sortedBars.length === 0) {
		console.log('No bars found for calculation');
		return 0;
	}
	
	const highs = sortedBars.map(bar => bar.h);
	console.log('Sample highs (previous days):', highs.slice(0, 5));
	
	const maxHigh = Math.max(...highs);
	console.log('20-day high (previous 20 days) calculated:', maxHigh);
	return maxHigh;
}

function calculate20DayLow(bars: PolygonBar[]): number {
	console.log('Calculating 20-day low, bars count:', bars.length);
	if (!bars || bars.length === 0) {
		console.log('No bars data available');
		return 0;
	}

	// Sort by timestamp descending (most recent first) and take the most recent 20 bars
	// Since we already excluded today's data from the API call, these are all previous days
	const sortedBars = bars.sort((a, b) => b.t - a.t).slice(0, 20);
	console.log('Number of bars for 20-day low calc:', sortedBars.length);
	
	if (sortedBars.length === 0) {
		console.log('No bars found for calculation');
		return 0;
	}
	
	const lows = sortedBars.map(bar => bar.l);
	console.log('Sample lows (previous days):', lows.slice(0, 5));
	
	const minLow = Math.min(...lows);
	console.log('20-day low (previous 20 days) calculated:', minLow);
	return minLow;
}

function calculateGapPercentage(openPrice: number, previousClose: number): number {
	if (previousClose === 0) return 0;
	return ((openPrice - previousClose) / previousClose) * 100;
}

function calculateVolatilityScore(bars: PolygonBar[]): number {
	if (!bars || bars.length < 5) return 100; // High volatility for insufficient data
	
	// Sort by timestamp (most recent first)
	const sortedBars = bars.sort((a, b) => b.t - a.t).slice(0, 10); // Last 10 days
	
	// Calculate daily ranges as percentage of close price
	const dailyRanges = sortedBars.map(bar => {
		const range = bar.h - bar.l;
		const rangePercent = (range / bar.c) * 100;
		return rangePercent;
	});
	
	// Calculate average daily range
	const avgDailyRange = dailyRanges.reduce((sum, range) => sum + range, 0) / dailyRanges.length;
	
	// Calculate volume volatility (coefficient of variation)
	const volumes = sortedBars.map(bar => bar.v);
	const avgVolume = volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length;
	const volumeStdDev = Math.sqrt(
		volumes.reduce((sum, vol) => sum + Math.pow(vol - avgVolume, 2), 0) / volumes.length
	);
	const volumeCV = avgVolume > 0 ? (volumeStdDev / avgVolume) * 100 : 0;
	
	// Calculate price volatility (standard deviation of closes)
	const closes = sortedBars.map(bar => bar.c);
	const avgClose = closes.reduce((sum, close) => sum + close, 0) / closes.length;
	const priceStdDev = Math.sqrt(
		closes.reduce((sum, close) => sum + Math.pow(close - avgClose, 2), 0) / closes.length
	);
	const priceCV = avgClose > 0 ? (priceStdDev / avgClose) * 100 : 0;
	
	// Combine factors into volatility score (0-100, lower is better)
	const volatilityScore = (avgDailyRange * 0.5) + (volumeCV * 0.3) + (priceCV * 0.2);
	
	return Math.min(volatilityScore, 100); // Cap at 100
}

function isVolatilityAcceptable(bars: PolygonBar[], currentPrice: number, volatilityLevel: 'low' | 'medium' | 'high' = 'low', symbol?: string): boolean {
	const volatilityScore = calculateVolatilityScore(bars);
	
	// Check if this is a blue chip stock
	const isBlueChip = symbol ? BLUE_CHIP_STOCKS.has(symbol) : false;
	
	// Define thresholds for different volatility levels
	let thresholds: { low: number; medium: number; high: number };
	
	if (currentPrice < 20) {
		// Very strict for lower-priced stocks, but more lenient for blue chips
		thresholds = { 
			low: isBlueChip ? 12 : 8, 
			medium: isBlueChip ? 20 : 15, 
			high: isBlueChip ? 35 : 25 
		};
	} else if (currentPrice < 50) {
		// Moderate for mid-priced stocks, more lenient for blue chips
		thresholds = { 
			low: isBlueChip ? 18 : 12, 
			medium: isBlueChip ? 30 : 20, 
			high: isBlueChip ? 50 : 35 
		};
	} else {
		// More lenient for higher-priced stocks, very lenient for blue chips
		thresholds = { 
			low: isBlueChip ? 25 : 15, 
			medium: isBlueChip ? 40 : 25, 
			high: isBlueChip ? 70 : 50 
		};
	}
	
	return volatilityScore < thresholds[volatilityLevel];
}

function calculateBreakoutPercentage(currentPrice: number, twentyDayHigh: number): number {
	if (twentyDayHigh === 0) return 0;
	return ((currentPrice - twentyDayHigh) / twentyDayHigh) * 100;
}

async function testPolygonApiKey(): Promise<boolean> {
	try {
		const response = await getPreviousClose('AAPL');
		return response !== null;
	} catch (error) {
		return false;
	}
}

async function getEnhancedStockDataFromGrouped(todayBar: GroupedDailyBar, yesterdayBar: GroupedDailyBar | null, twentyDayValue: number, isGapDown: boolean = false): Promise<EnhancedStockData | null> {
	try {
		if (!yesterdayBar) {
			console.warn(`No previous day data for ${todayBar.T}`);
			return null;
		}

		const symbol = todayBar.T;
		const currentPrice = todayBar.c; // Today's close price
		const openPrice = todayBar.o; // Today's open price
		const highPrice = todayBar.h; // Today's high price
		const lowPrice = todayBar.l; // Today's low price
		const previousClose = yesterdayBar.c; // Yesterday's close
		const volume = todayBar.v; // Today's volume

		// Calculate gap percentage (opening gap)
		const gapPercentage = calculateGapPercentage(openPrice, previousClose);
		
		// Calculate first 15 minutes high, low and close + premarket high/low
		let first15MinHigh = highPrice;
		let first15MinLow = lowPrice;
		let first15MinClose = currentPrice;
		let premarketHigh = 0;
		let premarketLow = 0;
		
		try {
			const today = new Date();
			const dayOfWeek = today.getDay();
			
			let mostRecentDay = new Date(today);
			if (dayOfWeek === 0) {
				mostRecentDay.setDate(today.getDate() - 2);
			} else if (dayOfWeek === 6) {
				mostRecentDay.setDate(today.getDate() - 1);
			}
			
			const tradingDate = mostRecentDay.toISOString().split('T')[0];
			const intradayBars = await getIntradayBars(symbol, 1, 'minute', tradingDate, tradingDate);
			
			if (intradayBars && intradayBars.length > 0) {
				const sortedBars = intradayBars.sort((a, b) => a.t - b.t);
				
				// Separate premarket (4:00-9:30 AM EST = 9:00-14:30 UTC) and market hours bars
				const premarketBars = sortedBars.filter(bar => {
					const date = new Date(bar.t);
					const hours = date.getUTCHours();
					const minutes = date.getUTCMinutes();
					const totalMinutes = hours * 60 + minutes;
					return totalMinutes >= 9 * 60 && totalMinutes < 14 * 60 + 30;
				});
				
				const marketBars = sortedBars.filter(bar => {
					const date = new Date(bar.t);
					const hours = date.getUTCHours();
					const minutes = date.getUTCMinutes();
					const totalMinutes = hours * 60 + minutes;
					return totalMinutes >= 14 * 60 + 30 && totalMinutes < 21 * 60;
				});
				
				// Calculate premarket high/low
				if (premarketBars.length > 0) {
					premarketHigh = Math.max(...premarketBars.map(bar => bar.h));
					premarketLow = Math.min(...premarketBars.map(bar => bar.l));
					console.log(`${symbol}: Premarket high: $${premarketHigh.toFixed(2)}, low: $${premarketLow.toFixed(2)} from ${premarketBars.length} bars`);
				}
				
				// Calculate first 15 minutes of market hours
				const first15Minutes = marketBars.slice(0, 15);
				if (first15Minutes.length > 0) {
					first15MinHigh = Math.max(...first15Minutes.map(bar => bar.h));
					first15MinLow = Math.min(...first15Minutes.map(bar => bar.l));
					first15MinClose = first15Minutes[first15Minutes.length - 1].c;
					console.log(`${symbol}: First 15min high: $${first15MinHigh.toFixed(2)}, low: $${first15MinLow.toFixed(2)}, close: $${first15MinClose.toFixed(2)} from ${first15Minutes.length} bars`);
				}
			}
		} catch (error) {
			console.warn(`Could not get intraday data for ${symbol}, using defaults: ${error}`);
		}
		
		// Get company details including exchange info
		let companyName = symbol;
		let exchange = 'Unknown';
		let marketCap = 0;
		
		try {
			const tickerDetails = await getTickerDetails(symbol);
			if (tickerDetails) {
				companyName = tickerDetails.name || symbol;
				exchange = tickerDetails.primary_exchange || 'Unknown';
				marketCap = tickerDetails.market_cap || 0;
			}
		} catch (error) {
			console.warn(`Could not get ticker details for ${symbol}:`, error);
		}
		
		const enhancedData: EnhancedStockData = {
			symbol,
			currentPrice,
			openPrice,
			highPrice,
			lowPrice,
			previousClose,
			volume,
			marketCap,
			twentyDayHigh: isGapDown ? 0 : twentyDayValue,
			twentyDayLow: isGapDown ? twentyDayValue : undefined,
			gapPercentage,
			companyName,
			exchange,
			currency: 'USD',
			first15MinHigh,
			first15MinLow,
			first15MinClose,
			premarketHigh: premarketHigh > 0 ? premarketHigh : undefined,
			premarketLow: premarketLow > 0 ? premarketLow : undefined
		};

		return enhancedData;
	} catch (error) {
		console.error(`Failed to get enhanced stock data for ${todayBar.T}:`, error);
		return null;
	}
}

async function getEnhancedStockData(symbol: string): Promise<EnhancedStockData | null> {
	try {
		console.log(`Getting enhanced data for ${symbol} from Polygon...`);
		
		// Get historical data for gap calculation and 20-day high
		const thirtyDaysAgo = new Date();
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
		const fromDate = thirtyDaysAgo.toISOString().split('T')[0];
		const toDate = new Date().toISOString().split('T')[0];

		// Skip company details for speed - only get historical data
		const historicalBars = await getDailyBars(symbol, fromDate, toDate);
		const dailyBars = historicalBars || [];
		
		console.log(`Historical bars count: ${dailyBars.length}`);

		if (dailyBars.length < 2) {
			console.warn(`Not enough historical data for ${symbol}`);
			return null;
		}

		// Sort bars by timestamp (most recent first)
		const sortedBars = dailyBars.sort((a, b) => b.t - a.t);
		
		// Find the most recent trading day (could be Friday if it's weekend)
		const latestBar = sortedBars[0]; // Most recent trading day
		const previousBar = sortedBars[1]; // Previous trading day
		
		const currentPrice = latestBar.c; // Latest close price
		const openPrice = latestBar.o; // Latest open price
		const highPrice = latestBar.h; // Latest high price
		const lowPrice = latestBar.l; // Latest low price
		const previousClose = previousBar.c; // Previous day's close
		const volume = latestBar.v; // Latest volume

		// Convert timestamp to readable date for logging
		const latestDate = new Date(latestBar.t).toDateString();
		const previousDate = new Date(previousBar.t).toDateString();
		console.log(`Analyzing gap for ${symbol}: ${latestDate} open vs ${previousDate} close`);
		console.log(`Raw data - Latest: Open=${openPrice}, Close=${currentPrice}, High=${highPrice}, Low=${lowPrice}, Volume=${volume}`);
		console.log(`Raw data - Previous: Close=${previousClose}`);
		console.log(`Timestamps - Latest: ${latestBar.t}, Previous: ${previousBar.t}`);

		// Calculate multiple types of gaps
		const openingGap = calculateGapPercentage(openPrice, previousClose);        // Open vs prev close
		const closingGap = calculateGapPercentage(currentPrice, previousClose);     // Close vs prev close  
		const intradayGap = calculateGapPercentage(highPrice, openPrice);           // High vs open (intraday momentum)
		
		// Determine the maximum gap (best performance)
		const maxGap = Math.max(Math.abs(openingGap), Math.abs(closingGap), Math.abs(intradayGap));
		const gapType = 
			Math.abs(openingGap) === maxGap ? 'Opening' :
			Math.abs(closingGap) === maxGap ? 'Closing' : 'Intraday';
		
		// Use the actual gap value (preserve sign) for the type with max absolute value
		const gapPercentage = 
			Math.abs(openingGap) === maxGap ? openingGap :
			Math.abs(closingGap) === maxGap ? closingGap : intradayGap;
		
		console.log(`Gap analysis for ${symbol}: Opening: ${openingGap.toFixed(2)}%, Closing: ${closingGap.toFixed(2)}%, Intraday: ${intradayGap.toFixed(2)}% => Best: ${gapType} ${gapPercentage.toFixed(2)}%`);
		
		// Calculate 20-day high and breakout percentage
		const twentyDayHigh = calculate20DayHigh(dailyBars);
		const breakoutPercentage = calculateBreakoutPercentage(currentPrice, twentyDayHigh);

		// Get live price during market hours
		let livePrice: number | undefined;
		try {
			livePrice = await getUnifiedLivePrice(symbol) || undefined;
		} catch (error) {
			console.warn(`Could not get live price for ${symbol}:`, error);
		}

		const enhancedData: EnhancedStockData = {
			symbol,
			currentPrice,
			livePrice,
			openPrice,
			highPrice,
			lowPrice,
			previousClose,
			volume,
			marketCap: 0, // Skip market cap lookup for speed
			twentyDayHigh,
			gapPercentage, // This is now the true gap percentage
			companyName: symbol, // Use symbol for speed
			exchange: 'Unknown', // Skip exchange lookup for speed
			currency: 'USD' // Default currency for speed
		};

		console.log(`Enhanced data for ${symbol}:`, {
			openPrice: openPrice.toFixed(2),
			previousClose: previousClose.toFixed(2),
			gapPercentage: gapPercentage.toFixed(2) + '%',
			twentyDayHigh: twentyDayHigh.toFixed(2),
			breakoutPercentage: breakoutPercentage.toFixed(2) + '%'
		});

		return enhancedData;
	} catch (error) {
		console.error(`Failed to get enhanced stock data for ${symbol}:`, error);
		return null;
	}
}


// Create polygonService object
const polygonService = {
	testApiKey: testPolygonApiKey,
	getEnhancedStockData: getEnhancedStockData
};

export const testPolygon = async (req: Request, res: Response) => {
	try {
		console.log('Testing Polygon API...');
		
		// Test API key first
		const isApiWorking = await polygonService.testApiKey();
		if (!isApiWorking) {
			return res.status(200).json({
				polygonStatus: 'API key test failed',
				message: 'Check your Polygon API key or subscription level'
			});
		}

		// Test a simple quote
		const testData = await polygonService.getEnhancedStockData('AAPL');
		
		return res.status(200).json({
			polygonStatus: testData ? 'Working' : 'Failed',
			testData,
			message: testData ? 'Polygon API is working' : 'Polygon API failed to get test data'
		});
	} catch (error) {
		console.error('Polygon test error:', error);
		return res.status(500).json({ 
			polygonStatus: 'Error',
			error: 'Polygon API test failed' 
		});
	}
};

// Batch processing configuration
const BATCH_SIZE = 20; // Process 20 stocks at a time
const BATCH_DELAY = 100; // 100ms delay between batches
const MAX_CONCURRENT_REQUESTS = 5; // Limit concurrent API requests

// Helper function to process batches with concurrency control
async function processBatch<T, R>(
	items: T[],
	batchSize: number,
	processor: (batch: T[]) => Promise<R[]>,
	delayMs: number = 0
): Promise<R[]> {
	const results: R[] = [];
	
	for (let i = 0; i < items.length; i += batchSize) {
		const batch = items.slice(i, i + batchSize);
		
		try {
			const batchResults = await processor(batch);
			results.push(...batchResults);
			
			// Add delay between batches to avoid rate limiting
			if (delayMs > 0 && i + batchSize < items.length) {
				await new Promise(resolve => setTimeout(resolve, delayMs));
			}
		} catch (error) {
			console.error(`Batch processing error:`, error);
			// Continue with next batch instead of failing completely
		}
	}
	
	return results;
}

// Helper function to batch API calls
async function batchApiCalls<T>(
	symbols: string[],
	apiCall: (symbol: string) => Promise<T>,
	maxConcurrent: number = MAX_CONCURRENT_REQUESTS
): Promise<Map<string, T>> {
	const results = new Map<string, T>();
	
	// Process symbols in batches to control concurrency
	for (let i = 0; i < symbols.length; i += maxConcurrent) {
		const batch = symbols.slice(i, i + maxConcurrent);
		
		const batchPromises = batch.map(async (symbol) => {
			try {
				const result = await apiCall(symbol);
				return { symbol, result };
			} catch (error) {
				console.warn(`API call failed for ${symbol}:`, error);
				return { symbol, result: null };
			}
		});
		
		const batchResults = await Promise.all(batchPromises);
		
		for (const { symbol, result } of batchResults) {
			if (result !== null) {
				results.set(symbol, result);
			}
		}
		
		// Small delay between concurrent batches
		if (i + maxConcurrent < symbols.length) {
			await new Promise(resolve => setTimeout(resolve, 50));
		}
	}
	
	return results;
}

export const scanGapUps = async (req: Request, res: Response) => {
	try {
		console.log('Starting market-wide Polygon gap up scan...');
		
		// Get the most recent trading dates - handles weekends AND holidays
		const tradingDays = getMostRecentTradingDay();
		let todayStr = tradingDays.today;
		let yesterdayStr = tradingDays.yesterday;
		
		console.log(`Scanning market data: Most Recent Trading Day=${todayStr}, Previous Trading Day=${yesterdayStr}`);

		const startTime = Date.now();
		const maxProcessingTime = 20000; // 20 seconds max to avoid Heroku timeout

		// Get market-wide data for today and yesterday
		let [todayData, yesterdayData] = await Promise.all([
			getGroupedDaily(todayStr),
			getPolygonGroupedDaily(yesterdayStr)
		]);

		if (!todayData || todayData.length === 0) {
			console.log(`No market data for ${todayStr}. Falling back to previous trading day...`);
			
			// Use holiday-aware fallback - go back one more trading day
			const fallbackTodayStr = getPreviousTradingDay(new Date(todayStr));
			const fallbackYesterdayStr = getPreviousTradingDay(new Date(fallbackTodayStr));
			
			console.log(`Trying fallback dates: ${fallbackTodayStr} vs ${fallbackYesterdayStr}`);
			
			const [fallbackTodayData, fallbackYesterdayData] = await Promise.all([
				getPolygonGroupedDaily(fallbackTodayStr),
				getPolygonGroupedDaily(fallbackYesterdayStr)
			]);
			
			if (!fallbackTodayData || fallbackTodayData.length === 0) {
				return res.status(404).json({ 
					error: `No market data available for ${todayStr} or ${fallbackTodayStr}. Markets may be closed.` 
				});
			}
			
			// Use fallback data and update the date strings for logging
			console.log(`Using fallback data: ${fallbackTodayData.length} stocks for ${fallbackTodayStr}`);
			todayData = fallbackTodayData;
			yesterdayData = fallbackYesterdayData;
			
			// Update the date strings for subsequent logging
			todayStr = fallbackTodayStr;
			yesterdayStr = fallbackYesterdayStr;
		}

		if (!yesterdayData || yesterdayData.length === 0) {
			console.log(`No market data for ${yesterdayStr}. Response:`, yesterdayData);
			return res.status(404).json({ 
				error: `No previous day market data available for ${yesterdayStr}.` 
			});
		}

		// Create lookup map for yesterday's data
		const yesterdayMap = new Map<string, GroupedDailyBar>();
		yesterdayData.forEach(bar => yesterdayMap.set(bar.T, bar));

		console.log(`Processing ${todayData.length} stocks from market-wide scan...`);

		let gapUpStocks: GapUpStock[] = [];
		let processedCount = 0;
		let gapUpCount = 0; // Track how many stocks are gapping up

		// Get volatility level from request body, default to 'low'
		const volatilityLevel: 'low' | 'medium' | 'high' = req.body?.volatilityLevel || 'low';

		// Phase 1: Pre-filter stocks based on gap criteria (no API calls)
		console.log('Phase 1: Pre-filtering stocks based on gap criteria...');
		const preFilteredCandidates: {todayBar: GroupedDailyBar, yesterdayBar: GroupedDailyBar, gapPercentage: number, isBlueChip: boolean}[] = [];

		for (const todayBar of todayData) {
			const symbol = todayBar.T;
			const yesterdayBar = yesterdayMap.get(symbol);
			
			if (!yesterdayBar) continue;

			// Calculate gap percentage
			const gapPercentage = calculateGapPercentage(todayBar.o, yesterdayBar.c);
			
			// Track any gap ups for debugging
			if (gapPercentage > 0) {
				gapUpCount++;
				if (gapUpCount <= 5) {
					console.log(`Gap up found: ${symbol} +${gapPercentage.toFixed(2)}% (Open: $${todayBar.o.toFixed(2)}, Prev Close: $${yesterdayBar.c.toFixed(2)}, Volume: ${todayBar.v.toLocaleString()})`);
				}
			}
			
			// Check if this is a blue chip stock
			const isBlueChip = BLUE_CHIP_STOCKS.has(symbol);
			
			// Set gap limits based on volatility level and blue chip status
			const gapLimits = {
				low: { 
					min: 2.5, 
					max: isBlueChip ? 15 : 8  // Blue chips can gap higher on news
				},
				medium: { 
					min: 2.0, 
					max: isBlueChip ? 25 : 12  // Blue chips get even more tolerance
				},
				high: { 
					min: 1.5, 
					max: isBlueChip ? 40 : 20  // Blue chips can have major news gaps
				}
			};
			
			// Pre-filter: Only check stocks in our pattern scanner watchlist with significant gaps
			if (gapPercentage >= gapLimits[volatilityLevel].min && // Minimum gap based on volatility level
				gapPercentage <= gapLimits[volatilityLevel].max && // Maximum gap based on volatility level and blue chip status
				todayBar.v > 100000 && // Minimum volume (increased for quality)
				todayBar.o >= 5 && // No penny stocks (>= $5)
				todayBar.o < 1000 && // Reasonable price range
				isInPatternScannerWatchlist(symbol)) { // Only include stocks from pattern scanner watchlist
				
				preFilteredCandidates.push({ todayBar, yesterdayBar, gapPercentage, isBlueChip });
			}
			processedCount++;
		}

		console.log(`Phase 1 complete: ${preFilteredCandidates.length} candidates from ${processedCount} stocks (filtered to pattern scanner watchlist: ${PATTERN_SCANNER_WATCHLIST.length} symbols)`);
		console.log(`Total gap ups in market: ${gapUpCount}`);

		// Track batch processing metrics
		let batchesProcessed = 0;
		let twentyDayHighCalculated = 0;

		// Phase 2: Process pre-filtered candidates in batches
		console.log('Phase 2: Processing gap up candidates in batches...');
		
		// Process pre-filtered candidates instead of all stocks
		for (let i = 0; i < preFilteredCandidates.length; i += BATCH_SIZE) {
			// Check timeout before processing each batch
			if (Date.now() - startTime > maxProcessingTime) {
				console.log(`Stopping scan due to time limit (${maxProcessingTime/1000}s) - processed ${batchesProcessed} batches`);
				break;
			}

			const batch = preFilteredCandidates.slice(i, i + BATCH_SIZE);
			
			for (const candidate of batch) {
				try {
					const symbol = candidate.todayBar.T;
					const todayBar = candidate.todayBar;
					const yesterdayBar = candidate.yesterdayBar;
					const gapPercentage = candidate.gapPercentage;
					const isBlueChip = candidate.isBlueChip;
					
					// Set gap limits based on volatility level and blue chip status
					const gapLimits = {
						low: { 
							min: 2.5, 
							max: isBlueChip ? 15 : 8  // Blue chips can gap higher on news
						},
						medium: { 
							min: 2.0, 
							max: isBlueChip ? 25 : 12  // Blue chips get even more tolerance
						},
						high: { 
							min: 1.5, 
							max: isBlueChip ? 40 : 20  // Blue chips can have major news gaps
						}
					};
					
					// Pre-filter: Only check stocks in pattern scanner watchlist with significant gaps
					if (gapPercentage >= gapLimits[volatilityLevel].min && // Minimum gap based on volatility level
						gapPercentage <= gapLimits[volatilityLevel].max && // Maximum gap based on volatility level and blue chip status
						todayBar.v > 100000 && // Minimum volume (increased for quality)
						todayBar.o >= 5 && // No penny stocks (>= $5)
						todayBar.o < 1000 && // Reasonable price range
						isInPatternScannerWatchlist(symbol)) { // Only include stocks from pattern scanner watchlist
						
						// Skip 20-day high calculation during initial scan for speed
						// We'll calculate it for the top results later and apply the proper filter there
						const twentyDayHigh = 0;
						
						const stockData = await getEnhancedStockDataFromGrouped(todayBar, yesterdayBar, twentyDayHigh, false);
						
						if (stockData) {
							// Get recent historical data for volatility analysis
							const thirtyDaysAgo = new Date();
							thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
							const fromDate = thirtyDaysAgo.toISOString().split('T')[0];
							const toDate = new Date().toISOString().split('T')[0];
							
							let volatilityAcceptable = true;
							try {
								const historicalBars = await getDailyBars(symbol, fromDate, toDate);
								// Get volatility level from request body, default to 'low'
								const volatilityLevel = req.body?.volatilityLevel || 'low';
								volatilityAcceptable = isVolatilityAcceptable(historicalBars, stockData.currentPrice, volatilityLevel, symbol);
								
								if (!volatilityAcceptable) {
									console.log(`Filtered out ${symbol} due to high volatility (${calculateVolatilityScore(historicalBars).toFixed(1)}) for ${volatilityLevel} level${isBlueChip ? ' (Blue Chip)' : ''}`);
								}
							} catch (error) {
								console.warn(`Could not calculate volatility for ${symbol}, allowing through:`, error);
							}
							
							// Enhanced suitable criteria for gap trading based on volatility level
							// Note: 20-day high filter will be applied in Phase 2 where real values are calculated
							const suitable = stockData.volume > 100000 && 
								stockData.gapPercentage >= gapLimits[volatilityLevel as keyof typeof gapLimits].min && 
								stockData.gapPercentage <= gapLimits[volatilityLevel as keyof typeof gapLimits].max && 
								stockData.currentPrice >= 5 && // No penny stocks
								// stockData.currentPrice <= 300 && // Avoid extremely high-priced stocks (commented out for now)
								volatilityAcceptable; // Add volatility filter
							
							// ONLY show stocks that meet ALL criteria
							if (suitable) {
								const isBlueChip = BLUE_CHIP_STOCKS.has(symbol);
								const blueChipLabel = isBlueChip ? ' [BLUE CHIP]' : '';
								
								console.log(`Found suitable gap up: ${symbol}${blueChipLabel} +${gapPercentage.toFixed(2)}% (Open: $${todayBar.o.toFixed(2)}, Prev Close: $${yesterdayBar.c.toFixed(2)}, Volume: ${todayBar.v.toLocaleString()})`);
								
								const analysis = `${symbol} gapped up ${stockData.gapPercentage.toFixed(1)}% on ${todayStr}. Open: $${stockData.openPrice.toFixed(2)}, Previous close: $${stockData.previousClose.toFixed(2)}, Current: $${stockData.currentPrice.toFixed(2)}. Volume: ${stockData.volume.toLocaleString()}. SUITABLE for gap trading.${isBlueChip ? ' This is a blue chip company with higher gap tolerance due to news-driven moves.' : ''}`;

								const gapUpStock: GapUpStock = {
									stockSymbol: symbol,
									currentPrice: `$${stockData.currentPrice.toFixed(2)}`,
									livePrice: stockData.livePrice ? `$${stockData.livePrice.toFixed(2)}` : undefined,
									twentyDayHigh: `$${stockData.twentyDayHigh.toFixed(2)}`,
									gapPercentage: `${stockData.gapPercentage.toFixed(2)}%`,
									openPrice: `$${stockData.openPrice.toFixed(2)}`,
									highPrice: `$${stockData.highPrice.toFixed(2)}`,
									lowPrice: `$${stockData.lowPrice.toFixed(2)}`,
									previousClose: `$${stockData.previousClose.toFixed(2)}`,
									volume: stockData.volume,
									marketCap: stockData.marketCap,
									companyName: stockData.companyName,
									exchange: stockData.exchange,
									analysis: analysis,
									suitable: true,
									isBlueChip: isBlueChip,
									first15MinHigh: stockData.first15MinHigh ? `$${stockData.first15MinHigh.toFixed(2)}` : undefined,
									first15MinLow: stockData.first15MinLow ? `$${stockData.first15MinLow.toFixed(2)}` : undefined,
									first15MinClose: stockData.first15MinClose ? `$${stockData.first15MinClose.toFixed(2)}` : undefined,
									premarketHigh: stockData.premarketHigh ? `$${stockData.premarketHigh.toFixed(2)}` : undefined,
									premarketLow: stockData.premarketLow ? `$${stockData.premarketLow.toFixed(2)}` : undefined
								};
								
								gapUpStocks.push(gapUpStock);
							} else {
								console.log(`Filtered out ${symbol} +${gapPercentage.toFixed(2)}% - doesn't meet criteria (Price: $${stockData.currentPrice.toFixed(2)}, Volume: ${stockData.volume.toLocaleString()})`);
							}
						}
					}
				} catch (error: any) {
					console.error(`Error processing ${candidate.todayBar.T}:`, error.message || error);
				}
			}
			
			batchesProcessed++;
			console.log(`Completed batch ${batchesProcessed}/${Math.ceil(preFilteredCandidates.length / BATCH_SIZE)}: ${gapUpStocks.length} suitable gap up stocks found so far`);
		}

		// Sort by gap percentage (highest first)
		gapUpStocks.sort((a, b) => parseFloat(b.gapPercentage) - parseFloat(a.gapPercentage));

		// Phase 3: Calculate 20-day highs for ALL gap-up stocks that meet criteria
		console.log(`Phase 3: Calculating 20-day highs for all ${gapUpStocks.length} qualifying stocks...`);
		const topStocks = gapUpStocks; // Calculate for ALL results
		
		for (let i = 0; i < topStocks.length; i++) {
			const stock = topStocks[i];
			try {
				// Get historical data EXCLUDING the most recent trading day
				// We want 20-day high from BEFORE today's gap, not including today
				// Use 40 days to ensure we get at least 20 trading days (accounting for weekends/holidays)
				const fortyDaysAgo = new Date();
				fortyDaysAgo.setDate(fortyDaysAgo.getDate() - 40);
				const fromDate = fortyDaysAgo.toISOString().split('T')[0];
				
				// Use previousDay as the end date to EXCLUDE today's data
				const toDate = previousDay.toISOString().split('T')[0];
				
				console.log(`Getting historical data for ${stock.stockSymbol}: ${fromDate} to ${toDate} (excluding most recent day)`);
				
				const historicalBars = await getPolygonDailyBars(stock.stockSymbol, fromDate, toDate);
				
				if (historicalBars && historicalBars.length >= 20) {
					console.log(`${stock.stockSymbol}: Processing ${historicalBars.length} historical bars`);
					
					// Debug: show the date range of the data we got
					const sortedBars = historicalBars.sort((a, b) => b.t - a.t);
					const latestBarDate = new Date(sortedBars[0].t).toISOString().split('T')[0];
					const oldestBarDate = new Date(sortedBars[sortedBars.length - 1].t).toISOString().split('T')[0];
					console.log(`${stock.stockSymbol}: Historical data range: ${oldestBarDate} to ${latestBarDate}`);
					
					// Debug: show current price vs what we're about to calculate
					const currentPrice = parseFloat(stock.currentPrice.replace('$', ''));
					console.log(`${stock.stockSymbol}: Current price: $${currentPrice.toFixed(2)}`);
					
					const twentyDayHigh = calculate20DayHigh(historicalBars);
					stock.twentyDayHigh = `$${twentyDayHigh.toFixed(2)}`;
					
					console.log(`${stock.stockSymbol}: 20-day high: $${twentyDayHigh.toFixed(2)}, Current: $${currentPrice.toFixed(2)}, Equal? ${Math.abs(twentyDayHigh - currentPrice) < 0.01}`);
				} else {
					console.log(`${stock.stockSymbol}: Not enough historical data (${historicalBars?.length || 0} bars)`);
					// Use today's high as fallback
					const currentPrice = parseFloat(stock.currentPrice.replace('$', ''));
					stock.twentyDayHigh = `$${currentPrice.toFixed(2)}`;
					console.log(`${stock.stockSymbol}: Using current price as 20-day high fallback`);
				}
			} catch (error) {
				console.warn(`Could not calculate 20-day high for ${stock.stockSymbol}:`, error);
				// Keep the $0.00 value to indicate calculation failed
			}
		}

		// CRITICAL: Filter stocks where openPrice > twentyDayHigh AND first15MinHigh > twentyDayHigh
		// This ensures the gap breakout is confirmed by the first 15 minutes of trading
		console.log(`Applying openPrice > twentyDayHigh AND first15MinHigh > twentyDayHigh filter...`);
		const beforeFilterCount = gapUpStocks.length;
		gapUpStocks = gapUpStocks.filter(stock => {
			const openPrice = parseFloat(stock.openPrice?.replace('$', '') || '0');
			const twentyDayHigh = parseFloat(stock.twentyDayHigh?.replace('$', '') || '0');
			const first15MinHigh = parseFloat(stock.first15MinHigh?.replace('$', '') || '0');
			
			const openPassesFilter = openPrice > twentyDayHigh;
			const first15MinPassesFilter = first15MinHigh > twentyDayHigh;
			const passesFilter = openPassesFilter && first15MinPassesFilter;
			
			if (!openPassesFilter) {
				console.log(`${stock.stockSymbol}: FILTERED OUT - Open: $${openPrice.toFixed(2)} not > 20-day high: $${twentyDayHigh.toFixed(2)}`);
			} else if (!first15MinPassesFilter) {
				console.log(`${stock.stockSymbol}: FILTERED OUT - First 15min high: $${first15MinHigh.toFixed(2)} not > 20-day high: $${twentyDayHigh.toFixed(2)} (gap failed to hold)`);
			} else {
				console.log(`${stock.stockSymbol}: PASSES FILTER - Open: $${openPrice.toFixed(2)} > 20-day high: $${twentyDayHigh.toFixed(2)}, First 15min high: $${first15MinHigh.toFixed(2)} confirms breakout ✓`);
			}
			
			return passesFilter;
		});
		
		console.log(`Applied gap up breakout filter: ${beforeFilterCount} -> ${gapUpStocks.length} stocks remaining`);

		const endTime = Date.now();
		const duration = (endTime - startTime) / 1000;
		console.log(`Market-wide scan complete: Found ${gapUpStocks.length} gap-up stocks`);
		console.log(`Processed ${processedCount}/${todayData.length} stocks in ${duration.toFixed(2)} seconds`);
		console.log(`Total gap ups in market: ${gapUpCount}`);

		const result: ScanResult = {
			stocks: gapUpStocks.slice(0, 50), // Limit to top 50 results
			totalFound: gapUpStocks.length,
			timestamp: new Date(),
			scanDuration: `${duration.toFixed(2)}s`,
			status: processedCount === todayData.length ? 'completed' : 'timeout',
			processedCount,
			totalCount: todayData.length,
			batchInfo: {
				preFilteredCount: preFilteredCandidates.length,
				batchesProcessed: batchesProcessed,
				totalBatches: Math.ceil(preFilteredCandidates.length / BATCH_SIZE),
				twentyDayHighCalculated: twentyDayHighCalculated,
				optimizationUsed: true
			}
		};

		return res.status(200).json(result);
	} catch (error) {
		console.error('Error scanning for gap ups:', error);
		return res.status(500).json({ error: 'Failed to scan for gap ups' });
	}
};

export const scanGapDowns = async (req: Request, res: Response) => {
	try {
		console.log('Starting market-wide Polygon gap down scan...');
		
		// Get the most recent trading dates - handles weekends AND holidays
		const tradingDays = getMostRecentTradingDay();
		let todayStr = tradingDays.today;
		let yesterdayStr = tradingDays.yesterday;
		
		console.log(`Scanning market data: Most Recent Trading Day=${todayStr}, Previous Trading Day=${yesterdayStr}`);

		const startTime = Date.now();
		const maxProcessingTime = 20000; // 20 seconds max to avoid Heroku timeout

		// Get market-wide data for today and yesterday
		let [todayData, yesterdayData] = await Promise.all([
			getGroupedDaily(todayStr),
			getPolygonGroupedDaily(yesterdayStr)
		]);

		if (!todayData || todayData.length === 0) {
			console.log(`No market data for ${todayStr}. Falling back to previous trading day...`);
			
			// Use holiday-aware fallback - go back one more trading day
			const fallbackTodayStr = getPreviousTradingDay(new Date(todayStr));
			const fallbackYesterdayStr = getPreviousTradingDay(new Date(fallbackTodayStr));
			
			console.log(`Trying fallback dates: ${fallbackTodayStr} vs ${fallbackYesterdayStr}`);
			
			const [fallbackTodayData, fallbackYesterdayData] = await Promise.all([
				getPolygonGroupedDaily(fallbackTodayStr),
				getPolygonGroupedDaily(fallbackYesterdayStr)
			]);
			
			if (!fallbackTodayData || fallbackTodayData.length === 0) {
				return res.status(404).json({ 
					error: `No market data available for ${todayStr} or ${fallbackTodayStr}. Markets may be closed.` 
				});
			}
			
			// Use fallback data and update the date strings for logging
			console.log(`Using fallback data: ${fallbackTodayData.length} stocks for ${fallbackTodayStr}`);
			todayData = fallbackTodayData;
			yesterdayData = fallbackYesterdayData;
			
			// Update the date strings for subsequent logging
			todayStr = fallbackTodayStr;
			yesterdayStr = fallbackYesterdayStr;
		}

		if (!yesterdayData || yesterdayData.length === 0) {
			console.log(`No market data for ${yesterdayStr}. Response:`, yesterdayData);
			return res.status(404).json({ 
				error: `No previous day market data available for ${yesterdayStr}.` 
			});
		}

		// Create lookup map for yesterday's data
		const yesterdayMap = new Map<string, GroupedDailyBar>();
		yesterdayData.forEach(bar => yesterdayMap.set(bar.T, bar));

		console.log(`Processing ${todayData.length} stocks from market-wide gap down scan (filtered to pattern scanner watchlist: ${PATTERN_SCANNER_WATCHLIST.length} symbols)...`);

		let gapDownStocks: GapUpStock[] = [];
		let processedCount = 0;

		// Filter and process stocks in batches
		for (let i = 0; i < todayData.length; i += 100) {
			// Check timeout
			if (Date.now() - startTime > maxProcessingTime) {
				console.log(`Stopping scan due to time limit (${maxProcessingTime/1000}s)`);
				break;
			}

			const batch = todayData.slice(i, i + 100);
			
			for (const todayBar of batch) {
				try {
					const symbol = todayBar.T;
					const yesterdayBar = yesterdayMap.get(symbol);
					
					if (!yesterdayBar) continue;

					// Calculate gap percentage (negative for gap downs)
					const gapPercentage = calculateGapPercentage(todayBar.o, yesterdayBar.c);
					
					// Get volatility level from request body, default to 'low'
					const volatilityLevel: 'low' | 'medium' | 'high' = req.body?.volatilityLevel || 'low';
					
					// Check if this is a blue chip stock
					const isBlueChip = BLUE_CHIP_STOCKS.has(symbol);
					
					// Set gap limits based on volatility level and blue chip status (for gap downs)
					const gapLimits = {
						low: { 
							min: isBlueChip ? -15 : -8,  // Blue chips can gap down more on news
							max: -2.5 
						},
						medium: { 
							min: isBlueChip ? -25 : -12,  // Blue chips get more tolerance
							max: -2.0 
						},
						high: { 
							min: isBlueChip ? -40 : -20,  // Blue chips can have major news gaps down
							max: -1.5 
						}
					};
					
					// Pre-filter: Only check stocks in pattern scanner watchlist with significant gap downs
					if (gapPercentage <= gapLimits[volatilityLevel].max && // Must be negative enough (gap down)
						gapPercentage >= gapLimits[volatilityLevel].min && // But not too extreme
						todayBar.v > 100000 && // Minimum volume (increased for quality)
						todayBar.o >= 5 && // No penny stocks (>= $5)
						todayBar.o < 1000 && // Reasonable price range
						isInPatternScannerWatchlist(symbol)) { // Only include stocks from pattern scanner watchlist
						
						// Skip 20-day low calculation during initial scan for speed
						// We'll calculate it for the top results later and apply the proper filter there
						const twentyDayLow = 0;
						
						const stockData = await getEnhancedStockDataFromGrouped(todayBar, yesterdayBar, twentyDayLow, true);
						
						if (stockData) {
							// Enhanced suitable criteria for gap down trading based on volatility level
							const suitable = stockData.volume > 100000 && 
								stockData.gapPercentage <= gapLimits[volatilityLevel as keyof typeof gapLimits].max && 
								stockData.gapPercentage >= gapLimits[volatilityLevel as keyof typeof gapLimits].min && 
								stockData.currentPrice >= 5; // No penny stocks
								// stockData.currentPrice <= 300; // Avoid extremely high-priced stocks (commented out for now)
							
							// ONLY show stocks that meet ALL criteria
							if (suitable) {
								const blueChipLabel = isBlueChip ? ' [BLUE CHIP]' : '';
								
								console.log(`Found suitable gap down: ${symbol}${blueChipLabel} ${gapPercentage.toFixed(2)}% (Open: $${todayBar.o.toFixed(2)}, Prev Close: $${yesterdayBar.c.toFixed(2)}, Volume: ${todayBar.v.toLocaleString()})`);
								
								const analysis = `${symbol} gapped down ${Math.abs(stockData.gapPercentage).toFixed(1)}% on ${todayStr}. Open: $${stockData.openPrice.toFixed(2)}, Previous close: $${stockData.previousClose.toFixed(2)}, Current: $${stockData.currentPrice.toFixed(2)}. Volume: ${stockData.volume.toLocaleString()}. SUITABLE for gap down trading.${isBlueChip ? ' This is a blue chip company with higher gap tolerance due to news-driven moves.' : ''}`;

								const gapDownStock: GapUpStock = {
									stockSymbol: symbol,
									currentPrice: `$${stockData.currentPrice.toFixed(2)}`,
									livePrice: stockData.livePrice ? `$${stockData.livePrice.toFixed(2)}` : undefined,
									twentyDayHigh: stockData.twentyDayLow ? `$${stockData.twentyDayLow.toFixed(2)}` : `$${stockData.twentyDayHigh.toFixed(2)}`,
									gapPercentage: `${stockData.gapPercentage.toFixed(2)}%`,
									openPrice: `$${stockData.openPrice.toFixed(2)}`,
									highPrice: `$${stockData.highPrice.toFixed(2)}`,
									lowPrice: `$${stockData.lowPrice.toFixed(2)}`,
									previousClose: `$${stockData.previousClose.toFixed(2)}`,
									volume: stockData.volume,
									marketCap: stockData.marketCap,
									companyName: stockData.companyName,
									exchange: stockData.exchange,
									analysis: analysis,
									suitable: true, // All displayed stocks are suitable
									isBlueChip: isBlueChip,
									first15MinHigh: stockData.first15MinHigh ? `$${stockData.first15MinHigh.toFixed(2)}` : undefined,
									first15MinLow: stockData.first15MinLow ? `$${stockData.first15MinLow.toFixed(2)}` : undefined,
									first15MinClose: stockData.first15MinClose ? `$${stockData.first15MinClose.toFixed(2)}` : undefined
								};
								
								gapDownStocks.push(gapDownStock);
							}
						}
					}
				} catch (error: any) {
					console.error(`Error processing ${todayBar.T}:`, error.message || error);
				}
				processedCount++;
			}
		}

		// Sort by gap percentage (most negative first)
		gapDownStocks.sort((a, b) => parseFloat(a.gapPercentage) - parseFloat(b.gapPercentage));

		// Phase 2: Calculate 20-day lows for final results
		console.log('Phase 2: Calculating 20-day lows for final gap down stocks...');
		const topStocks = gapDownStocks.slice(0, 50); // Limit to top 50 for performance
		
		for (let i = 0; i < topStocks.length; i++) {
			const stock = topStocks[i];
			try {
				// Get historical data EXCLUDING the most recent trading day
				// We want 20-day low from BEFORE today's gap, not including today
				// Use 40 days to ensure we get at least 20 trading days (accounting for weekends/holidays)
				const fortyDaysAgo = new Date();
				fortyDaysAgo.setDate(fortyDaysAgo.getDate() - 40);
				const fromDate = fortyDaysAgo.toISOString().split('T')[0];
				
				// Use previousDay as the end date to EXCLUDE today's data
				const toDate = previousDay.toISOString().split('T')[0];
				
				console.log(`Getting historical data for ${stock.stockSymbol}: ${fromDate} to ${toDate} (excluding most recent day)`);
				
				const historicalBars = await getPolygonDailyBars(stock.stockSymbol, fromDate, toDate);
				
				if (historicalBars && historicalBars.length >= 20) {
					console.log(`${stock.stockSymbol}: Processing ${historicalBars.length} historical bars`);
					
					// Debug: show the date range of the data we got
					const sortedBars = historicalBars.sort((a, b) => b.t - a.t);
					const latestBarDate = new Date(sortedBars[0].t).toISOString().split('T')[0];
					const oldestBarDate = new Date(sortedBars[sortedBars.length - 1].t).toISOString().split('T')[0];
					console.log(`${stock.stockSymbol}: Historical data range: ${oldestBarDate} to ${latestBarDate}`);
					
					// Debug: show current price vs what we're about to calculate
					const currentPrice = parseFloat(stock.currentPrice.replace('$', ''));
					console.log(`${stock.stockSymbol}: Current price: $${currentPrice.toFixed(2)}`);
					
					const twentyDayLow = calculate20DayLow(historicalBars);
					stock.twentyDayHigh = `$${twentyDayLow.toFixed(2)}`; // Update the display field
					
					// Get first 15-minute low from the stock data
					const first15MinLow = stock.first15MinLow ? parseFloat(stock.first15MinLow.replace('$', '')) : currentPrice;
					
					console.log(`${stock.stockSymbol}: 20-day low: $${twentyDayLow.toFixed(2)}, First 15min low: $${first15MinLow.toFixed(2)}, Current: $${currentPrice.toFixed(2)}`);
					
					// CRITICAL GAP DOWN LOGIC: First 15-minute low must be below 20-day low
					if (first15MinLow > twentyDayLow) {
						console.log(`${stock.stockSymbol}: REMOVING - First 15min low ($${first15MinLow.toFixed(2)}) is NOT below 20-day low ($${twentyDayLow.toFixed(2)})`);
						// Mark this stock for removal
						stock.twentyDayHigh = '$REMOVE';
					} else {
						console.log(`${stock.stockSymbol}: QUALIFIED - First 15min low ($${first15MinLow.toFixed(2)}) is below 20-day low ($${twentyDayLow.toFixed(2)}) ✓`);
					}
				} else {
					console.log(`${stock.stockSymbol}: Not enough historical data (${historicalBars?.length || 0} bars)`);
					// Use today's low as fallback
					const currentPrice = parseFloat(stock.currentPrice.replace('$', ''));
					stock.twentyDayHigh = `$${currentPrice.toFixed(2)}`;
					console.log(`${stock.stockSymbol}: Using current price as 20-day low fallback`);
				}
			} catch (error) {
				console.warn(`Could not calculate 20-day low for ${stock.stockSymbol}:`, error);
				// Keep the $0.00 value to indicate calculation failed
			}
		}

		// CRITICAL: Filter stocks where openPrice < twentyDayLow using real calculated values
		console.log(`Applying openPrice < twentyDayLow filter...`);
		const beforeFilterCount = gapDownStocks.length;
		const filteredByOpenPrice = gapDownStocks.filter(stock => {
			const openPrice = parseFloat(stock.openPrice?.replace('$', '') || '0');
			const twentyDayLow = parseFloat(stock.twentyDayHigh?.replace('$', '') || '0'); // Note: twentyDayHigh field contains twentyDayLow for gap downs
			
			const passesFilter = openPrice < twentyDayLow;
			
			if (!passesFilter) {
				console.log(`${stock.stockSymbol}: FILTERED OUT - Open: $${openPrice.toFixed(2)} not < 20-day low: $${twentyDayLow.toFixed(2)}`);
			} else {
				console.log(`${stock.stockSymbol}: PASSES FILTER - Open: $${openPrice.toFixed(2)} < 20-day low: $${twentyDayLow.toFixed(2)}`);
			}
			
			return passesFilter;
		});
		
		console.log(`Applied openPrice < twentyDayLow filter: ${beforeFilterCount} -> ${filteredByOpenPrice.length} stocks remaining`);

		// Filter out stocks that didn't meet the gap down trading criteria
		const qualifiedGapDownStocks = filteredByOpenPrice.filter(stock => stock.twentyDayHigh !== '$REMOVE');
		console.log(`Filtered gap down stocks by 15min low criteria: ${filteredByOpenPrice.length} -> ${qualifiedGapDownStocks.length} (removed ${filteredByOpenPrice.length - qualifiedGapDownStocks.length} that didn't meet 15min low < 20-day low criteria)`);

		const endTime = Date.now();
		const duration = (endTime - startTime) / 1000;
		console.log(`Market-wide gap down scan complete: Found ${qualifiedGapDownStocks.length} qualified gap-down stocks`);
		console.log(`Processed ${processedCount}/${todayData.length} stocks in ${duration.toFixed(2)} seconds`);

		const result: ScanResult = {
			stocks: qualifiedGapDownStocks.slice(0, 50), // Limit to top 50 results
			totalFound: qualifiedGapDownStocks.length,
			timestamp: new Date(),
			scanDuration: `${duration.toFixed(2)}s`,
			status: processedCount === todayData.length ? 'completed' : 'timeout',
			processedCount,
			totalCount: todayData.length,
			batchInfo: {
				preFilteredCount: 0, // Will implement in next step
				batchesProcessed: 0, // Will implement in next step
				totalBatches: 0, // Will implement in next step
				twentyDayHighCalculated: qualifiedGapDownStocks.length, // Currently calculated for all
				optimizationUsed: false // Not yet implemented
			}
		};

		return res.status(200).json(result);
	} catch (error) {
		console.error('Error scanning for gap downs:', error);
		return res.status(500).json({ error: 'Failed to scan for gap downs' });
	}
};

// Function to get all available stocks for charting
export const getAvailableStocks = async (req: Request, res: Response) => {
	try {
		// Get all stocks from market-wide data instead of static list
		const today = new Date();
		const dayOfWeek = today.getDay();
		
		let mostRecentDay = new Date(today);
		
		if (dayOfWeek === 0) { // Sunday
			mostRecentDay.setDate(today.getDate() - 2); // Friday
		} else if (dayOfWeek === 1) { // Monday
			mostRecentDay.setDate(today.getDate() - 3); // Friday
		} else if (dayOfWeek === 6) { // Saturday
			mostRecentDay.setDate(today.getDate() - 1); // Friday
		} else { // Tuesday-Friday
			mostRecentDay.setDate(today.getDate() - 1); // Yesterday
		}
		
		const todayStr = mostRecentDay.toISOString().split('T')[0];
		
		console.log(`Getting available stocks from market data for ${todayStr}`);
		
		// Get market-wide data to get all available symbols
		const marketData = await getPolygonGroupedDaily(todayStr);
		
		if (!marketData || marketData.length === 0) {
			return res.status(404).json({ 
				error: `No market data available for ${todayStr}` 
			});
		}
		
		// Filter and format stocks for dropdown
		const availableStocks = marketData
			.filter(stock => 
				stock.v > 10000 && // Minimum volume
				stock.c > 1 && // Minimum price
				stock.c < 1000 && // Maximum price
				stock.T.length <= 5 && // Filter out complex symbols
				!stock.T.includes('.') // No warrants/special symbols
			)
			.map(stock => ({
				symbol: stock.T,
				name: stock.T, // We'll use symbol as name for now
				price: stock.c,
				volume: stock.v
			}))
			.sort((a, b) => a.symbol.localeCompare(b.symbol));
		
		console.log(`Found ${availableStocks.length} available stocks for charting`);
		
		return res.status(200).json({
			stocks: availableStocks,
			count: availableStocks.length,
			date: todayStr
		});
		
	} catch (error) {
		console.error('Error getting available stocks:', error);
		return res.status(500).json({ error: 'Failed to get available stocks' });
	}
};

export const getChartData = async (req: Request, res: Response) => {
	try {
		const { symbol } = req.params;
		const { days = '30' } = req.query;
		
		if (!symbol) {
			return res.status(400).json({ error: 'Stock symbol is required' });
		}

		console.log(`Getting chart data for ${symbol.toUpperCase()} for ${days} days`);
		console.log(`System time: ${new Date().toISOString()}`);
		console.log(`System timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);

		const daysBack = parseFloat(days as string);
		console.log(`Parsed daysBack value: ${daysBack}, type: ${typeof daysBack}`);
		
		let bars: PolygonBar[];
		let timeFormat = 'YYYY-MM-DD';
		let fromDateStr: string;
		let toDateStr: string;

		if (daysBack < 1) {
			// Intraday data
			const hoursBack = daysBack * 24;
			const minutesBack = hoursBack * 60;
			
			const toDate = new Date();
			const fromDate = new Date();
			
			// Check market status for intraday requests
			const marketStatus = getMarketStatus();
			console.log(`Intraday request: minutesBack=${minutesBack}, hoursBack=${hoursBack}`);
			console.log(`Market status: ${marketStatus.status}, reason: ${marketStatus.reason}`);
			
			// For intraday charts, check if it's a non-trading time
			if (marketStatus.status === 'CLOSED' && marketStatus.reason === 'Weekend') {
				return res.status(400).json({ 
					error: `Intraday chart data not available on weekends. Markets are closed on ${marketStatus.reason.toLowerCase()}. Please try again during trading hours (Monday-Friday 9:30 AM - 4:00 PM ET) or use daily/weekly charts instead.`,
					marketStatus: marketStatus
				});
			}
			
			// For very short timeframes (15min, 1hour), also check trading hours
			if ((minutesBack <= 15 || hoursBack <= 1) && marketStatus.status === 'CLOSED' && marketStatus.reason === 'After Hours') {
				return res.status(400).json({ 
					error: `Intraday chart data for ${minutesBack <= 15 ? '15-minute' : '1-hour'} timeframes not available during after-hours. Current market status: ${marketStatus.status}. Please try again during trading hours (9:30 AM - 4:00 PM ET) or use daily charts instead.`,
					marketStatus: marketStatus
				});
			}
			
			if (minutesBack <= 15) {
				// 15 minutes - use 1 minute bars for today only
				const today = new Date().toISOString().split('T')[0];
				fromDateStr = today;
				toDateStr = today;
				console.log(`15min: From ${fromDateStr} to ${toDateStr}`);
				bars = await getPolygonIntradayBars(symbol.toUpperCase(), 1, 'minute', fromDateStr, toDateStr);
				console.log(`15min bars received: ${bars.length} bars`);
				if (bars.length > 0) {
					const firstBar = new Date(bars[0].t);
					const lastBar = new Date(bars[bars.length - 1].t);
					console.log(`15min data range: ${firstBar.toLocaleString()} to ${lastBar.toLocaleString()}`);
				}
				timeFormat = 'HH:mm';
			} else if (hoursBack <= 1) {
				// 1 hour - use 1 minute bars for today only
				const today = new Date().toISOString().split('T')[0];
				fromDateStr = today;
				toDateStr = today;
				console.log(`1hour: From ${fromDateStr} to ${toDateStr}`);
				bars = await getPolygonIntradayBars(symbol.toUpperCase(), 1, 'minute', fromDateStr, toDateStr);
				timeFormat = 'HH:mm';
			} else {
				// 1 day - use 5 minute bars
				fromDate.setDate(fromDate.getDate() - 1);
				fromDateStr = fromDate.toISOString().split('T')[0];
				toDateStr = toDate.toISOString().split('T')[0];
				console.log(`1day: From ${fromDateStr} to ${toDateStr}`);
				bars = await getPolygonIntradayBars(symbol.toUpperCase(), 5, 'minute', fromDateStr, toDateStr);
				timeFormat = 'HH:mm';
			}
		} else {
			// Daily data
			const toDate = new Date();
			const fromDate = new Date();
			fromDate.setDate(fromDate.getDate() - Math.ceil(daysBack));

			fromDateStr = fromDate.toISOString().split('T')[0];
			toDateStr = toDate.toISOString().split('T')[0];

			// Get historical bars
			bars = await getPolygonDailyBars(symbol.toUpperCase(), fromDateStr, toDateStr);
		}

		if (!bars || bars.length === 0) {
			if (daysBack < 1) {
				return res.status(404).json({ 
					error: `No intraday data available for ${symbol.toUpperCase()}. Markets may be closed or your Polygon subscription may not include real-time minute data.` 
				});
			} else {
				return res.status(404).json({ error: `No chart data found for ${symbol.toUpperCase()}` });
			}
		}

		// Format data for candlestick chart
		const chartData = bars
			.sort((a, b) => a.t - b.t) // Sort by timestamp ascending
			.map(bar => {
				const date = new Date(bar.t);
				let timeLabel;
				
				if (daysBack < 1) {
					// Intraday - show time
					timeLabel = date.toLocaleTimeString('en-US', { 
						hour: '2-digit', 
						minute: '2-digit',
						hour12: false 
					});
				} else {
					// Daily - show date
					timeLabel = date.toISOString().split('T')[0];
				}
				
				return {
					time: timeLabel,
					timestamp: bar.t, // Keep original timestamp for chart
					open: bar.o,
					high: bar.h,
					low: bar.l,
					close: bar.c,
					volume: bar.v
				};
			});

		console.log(`Chart data formatted: ${chartData.length} points`);
		if (chartData.length > 0) {
			console.log(`First chart point: ${chartData[0].time} (${new Date(chartData[0].timestamp).toLocaleString()})`);
			console.log(`Last chart point: ${chartData[chartData.length - 1].time} (${new Date(chartData[chartData.length - 1].timestamp).toLocaleString()})`);
		}

		// Get company details for chart title
		const companyDetails = await getPolygonTickerDetails(symbol.toUpperCase());

		return res.status(200).json({
			symbol: symbol.toUpperCase(),
			companyName: companyDetails?.name || symbol.toUpperCase(),
			data: chartData,
			dataPoints: chartData.length,
			dateRange: {
				from: fromDateStr,
				to: toDateStr
			}
		});

	} catch (error) {
		console.error('Error getting chart data:', error);
		return res.status(500).json({ error: 'Failed to get chart data' });
	}
};

export const getLivePrice = async (req: Request, res: Response) => {
	try {
		const { symbol } = req.params;
		
		if (!symbol) {
			return res.status(400).json({ error: 'Stock symbol is required' });
		}

		console.log(`Getting live price for ${symbol.toUpperCase()}`);
		
		const livePrice = await getUnifiedLivePrice(symbol.toUpperCase());
		
		if (livePrice !== null) {
			return res.status(200).json({
				symbol: symbol.toUpperCase(),
				livePrice: `$${livePrice.toFixed(2)}`,
				timestamp: new Date().toISOString()
			});
		} else {
			// Fallback: get the most recent close price if live data isn't available
			console.log(`Live price not available for ${symbol.toUpperCase()}, falling back to most recent close`);
			
			try {
				const previousClose = await getPolygonPreviousClose(symbol.toUpperCase());
				if (previousClose) {
					return res.status(200).json({
						symbol: symbol.toUpperCase(),
						livePrice: `$${previousClose.c.toFixed(2)}`,
						timestamp: new Date().toISOString(),
						note: 'Using most recent close price (live data not available)'
					});
				}
			} catch (fallbackError) {
				console.warn(`Fallback also failed for ${symbol.toUpperCase()}:`, fallbackError);
			}
			
			return res.status(404).json({ 
				error: `Price data not available for ${symbol.toUpperCase()}`,
				reason: 'Live data requires subscription upgrade and historical data unavailable'
			});
		}

	} catch (error) {
		console.error('Error getting live price:', error);
		return res.status(500).json({ error: 'Failed to get live price' });
	}
};

export const getRiskAssessment = async (req: Request, res: Response) => {
	try {
		const { symbol, stockData } = req.body;
		
		if (!symbol || !stockData) {
			return res.status(400).json({ error: 'Symbol and stock data are required' });
		}

		console.log(`Getting ChatGPT risk assessment for ${symbol}`);
		
		// Create a comprehensive prompt for ChatGPT
		const prompt = `You are a stock investment expoert. Please provide a comprehensive risk assessment for investing in ${symbol} (${stockData.companyName || symbol}) based on the following current market data, with view of using it for a day trade today:

Stock: ${symbol} ${stockData.companyName ? `(${stockData.companyName})` : ''}
Current/Closing Price: ${stockData.currentPrice}
${stockData.livePrice ? `Live Price: ${stockData.livePrice}` : ''}
Today's Open: ${stockData.openPrice}
Today's High: ${stockData.highPrice}  
Today's Low: ${stockData.lowPrice}
Previous Close: ${stockData.previousClose}
20-Day High: ${stockData.twentyDayHigh}
Gap Percentage: ${stockData.gapPercentage}
Volume: ${stockData.volume?.toLocaleString() || 'N/A'}
Market Cap: ${stockData.marketCap ? `$${(stockData.marketCap / 1000000).toFixed(0)}M` : 'N/A'}
Exchange: ${stockData.exchange}
${stockData.first15MinHigh ? `First 15min High: ${stockData.first15MinHigh}` : ''}
${stockData.first15MinClose ? `First 15min Close: ${stockData.first15MinClose}` : ''}
Blue Chip: ${stockData.isBlueChip ? 'Yes' : 'No'}
Gap Trading Suitable: ${stockData.suitable ? 'Yes' : 'No'}

Please analyze:
1. Gap trading risk level (High/Medium/Low)
2. Key risk factors to consider
3. Potential upside/downside scenarios
4. Recommended position sizing
5. Stop-loss suggestions
6. Overall investment recommendation

Keep the response concise but comprehensive, suitable for day trading decisions.`;

		// Call OpenAI API for real risk assessment
		const completion = await openai.chat.completions.create({
			model: "gpt-4o-mini", // Using the more cost-effective model
			messages: [
				{
					role: "system",
					content: "You are an expert stock market analyst specializing in gap trading and risk assessment. Provide concise, actionable analysis suitable for day trading decisions. Focus on risk management and practical recommendations."
				},
				{
					role: "user",
					content: prompt
				}
			],
			max_tokens: 500,
			temperature: 0.7,
		});

		const assessment = completion.choices[0]?.message?.content || 'Unable to generate assessment';

		return res.status(200).json({
			symbol: symbol.toUpperCase(),
			assessment: assessment,
			timestamp: new Date().toISOString()
		});

	} catch (error) {
		console.error('Error getting risk assessment:', error);
		return res.status(500).json({ error: 'Failed to get risk assessment' });
	}
};

export const getPreMarketAnalysis = async (req: Request, res: Response): Promise<void> => {
	try {
		const { currentTime, isOptimalTime, recentGapData, prompt } = req.body;

		if (!prompt) {
			res.status(400).json({ error: 'Prompt is required' });
			return;
		}

		console.log('Getting pre-market analysis...');
		console.log('Current time (EST):', currentTime);
		console.log('Is optimal time:', isOptimalTime);
		console.log('Recent gap data:', recentGapData);

		// Call OpenAI API for pre-market analysis
		const completion = await openai.chat.completions.create({
			model: "gpt-4o-mini", // Using same model as risk assessment
			messages: [
				{
					role: "system",
					content: "You are a pre-market stock analysis expert with deep knowledge of market futures, volatility indicators, and gap trading strategies. Provide clear, actionable guidance based on current market conditions."
				},
				{
					role: "user",
					content: prompt
				}
			],
			temperature: 0.7,
			max_tokens: 1500
		});

		const analysis = completion.choices[0]?.message?.content || 'Unable to generate analysis';

		res.json({
			analysis: analysis,
			timestamp: new Date().toISOString()
		});

	} catch (error) {
		console.error('Error getting pre-market analysis:', error);
		res.status(500).json({ error: 'Failed to get pre-market analysis' });
	}
};

export const getHappyTwists = async (req: Request, res: Response): Promise<void> => {
	try {
		const { prompt } = req.body;
		
		console.log('=== HAPPY TWISTS: Using Polygon News API ===');
		
		// Get real news from Polygon
		const polygonApiKey = process.env.POLYGON_API_KEY;
		if (!polygonApiKey) {
			throw new Error('Polygon API key is missing');
		}
		
		// Get news from the last 3 days
		const threeDaysAgo = new Date();
		threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
		const today = new Date();
		
		// Fetch recent news
		const newsUrl = `https://api.polygon.io/v2/reference/news?published_utc.gte=${threeDaysAgo.toISOString().split('T')[0]}&published_utc.lte=${today.toISOString().split('T')[0]}&order=desc&limit=100&apiKey=${polygonApiKey}`;
		
		console.log('Fetching news from Polygon...');
		const newsResponse = await axios.get(newsUrl);
		
		if (!newsResponse.data || !newsResponse.data.results) {
			throw new Error('No news data received from Polygon');
		}
		
		// Filter for positive catalyst keywords
		const positiveKeywords = [
			'beats earnings', 'exceeds expectations', 'raises guidance', 'upgraded',
			'FDA approval', 'FDA approves', 'acquisition', 'merger', 'buyout',
			'wins contract', 'partnership', 'record revenue', 'breakthrough',
			'soars', 'jumps', 'surges', 'rallies', 'spikes'
		];
		
		const positiveNews = newsResponse.data.results.filter((article: any) => {
			const title = (article.title || '').toLowerCase();
			const description = (article.description || '').toLowerCase();
			const combined = title + ' ' + description;
			
			return positiveKeywords.some(keyword => combined.includes(keyword)) &&
			       article.tickers && article.tickers.length > 0;
		});
		
		console.log(`Found ${positiveNews.length} positive news articles`);
		
		// Format the response
		let formattedResponse = '**Market Scan Summary:**\n';
		formattedResponse += `Found ${positiveNews.length} positive catalyst news items from the last 3 days.\n\n`;
		formattedResponse += '**Top Happy Twists Found:**\n\n';
		
		// Take top 5-6 news items
		const topNews = positiveNews.slice(0, 6);
		
		// Get company names for tickers
		const tickerDetails: { [key: string]: string } = {
			'FTNT': 'Fortinet, Inc.',
			'DJT': 'Trump Media & Technology Group',
			'SATS': 'EchoStar Corporation',
			'CCL': 'Carnival Corporation',
			'PANW': 'Palo Alto Networks',
			'NVDA': 'NVIDIA Corporation',
			'AAPL': 'Apple Inc.',
			'MSFT': 'Microsoft Corporation',
			'AMZN': 'Amazon.com, Inc.',
			'TSLA': 'Tesla, Inc.'
		};
		
		for (const article of topNews) {
			const index = topNews.indexOf(article);
			const ticker = article.tickers[0];
			const companyName = tickerDetails[ticker] || ticker;
			
			// Format exactly as the frontend expects with brackets
			formattedResponse += `${index + 1}. **[${ticker}] - ${companyName}**\n`;
			formattedResponse += `   📰 Headline: ${article.title}\n`;
			formattedResponse += `   🔗 Source: ${article.article_url}\n`;
			formattedResponse += `   🚀 Potential Impact: ${article.description?.substring(0, 150)}...\n`;
			formattedResponse += `   ⚠️ Risk: Market conditions and execution risks apply\n\n`;
		}
		
		if (topNews.length === 0) {
			formattedResponse += 'Limited positive catalysts found in recent trading days. Market may be in a consolidation phase.\n\n';
		}
		
		formattedResponse += '**Trading Strategy:**\n';
		formattedResponse += 'These are real news catalysts from the last 3 days. Research each opportunity thoroughly before trading.';
		
		res.json({ 
			analysis: formattedResponse,
			timestamp: new Date().toISOString()
		});
		
	} catch (error: any) {
		console.error('Error getting happy twists analysis:', error);
		
		// Log the specific error response
		if (error.response && error.response.data) {
			console.error('API error details:', JSON.stringify(error.response.data, null, 2));
		}
		
		res.status(500).json({ error: 'Failed to get happy twists analysis' });
	}
};

// Export function to get request stats
export function getStockAnalysisRequestStats() {
	const now = new Date();
	const last24Hours = stockAnalysisRequestLog.filter(r => (now.getTime() - r.timestamp.getTime()) < 24 * 60 * 60 * 1000);
	const lastHour = stockAnalysisRequestLog.filter(r => (now.getTime() - r.timestamp.getTime()) < 60 * 60 * 1000);
	
	return {
		totalRequests: stockAnalysisRequestCounter,
		lastHour: lastHour.length,
		last24Hours: last24Hours.length,
		recentRequests: stockAnalysisRequestLog.slice(-10)
	};
}

export const getFundamentalAnalysis = async (req: Request, res: Response): Promise<void> => {
	try {
		const { sector, symbol } = req.body;
		
		if (!sector || !symbol) {
			res.status(400).json({ error: 'Sector and symbol are required' });
			return;
		}
		
		console.log(`Getting fundamental analysis for ${symbol} in ${sector} sector...`);
		
		// Get company details from Polygon/Marketstack
		let companyDetails;
		if (DATA_PROVIDER === 'polygon') {
			const tickerResponse = await makePolygonRequest(`/v3/reference/tickers/${symbol}`);
			companyDetails = tickerResponse.results;
		} else {
			companyDetails = await getMarketstackTickerDetails(symbol);
		}
		
		// Prepare the prompt for Perplexity to gather real-time data
		const perplexityPrompt = `Provide a comprehensive fundamental analysis for ${symbol} (${companyDetails?.name || symbol}) in the ${sector} sector. Include:

1. Global Analysis: Current macroeconomic factors affecting the stock market, including interest rates, global monetary policy, political developments, and commodity prices.

2. Sector Analysis: Current state of the ${sector} sector, including trends, challenges, opportunities, and peer performance.

3. Company Analysis: Specific analysis of ${symbol} including recent financial performance, key metrics, competitive position, and recent developments.

4. Market Sentiment: Current market sentiment towards ${symbol} and the ${sector} sector.

Please provide current, factual information based on the latest available data.`;

		// Call Perplexity for real-time data gathering with timeout
		console.log('Calling Perplexity API...');
		let perplexityData = '';
		
		try {
			const perplexityResponse = await axios.post('https://api.perplexity.ai/chat/completions', {
				model: 'sonar',
				messages: [
					{
						role: 'user',
						content: perplexityPrompt
					}
				],
				temperature: 0.3,
				max_tokens: 2000,
				stream: false
			}, {
				headers: {
					'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
					'Content-Type': 'application/json'
				},
				timeout: 15000 // 15 second timeout
			});
			
			perplexityData = perplexityResponse.data.choices[0]?.message?.content || '';
			console.log('Perplexity response received');
		} catch (perplexityError: any) {
			console.error('Perplexity API error:', perplexityError.message);
			// Continue with empty data if Perplexity fails
			perplexityData = `Current market data for ${symbol} is temporarily unavailable.`;
		}
		
		// Now use ChatGPT to structure and analyze the data according to "The Trading Code" framework
		const analysisPrompt = `Based on the following real-time market data, provide a structured fundamental analysis following "The Trading Code" framework:

${perplexityData}

Please structure your response with these specific sections:

1. GLOBAL ANALYSIS: Analyze macroeconomic factors and their potential impact on ${symbol}. Focus on what's most relevant for short-term trading.

2. SECTOR ANALYSIS: Analyze the ${sector} sector specifically, including competitive dynamics, trends, and how ${symbol} is positioned within the sector.

3. COMPANY ANALYSIS: Provide specific analysis of ${symbol}, focusing on recent performance, key metrics, and any company-specific news or developments.

4. MARKET SENTIMENT: Assess the current market sentiment (bullish/bearish) and explain why.

5. TRADING RECOMMENDATION: Based on all factors, provide a clear BUY/SELL/HOLD recommendation with specific reasoning. Focus on short-term trading potential (days to weeks).

Keep each section concise but informative, suitable for day traders who need quick, actionable insights.`;

		// Call OpenAI for structured analysis
		console.log('Calling OpenAI API for analysis...');
		const completion = await openai.chat.completions.create({
			model: "gpt-4o-mini", // Using mini model for faster response
			messages: [
				{
					role: "system",
					content: "You are an expert financial analyst specializing in fundamental analysis for day trading. Provide clear, concise, and actionable insights based on 'The Trading Code' methodology."
				},
				{
					role: "user",
					content: analysisPrompt
				}
			],
			temperature: 0.3,
			max_tokens: 1500
		});
		
		const structuredAnalysis = completion.choices[0]?.message?.content || 'No analysis available';
		
		// Parse the structured response into sections
		const sections = {
			globalAnalysis: '',
			sectorAnalysis: '',
			companyAnalysis: '',
			sentiment: '',
			recommendation: ''
		};
		
		// Extract sections from the response
		const analysisText = structuredAnalysis;
		
		// More flexible parsing - look for section headers with various formats
		const globalMatch = analysisText.match(/(?:1\.\s*)?GLOBAL ANALYSIS:?\s*(.*?)(?=(?:\d\.\s*)?SECTOR ANALYSIS|$)/si);
		const sectorMatch = analysisText.match(/(?:2\.\s*)?SECTOR ANALYSIS:?\s*(.*?)(?=(?:\d\.\s*)?COMPANY ANALYSIS|$)/si);
		const companyMatch = analysisText.match(/(?:3\.\s*)?COMPANY ANALYSIS:?\s*(.*?)(?=(?:\d\.\s*)?MARKET SENTIMENT|$)/si);
		const sentimentMatch = analysisText.match(/(?:4\.\s*)?MARKET SENTIMENT:?\s*(.*?)(?=(?:\d\.\s*)?TRADING RECOMMENDATION|$)/si);
		const recommendationMatch = analysisText.match(/(?:5\.\s*)?TRADING RECOMMENDATION:?\s*(.*?)$/si);
		
		// Helper function to remove markdown formatting
		const removeMarkdown = (text: string): string => {
			return text
				.replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold **text**
				.replace(/\*(.*?)\*/g, '$1')     // Remove italic *text*
				.replace(/__(.*?)__/g, '$1')     // Remove underline __text__
				.replace(/`(.*?)`/g, '$1')       // Remove inline code `text`
				.replace(/#{1,6}\s/g, '')        // Remove headers
				.trim();
		};
		
		// If structured parsing fails, try to parse as a whole
		if (!globalMatch && !sectorMatch && !companyMatch) {
			console.log('Structured parsing failed, using full response');
			sections.globalAnalysis = 'See full analysis below';
			sections.sectorAnalysis = 'See full analysis below';
			sections.companyAnalysis = removeMarkdown(structuredAnalysis);
			sections.sentiment = 'See company analysis';
			sections.recommendation = 'See company analysis';
		} else {
			sections.globalAnalysis = globalMatch ? removeMarkdown(globalMatch[1]) : 'Global analysis not available';
			sections.sectorAnalysis = sectorMatch ? removeMarkdown(sectorMatch[1]) : 'Sector analysis not available';
			sections.companyAnalysis = companyMatch ? removeMarkdown(companyMatch[1]) : 'Company analysis not available';
			sections.sentiment = sentimentMatch ? removeMarkdown(sentimentMatch[1]) : 'Sentiment analysis not available';
			sections.recommendation = recommendationMatch ? removeMarkdown(recommendationMatch[1]) : 'Recommendation not available';
		}
		
		console.log('Parsed sections:', {
			global: sections.globalAnalysis.substring(0, 50) + '...',
			sector: sections.sectorAnalysis.substring(0, 50) + '...',
			company: sections.companyAnalysis.substring(0, 50) + '...'
		});
		
		// Send response
		res.json({
			symbol: symbol,
			sector: sector,
			companyName: companyDetails?.name || symbol,
			globalAnalysis: sections.globalAnalysis,
			sectorAnalysis: sections.sectorAnalysis,
			companyAnalysis: sections.companyAnalysis,
			sentiment: sections.sentiment,
			recommendation: sections.recommendation,
			timestamp: new Date().toISOString()
		});
		
	} catch (error: any) {
		console.error('Error getting fundamental analysis:', error);
		
		if (error.response && error.response.data) {
			console.error('API error details:', JSON.stringify(error.response.data, null, 2));
		}
		
		res.status(500).json({ error: 'Failed to get fundamental analysis' });
	}
};

export const getMarketOverview = async (req: Request, res: Response): Promise<void> => {
	try {
		const market = (req.query.market as string)?.toUpperCase() === 'UK' ? 'UK' : 'US';
		console.log(`Getting ${market} market overview analysis...`);

		const today = new Date().toISOString().split('T')[0];

		// Use the same marketContextService as CAN SLIM scanner for consistency
		const marketContext = await getMarketContext(today, market);

		// IMPORTANT: Always use US market context for CAN SLIM outlook
		// The scanner uses US market regime (SPY/QQQ) for trading decisions, even for UK stocks
		// This ensures the Analysis page outlook matches what the scanner actually does
		const usMarketContext = market === 'UK' ? await getMarketContext(today, 'US') : marketContext;

		if (!marketContext) {
			res.status(500).json({ error: 'Failed to get market context' });
			return;
		}

		const { spy, qqq, vix, regime, regimeReason } = marketContext;

		const marketDataSummary = formatMarketContextForAI(marketContext);

		const marketName = market === 'UK' ? 'UK/FTSE' : 'US';
		const marketIndex = market === 'UK' ? 'FTSE 100' : 'S&P 500';

		const perplexityPrompt = `Based on the current ${marketName} market data and recent news, provide a comprehensive market outlook:

${marketDataSummary}

Please analyze for the ${marketName} market:
1. CURRENT MARKET CONDITIONS: What is the overall ${marketIndex} market sentiment right now? Bull market, bear market, or sideways/consolidation? Support with data.

2. RECENT TRENDS: What have been the key ${marketName} market movements and drivers over the past week? Any significant sector rotations or themes?

3. PREDICTION - NEXT DAY: What is likely to happen tomorrow in the ${marketName} market? Key levels to watch, expected volatility, any catalysts?

4. PREDICTION - NEXT 7 DAYS: Short-term ${marketName} outlook for the coming week. Key events (earnings, economic data), technical levels, expected direction.

5. PREDICTION - NEXT 30 DAYS: Medium-term ${marketName} outlook. Major themes, seasonal patterns, upcoming central bank meetings or economic releases.

6. PREDICTION - NEXT 180 DAYS: Longer-term ${marketName} outlook. Economic cycle positioning, major risks and opportunities, strategic considerations.

Be specific with price levels and percentages where possible. Focus on actionable insights for traders.`;

		let perplexityData = '';
		
		try {
			const perplexityResponse = await axios.post('https://api.perplexity.ai/chat/completions', {
				model: 'sonar',
				messages: [{ role: 'user', content: perplexityPrompt }],
				temperature: 0.3,
				max_tokens: 2500,
				stream: false
			}, {
				headers: {
					'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
					'Content-Type': 'application/json'
				},
				timeout: 20000
			});
			
			perplexityData = perplexityResponse.data.choices[0]?.message?.content || '';
		} catch (perplexityError: any) {
			console.error('Perplexity API error:', perplexityError.message);
			perplexityData = 'Real-time market analysis temporarily unavailable.';
		}
		
		const analysisPrompt = `Based on the following market data and analysis, provide a structured market overview:

${perplexityData}

Format your response with these exact sections:

1. CURRENT CONDITIONS: Overall market state (bull/bear/neutral) with key supporting factors.

2. RECENT TRENDS: Key movements and themes from the past week.

3. NEXT DAY OUTLOOK: Tomorrow's expected direction, key levels, catalysts.

4. NEXT 7 DAYS OUTLOOK: Week ahead expectations, key events, technical levels.

5. NEXT 30 DAYS OUTLOOK: Month ahead view, major themes and events.

6. NEXT 180 DAYS OUTLOOK: 6-month strategic outlook, big picture risks and opportunities.

Keep each section concise (2-3 sentences) but actionable.`;

		const completion = await openai.chat.completions.create({
			model: "gpt-4o-mini",
			messages: [
				{
					role: "system",
					content: "You are a senior market strategist providing clear, actionable market analysis. Be specific with price levels and timeframes."
				},
				{ role: "user", content: analysisPrompt }
			],
			temperature: 0.3,
			max_tokens: 1500
		});
		
		const structuredAnalysis = completion.choices[0]?.message?.content || '';
		
		const removeMarkdown = (text: string): string => {
			return text
				.replace(/\*\*(.*?)\*\*/g, '$1')
				.replace(/\*(.*?)\*/g, '$1')
				.replace(/__(.*?)__/g, '$1')
				.replace(/`(.*?)`/g, '$1')
				.replace(/#{1,6}\s/g, '')
				.trim();
		};
		
		const parseSection = (text: string, sectionNum: number, sectionName: string): string => {
			const patterns = [
				new RegExp(`${sectionNum}\\.\\s*${sectionName}[:\\s]*([\\s\\S]*?)(?=\\d\\.\\s*[A-Z]|$)`, 'i'),
				new RegExp(`${sectionName}[:\\s]*([\\s\\S]*?)(?=\\d\\.\\s*[A-Z]|$)`, 'i')
			];
			
			for (const pattern of patterns) {
				const match = text.match(pattern);
				if (match && match[1]) {
					let result = removeMarkdown(match[1].trim());
					if (result.startsWith(':')) {
						result = result.substring(1).trim();
					}
					return result;
				}
			}
			return 'Analysis not available';
		};
		
		const sections = {
			currentConditions: parseSection(structuredAnalysis, 1, 'CURRENT CONDITIONS'),
			recentTrends: parseSection(structuredAnalysis, 2, 'RECENT TRENDS'),
			nextDay: parseSection(structuredAnalysis, 3, 'NEXT DAY OUTLOOK'),
			next7Days: parseSection(structuredAnalysis, 4, 'NEXT 7 DAYS OUTLOOK'),
			next30Days: parseSection(structuredAnalysis, 5, 'NEXT 30 DAYS OUTLOOK'),
			next180Days: parseSection(structuredAnalysis, 6, 'NEXT 180 DAYS OUTLOOK'),
			// Use US market context for CAN SLIM outlook - scanner always uses US regime for trading decisions
			// Pass 'US' for market param so labels show SPY/QQQ (the actual data being used)
			canSlimOutlook: usMarketContext ? generateAlgorithmicCanSlimOutlook(usMarketContext, 'US') : 'Market context unavailable'
		};
		
		res.json({
			market,
			marketData: {
				spy: spy ? {
					symbol: spy.symbol,
					name: market === 'UK' ? 'FTSE Proxy (SHEL)' : 'SPY (S&P 500)',
					current: spy.current,
					dayChange: spy.changePercent.toFixed(2),
					weekChange: spy.weekChangePercent.toFixed(2),
					aboveEma20: spy.aboveEma20,
					trend: spy.trend
				} : null,
				qqq: qqq ? {
					symbol: qqq.symbol,
					name: market === 'UK' ? 'UK Large Cap (AZN)' : 'QQQ (Nasdaq 100)',
					current: qqq.current,
					dayChange: qqq.changePercent.toFixed(2),
					weekChange: qqq.weekChangePercent.toFixed(2),
					aboveEma20: qqq.aboveEma20,
					trend: qqq.trend
				} : null,
				vix: vix ? {
					symbol: vix.symbol,
					name: market === 'UK' ? 'UK Volatility (BARC)' : 'VIX',
					current: vix.current,
					weekChange: vix.weekChangePercent.toFixed(2)
				} : null
			},
			regime: regime,
			regimeReason: regimeReason,
			analysis: sections,
			timestamp: new Date().toISOString()
		});
		
	} catch (error: any) {
		console.error('Error getting market overview:', error);
		res.status(500).json({ error: 'Failed to get market overview' });
	}
};

export const getGoldAnalysis = async (req: Request, res: Response) => {
	try {
		console.log('[GOLD-ANALYSIS] Fetching gold analysis...');
		const analysis = await analyzeGold();

		if (!analysis) {
			return res.status(500).json({ error: 'Failed to analyze gold' });
		}

		res.json({
			symbol: analysis.symbol,
			currentPrice: analysis.currentPrice,
			ema20: analysis.ema20,
			trend: analysis.trend,
			score: analysis.score,
			maxScore: analysis.maxScore,
			vixLevel: analysis.vixLevel,
			vixElevated: analysis.vixElevated,
			consolidation: analysis.consolidation,
			breakoutLevel: analysis.breakoutLevel,
			equityMarketRegime: analysis.equityMarketRegime,
			recommendation: analysis.recommendation,
			reasons: analysis.reasons,
			timestamp: analysis.timestamp
		});
	} catch (error: any) {
		console.error('Error getting gold analysis:', error);
		res.status(500).json({ error: 'Failed to get gold analysis' });
	}
};

// End of file
