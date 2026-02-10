import { fetchHistoricalBars } from '../handlers/polygonAPI.js';
import { fetchUKHistoricalBars } from '../handlers/ukDataAPI.js';

export interface RelativeStrengthResult {
  symbol: string;
  date: string;
  stockReturn12M: number;
  benchmarkReturn12M: number;  // SPY for US, ISF for UK
  benchmark: string;
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

// UK stocks available on FxPro MT5 (.L suffix for LSE)
// Based on actual FxPro availability check - 254 UK stocks
const FXPRO_UK = [
  'AAF', 'AAIF', 'AAL', 'ABDN', 'ABF', 'ADML', 'AHT', 'AJBA', 'AML', 'ANTO', 'AO', 'ASHM', 'ASL', 'AUTOA', 'AV', 'AVON', 'AZN',
  'BAB', 'BAES', 'BAG', 'BALF', 'BARC', 'BATS', 'BBOXT', 'BEZG', 'BHPB', 'BKGH', 'BLND', 'BMEB', 'BNZL', 'BOY', 'BP', 'BRBY', 'BT', 'BTRW', 'BVC', 'BWY', 'BYG', 'BYIT',
  'CBRO', 'CCC', 'CCH', 'CCL', 'CHG', 'CHRY', 'CKN', 'CMCX', 'CNA', 'COA', 'CPG', 'CPI', 'CRDA', 'CRST', 'CTEC', 'CTY', 'CWK',
  'DCC', 'DGE', 'DLN', 'DNLM', 'DOCS', 'DOM', 'DPLM', 'DRX',
  'ELM', 'EMG', 'ENOG', 'ENT', 'EOTE', 'ESNT', 'EVOK', 'EXPN', 'EZJ',
  'FAN', 'FDM', 'FERG', 'FEV', 'FGP', 'FGT', 'FORT', 'FOUR', 'FRAS', 'FRES', 'FXPO',
  'GAW', 'GCC', 'GENG', 'GENL', 'GFTU_u', 'GKP', 'GLEN', 'GNC', 'GNS', 'GPEG', 'GRG', 'GRI', 'GSK', 'GYM',
  'HAYS', 'HBR', 'HFD', 'HFEL', 'HFG', 'HICL', 'HIK', 'HILS', 'HLMA', 'HMSO', 'HOCM', 'HSBA', 'HSL', 'HSX', 'HTWS', 'HWDN',
  'IBST', 'ICAG', 'ICGIN', 'IGG', 'IHG', 'IHPI', 'III', 'IMB', 'IMI', 'INCH', 'INF', 'INPP', 'INVP', 'IPO', 'ITRK', 'ITV', 'IWG',
  'JD', 'JDW', 'JMAT', 'JUP', 'JUSTJ',
  'KGF', 'KNOS',
  'LAND', 'LGEN', 'LIO', 'LLOY', 'LMPL', 'LRE', 'LSEG',
  'MAB', 'MARS', 'MCG', 'MGAMM', 'MGNS', 'MKS', 'MNDI', 'MNG', 'MNKS', 'MONY', 'MRON', 'MSLH', 'MTO', 'MYI',
  'N91', 'NCCG', 'NG', 'NWG', 'NXT',
  'OCDO', 'OSBO', 'OXB', 'OXIG',
  'PAGE', 'PAGPA', 'PAYP', 'PCT', 'PETSP', 'PFD', 'PHNX', 'PHP', 'PLUSP', 'PNN', 'PRTC', 'PRU', 'PSN', 'PSON', 'PTEC', 'PZC',
  'QLT', 'QQ',
  'RCH', 'REL', 'RHIM', 'RIO', 'RKT', 'RMV', 'ROR', 'RR', 'RS1R', 'RSW', 'RTO',
  'S32', 'SAFE', 'SBRY', 'SCTS', 'SDR', 'SGE', 'SGRO', 'SHCS', 'SHEL', 'SJP', 'SMIN', 'SMT', 'SMWH', 'SN', 'SNR', 'SOLG', 'SPI', 'SPX', 'SRET', 'SRP', 'SSE', 'SSPG', 'STAN', 'STEMS', 'SVS', 'SVT', 'SYNTS',
  'TATE', 'TCAPI', 'TEP', 'THG', 'TLW', 'TPK', 'TRIG', 'TRNT', 'TRST', 'TRY', 'TSCO', 'TW',
  'UKWG', 'ULVR', 'UTG', 'UU',
  'VCTX', 'VOD', 'VSVS', 'VTYV',
  'WEIR', 'WG', 'WIZZ', 'WKP', 'WOSG', 'WPP', 'WTB', 'WWH',
  'XPP',
  'ZIG'
];

// UK universe for CAN SLIM scanning
const UK_UNIVERSE = FXPRO_UK;

// Major UK stocks used to create synthetic FTSE 100 benchmark
// These are the largest/most liquid FTSE 100 constituents available on FxPro
const UK_BENCHMARK_STOCKS = [
  'SHEL',  // Shell
  'AZN',   // AstraZeneca
  'HSBA',  // HSBC
  'BP',    // BP
  'GSK',   // GSK
  'RIO',   // Rio Tinto
  'ULVR',  // Unilever
  'BARC',  // Barclays
  'LLOY',  // Lloyds
  'VOD'    // Vodafone
];

// Cache for UK benchmark return to avoid recalculating
const ukBenchmarkCache = new Map<string, number>();

async function calculateUKBenchmarkReturn(endDate: string): Promise<number | null> {
  // Check cache first
  if (ukBenchmarkCache.has(endDate)) {
    return ukBenchmarkCache.get(endDate)!;
  }

  console.log('[RS] Calculating synthetic UK benchmark from major FTSE 100 stocks...');

  const returns: number[] = [];

  for (const symbol of UK_BENCHMARK_STOCKS) {
    const ret = await calculate12MonthReturn(symbol, endDate, 'UK');
    if (ret !== null) {
      returns.push(ret);
    }
  }

  if (returns.length < 5) {
    console.error('[RS] Not enough UK benchmark stocks with data');
    return null;
  }

  // Calculate average return (equal-weighted)
  const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  console.log(`[RS] UK benchmark: ${avgReturn.toFixed(2)}% (avg of ${returns.length} stocks)`);

  // Cache the result
  ukBenchmarkCache.set(endDate, avgReturn);

  return avgReturn;
}

async function calculate12MonthReturn(
  symbol: string,
  endDate: string,
  market: 'US' | 'UK' = 'US'
): Promise<number | null> {
  const end = new Date(endDate);
  const start = new Date(endDate);
  start.setFullYear(start.getFullYear() - 1);

  try {
    let candles;

    if (market === 'UK') {
      candles = await fetchUKHistoricalBars(
        symbol,
        start.toISOString().split('T')[0],
        end.toISOString().split('T')[0],
        'day',
        300
      );
    } else {
      const apiKey = process.env.POLYGON_API_KEY;
      if (!apiKey) {
        console.error('[RS] No Polygon API key');
        return null;
      }

      candles = await fetchHistoricalBars(
        apiKey,
        symbol,
        start.toISOString().split('T')[0],
        end.toISOString().split('T')[0],
        'day',
        1,
        300
      );
    }

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
  universe: string[] = RS_UNIVERSE,
  market: 'US' | 'UK' = 'US'
): Promise<RelativeStrengthResult | null> {
  // Use appropriate benchmark: SPY for US, synthetic FTSE (avg of major stocks) for UK
  const benchmark = market === 'UK' ? 'FTSE-Synthetic' : 'SPY';
  const effectiveUniverse = market === 'UK' ? UK_UNIVERSE : universe;

  console.log(`[RS] Calculating relative strength for ${symbol} (${market}) on ${date} vs ${benchmark}`);

  let stockReturn: number | null;
  let benchmarkReturn: number | null;

  if (market === 'UK') {
    // For UK, use synthetic benchmark calculated from major FTSE 100 stocks
    [stockReturn, benchmarkReturn] = await Promise.all([
      calculate12MonthReturn(symbol, date, 'UK'),
      calculateUKBenchmarkReturn(date)
    ]);
  } else {
    // For US, use SPY directly
    [stockReturn, benchmarkReturn] = await Promise.all([
      calculate12MonthReturn(symbol, date, 'US'),
      calculate12MonthReturn('SPY', date, 'US')
    ]);
  }

  if (stockReturn === null || benchmarkReturn === null) {
    return null;
  }

  const relativeReturn = stockReturn - benchmarkReturn;

  const allReturns: { symbol: string; return12M: number }[] = [];

  for (const sym of effectiveUniverse) {
    const ret = await calculate12MonthReturn(sym, date, market);
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
    benchmarkReturn12M: Math.round(benchmarkReturn * 100) / 100,
    benchmark,
    relativeReturn: Math.round(relativeReturn * 100) / 100,
    rsRating,
    rsRank: rank,
    totalStocks: allReturns.length
  };
}

export async function getRSRankings(
  date: string,
  universe: string[] = RS_UNIVERSE,
  market: 'US' | 'UK' = 'US'
): Promise<{ symbol: string; return12M: number; rsRating: number }[]> {
  const effectiveUniverse = market === 'UK' ? UK_UNIVERSE : universe;

  const allReturns: { symbol: string; return12M: number }[] = [];

  for (const sym of effectiveUniverse) {
    const ret = await calculate12MonthReturn(sym, date, market);
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

export { RS_UNIVERSE, UK_UNIVERSE };
