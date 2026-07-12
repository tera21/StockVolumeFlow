import { getMarketData, MARKETS, type MarketCode } from "./cache";
import type { DailyBar } from "./yahoo";

export interface DailyTickerEntry {
  ticker: string;
  name: string;
  sector: string | null;
  bar: DailyBar;
  prevClose: number | null;
  change: number;
  changeRate: number;
}

export async function getAllAvailableDates(
  market: MarketCode,
): Promise<string[]> {
  const data = await getMarketData(market);
  const set = new Set<string>();
  for (const t of data) {
    for (const b of t.bars) set.add(b.date);
  }
  return Array.from(set).sort().reverse();
}

export async function resolveDate(
  market: MarketCode,
  input?: string | null,
): Promise<string> {
  const dates = await getAllAvailableDates(market);
  if (dates.length === 0) {
    throw new Error("시장 데이터를 가져올 수 없습니다.");
  }
  if (input) {
    if (dates.includes(input)) return input;
    const sorted = [...dates].sort();
    let chosen: string | null = null;
    for (const d of sorted) {
      if (d <= input) chosen = d;
    }
    return chosen ?? dates[0]!;
  }
  return dates[0]!;
}

export async function getEntriesForDate(
  market: MarketCode,
  date: string,
): Promise<DailyTickerEntry[]> {
  const data = await getMarketData(market);
  const tickerMap = MARKETS[market].tickerMap;
  const entries: DailyTickerEntry[] = [];

  for (const t of data) {
    const idx = t.bars.findIndex((b) => b.date === date);
    if (idx < 0) continue;
    const bar = t.bars[idx]!;
    if (bar.tradingValue <= 0) continue;
    const prevClose = idx > 0 ? t.bars[idx - 1]!.close : null;
    const change = prevClose != null ? bar.close - prevClose : 0;
    const changeRate =
      prevClose != null && prevClose !== 0 ? (change / prevClose) * 100 : 0;

    const meta = tickerMap.get(t.ticker);
    entries.push({
      ticker: t.ticker,
      name: meta?.name ?? t.ticker,
      sector: meta?.sector ?? null,
      bar,
      prevClose,
      change,
      changeRate,
    });
  }

  entries.sort((a, b) => b.bar.tradingValue - a.bar.tradingValue);
  return entries;
}

export async function getMarketTotalsByDate(
  market: MarketCode,
): Promise<
  Map<string, { tradingValue: number; volume: number; tickerCount: number }>
> {
  const data = await getMarketData(market);
  const totals = new Map<
    string,
    { tradingValue: number; volume: number; tickerCount: number }
  >();
  for (const t of data) {
    for (const b of t.bars) {
      if (b.tradingValue <= 0) continue;
      const cur = totals.get(b.date) ?? {
        tradingValue: 0,
        volume: 0,
        tickerCount: 0,
      };
      cur.tradingValue += b.tradingValue;
      cur.volume += b.volume;
      cur.tickerCount += 1;
      totals.set(b.date, cur);
    }
  }
  return totals;
}

export async function getAdvanceDecline(
  market: MarketCode,
  date: string,
): Promise<{ advancers: number; decliners: number; unchanged: number }> {
  const entries = await getEntriesForDate(market, date);
  let advancers = 0;
  let decliners = 0;
  let unchanged = 0;
  for (const e of entries) {
    if (e.changeRate > 0) advancers++;
    else if (e.changeRate < 0) decliners++;
    else unchanged++;
  }
  return { advancers, decliners, unchanged };
}

export interface PeriodRankingItem {
  rank: number;
  ticker: string;
  name: string;
  sector: string | null;
  score: number;
  maxScore: number;
  daysInTop: number;
  avgRank: number;
  bestRank: number;
  totalTradingValue: number;
}

export interface PeriodRankingResult {
  from: string;
  to: string;
  daysInRange: number;
  topN: number;
  items: PeriodRankingItem[];
}

