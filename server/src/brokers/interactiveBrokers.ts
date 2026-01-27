// @ts-nocheck
import { EventEmitter } from 'events';
import {
  IBApi,
  Contract,
  Order,
  OrderAction,
  OrderType,
  SecType,
  TimeInForce,
  EventName,
  ErrorCode,
  OrderState,
  OrderStatus,
  ExecutionFilter
} from '@stoqey/ib';

export interface IBConfig {
  host: string;
  port: number;
  clientId: number;
  paperTrading?: boolean;
}

export interface IBPosition {
  symbol: string;
  quantity: number;
  avgCost: number;
  marketValue?: number;
  unrealizedPnL?: number;
}

export interface IBOrderResult {
  orderId: number;
  status: string;
  filled: number;
  remaining: number;
  avgFillPrice: number;
  symbol: string;
}

export interface IBAccountSummary {
  netLiquidation: number;
  buyingPower: number;
  availableFunds: number;
  cashBalance: number;
}

const DEFAULT_CONFIG: IBConfig = {
  host: '127.0.0.1',
  port: 7497,  // TWS Paper Trading. Use 7496 for live
  clientId: 1,
  paperTrading: true
};

export class InteractiveBrokersClient extends EventEmitter {
  private api: IBApi;
  private config: IBConfig;
  private connected: boolean = false;
  private nextOrderId: number = 0;
  private positions: Map<string, IBPosition> = new Map();
  private orders: Map<number, IBOrderResult> = new Map();
  private accountSummary: Partial<IBAccountSummary> = {};

  constructor(config: Partial<IBConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.api = new IBApi({
      host: this.config.host,
      port: this.config.port,
      clientId: this.config.clientId
    });
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.api.on(EventName.connected, () => {
      console.log('✅ Connected to Interactive Brokers');
      this.connected = true;
      this.emit('connected');
    });

    this.api.on(EventName.disconnected, () => {
      console.log('❌ Disconnected from Interactive Brokers');
      this.connected = false;
      this.emit('disconnected');
    });

    this.api.on(EventName.error, (err: Error, code: ErrorCode, reqId: number) => {
      console.error(`IB Error [${code}] ReqId: ${reqId}:`, err.message);
      // Don't crash on order rejections/errors - just log and continue
      // 110 = price tick size, 201/202/203 = order cancelled/rejected
      if (code === 110 || code === 202 || code === 201 || code === 203) {
        const order = this.orders.get(reqId);
        if (order) {
          order.status = 'Cancelled';
          this.emit('orderUpdate', order);
        }
        return; // Don't emit error event for handled errors
      }
      this.emit('error', { error: err, code, reqId });
    });

    this.api.on(EventName.nextValidId, (orderId: number) => {
      this.nextOrderId = orderId;
      console.log(`Next valid order ID: ${orderId}`);
      this.emit('ready', orderId);
    });

    this.api.on(EventName.orderStatus, (
      orderId: number,
      status: OrderStatus,
      filled: number,
      remaining: number,
      avgFillPrice: number
    ) => {
      const order = this.orders.get(orderId);
      if (order) {
        order.status = status;
        order.filled = filled;
        order.remaining = remaining;
        order.avgFillPrice = avgFillPrice;
        this.emit('orderUpdate', order);
      }
    });

    this.api.on(EventName.openOrder, (
      orderId: number,
      contract: Contract,
      order: Order,
      orderState: OrderState
    ) => {
      const orderResult: IBOrderResult = {
        orderId,
        status: orderState.status || 'Unknown',
        filled: 0,
        remaining: Number(order.totalQuantity) || 0,
        avgFillPrice: 0,
        symbol: contract.symbol || ''
      };
      this.orders.set(orderId, orderResult);
      this.emit('openOrder', orderResult);
    });

    this.api.on(EventName.position, (
      account: string,
      contract: Contract,
      pos: number,
      avgCost: number
    ) => {
      if (contract.symbol) {
        const position: IBPosition = {
          symbol: contract.symbol,
          quantity: pos,
          avgCost
        };
        if (pos !== 0) {
          this.positions.set(contract.symbol, position);
        } else {
          this.positions.delete(contract.symbol);
        }
        this.emit('position', position);
      }
    });

    this.api.on(EventName.accountSummary, (
      reqId: number,
      account: string,
      tag: string,
      value: string,
      currency: string
    ) => {
      switch (tag) {
        case 'NetLiquidation':
          this.accountSummary.netLiquidation = parseFloat(value);
          break;
        case 'BuyingPower':
          this.accountSummary.buyingPower = parseFloat(value);
          break;
        case 'AvailableFunds':
          this.accountSummary.availableFunds = parseFloat(value);
          break;
        case 'CashBalance':
          this.accountSummary.cashBalance = parseFloat(value);
          break;
      }
      this.emit('accountSummary', this.accountSummary);
    });
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 10000);

      this.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.once('error', (err) => {
        clearTimeout(timeout);
        reject(err.error);
      });

