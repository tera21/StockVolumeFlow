import { logger } from "../logger";

const YAHOO_BASE = "https://query1.finance.yahoo.com";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

interface YahooChartMeta {
  symbol: string;
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  longName?: string;
  shortName?: string;
}

interface YahooChartIndicators {
  quote: Array<{
    open?: Array<number | null>;
    close?: Array<number | null>;
    high?: Array<number | null>;
    low?: Array<number | null>;
    volume?: Array<number | null>;
  }>;
}

interface YahooChartResult {
  meta: YahooChartMeta;
  timestamp?: number[];
  indicators: YahooChartIndicators;
}

interface YahooChartResponse {
  chart: {
    result?: YahooChartResult[] | null;
    error?: { code: string; description: string } | null;
  };
}

export interface DailyBar {
  date: string; // YYYY-MM-DD (시장 현지 시간 기준)
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  tradingValue: number; // close * volume
}

export interface TickerDailyData {
  ticker: string;
  bars: DailyBar[];
  latestPrice: number | null;
}

function formatDateInTz(epochSeconds: number, tzOffsetMs: number): string {
  const ms = epochSeconds * 1000 + tzOffsetMs;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function fetchTickerChart(
  ticker: string,
  yahooSuffix: string,
  tzOffsetMs: number,
  rangeDays = 35,
): Promise<TickerDailyData | null> {
  const symbol = `${ticker}${yahooSuffix}`;
  const url = `${YAHOO_BASE}/v8/finance/chart/${symbol}?interval=1d&range=${rangeDays}d`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      logger.warn({ ticker, status: res.status }, "Yahoo chart fetch failed");
      return null;
    }

    const json = (await res.json()) as YahooChartResponse;
    const result = json.chart?.result?.[0];

    if (!result) {
      return null;
    }

    const timestamps = result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0];

    if (!quote || timestamps.length === 0) {
      return {
        ticker,
        bars: [],
        latestPrice: result.meta?.regularMarketPrice ?? null,
      };
    }

    const bars: DailyBar[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const close = quote.close?.[i];
      const open = quote.open?.[i];
      const high = quote.high?.[i];
      const low = quote.low?.[i];
      const volume = quote.volume?.[i];

      if (
        close == null ||
        open == null ||
        high == null ||
        low == null ||
        volume == null
      ) {
        continue;
      }

      bars.push({
        date: formatDateInTz(timestamps[i]!, tzOffsetMs),
        open,
        close,
        high,
        low,
        volume,
        tradingValue: close * volume,
      });
    }

    return {
      ticker,
      bars,
      latestPrice: result.meta?.regularMarketPrice ?? null,
    };
  } catch (err) {
    logger.warn({ ticker, err }, "Yahoo chart fetch threw");
    return null;
  }
}

export async function fetchManyTickers(
  tickers: string[],
  yahooSuffix: string,
  tzOffsetMs: number,
  rangeDays = 35,
  concurrency = 16,
): Promise<TickerDailyData[]> {
  const results: TickerDailyData[] = [];
  const queue = [...tickers];

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const ticker = queue.shift();
      if (!ticker) return;
      const data = await fetchTickerChart(ticker, yahooSuffix, tzOffsetMs, rangeDays);
      if (data && data.bars.length > 0) {
        results.push(data);
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, tickers.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}