export async function getPeriodRanking(
  market: MarketCode,
  fromInput: string | null | undefined,
  toInput: string | null | undefined,
  topN: number,
  limit: number,
): Promise<PeriodRankingResult> {
  const allDates = await getAllAvailableDates(market); // newest first
  if (allDates.length === 0) {
    return {
      from: "",
      to: "",
      daysInRange: 0,
      topN,
      items: [],
    };
  }

  const sortedAsc = [...allDates].sort();
  const earliest = sortedAsc[0]!;
  const latest = sortedAsc[sortedAsc.length - 1]!;

  // Snap to nearest available business day inside [earliest, latest]
  function snapDown(d: string): string {
    let chosen = earliest;
    for (const x of sortedAsc) if (x <= d) chosen = x;
    return chosen;
  }
  function snapUp(d: string): string {
    let chosen = latest;
    for (let i = sortedAsc.length - 1; i >= 0; i--) {
      if (sortedAsc[i]! >= d) chosen = sortedAsc[i]!;
    }
    return chosen;
  }

  let from = fromInput ? snapUp(fromInput) : earliest;
  let to = toInput ? snapDown(toInput) : latest;
  if (from > to) {
    const tmp = from;
    from = to;
    to = tmp;
  }

  const datesInRange = sortedAsc.filter((d) => d >= from && d <= to);
  const daysInRange = datesInRange.length;

  // Aggregate per-ticker stats
  interface Acc {
    ticker: string;
    score: number;
    daysInTop: number;
    rankSum: number;
    bestRank: number;
    totalTradingValue: number;
  }
  const acc = new Map<string, Acc>();

  for (const date of datesInRange) {
    const entries = await getEntriesForDate(market, date);
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]!;
      const dailyRank = i + 1;
      const inTop = dailyRank <= topN;
      const cur = acc.get(e.ticker) ?? {
        ticker: e.ticker,
        score: 0,
        daysInTop: 0,
        rankSum: 0,
        bestRank: Infinity,
        totalTradingValue: 0,
      };
      cur.totalTradingValue += e.bar.tradingValue;
      if (inTop) {
        cur.score += topN - dailyRank + 1;
        cur.daysInTop += 1;
        cur.rankSum += dailyRank;
        if (dailyRank < cur.bestRank) cur.bestRank = dailyRank;
      }
      acc.set(e.ticker, cur);
    }
  }

  const tickerMap = MARKETS[market].tickerMap;
  const maxScore = topN * daysInRange;

  const items = Array.from(acc.values())
    .filter((a) => a.daysInTop > 0)
    .map((a) => {
      const meta = tickerMap.get(a.ticker);
      return {
        ticker: a.ticker,
        name: meta?.name ?? a.ticker,
        sector: meta?.sector ?? null,
        score: a.score,
        maxScore,
        daysInTop: a.daysInTop,
        avgRank: a.daysInTop > 0 ? a.rankSum / a.daysInTop : 0,
        bestRank: isFinite(a.bestRank) ? a.bestRank : 0,
        totalTradingValue: a.totalTradingValue,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.daysInTop !== a.daysInTop) return b.daysInTop - a.daysInTop;
      return b.totalTradingValue - a.totalTradingValue;
    })
    .slice(0, limit)
    .map((item, i) => ({ rank: i + 1, ...item }));

  return { from, to, daysInRange, topN, items };
}

export async function getDailyTradingSeries(
  market: MarketCode,
  from: string,
  to: string,
  tickers: string[],
): Promise<{ date: string; ticker: string; tradingValue: number }[]> {
  const data = await getMarketData(market);
  const tickerSet = new Set(tickers);
  const result: { date: string; ticker: string; tradingValue: number }[] = [];
  for (const t of data) {
    if (!tickerSet.has(t.ticker)) continue;
    for (const b of t.bars) {
      if (b.date >= from && b.date <= to) {
        result.push({ date: b.date, ticker: t.ticker, tradingValue: b.tradingValue });
      }
    }
  }
  return result.sort(
    (a, b) => a.date.localeCompare(b.date) || a.ticker.localeCompare(b.ticker),
  );
}

export function pickEntries(
  entries: DailyTickerEntry[],
  marketTradingValue: number,
  limit: number,
) {
  return entries.slice(0, limit).map((e, i) => ({
    rank: i + 1,
    ticker: e.ticker,
    name: e.name,
    sector: e.sector,
    marketCap: null,
    price: e.bar.close,
    change: e.change,
    changeRate: e.changeRate,
    volume: e.bar.volume,
    tradingValue: e.bar.tradingValue,
    tradingValueShare:
      marketTradingValue > 0 ? e.bar.tradingValue / marketTradingValue : 0,
  }));
}
