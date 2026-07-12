# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### `artifacts/kospi-flow` — 주식 자금 흐름 (KOSPI + US)
Daily top-10 stocks by trading value (거래대금). Two markets selectable via toggle: KOSPI (Korean) and 미국주식 (US).

- **Frontend**: React + Vite + Recharts at preview path `/`. Single page (`pages/dashboard.tsx`):
  - Market toggle (KOSPI / 미국주식)
  - Horizontal date scroller (drag-to-pan, click chips, chevron buttons) — clicking a chip instantly switches the displayed top 10
  - 4 KPI cards + top-10 horizontal bar chart only (donut/trend/sector/table all removed)
  - Korean conventions: Red = 상승, Blue = 하락
- **Backend**: Express routes under `artifacts/api-server/src/routes/kospi/` (path is legacy; serves both markets via `?market=kospi|us` query param).
- **Data source**: Yahoo Finance (`query1.finance.yahoo.com`).
  - KOSPI tickers use `.KS` suffix (KRW)
  - US tickers use no suffix (USD)
  - KRX 정보데이터시스템 (data.krx.co.kr) is bot-blocked from this network — Yahoo Finance is used for both markets. Trading value is computed as `close × volume`.
- **Ticker universes**:
  - `artifacts/api-server/src/lib/krx/tickers.ts` — ~150 KOSPI names with Korean name + sector
  - `artifacts/api-server/src/lib/krx/tickers-us.ts` — ~150 S&P 500 / Nasdaq megacaps with English name + sector
- **Per-market caching**: 5-minute in-memory snapshot per market in `artifacts/api-server/src/lib/krx/cache.ts`.
- **API endpoints** (`/api/kospi/*`, all accept `?market=kospi|us`): `top-trading-value`, `market-summary`, `available-dates`. Response schemas (including `market` and `currency` fields) validated with `@workspace/api-zod`.
