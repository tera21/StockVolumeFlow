export function formatKrw(value: number | undefined | null): string {
  if (value === null || value === undefined) return "--";
  if (value >= 1_000_000_000_000) {
    return `${(value / 1_000_000_000_000).toFixed(2)}조원`;
  }
  if (value >= 100_000_000) {
    return `${(value / 100_000_000).toLocaleString('en-US', { maximumFractionDigits: 0 })}억원`;
  }
  if (value >= 10_000) {
    return `${(value / 10_000).toLocaleString('en-US', { maximumFractionDigits: 0 })}만원`;
  }
  return `${value.toLocaleString('en-US')}원`;
}

export function formatPercent(value: number | undefined | null): string {
  if (value === null || value === undefined) return "--";
  return `${(value * 100).toFixed(1)}%`;
}

export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatVolume(value: number | undefined | null): string {
  if (value === null || value === undefined) return "--";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
