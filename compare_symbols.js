const RS_UNIVERSE = [
  // Mega Cap Tech
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'AVGO', 'ORCL', 'CRM',
  // Semiconductors
  'AMD', 'INTC', 'QCOM', 'TXN', 'AMAT', 'LRCX', 'MU', 'ADI', 'MRVL', 'ON', 'SNPS', 'CDNS', 'KLAC', 'ASML', 'NXPI', 'MCHP', 'SWKS', 'ARM', 'SMCI',
  // Software & Cloud
  'ADBE', 'NOW', 'INTU', 'PANW', 'CRWD', 'SNOW', 'DDOG', 'NET', 'PLTR', 'SHOP', 'WDAY', 'TEAM', 'OKTA', 'ZS', 'FTNT', 'HUBS', 'DOCU', 'ZM', 'COIN', 'MSTR',
  // Internet & E-commerce
  'NFLX', 'PYPL', 'ABNB', 'UBER', 'DASH', 'EBAY', 'ETSY', 'BKNG', 'MELI',
  // Financials
  'V', 'MA', 'JPM', 'BAC', 'GS', 'MS', 'BLK', 'SCHW', 'AXP', 'C', 'WFC', 'SPGI', 'MCO', 'CME', 'ICE',
  // Healthcare & Pharma
  'UNH', 'JNJ', 'LLY', 'ABBV', 'MRK', 'PFE', 'TMO', 'ABT', 'DHR', 'BMY', 'AMGN', 'GILD', 'VRTX', 'REGN', 'ISRG', 'MRNA', 'BIIB', 'ILMN', 'DXCM',
  // Consumer
  'HD', 'LOW', 'COST', 'WMT', 'TGT', 'NKE', 'SBUX', 'MCD', 'LULU', 'ROST', 'TJX', 'DG', 'DLTR', 'ORLY', 'AZO', 'CMG', 'DPZ', 'YUM', 'ULTA',
  // Consumer Staples
  'PG', 'KO', 'PEP', 'PM', 'MO', 'CL', 'KHC', 'MDLZ', 'GIS', 'HSY', 'STZ', 'MNST',
  // Energy
  'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'PXD', 'OXY', 'VLO', 'PSX', 'MPC', 'HAL', 'DVN',
  // Industrials
  'CAT', 'DE', 'BA', 'HON', 'RTX', 'LMT', 'GD', 'NOC', 'GE', 'MMM', 'UPS', 'FDX', 'UNP', 'CSX', 'URI', 'EMR', 'ETN', 'ITW', 'PH',
  // Materials
  'LIN', 'APD', 'SHW', 'ECL', 'NEM', 'FCX', 'NUE', 'SCCO',
  // REITs & Real Estate
  'AMT', 'PLD', 'CCI', 'EQIX', 'SPG', 'PSA', 'DLR', 'O', 'WELL', 'AVB',
  // Utilities
  'NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC', 'SRE', 'XEL',
  // Telecom & Media
  'T', 'VZ', 'TMUS', 'CMCSA', 'DIS', 'WBD', 'NWSA', 'PARA',
  // EV & Clean Energy
  'RIVN', 'LCID', 'ENPH', 'SEDG', 'FSLR', 'RUN', 'PLUG',
  // Gaming & Entertainment
  'EA', 'TTWO', 'RBLX', 'DKNG', 'PENN', 'MGM', 'LVS', 'WYNN',
  // Aerospace & Defense
  'AXON', 'HII', 'LHX', 'TDG',
  // Misc High Growth
  'SOFI', 'HOOD', 'AFRM', 'UPST', 'SQ', 'APP', 'ROKU', 'TTD', 'BILL', 'PCTY', 'PAYC', 'VEEV', 'CPRT', 'ODFL', 'POOL', 'IDXX', 'PODD', 'ALGN', 'MKTX'
];

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

