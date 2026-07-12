import { Router, type IRouter } from "express";
import {
  GetTopTradingValueQueryParams,
  GetTopTradingValueResponse,
  GetMarketSummaryQueryParams,
  GetMarketSummaryResponse,
  GetAvailableDatesQueryParams,
  GetAvailableDatesResponse,
  GetPeriodRankingQueryParams,
  GetPeriodRankingResponse,
  GetDailyTradingSeriesQueryParams,
  GetDailyTradingSeriesResponse,
} from "@workspace/api-zod";
import {
  getAllAvailableDates,
  getEntriesForDate,
  getMarketTotalsByDate,
  pickEntries,
  resolveDate,
  getAdvanceDecline,
  getPeriodRanking,
  getDailyTradingSeries,
} from "../../lib/krx/aggregate";
import { MARKETS, parseMarket, getMarketFetchedAt } from "../../lib/krx/cache";

const router: IRouter = Router();

router.get("/kospi/top-trading-value", async (req, res): Promise<void> => {
  const parsed = GetTopTradingValueQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const market = parseMarket(parsed.data.market);
  const limit = Math.min(Math.max(parsed.data.limit, 1), 50);
  try {
    const date = await resolveDate(market, parsed.data.date);
    const entries = await getEntriesForDate(market, date);
    const totals = await getMarketTotalsByDate(market);
    const totalsForDate = totals.get(date);
    const marketTradingValue = totalsForDate?.tradingValue ?? 0;
    const items = pickEntries(entries, marketTradingValue, limit);
    const topTradingValue = items.reduce((s, i) => s + i.tradingValue, 0);
    const topShare =
      marketTradingValue > 0 ? topTradingValue / marketTradingValue : 0;

    const out = GetTopTradingValueResponse.parse({
      date,
      market,
      currency: MARKETS[market].currency,
      marketTradingValue,
      topTradingValue,
      topShare,
      items,
    });
    res.json(out);
  } catch (err) {
    req.log.error({ err }, "top-trading-value failed");
    res.status(503).json({ error: "데이터를 가져오지 못했습니다." });
  }
});

router.get("/kospi/market-summary", async (req, res): Promise<void> => {
  const parsed = GetMarketSummaryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const market = parseMarket(parsed.data.market);
  try {
    const date = await resolveDate(market, parsed.data.date);
    const entries = await getEntriesForDate(market, date);
    const totals = await getMarketTotalsByDate(market);
    const totalsForDate = totals.get(date);
    const marketTradingValue = totalsForDate?.tradingValue ?? 0;
    const marketVolume = totalsForDate?.volume ?? 0;
    const tickerCount = totalsForDate?.tickerCount ?? 0;
    const top10 = entries.slice(0, 10);
    const top10TV = top10.reduce((s, e) => s + e.bar.tradingValue, 0);
    const top10Share =
      marketTradingValue > 0 ? top10TV / marketTradingValue : 0;
    const top1 = entries[0];
    const top1Share =
      marketTradingValue > 0 && top1
        ? top1.bar.tradingValue / marketTradingValue
        : 0;
    const ad = await getAdvanceDecline(market, date);
    const advanceRate =
      tickerCount > 0 ? ad.advancers / tickerCount : 0;

    const fetchedAt = getMarketFetchedAt(market);
    const out = GetMarketSummaryResponse.parse({
      date,
      market,
      currency: MARKETS[market].currency,
      marketTradingValue,
      marketVolume,
      tickerCount,
      top10Share,
      top1Share,
      topTicker: top1?.ticker ?? "",
      topName: top1?.name ?? "",
      topTradingValue: top1?.bar.tradingValue ?? 0,
      advancers: ad.advancers,
      decliners: ad.decliners,
      unchanged: ad.unchanged,
      advanceRate,
      cacheRefreshedAt: fetchedAt ? new Date(fetchedAt).toISOString() : null,
    });
    res.json(out);
  } catch (err) {
    req.log.error({ err }, "market-summary failed");
    res.status(503).json({ error: "데이터를 가져오지 못했습니다." });
  }
});

router.get("/kospi/period-ranking", async (req, res): Promise<void> => {
  const parsed = GetPeriodRankingQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const market = parseMarket(parsed.data.market);
  const topN = Math.min(Math.max(parsed.data.topN, 1), 50);
  const limit = Math.min(Math.max(parsed.data.limit, 1), 30);
  try {
    const result = await getPeriodRanking(
      market,
      parsed.data.from,
      parsed.data.to,
      topN,
      limit,
    );
    const out = GetPeriodRankingResponse.parse({
      market,
      currency: MARKETS[market].currency,
      ...result,
    });
    res.json(out);
  } catch (err) {
    req.log.error({ err }, "period-ranking failed");
    res.status(503).json({ error: "데이터를 가져오지 못했습니다." });
  }
});

router.get("/kospi/daily-trading-series", async (req, res): Promise<void> => {
  const parsed = GetDailyTradingSeriesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const market = parseMarket(parsed.data.market);
  const tickers = parsed.data.tickers
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 30);
  try {
    const items = await getDailyTradingSeries(
      market,
      parsed.data.from,
      parsed.data.to,
      tickers,
    );
    const out = GetDailyTradingSeriesResponse.parse({
      market,
      currency: MARKETS[market].currency,
      from: parsed.data.from,
      to: parsed.data.to,
      items,
    });
    res.json(out);
  } catch (err) {
    req.log.error({ err }, "daily-trading-series failed");
    res.status(503).json({ error: "데이터를 가져오지 못했습니다." });
  }
});

router.get("/kospi/available-dates", async (req, res): Promise<void> => {
  const parsed = GetAvailableDatesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const market = parseMarket(parsed.data.market);
  const count = Math.min(Math.max(parsed.data.count, 1), 250);
  try {
    const dates = await getAllAvailableDates(market);
    const out = GetAvailableDatesResponse.parse(dates.slice(0, count));
    res.json(out);
  } catch (err) {
    req.log.error({ err }, "available-dates failed");
    res.status(503).json({ error: "데이터를 가져오지 못했습니다." });
  }
});

export default router;
