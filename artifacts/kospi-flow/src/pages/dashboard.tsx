import { useState, useEffect, useRef, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAvailableDates,
  useGetMarketSummary,
  useGetTopTradingValue,
  useGetPeriodRanking,
  useGetDailyTradingSeries,
  getGetMarketSummaryQueryKey,
  getGetTopTradingValueQueryKey,
  getGetAvailableDatesQueryKey,
  getGetPeriodRankingQueryKey,
  getGetDailyTradingSeriesQueryKey,
} from "@workspace/api-client-react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RefreshCw,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  Calendar,
  TrendingUp,
} from "lucide-react";

const COLORS = {
  blue: "#0079F2",
  up: "#d60000", // 상승 (한국 관례: 빨강)
  down: "#0051c7", // 하락 (한국 관례: 파랑)
  flat: "#71717a",
  amber: "#f59e0b",
};

const LINE_COLORS = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6",
  "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#6366f1",
];

type MarketCode = "kospi" | "us";

interface MarketConfig {
  code: MarketCode;
  label: string;
  longLabel: string;
  subtitle: string;
  currency: "KRW" | "USD";
  source: string;
}

const MARKETS: Record<MarketCode, MarketConfig> = {
  kospi: {
    code: "kospi",
    label: "KOSPI",
    longLabel: "코스피 자금 흐름",
    subtitle: "거래대금이 몰리는 KOSPI 종목 한눈에 보기",
    currency: "KRW",
    source: "Yahoo Finance (KOSPI)",
  },
  us: {
    code: "us",
    label: "미국주식",
    longLabel: "미국주식 자금 흐름",
    subtitle: "거래대금이 몰리는 US 종목 한눈에 보기",
    currency: "USD",
    source: "Yahoo Finance (US)",
  },
};

