# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

No test suite is configured.

## Architecture

This is a Next.js 16 (App Router) + TypeScript delivery route optimization app with two user roles: **managers** (planners) and **drivers**.

### Two separate Supabase databases
- Management DB: `NEXT_PUBLIC_SUPABASE_URL` — stores deliveries, clients, routes, zones
- Driver DB: `NEXT_PUBLIC_SUPABASE_DRIVER_URL` — driver location tracking (`lib/supabase-driver.ts`)

### Route optimization pipeline
`/api/optimize` orchestrates the full flow:
1. Geocode any stops missing coordinates (Nominatim via `lib/services/geocode.nominatim.ts`)
2. Build duration/distance matrix (OpenRouteService via `lib/services/matrix.ors.ts`)
3. Run VRPTW solver (`lib/optimizer/vrptw.ts`) — greedy heuristic, single vehicle
4. Fetch turn-by-turn polylines per segment (`lib/services/directions.ors.ts`)
5. Compute per-stop ETAs (`lib/utils/eta.ts`)

### Frontend API layer
`lib/api.ts` contains all frontend→API wrappers. Components call these functions rather than `fetch` directly.

### Map components use dynamic imports
MapLibre GL components (`components/MapView.tsx`, `components/HistoryMapView.tsx`) are dynamically imported with `{ ssr: false }` to avoid SSR issues.

### Authentication
Supabase Auth with middleware at `src/middleware.ts`. Driver access is gated by `ALLOWED_DRIVER_EMAILS` env var. Auth utilities split between `lib/supabase-auth/client.ts` and `lib/supabase-auth/server.ts`.

### Key types
All shared types in `lib/types.ts`: `Stop`, `OptimizeRequest`, `OptimizeResponse`, `OptimizedStop`, `MatrixResult`, `ErrorResponse`.

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SUPABASE_DRIVER_URL
NEXT_PUBLIC_SUPABASE_DRIVER_ANON_KEY
NOMINATIM_URL
ORS_API_KEY
ALLOWED_DRIVER_EMAILS
```
