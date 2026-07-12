import { fetchManyTickers, type TickerDailyData } from "./yahoo";
import { KOSPI_TICKERS_UNIQUE, type KospiTicker } from "./tickers";
import { US_TICKERS_UNIQUE } from "./tickers-us";
import { logger } from "../logger";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5분 캐시

export type MarketCode = "kospi" | "us";

export interface MarketConfig {
  code: MarketCode;
  yahooSuffix: string;
  tzOffsetMs: number;
  currency: "KRW" | "USD";
  tickers: KospiTicker[];
  tickerMap: Map<string, KospiTicker>;
}

export const MARKETS: Record<MarketCode, MarketConfig> = {
  kospi: {
    code: "kospi",
    yahooSuffix: ".KS",
    tzOffsetMs: 9 * 60 * 60 * 1000, // KST
    currency: "KRW",
    tickers: KOSPI_TICKERS_UNIQUE,
    tickerMap: new Map(KOSPI_TICKERS_UNIQUE.map((t) => [t.ticker, t])),
  },
  us: {
    code: "us",
    yahooSuffix: "",
    tzOffsetMs: -5 * 60 * 60 * 1000, // EST (NYSE close ~16:00 ET)
    currency: "USD",
    tickers: US_TICKERS_UNIQUE,
    tickerMap: new Map(US_TICKERS_UNIQUE.map((t) => [t.ticker, t])),
  },
};

export function parseMarket(input: unknown): MarketCode {
  if (input === "us" || input === "kospi") return input;
  return "kospi";
}

interface MarketSnapshot {
  fetchedAt: number;
  data: TickerDailyData[];
}

const snapshots = new Map<MarketCode, MarketSnapshot>();
const inflightMap = new Map<MarketCode, Promise<TickerDailyData[]>>();

export function getMarketFetchedAt(marketCode: MarketCode): number | null {
  return snapshots.get(marketCode)?.fetchedAt ?? null;
}

export async function getMarketData(
  marketCode: MarketCode,
): Promise<TickerDailyData[]> {
  const market = MARKETS[marketCode];
  const now = Date.now();
  const cached = snapshots.get(marketCode);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }
  const inflight = inflightMap.get(marketCode);
  if (inflight) return inflight;

  const promise = (async () => {
    const start = Date.now();
    logger.info(
      { market: marketCode, tickerCount: market.tickers.length },
      "Fetching market data from Yahoo",
    );
    const tickers = market.tickers.map((t) => t.ticker);
    const data = await fetchManyTickers(
      tickers,
      market.yahooSuffix,
      market.tzOffsetMs,
      220,
      20,
    );
    snapshots.set(marketCode, { fetchedAt: Date.now(), data });
    logger.info(
      { market: marketCode, count: data.length, ms: Date.now() - start },
      "Market data fetched",
    );
    inflightMap.delete(marketCode);
    return data;
  })();

  inflightMap.set(marketCode, promise);
  return promise;
}