function formatKrw(v: number): string {
  if (!isFinite(v) || v === 0) return "0원";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(2)}조원`;
  if (abs >= 1e8) return `${(v / 1e8).toFixed(2)}억원`;
  if (abs >= 1e4) return `${(v / 1e4).toFixed(1)}만원`;
  return `${Math.round(v).toLocaleString()}원`;
}

function formatUsd(v: number): string {
  if (!isFinite(v) || v === 0) return "$0";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

function formatPercent(v: number, decimals = 1): string {
  return `${(v * 100).toFixed(decimals)}%`;
}

function formatTradingValue(v: number, currency: "KRW" | "USD"): string {
  return currency === "KRW" ? formatKrw(v) : formatUsd(v);
}

function formatDateChip(dateStr: string): {
  weekday: string;
  day: string;
  mon: string;
} {
  const [y, m, d] = dateStr.split("-").map((s) => parseInt(s, 10));
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return {
    weekday: weekdays[date.getUTCDay()]!,
    day: String(d).padStart(2, "0"),
    mon: String(m).padStart(2, "0"),
  };
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map((s) => parseInt(s, 10));
  const t = Date.UTC(y!, m! - 1, d!) + days * 24 * 60 * 60 * 1000;
  const dt = new Date(t);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function CustomTopTooltip({ active, payload, currency }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0];
  const datum = item.payload;
  return (
    <div
      style={{
        backgroundColor: "#fff",
        borderRadius: "6px",
        padding: "10px 14px",
        border: "1px solid #e0e0e0",
        color: "#1a1a1a",
        fontSize: "13px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        {datum.rank}위. {datum.name}{" "}
        <span style={{ color: "#777", fontWeight: 400 }}>({datum.ticker})</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <span style={{ color: "#555" }}>거래대금</span>
        <span style={{ fontWeight: 600 }}>
          {formatTradingValue(datum.tradingValue, currency)}
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <span style={{ color: "#555" }}>비중</span>
        <span style={{ fontWeight: 600 }}>{formatPercent(datum.share, 2)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <span style={{ color: "#555" }}>등락률</span>
        <span
          style={{
            fontWeight: 600,
            color:
              datum.changeRate > 0
                ? COLORS.up
                : datum.changeRate < 0
                  ? COLORS.down
                  : COLORS.flat,
          }}
        >
          {datum.changeRate > 0 ? "+" : ""}
          {datum.changeRate.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}

function PeriodTooltip({ active, payload, currency, daysInRange }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0].payload;
  return (
    <div
      style={{
        backgroundColor: "#fff",
        borderRadius: "6px",
        padding: "10px 14px",
        border: "1px solid #e0e0e0",
        color: "#1a1a1a",
        fontSize: "13px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        minWidth: 220,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6 }}>
        {datum.rank}위. {datum.name}{" "}
        <span style={{ color: "#777", fontWeight: 400 }}>({datum.ticker})</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <span style={{ color: "#555" }}>기간 점수</span>
        <span style={{ fontWeight: 600 }}>
          {datum.score.toLocaleString()}
          <span style={{ color: "#999", fontWeight: 400, fontSize: 11 }}>
            {" "}
            / {datum.maxScore.toLocaleString()}
          </span>
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <span style={{ color: "#555" }}>등장일수</span>
        <span style={{ fontWeight: 600 }}>
          {datum.daysInTop}일 / {daysInRange}일
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <span style={{ color: "#555" }}>평균 순위</span>
        <span style={{ fontWeight: 600 }}>{datum.avgRank.toFixed(1)}위</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <span style={{ color: "#555" }}>최고 순위</span>
        <span style={{ fontWeight: 600 }}>{datum.bestRank}위</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <span style={{ color: "#555" }}>총 거래대금</span>
        <span style={{ fontWeight: 600 }}>
          {formatTradingValue(datum.totalTradingValue, currency)}
        </span>
      </div>
    </div>
  );
}

function LineSeriesTooltip({ active, payload, label, periodChartData, currency }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const sorted = [...payload].sort((a, b) => b.value - a.value);
  return (
    <div
      style={{
        backgroundColor: "#fff",
        borderRadius: "6px",
        padding: "10px 14px",
        border: "1px solid #e0e0e0",
        color: "#1a1a1a",
        fontSize: "12px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        minWidth: 200,
        maxWidth: 280,
      }}
    >
      <div
        style={{
          fontWeight: 600,
          marginBottom: 6,
          borderBottom: "1px solid #eee",
          paddingBottom: 4,
        }}
      >
        {label}
      </div>
      {sorted.map((p: any) => {
        const item = periodChartData.find((pd: any) => pd.ticker === p.dataKey);
        return (
          <div
            key={p.dataKey}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 2,
            }}
          >
            <span style={{ color: p.color, fontWeight: 500 }}>
              {item ? item.displayLabel : p.dataKey}
            </span>
            <span style={{ fontWeight: 600 }}>
              {formatTradingValue(p.value, currency)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DateScroller({
  dates,
  selected,
  onSelect,
  isDark,
}: {
  dates: string[];
  selected: string;
  onSelect: (d: string) => void;
  isDark: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startScrollRef = useRef(0);
  const movedRef = useRef(false);

  const ordered = useMemo(() => [...dates].reverse(), [dates]);

  useEffect(() => {
    if (!scrollRef.current || !selected) return;
    const el = scrollRef.current.querySelector<HTMLButtonElement>(
      `[data-date="${selected}"]`,
    );
    if (el) {
      const container = scrollRef.current;
      const elLeft = el.offsetLeft;
      const elRight = elLeft + el.offsetWidth;
      const cLeft = container.scrollLeft;
      const cRight = cLeft + container.clientWidth;
      if (elLeft < cLeft + 20 || elRight > cRight - 20) {
        container.scrollTo({
          left: elLeft - container.clientWidth / 2 + el.offsetWidth / 2,
          behavior: "smooth",
        });
      }
    }
  }, [selected, ordered.length]);

  useEffect(() => {
    if (!scrollRef.current || ordered.length === 0) return;
    if (!selected) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [ordered.length, selected]);

  function onMouseDown(e: React.MouseEvent) {
    if (!scrollRef.current) return;
    isDraggingRef.current = true;
    movedRef.current = false;
    startXRef.current = e.pageX - scrollRef.current.offsetLeft;
    startScrollRef.current = scrollRef.current.scrollLeft;
    scrollRef.current.style.cursor = "grabbing";
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!isDraggingRef.current || !scrollRef.current) return;
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = x - startXRef.current;
    if (Math.abs(walk) > 4) movedRef.current = true;
    scrollRef.current.scrollLeft = startScrollRef.current - walk;
  }
  function onMouseUp() {
    isDraggingRef.current = false;
    if (scrollRef.current) scrollRef.current.style.cursor = "grab";
  }
  function nudge(dir: -1 | 1) {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir * 220, behavior: "smooth" });
  }

  return (
    <div className="relative w-full">
      <button
        onClick={() => nudge(-1)}
        aria-label="이전 날짜"
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full flex items-center justify-center shadow-sm border print:hidden"
        style={{
          backgroundColor: isDark ? "#27272a" : "#fff",
          color: isDark ? "#e4e4e7" : "#52525b",
          borderColor: isDark ? "rgba(255,255,255,0.1)" : "#e5e5e5",
        }}
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button
        onClick={() => nudge(1)}
        aria-label="다음 날짜"
        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full flex items-center justify-center shadow-sm border print:hidden"
        style={{
          backgroundColor: isDark ? "#27272a" : "#fff",
          color: isDark ? "#e4e4e7" : "#52525b",
          borderColor: isDark ? "rgba(255,255,255,0.1)" : "#e5e5e5",
        }}
      >
        <ChevronRight className="w-4 h-4" />
      </button>
      <div
        ref={scrollRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        className="flex gap-2 overflow-x-auto py-2 px-9 select-none scrollbar-thin"
        style={{
          cursor: "grab",
          scrollbarWidth: "thin",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {ordered.map((d) => {
          const chip = formatDateChip(d);
          const active = d === selected;
          return (
            <button
              key={d}
              data-date={d}
              onClick={() => {
                if (movedRef.current) return;
                onSelect(d);
              }}
              className="shrink-0 rounded-lg flex flex-col items-center justify-center transition-all"
              style={{
                width: "62px",
                height: "68px",
                padding: "8px 6px",
                backgroundColor: active
                  ? COLORS.blue
                  : isDark
                    ? "rgba(255,255,255,0.06)"
                    : "#F4F5F7",
                color: active ? "#fff" : isDark ? "#d4d4d8" : "#3f3f46",
                border: active
                  ? `2px solid ${COLORS.blue}`
                  : "2px solid transparent",
                boxShadow: active ? "0 4px 10px rgba(0,121,242,0.25)" : "none",
              }}
            >
              <span className="text-[11px] opacity-80 leading-none">
                {chip.mon}월
              </span>
              <span className="text-[20px] font-bold leading-tight mt-0.5">
                {chip.day}
              </span>
              <span className="text-[10px] opacity-80 leading-none mt-0.5">
                {chip.weekday}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [isDark, setIsDark] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [market, setMarket] = useState<MarketCode>("kospi");
  const [selectedDate, setSelectedDate] = useState<string>("");

  // Period range state
  const [rangeFrom, setRangeFrom] = useState<string>("");
  const [rangeTo, setRangeTo] = useState<string>("");

  // Top N selector
  const [topN, setTopN] = useState<number>(10);

  // Line chart interaction state
  const [highlightedTicker, setHighlightedTicker] = useState<string | null>(null);
  const [clickedDateData, setClickedDateData] = useState<{
    date: string;
    entries: Array<{ ticker: string; value: number; color: string }>;
  } | null>(null);
  const [yZoom, setYZoom] = useState<number>(1);
  const [hoverMode, setHoverMode] = useState(false);
  const [xViewStart, setXViewStart] = useState(0);
  const [xViewEnd, setXViewEnd] = useState(0);
  const hoverTickerRef = useRef<string | null>(null);
  const panDivRef = useRef<HTMLDivElement>(null);
  const panStartRef = useRef<{ clientX: number; viewStart: number; viewEnd: number } | null>(null);
  const panDraggedRef = useRef(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  // Prevent page scroll while dragging the line chart in hover mode
  useEffect(() => {
    const div = panDivRef.current;
    if (!div || !hoverMode) return;
    const prevent = (e: TouchEvent) => {
      if (panStartRef.current) e.preventDefault();
    };
    div.addEventListener("touchmove", prevent, { passive: false });
    return () => div.removeEventListener("touchmove", prevent);
  }, [hoverMode]);

  // Reset everything when market switches
  useEffect(() => {
    setSelectedDate("");
    setRangeFrom("");
    setRangeTo("");
    setHighlightedTicker(null);
    setClickedDateData(null);
    setYZoom(1);
    setTopN(10);
  }, [market]);

  // Reset line chart state when period range changes
  useEffect(() => {
    setHighlightedTicker(null);
    setClickedDateData(null);
    setYZoom(1);
  }, [rangeFrom, rangeTo]);

  const { data: availableDates = [], isLoading: isLoadingDates } =
    useGetAvailableDates(
      { market, count: 220 },
      {
        query: {
          queryKey: getGetAvailableDatesQueryKey({ market, count: 220 }),
        },
      },
    );

  // Initial selected date + default range (last ~7 trading days)
  useEffect(() => {
    if (availableDates.length > 0 && !selectedDate) {
      setSelectedDate(availableDates[0]);
    }
    if (availableDates.length > 0 && (!rangeFrom || !rangeTo)) {
      const sortedAsc = [...availableDates].sort();
      const latest = sortedAsc[sortedAsc.length - 1]!;
      const earliestForDefault =
        sortedAsc[Math.max(0, sortedAsc.length - 7)]!;
      if (!rangeFrom) setRangeFrom(earliestForDefault);
      if (!rangeTo) setRangeTo(latest);
    }
  }, [availableDates, selectedDate, rangeFrom, rangeTo]);

  const marketSummaryQuery = useGetMarketSummary(
    { market, date: selectedDate },
    {
      query: {
        enabled: !!selectedDate,
        queryKey: getGetMarketSummaryQueryKey({ market, date: selectedDate }),
      },
    },
  );

  const topTradingQuery = useGetTopTradingValue(
    { market, date: selectedDate, limit: topN },
    {
      query: {
        enabled: !!selectedDate,
        queryKey: getGetTopTradingValueQueryKey({
          market,
          date: selectedDate,
          limit: topN,
        }),
      },
    },
  );

  // Find the previous trading day to detect "NEW" entries in top 10
  const previousDate = useMemo(() => {
    if (!selectedDate || availableDates.length === 0) return "";
    const sortedAsc = [...availableDates].sort();
    const idx = sortedAsc.indexOf(selectedDate);
    return idx > 0 ? sortedAsc[idx - 1]! : "";
  }, [availableDates, selectedDate]);

  const previousDayQuery = useGetTopTradingValue(
    { market, date: previousDate, limit: topN },
    {
      query: {
        enabled: !!previousDate,
        queryKey: getGetTopTradingValueQueryKey({
          market,
          date: previousDate,
          limit: topN,
        }),
      },
    },
  );

  const previousTickerSet = useMemo(() => {
    return new Set((previousDayQuery.data?.items ?? []).map((i) => i.ticker));
  }, [previousDayQuery.data]);

  const periodQuery = useGetPeriodRanking(
    { market, from: rangeFrom, to: rangeTo, topN, limit: topN },
    {
      query: {
        enabled: !!rangeFrom && !!rangeTo,
        queryKey: getGetPeriodRankingQueryKey({
          market,
          from: rangeFrom,
          to: rangeTo,
          topN,
          limit: topN,
        }),
      },
    },
  );

  const loading =
    isLoadingDates ||
    marketSummaryQuery.isLoading ||
    topTradingQuery.isLoading ||
    marketSummaryQuery.isFetching ||
    topTradingQuery.isFetching;

  useEffect(() => {
    if (loading) {
      setIsSpinning(true);
      return;
    }
    const t = setTimeout(() => setIsSpinning(false), 600);
    return () => clearTimeout(t);
  }, [loading]);

  const handleRefresh = () => {
    if (!selectedDate) return;
    queryClient.invalidateQueries({
      queryKey: getGetMarketSummaryQueryKey({ market, date: selectedDate }),
    });
    queryClient.invalidateQueries({
      queryKey: getGetTopTradingValueQueryKey({
        market,
        date: selectedDate,
        limit: topN,
      }),
    });
    queryClient.invalidateQueries({
      queryKey: getGetAvailableDatesQueryKey({ market, count: 30 }),
    });
    queryClient.invalidateQueries({
      queryKey: getGetPeriodRankingQueryKey({
        market,
        from: rangeFrom,
        to: rangeTo,
        topN,
        limit: topN,
      }),
    });
  };

  function applyPreset(daysBack: number) {
    if (availableDates.length === 0) return;
    const sortedAsc = [...availableDates].sort();
    const latest = sortedAsc[sortedAsc.length - 1]!;
    const idx = Math.max(0, sortedAsc.length - daysBack);
    setRangeFrom(sortedAsc[idx]!);
    setRangeTo(latest);
  }

  const cfg = MARKETS[market];
  const currency = cfg.currency;

  const lastRefreshed = marketSummaryQuery.dataUpdatedAt
    ? (() => {
        const d = new Date(marketSummaryQuery.dataUpdatedAt);
        const time = d.toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
        });
        const date = d.toLocaleDateString("ko-KR", {
          month: "short",
          day: "numeric",
        });
        return `${date} ${time}`;
      })()
    : null;

  const cacheRefreshedAt = marketSummaryQuery.data?.cacheRefreshedAt
    ? (() => {
        const d = new Date(marketSummaryQuery.data!.cacheRefreshedAt as string);
        return d.toLocaleString("ko-KR", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      })()
    : null;

  const gridColor = isDark ? "rgba(255,255,255,0.08)" : "#e5e5e5";
  const tickColor = isDark ? "#98999C" : "#71717a";

  const topItems = topTradingQuery.data?.items || [];
  const marketSummary = marketSummaryQuery.data;

  // Only flag NEW once we actually have previous-day data loaded
  const hasPreviousData =
    !!previousDate && previousTickerSet.size > 0;
  const heroChartData = topItems.map((item) => ({
    name: item.name,
    ticker: item.ticker,
    rank: item.rank,
    tradingValue: item.tradingValue,
    share: item.tradingValueShare,
    changeRate: item.changeRate,
    isNew: hasPreviousData && !previousTickerSet.has(item.ticker),
    fill:
      item.changeRate > 0
        ? COLORS.up
        : item.changeRate < 0
          ? COLORS.down
          : COLORS.flat,
  }));

  const periodData = periodQuery.data;
  const periodChartData = (periodData?.items ?? []).map((item) => ({
    name: item.name,
    ticker: item.ticker,
    displayLabel: currency === "KRW" ? item.name : item.ticker,
    rank: item.rank,
    score: item.score,
    maxScore: item.maxScore,
    daysInTop: item.daysInTop,
    avgRank: item.avgRank,
    bestRank: item.bestRank,
    totalTradingValue: item.totalTradingValue,
  }));
  const periodLoading = periodQuery.isLoading || periodQuery.isFetching;

  const periodTickers = (periodData?.items ?? []).map((i) => i.ticker);
  const dailySeriesQuery = useGetDailyTradingSeries(
    {
      market,
      from: rangeFrom,
      to: rangeTo,
      tickers: periodTickers.join(","),
    },
    {
      query: {
        enabled: !!rangeFrom && !!rangeTo && periodTickers.length > 0,
        queryKey: getGetDailyTradingSeriesQueryKey({
          market,
          from: rangeFrom,
          to: rangeTo,
          tickers: periodTickers.join(","),
        }),
      },
    },
  );

  const dailySeriesChartData = useMemo(() => {
    const items = dailySeriesQuery.data?.items ?? [];
    if (items.length === 0) return [];
    const map = new Map<string, Record<string, number>>();
    for (const pt of items) {
      const row = map.get(pt.date) ?? {};
      row[pt.ticker] = pt.tradingValue;
      map.set(pt.date, row);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({ date, ...values }));
  }, [dailySeriesQuery.data]);

  const maxSeriesY = useMemo(() => {
    if (dailySeriesChartData.length === 0) return 0;
    let max = 0;
    for (const row of dailySeriesChartData) {
      for (const [key, val] of Object.entries(row)) {
        if (key !== "date" && typeof val === "number" && val > max) max = val;
      }
    }
    return max;
  }, [dailySeriesChartData]);

  // Reset x-pan view whenever the data set changes (market / range / topN change)
  useEffect(() => {
    const n = dailySeriesChartData.length;
    setXViewStart(0);
    setXViewEnd(Math.max(0, n - 1));
  }, [dailySeriesChartData.length]);

  const viewedData = useMemo(
    () => dailySeriesChartData.slice(xViewStart, xViewEnd + 1),
    [dailySeriesChartData, xViewStart, xViewEnd],
  );
  const isFullView =
    dailySeriesChartData.length === 0 ||
    (xViewStart === 0 && xViewEnd === dailySeriesChartData.length - 1);

  // Range bounds for date inputs
  const minDate =
    availableDates.length > 0 ? [...availableDates].sort()[0] : undefined;
  const maxDate =
    availableDates.length > 0
      ? [...availableDates].sort()[availableDates.length - 1]
      : undefined;

  return (
    <div className="min-h-screen bg-background px-5 py-4 pt-[24px] pb-[32px] pl-[24px] pr-[24px]">
      <div className="max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="pt-1">
            <h1 className="font-bold text-[28px] sm:text-[32px] tracking-tight">
              {cfg.longLabel}
            </h1>
            <p className="text-muted-foreground mt-1 text-[13px] sm:text-[14px]">
              {cfg.subtitle}
            </p>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <div
              className="inline-flex rounded-lg p-1"
              style={{
                backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "#F0F1F2",
              }}
            >
              {(Object.keys(MARKETS) as MarketCode[]).map((m) => {
                const active = market === m;
                return (
                  <button
                    key={m}
                    onClick={() => setMarket(m)}
                    className="px-3 py-1.5 rounded-md text-[13px] font-semibold transition-all"
                    style={{
                      backgroundColor: active
                        ? isDark
                          ? "#3f3f46"
                          : "#fff"
                        : "transparent",
                      color: active
                        ? isDark
                          ? "#fafafa"
                          : "#0a0a0a"
                        : isDark
                          ? "#a1a1aa"
                          : "#71717a",
                      boxShadow: active
                        ? "0 1px 2px rgba(0,0,0,0.08)"
                        : "none",
                    }}
                  >
                    {MARKETS[m].label}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setIsDark((d) => !d)}
              aria-label="테마 전환"
              className="flex items-center justify-center w-[32px] h-[32px] rounded-md transition-colors"
              style={{
                backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2",
                color: isDark ? "#c8c9cc" : "#4b5563",
              }}
            >
              {isDark ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>

            <button
              onClick={handleRefresh}
              disabled={loading || !selectedDate}
              className="flex items-center gap-1.5 px-3 h-[32px] rounded-md text-[13px] font-medium transition-colors disabled:opacity-50"
              style={{
                backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#F0F1F2",
                color: isDark ? "#c8c9cc" : "#4b5563",
              }}
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isSpinning ? "animate-spin" : ""}`}
              />
              새로고침
            </button>
          </div>
        </div>

        {/* Date Scroller */}
        <Card className="mb-4">
          <CardContent className="p-2">
            {isLoadingDates ? (
              <div className="flex gap-2 px-9 py-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="w-[62px] h-[68px] shrink-0" />
                ))}
              </div>
            ) : availableDates.length > 0 ? (
              <DateScroller
                dates={availableDates}
                selected={selectedDate}
                onSelect={setSelectedDate}
                isDark={isDark}
              />
            ) : (
              <div className="text-center py-6 text-muted-foreground text-sm">
                불러올 날짜가 없습니다
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top N selector */}
        <div className="flex items-center gap-2 mb-3 px-1">
          <span className="text-[12px] text-muted-foreground shrink-0">종목 수</span>
          {[10, 20, 30].map((n) => (
            <button
              key={n}
              onClick={() => setTopN(n)}
              style={{
                fontSize: 12,
                padding: "3px 12px",
                borderRadius: 6,
                border: `1px solid ${topN === n ? COLORS.amber : (isDark ? "rgba(255,255,255,0.15)" : "#d1d5db")}`,
                background: topN === n ? COLORS.amber : "transparent",
                color: topN === n ? "#fff" : (isDark ? "#c8c9cc" : "#374151"),
                fontWeight: topN === n ? 700 : 400,
                cursor: "pointer",
                transition: "all 0.12s",
              }}
            >
              {n}종목
            </button>
          ))}
        </div>

        {/* Hero Chart: Top N Bars (single day) — moved above KPIs */}
        <Card className="mb-4">
          <CardHeader className="px-5 pt-5 pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">
              거래대금 상위 {topN}종목
              {selectedDate && (
                <span className="text-muted-foreground font-normal text-sm ml-2">
                  · {selectedDate}
                </span>
              )}
            </CardTitle>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap justify-end">
              <span className="flex items-center gap-1">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ background: COLORS.up }}
                />
                상승
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ background: COLORS.down }}
                />
                하락
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="inline-flex items-center justify-center text-[9px] font-bold text-white px-1 rounded"
                  style={{
                    background: "#10b981",
                    height: 14,
                    lineHeight: "14px",
                  }}
                >
                  NEW
                </span>
                전일 {topN}위 밖 → 신규 진입
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="w-full" style={{ height: Math.max(280, topN * 28) }} />
            ) : heroChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(280, topN * 28)} debounce={0}>
                <BarChart
                  data={heroChartData}
                  layout="vertical"
                  margin={{ top: 4, right: 70, left: 8, bottom: 4 }}
                  barCategoryGap="30%"
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={gridColor}
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => formatTradingValue(v, currency)}
                    tick={{ fontSize: 12, fill: tickColor }}
                    stroke={tickColor}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: topN <= 10 ? 12 : 11, fill: tickColor }}
                    stroke={tickColor}
                    width={currency === "KRW" ? 110 : 85}
                    interval={0}
                  />
                  <Tooltip
                    content={<CustomTopTooltip currency={currency} />}
                    isAnimationActive={false}
                    cursor={{
                      fill: isDark
                        ? "rgba(255,255,255,0.04)"
                        : "rgba(0,0,0,0.04)",
                    }}
                  />
                  <Bar
                    dataKey="tradingValue"
                    name="거래대금"
                    fillOpacity={0.9}
                    activeBar={{ fillOpacity: 1 }}
                    isAnimationActive={false}
                    radius={[0, 4, 4, 0]}
                    label={(props: any) => {
                      const { x, y, width, height, index } = props;
                      const datum = heroChartData[index];
                      if (!datum?.isNew) return <g />;
                      const bx = x + width + 6;
                      const by = y + height / 2 - 8;
                      return (
                        <g>
                          <rect
                            x={bx}
                            y={by}
                            width={36}
                            height={16}
                            rx={3}
                            fill="#10b981"
                          />
                          <text
                            x={bx + 18}
                            y={by + 11}
                            textAnchor="middle"
                            fontSize={10}
                            fontWeight={700}
                            fill="#fff"
                          >
                            NEW
                          </text>
                        </g>
                      );
                    }}
                  >
                    {heroChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-[420px] flex items-center justify-center text-muted-foreground">
                선택한 날짜에 데이터가 없습니다
              </div>
            )}
          </CardContent>
        </Card>

        {/* KPI Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Card>
            <CardContent className="p-5">
              {loading || !marketSummary ? (
                <>
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-7 w-32" />
                </>
              ) : (
                <>
                  <p className="text-[12px] sm:text-sm text-muted-foreground">
                    {cfg.label} 거래대금
                  </p>
                  <p
                    className="text-xl sm:text-2xl font-bold mt-1"
                    style={{ color: COLORS.blue }}
                  >
                    {formatTradingValue(
                      marketSummary.marketTradingValue,
                      currency,
                    )}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* 상승/하락 KPI */}
          <Card>
            <CardContent className="p-5">
              {loading || !marketSummary ? (
                <>
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-7 w-32" />
                </>
              ) : (
                <>
                  <p className="text-[12px] sm:text-sm text-muted-foreground">
                    상승 / 하락 종목
                  </p>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span
                      className="text-xl sm:text-2xl font-bold"
                      style={{ color: COLORS.up }}
                    >
                      {marketSummary.advancers}
                    </span>
                    <span className="text-base text-muted-foreground">/</span>
                    <span
                      className="text-xl sm:text-2xl font-bold"
                      style={{ color: COLORS.down }}
                    >
                      {marketSummary.decliners}
                    </span>
                    <span className="text-[11px] text-muted-foreground ml-1">
                      (상승 {formatPercent(marketSummary.advanceRate, 0)})
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              {loading || !marketSummary ? (
                <>
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-7 w-32" />
                </>
              ) : (
                <>
                  <p className="text-[12px] sm:text-sm text-muted-foreground">
                    상위 {topN}종목 비중
                  </p>
                  <p
                    className="text-xl sm:text-2xl font-bold mt-1"
                    style={{ color: COLORS.blue }}
                  >
                    {formatPercent(topTradingQuery.data?.topShare ?? marketSummary.top10Share)}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              {loading || !marketSummary ? (
                <>
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-7 w-32" />
                </>
              ) : (
                <>
                  <p className="text-[12px] sm:text-sm text-muted-foreground">
                    1위 종목
                  </p>
                  <p
                    className="text-xl sm:text-2xl font-bold mt-1 truncate"
                    style={{ color: COLORS.blue }}
                    title={marketSummary.topName}
                  >
                    {marketSummary.topName}
                    <span className="text-xs sm:text-sm font-normal text-muted-foreground ml-2">
                      ({formatPercent(marketSummary.top1Share)})
                    </span>
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Period Ranking */}
        <Card>
          <CardHeader className="px-5 pt-5 pb-2 flex-col items-start space-y-3">
            <div className="flex items-start justify-between w-full gap-3 flex-wrap">
              <div className="flex items-start gap-2">
                <TrendingUp
                  className="w-4 h-4 mt-1 shrink-0"
                  style={{ color: COLORS.amber }}
                />
                <div>
                  <CardTitle className="text-base">
                    기간 인기 종목 랭킹
                  </CardTitle>
                  <p className="text-[12px] text-muted-foreground mt-1 leading-snug">
                    선택 기간 동안{" "}
                    <span className="font-medium">상위 30위 안</span>에 들어간
                    빈도와 일별 순위를 가중합산해 산출 (1위 = 30점, 30위 = 1점,
                    그 외 = 0점)
                  </p>
                </div>
              </div>
              {periodData && periodData.daysInRange > 0 && (
                <div
                  className="text-[11px] font-medium px-2 py-1 rounded shrink-0"
                  style={{
                    backgroundColor: isDark
                      ? "rgba(245,158,11,0.15)"
                      : "rgba(245,158,11,0.12)",
                    color: COLORS.amber,
                  }}
                >
                  {periodData.daysInRange} 영업일 분석
                </div>
              )}
            </div>

            {/* Range controls */}
            <div className="flex flex-wrap items-center gap-2 w-full">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="date"
                value={rangeFrom}
                min={minDate}
                max={maxDate}
                onChange={(e) => setRangeFrom(e.target.value)}
                className="text-[13px] px-2 py-1 rounded-md border bg-background"
                style={{
                  borderColor: isDark
                    ? "rgba(255,255,255,0.15)"
                    : "rgba(0,0,0,0.15)",
                }}
              />
              <span className="text-muted-foreground text-sm">~</span>
              <input
                type="date"
                value={rangeTo}
                min={minDate}
                max={maxDate}
                onChange={(e) => setRangeTo(e.target.value)}
                className="text-[13px] px-2 py-1 rounded-md border bg-background"
                style={{
                  borderColor: isDark
                    ? "rgba(255,255,255,0.15)"
                    : "rgba(0,0,0,0.15)",
                }}
              />
              {periodData && (
                <span className="text-[11px] text-muted-foreground ml-1">
                  실제 분석: {periodData.from} ~ {periodData.to}
                </span>
              )}
              <div className="ml-auto flex items-center gap-1">
                <span className="text-[11px] text-muted-foreground mr-1">
                  빠른 선택:
                </span>
                {[
                  { label: "180일", days: 180 },
                  { label: "120일", days: 120 },
                  { label: "60일", days: 60 },
                  { label: "20일", days: 20 },
                  { label: "10일", days: 10 },
                  { label: "5일", days: 5 },
                ].map((p) => (
                  <button
                    key={p.label}
                    onClick={() => applyPreset(p.days)}
                    className="text-[11px] px-2 py-1 rounded-md font-medium transition-colors"
                    style={{
                      backgroundColor: isDark
                        ? "rgba(255,255,255,0.06)"
                        : "#F0F1F2",
                      color: isDark ? "#d4d4d8" : "#52525b",
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {periodLoading ? (
              <Skeleton className="w-full" style={{ height: Math.max(260, topN * 28) }} />
            ) : periodChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(260, periodChartData.length * 28)} debounce={0}>
                <BarChart
                  data={periodChartData}
                  layout="vertical"
                  margin={{ top: 4, right: 60, left: 8, bottom: 4 }}
                  barCategoryGap="30%"
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={gridColor}
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 12, fill: tickColor }}
                    stroke={tickColor}
                  />
                  <YAxis
                    type="category"
                    dataKey="displayLabel"
                    tick={{
                      fontSize: 11,
                      fill: tickColor,
                      fontFamily: currency === "KRW" ? undefined : "monospace",
                    }}
                    stroke={tickColor}
                    width={currency === "KRW" ? 120 : 85}
                  />
                  <Tooltip
                    content={
                      <PeriodTooltip
                        currency={currency}
                        daysInRange={periodData?.daysInRange ?? 0}
                      />
                    }
                    isAnimationActive={false}
                    cursor={{
                      fill: isDark
                        ? "rgba(255,255,255,0.04)"
                        : "rgba(0,0,0,0.04)",
                    }}
                  />
                  <Bar
                    dataKey="score"
                    name="기간 점수"
                    fill={COLORS.amber}
                    fillOpacity={0.9}
                    activeBar={{ fillOpacity: 1 }}
                    isAnimationActive={false}
                    radius={[0, 4, 4, 0]}
                    label={{
                      position: "right",
                      fontSize: 11,
                      fill: tickColor,
                      formatter: (val: any, _name: any, _props: any) => {
                        return ` ${val}`;
                      },
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-[280px] flex items-center justify-center text-muted-foreground">
                선택한 기간에 데이터가 없습니다
              </div>
            )}

            {/* 일별 거래대금 추이 꺾은선 그래프 */}
            {!periodLoading && periodChartData.length > 0 && (
              <div className="mt-5">
                <div className="grid grid-cols-3 items-center mb-2">
                  <span className="text-[12px] font-semibold" style={{ color: tickColor }}>
                    일별 거래대금 추이
                  </span>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 5,
                      fontSize: 11,
                      color: tickColor,
                      cursor: "pointer",
                      userSelect: "none",
                      opacity: hoverMode ? 1 : 0.65,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={hoverMode}
                      onChange={(e) => {
                        setHoverMode(e.target.checked);
                        if (!e.target.checked) setHighlightedTicker(null);
                      }}
                      style={{ accentColor: COLORS.amber, cursor: "pointer" }}
                    />
                    호버링하여 종목 확인
                  </label>
                  <div />
                </div>
                {dailySeriesQuery.isLoading || dailySeriesQuery.isFetching ? (
                  <Skeleton className="w-full h-[720px]" />
                ) : dailySeriesChartData.length > 0 ? (
                  <>
                    {!isFullView && (
                      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
                        <button
                          onClick={() => {
                            setXViewStart(0);
                            setXViewEnd(dailySeriesChartData.length - 1);
                          }}
                          style={{
                            fontSize: 10,
                            padding: "2px 8px",
                            borderRadius: 4,
                            border: `1px solid ${tickColor}`,
                            color: tickColor,
                            background: "transparent",
                            opacity: 0.7,
                            cursor: "pointer",
                          }}
                        >
                          전체 보기
                        </button>
                      </div>
                    )}
                    <div
                      ref={panDivRef}
                      style={{ userSelect: "none", cursor: "grab", touchAction: hoverMode ? "none" : "auto" }}
                      onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        if (hoverMode) e.preventDefault();
                        panStartRef.current = {
                          clientX: e.clientX,
                          viewStart: xViewStart,
                          viewEnd: xViewEnd,
                        };
                        panDraggedRef.current = false;
                        const totalLen = dailySeriesChartData.length;
                        if (panDivRef.current) {
                          panDivRef.current.style.cursor = "grabbing";
                        }
                        const onMove = (ev: MouseEvent) => {
                          if (!panStartRef.current || !panDivRef.current) return;
                          const dx = ev.clientX - panStartRef.current.clientX;
                          if (Math.abs(dx) > 5) panDraggedRef.current = true;
                          if (!panDraggedRef.current) return;
                          const { viewStart: vs, viewEnd: ve } = panStartRef.current;
                          const windowSize = ve - vs + 1;
                          // subtract yAxis width(58) + left margin(8) + right margin(16) + slider(36)
                          const plotW = Math.max(1, panDivRef.current.offsetWidth - 118);
                          const indexDelta = Math.round((-dx * windowSize) / plotW);
                          const maxStart = totalLen - windowSize;
                          const newStart = Math.max(0, Math.min(maxStart, vs + indexDelta));
                          setXViewStart(newStart);
                          setXViewEnd(newStart + windowSize - 1);
                        };
                        const onUp = () => {
                          if (panDivRef.current) panDivRef.current.style.cursor = "grab";
                          panStartRef.current = null;
                          window.removeEventListener("mousemove", onMove);
                          window.removeEventListener("mouseup", onUp);
                        };
                        window.addEventListener("mousemove", onMove);
                        window.addEventListener("mouseup", onUp);
                      }}
                    >
                    <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
                    <ResponsiveContainer width="100%" height={720} debounce={0}>
                      <LineChart
                        data={viewedData}
                        margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                        style={{ cursor: "pointer" }}
                        onMouseMove={(data: any) => {
                          const payload = data?.activePayload;
                          const chartY = data?.activeCoordinate?.y;
                          if (payload?.length && chartY != null) {
                            const MARGIN_TOP = 4;
                            // Actual plot area height: chart(720) - top margin(4) - bottom margin(4) - XAxis(~32)
                            const AREA_H = 680;
                            const domainMax = maxSeriesY > 0 ? maxSeriesY / yZoom : 1;
                            let nearest: string | null = null;
                            let minDist = Infinity;
                            // Sort descending so the highest-valued line wins when multiple
                            // lines are clipped at the same top boundary (yZoom > 1 case).
                            const sortedPayload = [...payload].sort(
                              (a: any, b: any) => (b.value ?? 0) - (a.value ?? 0),
                            );
                            for (const p of sortedPayload) {
                              if (p.value == null) continue;
                              const lineY =
                                (1 - Math.min(p.value, domainMax) / domainMax) * AREA_H +
                                MARGIN_TOP;
                              const dist = Math.abs(chartY - lineY);
                              if (dist < minDist) {
                                minDist = dist;
                                nearest = p.dataKey as string;
                              }
                            }
                            hoverTickerRef.current = nearest;
                            if (hoverMode) setHighlightedTicker(nearest);
                          } else {
                            hoverTickerRef.current = null;
                            if (hoverMode) setHighlightedTicker(null);
                          }
                        }}
                        onMouseLeave={() => {
                          hoverTickerRef.current = null;
                          if (hoverMode) setHighlightedTicker(null);
                        }}
                        onClick={(chartData: any) => {
                          if (panDraggedRef.current) return;
                          // Ticker highlight only in hover mode; off-mode click just shows date panel
                          if (hoverMode) {
                            const ticker = hoverTickerRef.current;
                            if (ticker) {
                              setHighlightedTicker((prev) =>
                                prev === ticker ? null : ticker,
                              );
                            }
                          }
                          if (chartData?.activeLabel && chartData?.activePayload?.length) {
                            const entries = [...chartData.activePayload]
                              .filter((p) => p.value != null)
                              .sort((a, b) => b.value - a.value)
                              .map((p) => ({
                                ticker: p.dataKey as string,
                                value: p.value as number,
                                color: p.color as string,
                              }));
                            setClickedDateData({ date: chartData.activeLabel as string, entries });
                          } else {
                            setClickedDateData(null);
                          }
                        }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke={gridColor}
                        />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10, fill: tickColor }}
                          stroke={tickColor}
                          tickFormatter={(d: string) => {
                            const parts = d.split("-");
                            return `${parseInt(parts[1]!)}/${parseInt(parts[2]!)}`;
                          }}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: tickColor }}
                          stroke={tickColor}
                          width={58}
                          tickFormatter={(v: number) =>
                            formatTradingValue(v, currency)
                          }
                          domain={[0, maxSeriesY > 0 ? maxSeriesY / yZoom : "auto"]}
                          allowDataOverflow
                        />
                        <Tooltip
                          content={<></>}
                          cursor={{ stroke: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)", strokeWidth: 1, strokeDasharray: "4 2" }}
                          isAnimationActive={false}
                        />
                        <Legend
                          content={(props) => {
                            const { payload } = props as any;
                            if (!payload) return null;
                            return (
                              <div
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: "4px 12px",
                                  justifyContent: "center",
                                  padding: "6px 0 2px",
                                }}
                              >
                                {payload.map((entry: any) => {
                                  const item = periodChartData.find(
                                    (p) => p.ticker === entry.value,
                                  );
                                  const isActive =
                                    highlightedTicker === null ||
                                    highlightedTicker === entry.value;
                                  return (
                                    <span
                                      key={entry.value}
                                      onClick={() =>
                                        setHighlightedTicker((prev) =>
                                          prev === entry.value ? null : entry.value,
                                        )
                                      }
                                      style={{
                                        fontSize: 10,
                                        cursor: "pointer",
                                        color: entry.color,
                                        opacity: isActive ? 1 : 0.3,
                                        fontWeight:
                                          highlightedTicker === entry.value
                                            ? 700
                                            : 400,
                                        userSelect: "none",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 4,
                                        transition: "opacity 0.15s",
                                      }}
                                    >
                                      <span
                                        style={{
                                          display: "inline-block",
                                          width: 16,
                                          height: 2,
                                          backgroundColor: entry.color,
                                          opacity: isActive ? 1 : 0.3,
                                          borderRadius: 1,
                                        }}
                                      />
                                      {item ? item.displayLabel : entry.value}
                                    </span>
                                  );
                                })}
                              </div>
                            );
                          }}
                        />
                        {periodChartData.map((p, i) => {
                          const isHL = highlightedTicker === p.ticker;
                          const noHL = highlightedTicker === null;
                          const color = LINE_COLORS[i % LINE_COLORS.length];
                          return (
                            <Line
                              key={p.ticker}
                              type="monotone"
                              dataKey={p.ticker}
                              name={p.ticker}
                              stroke={color}
                              dot={false}
                              strokeWidth={noHL ? 1.5 : isHL ? 3 : 0.8}
                              strokeOpacity={noHL ? 1 : isHL ? 1 : 0.2}
                              connectNulls
                              isAnimationActive={false}
                              activeDot={{
                                r: 5,
                                fill: color,
                                stroke: isDark ? "#1a1a1a" : "#fff",
                                strokeWidth: 2,
                                cursor: "pointer",
                                onClick: (_e: any, dotData: any) => {
                                  const ticker = dotData?.dataKey ?? p.ticker;
                                  setHighlightedTicker((prev) =>
                                    prev === ticker ? null : ticker,
                                  );
                                },
                              }}
                            />
                          );
                        })}
                      </LineChart>
                    </ResponsiveContainer>

                    {/* 세로 확대 슬라이더 — 차트 오른쪽 */}
                    <div
                      style={{
                        width: 36,
                        height: 720,
                        flexShrink: 0,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingTop: 4,
                        paddingBottom: 4,
                      }}
                    >
                      {/* 현재 배율 표시 */}
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: yZoom !== 1 ? COLORS.amber : tickColor,
                          lineHeight: 1,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {yZoom !== 1 ? `${yZoom}×` : "1×"}
                      </span>

                      {/* 슬라이더 — writing-mode로 세로 방향 */}
                      <input
                        type="range"
                        min={1}
                        max={20}
                        step={0.5}
                        value={yZoom}
                        onChange={(e) => setYZoom(Number(e.target.value))}
                        aria-label="세로 비율 확대"
                        style={{
                          writingMode: "vertical-lr" as any,
                          direction: "rtl" as any,
                          height: 652,
                          width: 20,
                          margin: 0,
                          accentColor: COLORS.amber,
                          cursor: "pointer",
                        }}
                      />

                      {/* 원복 버튼 */}
                      <button
                        onClick={() => setYZoom(1)}
                        disabled={yZoom === 1}
                        style={{
                          fontSize: 9,
                          padding: "2px 5px",
                          borderRadius: 4,
                          border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "#d0d0d0"}`,
                          background: "none",
                          color: yZoom !== 1 ? tickColor : "transparent",
                          borderColor: yZoom !== 1
                            ? (isDark ? "rgba(255,255,255,0.15)" : "#d0d0d0")
                            : "transparent",
                          cursor: yZoom !== 1 ? "pointer" : "default",
                          whiteSpace: "nowrap",
                          lineHeight: 1.4,
                        }}
                      >
                        원복
                      </button>
                    </div>
                    </div>{/* end chart+slider flex */}
                    </div>{/* end pan wrapper */}

                    {/* 클릭된 날짜 데이터 패널 */}
                    {clickedDateData && (
                      <div
                        style={{
                          marginTop: 8,
                          borderRadius: 8,
                          border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "#e0e0e0"}`,
                          backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "#fafafa",
                          padding: "10px 14px",
                          fontSize: 12,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 8,
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 600,
                              color: isDark ? "#e0e0e0" : "#333",
                            }}
                          >
                            {(() => {
                              const parts = clickedDateData.date.split("-");
                              return `${parseInt(parts[1]!)}월 ${parseInt(parts[2]!)}일 거래대금`;
                            })()}
                          </span>
                          <button
                            onClick={() => setClickedDateData(null)}
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              color: tickColor,
                              fontSize: 14,
                              lineHeight: 1,
                              padding: "0 2px",
                            }}
                            aria-label="닫기"
                          >
                            ✕
                          </button>
                        </div>
                        <div
                          style={{
                            columns: clickedDateData.entries.length <= 10 ? 2 : clickedDateData.entries.length <= 20 ? 4 : 5,
                            columnGap: 16,
                          }}
                        >
                          {clickedDateData.entries.map((e, idx) => {
                            const item = periodChartData.find(
                              (p) => p.ticker === e.ticker,
                            );
                            return (
                              <div
                                key={e.ticker}
                                style={{
                                  breakInside: "avoid",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  gap: 8,
                                  marginBottom: 4,
                                }}
                              >
                                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                  <span
                                    style={{
                                      fontSize: 10,
                                      color: tickColor,
                                      minWidth: 14,
                                      textAlign: "right",
                                    }}
                                  >
                                    {idx + 1}
                                  </span>
                                  <span
                                    style={{
                                      display: "inline-block",
                                      width: 8,
                                      height: 8,
                                      borderRadius: "50%",
                                      backgroundColor: e.color,
                                      flexShrink: 0,
                                    }}
                                  />
                                  <span style={{ color: isDark ? "#d0d0d0" : "#444", fontWeight: 500 }}>
                                    {item ? item.displayLabel : e.ticker}
                                  </span>
                                </span>
                                <span style={{ color: isDark ? "#e0e0e0" : "#111", fontWeight: 600 }}>
                                  {formatTradingValue(e.value, currency)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {!clickedDateData && (
                      <div
                        style={{
                          textAlign: "center",
                          fontSize: 10,
                          color: tickColor,
                          opacity: 0.6,
                          marginTop: 4,
                        }}
                      >
                        차트를 클릭하면 해당 날짜의 거래대금을 볼 수 있습니다
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            )}

            {/* Detail rows — ticker only */}
            {!periodLoading && periodChartData.length > 0 && (
              <div className="mt-4 grid gap-1.5">
                {periodChartData.map((it) => (
                  <div
                    key={it.ticker}
                    className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[12px] py-1.5 px-2 rounded"
                    style={{
                      backgroundColor: isDark
                        ? "rgba(255,255,255,0.03)"
                        : "rgba(0,0,0,0.02)",
                    }}
                  >
                    <span
                      className="font-mono text-[11px] shrink-0 w-6 text-center font-semibold"
                      style={{ color: COLORS.amber }}
                    >
                      {it.rank}
                    </span>
                    <span
                      className={`font-semibold shrink-0 text-[12px] ${
                        currency === "KRW" ? "" : "font-mono"
                      }`}
                    >
                      {currency === "KRW" ? it.name : it.ticker}
                    </span>
                    <span className="text-muted-foreground shrink-0">
                      등장 <b>{it.daysInTop}</b>일
                    </span>
                    <span className="text-muted-foreground shrink-0">
                      평균 <b>{it.avgRank.toFixed(1)}</b>위
                    </span>
                    <span className="text-muted-foreground shrink-0">
                      최고 <b>{it.bestRank}</b>위
                    </span>
                    <span className="ml-auto text-muted-foreground shrink-0">
                      총{" "}
                      <b>
                        {formatTradingValue(it.totalTradingValue, currency)}
                      </b>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground"
          style={{
            borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
          }}
        >
          <span className="shrink-0">Source:</span>
          <span
            className="font-semibold rounded px-2 py-0.5"
            style={{
              backgroundColor: isDark
                ? "rgba(255,255,255,0.1)"
                : "rgb(229, 231, 235)",
              color: isDark ? "#c8c9cc" : "rgb(75, 85, 99)",
            }}
          >
            {cfg.source}
          </span>
          {(cacheRefreshedAt || lastRefreshed) && (
            <span>· Yahoo 데이터 갱신: {cacheRefreshedAt ?? lastRefreshed}</span>
          )}
          <span className="ml-auto opacity-70">
            거래대금이 몰리는 종목 = 그날 시장의 관심도 높은 종목 · 색상 한국 관례 (상승 빨강 / 하락 파랑)
          </span>
        </div>
      </div>
    </div>
  );
}