      console.log(`Connecting to IB at ${this.config.host}:${this.config.port}...`);
      this.api.connect();
    });
  }

  disconnect(): void {
    this.api.disconnect();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private createStockContract(symbol: string): Contract {
    return {
      symbol,
      secType: SecType.STK,
      exchange: 'SMART',
      currency: 'USD',
      primaryExch: 'NASDAQ'
    };
  }

  async placeMarketOrder(
    symbol: string,
    action: 'BUY' | 'SELL',
    quantity: number
  ): Promise<number> {
    const contract = this.createStockContract(symbol);
    const orderId = this.nextOrderId++;

    const order: Order = {
      action: action as OrderAction,
      orderType: OrderType.MKT,
      totalQuantity: quantity,
      tif: TimeInForce.DAY,
      transmit: true
    };

    this.orders.set(orderId, {
      orderId,
      status: 'PendingSubmit',
      filled: 0,
      remaining: quantity,
      avgFillPrice: 0,
      symbol
    });

    this.api.placeOrder(orderId, contract, order);
    console.log(`📤 Placed MARKET ${action} order: ${quantity} ${symbol} (Order ID: ${orderId})`);

    return orderId;
  }

  async placeLimitOrder(
    symbol: string,
    action: 'BUY' | 'SELL',
    quantity: number,
    limitPrice: number
  ): Promise<number> {
    const contract = this.createStockContract(symbol);
    const orderId = this.nextOrderId++;

    const order: Order = {
      action: action as OrderAction,
      orderType: OrderType.LMT,
      totalQuantity: quantity,
      lmtPrice: limitPrice,
      tif: TimeInForce.DAY,
      transmit: true
    };

    this.orders.set(orderId, {
      orderId,
      status: 'PendingSubmit',
      filled: 0,
      remaining: quantity,
      avgFillPrice: 0,
      symbol
    });

    this.api.placeOrder(orderId, contract, order);
    console.log(`📤 Placed LIMIT ${action} order: ${quantity} ${symbol} @ $${limitPrice} (Order ID: ${orderId})`);

    return orderId;
  }

  async placeStopOrder(
    symbol: string,
    action: 'BUY' | 'SELL',
    quantity: number,
    stopPrice: number
  ): Promise<number> {
    const contract = this.createStockContract(symbol);
    const orderId = this.nextOrderId++;

    const order: Order = {
      action: action as OrderAction,
      orderType: OrderType.STP,
      totalQuantity: quantity,
      auxPrice: stopPrice,
      tif: TimeInForce.DAY,
      transmit: true
    };

    this.orders.set(orderId, {
      orderId,
      status: 'PendingSubmit',
      filled: 0,
      remaining: quantity,
      avgFillPrice: 0,
      symbol
    });

    this.api.placeOrder(orderId, contract, order);
    console.log(`📤 Placed STOP ${action} order: ${quantity} ${symbol} @ $${stopPrice} (Order ID: ${orderId})`);

    return orderId;
  }

  async placeBracketOrder(
    symbol: string,
    quantity: number,
    entryPrice: number,
    stopLoss: number,
    takeProfit: number
  ): Promise<{ parentId: number; stopId: number; profitId: number }> {
    const contract = this.createStockContract(symbol);
    const parentId = this.nextOrderId++;
    const stopId = this.nextOrderId++;
    const profitId = this.nextOrderId++;

    const parentOrder: Order = {
      action: OrderAction.BUY,
      orderType: OrderType.LMT,
      totalQuantity: quantity,
      lmtPrice: entryPrice,
      tif: TimeInForce.DAY,
      transmit: false
    };

    const stopOrder: Order = {
      action: OrderAction.SELL,
      orderType: OrderType.STP,
      totalQuantity: quantity,
      auxPrice: stopLoss,
      tif: TimeInForce.DAY,
      parentId,
      transmit: false
    };

    const profitOrder: Order = {
      action: OrderAction.SELL,
      orderType: OrderType.LMT,
      totalQuantity: quantity,
      lmtPrice: takeProfit,
      tif: TimeInForce.DAY,
      parentId,
      transmit: true
    };

    this.api.placeOrder(parentId, contract, parentOrder);
    this.api.placeOrder(stopId, contract, stopOrder);
    this.api.placeOrder(profitId, contract, profitOrder);

    console.log(`📤 Placed BRACKET order for ${symbol}:`);
    console.log(`   Entry: ${quantity} @ $${entryPrice} (ID: ${parentId})`);
    console.log(`   Stop Loss: $${stopLoss} (ID: ${stopId})`);
    console.log(`   Take Profit: $${takeProfit} (ID: ${profitId})`);

    return { parentId, stopId, profitId };
  }

  cancelOrder(orderId: number): void {
    this.api.cancelOrder(orderId);
    console.log(`🚫 Cancelled order ${orderId}`);
  }

  cancelAllOrders(): void {
    this.api.reqGlobalCancel();
    console.log('🚫 Cancelled all orders');
  }

  requestPositions(): void {
    this.api.reqPositions();
  }

  getPositions(): Map<string, IBPosition> {
    return this.positions;
  }

  getPosition(symbol: string): IBPosition | undefined {
    return this.positions.get(symbol);
  }

  requestAccountSummary(): void {
    this.api.reqAccountSummary(
      1,
      'All',
      'NetLiquidation,BuyingPower,AvailableFunds,CashBalance'
    );
  }

  getAccountSummary(): Partial<IBAccountSummary> {
    return this.accountSummary;
  }

  getOrder(orderId: number): IBOrderResult | undefined {
    return this.orders.get(orderId);
  }

  waitForFill(orderId: number, timeoutMs: number = 30000): Promise<IBOrderResult> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Order ${orderId} fill timeout`));
      }, timeoutMs);

      const checkFill = (order: IBOrderResult) => {
        if (order.orderId === orderId && order.status === 'Filled') {
          clearTimeout(timeout);
          this.removeListener('orderUpdate', checkFill);
          resolve(order);
        }
      };

      this.on('orderUpdate', checkFill);

      const currentOrder = this.orders.get(orderId);
      if (currentOrder?.status === 'Filled') {
        clearTimeout(timeout);
        this.removeListener('orderUpdate', checkFill);
        resolve(currentOrder);
      }
    });
  }
}

export function createIBClient(paperTrading: boolean = true): InteractiveBrokersClient {
  return new InteractiveBrokersClient({
    port: paperTrading ? 7497 : 7496,
    paperTrading
  });
}