const FXPRO_NASDAQ_SYMBOLS = [
  'AAPL', 'ABNB', 'ACGL', 'ADBE', 'ADI', 'ADP', 'ADSK', 'AFRM', 'AKAM', 'ALGM', 'ALGN', 'ALKS', 'ALNY', 'AMAT', 'AMCX', 'AMD', 'AMGN', 'AMZN', 'ANGI', 'APP', 'APPN', 'ARGX', 'ARM', 'ARRY', 'ASML', 'AVGO', 'AVIR', 'AXON', 'AXSM',
  'BANF', 'BANR', 'BATRA', 'BCPC', 'BCRX', 'BCYC', 'BIDU', 'BIIB', 'BILI', 'BKR', 'BL', 'BLDP', 'BLKB', 'BMBL', 'BMRN', 'BNTX', 'BOKF', 'BPOP', 'BRKR', 'BRZE', 'BSY', 'BYND', 'BZ',
  'CACC', 'CAR', 'CBRL', 'CCCC', 'CDNS', 'CDW', 'CERT', 'CFLT', 'CGEM', 'CGC', 'CHKP', 'CHRW', 'CHTR', 'CIGI', 'CINF', 'CLBT', 'CLNE', 'CLOV', 'CME', 'CMCSA', 'CNDT', 'CNOB', 'COIN', 'COMM', 'COST', 'CPRT', 'CPB', 'CROX', 'CRSP', 'CRSR', 'CRUS', 'CRVL', 'CRWD', 'CSCO', 'CSGP', 'CSIQ', 'CSX', 'CTAS', 'CTSH', 'CVAC', 'CWST', 'CYBR',
  'DASH', 'DDOG', 'DJT', 'DKNG', 'DLO', 'DLTR', 'DNUT', 'DOCU', 'DOO', 'DOX', 'DPZ', 'DRVN', 'DUOL', 'DXCM', 'DYN',
  'EA', 'EBAY', 'EBC', 'ENPH', 'EQIX', 'ERAS', 'ESLT', 'EVCM', 'EVRG', 'EWBC', 'EXC', 'EXAS', 'EXEL',
  'FA', 'FANG', 'FAST', 'FCEL', 'FFIV', 'FISV', 'FITB', 'FIVE', 'FIVN', 'FLEX', 'FLNC', 'FOLD', 'FOXA', 'FROG', 'FSLR', 'FSV', 'FTNT',
  'GDRX', 'GEN', 'GEVO', 'GILD', 'GLBE', 'GLPI', 'GNTX', 'GO', 'GOOGL', 'GPRE', 'GRPN', 'GT', 'GTLB', 'GTM',
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

// Combine FxPro lists
const FXPRO_ALL_SYMBOLS = [...new Set([...FXPRO_NYSE_SYMBOLS, ...FXPRO_NASDAQ_SYMBOLS])];

// Find symbols in RS_UNIVERSE that are not in FxPro
const notInFxPro = RS_UNIVERSE.filter(symbol => !FXPRO_ALL_SYMBOLS.includes(symbol));

console.log('Symbols in RS_UNIVERSE not available on FxPro:');
console.log('================================================');
console.log('Total RS_UNIVERSE symbols:', RS_UNIVERSE.length);
console.log('Symbols NOT on FxPro:', notInFxPro.length);
console.log('');
console.log('The following symbols cannot be traded on FxPro:');
console.log(notInFxPro.sort().join(', '));
console.log('');
console.log('By category:');

// Categorize the missing symbols
const categories = {
  'Mega Cap Tech': ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'AVGO', 'ORCL', 'CRM'],
  'Semiconductors': ['AMD', 'INTC', 'QCOM', 'TXN', 'AMAT', 'LRCX', 'MU', 'ADI', 'MRVL', 'ON', 'SNPS', 'CDNS', 'KLAC', 'ASML', 'NXPI', 'MCHP', 'SWKS', 'ARM', 'SMCI'],
  'Software & Cloud': ['ADBE', 'NOW', 'INTU', 'PANW', 'CRWD', 'SNOW', 'DDOG', 'NET', 'PLTR', 'SHOP', 'WDAY', 'TEAM', 'OKTA', 'ZS', 'FTNT', 'HUBS', 'DOCU', 'ZM', 'COIN', 'MSTR'],
  'Internet & E-commerce': ['NFLX', 'PYPL', 'ABNB', 'UBER', 'DASH', 'EBAY', 'ETSY', 'BKNG', 'MELI'],
  'Financials': ['V', 'MA', 'JPM', 'BAC', 'GS', 'MS', 'BLK', 'SCHW', 'AXP', 'C', 'WFC', 'SPGI', 'MCO', 'CME', 'ICE'],
  'Healthcare & Pharma': ['UNH', 'JNJ', 'LLY', 'ABBV', 'MRK', 'PFE', 'TMO', 'ABT', 'DHR', 'BMY', 'AMGN', 'GILD', 'VRTX', 'REGN', 'ISRG', 'MRNA', 'BIIB', 'ILMN', 'DXCM'],
  'Consumer': ['HD', 'LOW', 'COST', 'WMT', 'TGT', 'NKE', 'SBUX', 'MCD', 'LULU', 'ROST', 'TJX', 'DG', 'DLTR', 'ORLY', 'AZO', 'CMG', 'DPZ', 'YUM', 'ULTA'],
  'Consumer Staples': ['PG', 'KO', 'PEP', 'PM', 'MO', 'CL', 'KHC', 'MDLZ', 'GIS', 'HSY', 'STZ', 'MNST'],
  'Energy': ['XOM', 'CVX', 'COP', 'SLB', 'EOG', 'PXD', 'OXY', 'VLO', 'PSX', 'MPC', 'HAL', 'DVN'],
  'Industrials': ['CAT', 'DE', 'BA', 'HON', 'RTX', 'LMT', 'GD', 'NOC', 'GE', 'MMM', 'UPS', 'FDX', 'UNP', 'CSX', 'URI', 'EMR', 'ETN', 'ITW', 'PH'],
  'Materials': ['LIN', 'APD', 'SHW', 'ECL', 'NEM', 'FCX', 'NUE', 'SCCO'],
  'REITs & Real Estate': ['AMT', 'PLD', 'CCI', 'EQIX', 'SPG', 'PSA', 'DLR', 'O', 'WELL', 'AVB'],
  'Utilities': ['NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC', 'SRE', 'XEL'],
  'Telecom & Media': ['T', 'VZ', 'TMUS', 'CMCSA', 'DIS', 'WBD', 'NWSA', 'PARA'],
  'EV & Clean Energy': ['RIVN', 'LCID', 'ENPH', 'SEDG', 'FSLR', 'RUN', 'PLUG'],
  'Gaming & Entertainment': ['EA', 'TTWO', 'RBLX', 'DKNG', 'PENN', 'MGM', 'LVS', 'WYNN'],
  'Aerospace & Defense': ['AXON', 'HII', 'LHX', 'TDG'],
  'Misc High Growth': ['SOFI', 'HOOD', 'AFRM', 'UPST', 'SQ', 'APP', 'ROKU', 'TTD', 'BILL', 'PCTY', 'PAYC', 'VEEV', 'CPRT', 'ODFL', 'POOL', 'IDXX', 'PODD', 'ALGN', 'MKTX']
};

Object.entries(categories).forEach(([category, symbols]) => {
  const missingSymbols = symbols.filter(symbol => notInFxPro.includes(symbol));
  if (missingSymbols.length > 0) {
    console.log('\n' + category + ':');
    console.log('  Missing: ' + missingSymbols.join(', '));
  }
});