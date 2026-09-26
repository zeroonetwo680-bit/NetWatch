# FULL PROJECT PROMPT — NetWatch | منصة إدارة ومراقبة الشبكة (Next.js Full-Stack + SQLite + Drizzle + MikroTik)

> **How to use this file**
> Copy everything below the horizontal rule into your AI coding assistant (Cursor / Windsurf / Claude Code / ChatGPT) as the complete project prompt.
> It merges two sources:
> 1. The architecture decision for NetWatch: a single Next.js full-stack app (no separate backend) with SQLite + Drizzle ORM, a network-adapter layer that talks to MikroTik RouterOS, and a background poller that samples traffic and aggregates it into daily/monthly usage.
> 2. The frontend strategy of the reference project: typed API modules, Zod contracts, TanStack Query hooks, thin App-Router pages, shadcn/ui design system, Vitest workflow tests, skeleton-first loading and deliberate empty/error states.
>
> Do not start coding until you have read this entire document. Follow the phases in order. Every phase gate must pass before moving on.

---

# 1. Role & Mission

You are building **"NetWatch — مراقبة الشبكة"** — a modern, Arabic-first (RTL) full-stack web application for **managing and monitoring a local network** (home, office, or small ISP).

The product must feel like a real network operations dashboard: live device list with online/offline status, real-time download/upload speed per device and for the whole network, per-device speed limits actually enforced on the router, daily/monthly consumption reports with charts, device discovery, user management (each user sees only their own devices), and system settings.

**Hard constraints for v1:**

- **One project only**: Next.js App Router is the frontend AND the backend (Route Handlers + a background poller). No Express, no separate API server.
- **SQLite via Drizzle ORM** is the single source of truth. No Postgres/Mongo/Prisma.
- **The UI never touches the database or the router directly.** Client components fetch only through typed TanStack Query hooks that call `/api/*` Route Handlers; Route Handlers call services; services call Drizzle and the network adapter.
- **Real bandwidth control happens on the router, not in Node.** NetWatch is the brain: it stores intent (speed limits, blocks) and a **network adapter** applies it to MikroTik RouterOS (queues/firewall).
- **Simulator-first development**: exactly like a mock-first API, the network layer ships with two interchangeable adapters — `mikrotik` (real RouterOS API) and `simulated` (in-memory virtual network with realistic fluctuating traffic). Switching is **an environment-flag change only** (`NETWORK_MODE=simulated` → `mikrotik`). No service, route handler, or UI component is rewritten.

```txt
UI (React / TanStack Query hooks)
 ↓
/api/* Route Handlers  (auth guard + Zod in/out)
 ↓
Services  (devices, usage, limits, users)
 ↓                     ↓
Drizzle ORM          NetworkAdapter  (simulated ←→ mikrotik)
 ↓                     ↓
SQLite               RouterOS API → Queues/Firewall → Devices
 ↑
Background Poller (instrumentation.ts): sample counters → traffic_samples → usage_daily/usage_monthly → prune old samples
```

---

# 2. Technology Stack (exact)

| Category | Package | Notes |
|---|---|---|
| Framework | `next` **15+** (App Router) | Latest stable; full-stack; `src/` dir |
| Language | `typescript` ^5.x | `strict: true`, no ignored build errors |
| UI | `react` 19.x, `react-dom` 19.x | |
| Styles | `tailwindcss` ^4.x + `@tailwindcss/postcss` + `tw-animate-css` | CSS-first via `app/globals.css` |
| UI kit | shadcn/ui (`components.json`: style `new-york`, `rsc: true`, `tsx: true`, base color `neutral`, css variables `true`) + `@radix-ui/react-*` primitives | Install only what's used |
| Icons | `lucide-react` | |
| Data fetching | `@tanstack/react-query` ^5 + `@tanstack/react-query-devtools` | All client fetching |
| Validation | `zod` ^3.24 | Every API input/output contract |
| Forms | `react-hook-form` ^7 + `@hookform/resolvers` | Login, device rename, speed-limit, settings, users |
| Charts | `recharts` | Realtime line, daily/monthly bars, top devices |
| Database | `better-sqlite3` + `drizzle-orm` (+ `drizzle-kit` dev) | WAL mode, migrations in `drizzle/` |
| Router integration | `routeros-api` (RouterOS binary API) | Used ONLY inside `lib/network/mikrotik.ts` (node-routeros is discontinued) |
| Server-only guard | `server-only` | Imported by every module under `src/server/**` |

| Auth | `jose` (JWT session cookie) + `bcryptjs` (password hash) | httpOnly cookie, no next-auth |
| Theme | `next-themes` | Dark/light/system |
| Toasts | `sonner` | Arabic messages |
| Dates | `date-fns` | Ranges, formatting |
| Misc | `clsx`, `tailwind-merge`, `class-variance-authority` | |
| HTTP | native `fetch` | |
| Test | `vitest` ^3 + `@types/node` | Lib/workflow suite (node env) |
| Package manager | `pnpm` | |

**Do NOT use:** Express, NestJS, ASP.NET, MongoDB, PostgreSQL, MySQL, Prisma, Firebase, Supabase, tRPC, next-auth, any CSS framework other than Tailwind, any separate frontend/backend project.

## 2.1 Project setup (run first)

```bash
pnpm create next-app@latest . \
  --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm
pnpm dlx shadcn@latest init        # style: new-york, base color: neutral, css variables: true
pnpm dlx shadcn@latest add button card badge breadcrumb skeleton tabs accordion dialog alert-dialog sheet
pnpm dlx shadcn@latest add progress checkbox radio-group select input label form separator dropdown-menu table switch avatar alert tooltip pagination
pnpm add drizzle-orm better-sqlite3 zod @tanstack/react-query @tanstack/react-query-devtools
pnpm add recharts lucide-react next-themes sonner date-fns bcryptjs jose routeros-api
pnpm add react-hook-form @hookform/resolvers
pnpm add -D drizzle-kit @types/better-sqlite3 @types/bcryptjs vitest @types/node
```

## 2.2 `package.json` scripts

```json
{
  "scripts": {
    "dev": "next dev -H 0.0.0.0",
    "build": "next build",
    "start": "next start -H 0.0.0.0",
    "lint": "eslint .",
    "test": "vitest run",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio",
    "db:seed": "tsx src/db/seed.ts"
  }
}
```

## 2.3 `tsconfig.json` paths

```json
{
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./src/*"],
      "@/components/*": ["./src/components/*"],
      "@/lib/*": ["./src/lib/*"],
      "@/db/*": ["./src/db/*"],
      "@/server/*": ["./src/server/*"],
      "@/hooks/*": ["./src/hooks/*"],
      "@/types/*": ["./src/types/*"]
    }
  }
}
```

## 2.4 `next.config.ts`

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 & routeros-api are native/node-only — never bundle them.
  serverExternalPackages: ["better-sqlite3", "routeros-api"],
  images: { unoptimized: true },
  // Preview/tunnel hosts must be accepted by the dev server:
  allowedDevOrigins: ["*.e2b.app"],
  // Do NOT set typescript.ignoreBuildErrors or eslint.ignoreDuringBuilds.
};

export default nextConfig;
```

## 2.5 PostCSS + Tailwind 4

`postcss.config.mjs`:

```js
const config = { plugins: { "@tailwindcss/postcss": {} } };
export default config;
```

`app/globals.css` starts with:

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --font-sans: var(--font-cairo), Tahoma, Arial, ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-jetbrains), ui-monospace, SFMono-Regular, Menlo, monospace;
  /* shadcn color tokens mapped from :root / .dark CSS variables */
}
```

---

# 3. Environment Configuration

```dotenv
# The network-layer mode switch — the exact analogue of a mock-first API.
# simulated: in-memory virtual network (development, demos, tests)
# mikrotik:  real RouterOS API connection
NETWORK_MODE=simulated

# MikroTik connection (used only when NETWORK_MODE=mikrotik)
MIKROTIK_HOST=192.168.88.1
MIKROTIK_PORT=8728
MIKROTIK_USER=admin
MIKROTIK_PASSWORD=

# Poller
POLL_INTERVAL_MS=10000        # how often counters are sampled
SAMPLE_RETENTION_DAYS=7       # raw traffic_samples older than this are pruned
SIM_DEVICE_COUNT=10           # simulated network size

# Database
DATABASE_PATH=./data/netwatch.db

# Auth
SESSION_SECRET=change-me-32-chars-minimum-long-secret
SESSION_TTL_HOURS=24
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123       # seeded on first run — must be changed in production
DEMO_USER_USERNAME=user       # seeded only in simulated mode
DEMO_USER_PASSWORD=user123
```

`src/lib/config.ts` (server-safe, zod-validated at boot; missing required values fail fast with a clear Arabic+English error):

```ts
export type NetworkMode = "simulated" | "mikrotik";

export const appConfig = {
  networkMode: (process.env.NETWORK_MODE === "mikrotik" ? "mikrotik" : "simulated") as NetworkMode,
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 10_000),
  sampleRetentionDays: Number(process.env.SAMPLE_RETENTION_DAYS ?? 7),
  simDeviceCount: Number(process.env.SIM_DEVICE_COUNT ?? 10),
  databasePath: process.env.DATABASE_PATH ?? "./data/netwatch.db",
  session: {
    secret: process.env.SESSION_SECRET ?? "dev-only-insecure-secret-change-me",
    ttlHours: Number(process.env.SESSION_TTL_HOURS ?? 24),
    cookieName: "netwatch_session",
  },
  mikrotik: {
    host: process.env.MIKROTIK_HOST ?? "192.168.88.1",
    port: Number(process.env.MIKROTIK_PORT ?? 8728),
    user: process.env.MIKROTIK_USER ?? "admin",
    password: process.env.MIKROTIK_PASSWORD ?? "",
  },
} as const;
```

Never expose router credentials or `SESSION_SECRET` through `NEXT_PUBLIC_*`.

---

# 4. Complete File Structure (target)

```txt
NetWatch/
├── .env.example
├── .env.local                       # gitignored
├── .gitignore                       # includes /data
├── components.json                  # shadcn config
├── drizzle.config.ts
├── drizzle/                         # generated SQL migrations (committed)
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── PROJECT_PROMPT.md                # this file
├── tsconfig.json
├── vitest.config.ts
│
├── data/                            # gitignored — netwatch.db lives here
│
├── src/
│   ├── instrumentation.ts           # register(): starts the background poller (nodejs runtime)
│   ├── proxy.ts                     # Next.js 16 proxy (was middleware): session guard for pages + /api
│   │
│   ├── app/
│   │   ├── globals.css
│   │   ├── api/                     # ← all route handlers live here (src/app/api)
│   │   ├── layout.tsx               # <html lang="ar" dir="rtl"> + providers
│   │   ├── loading.tsx / error.tsx / not-found.tsx
│   │   ├── login/page.tsx
│   │   └── (app)/                   # authenticated shell (AppSidebar + Topbar)
│   │       ├── layout.tsx
│   │       ├── dashboard/page.tsx
│   │       ├── devices/
│   │       │   ├── page.tsx
│   │       │   └── [id]/page.tsx    # tabs: نظرة عامة / السرعة / الاستهلاك
│   │       ├── usage/page.tsx
│   │       ├── speed-limits/page.tsx
│   │       ├── settings/page.tsx
│   │       └── admin/
│   │           └── users/page.tsx   # admin only
│   │
│   ├── app/api/
│   │   ├── auth/{login,logout,me}/route.ts
│   │   ├── devices/route.ts                       # GET list (paged/filtered) + POST discover
│   │   ├── devices/[id]/route.ts                  # GET / PATCH / DELETE
│   │   ├── devices/[id]/assign/route.ts           # POST (admin)
│   │   ├── devices/[id]/block/route.ts            # POST { blocked: boolean } (admin)
│   │   ├── devices/[id]/speed-limit/route.ts      # GET / PUT
│   │   ├── devices/[id]/usage/route.ts            # GET ?granularity=daily|monthly&from&to
│   │   ├── devices/[id]/traffic/route.ts          # GET ?minutes=60 (raw samples)
│   │   ├── traffic/live/route.ts                  # GET current rates per device + totals
│   │   ├── usage/summary/route.ts                 # GET today/month/online counters
│   │   ├── users/route.ts + users/[id]/route.ts   # admin CRUD
│   │   ├── system/status/route.ts                 # GET network mode, router link, last poll
│   │   └── settings/route.ts                      # GET / PATCH (admin)
│   │
│   ├── components/
│   │   ├── layout/  (app-sidebar, topbar, mobile-nav, theme-toggle, user-menu, side-nav)
│   │   ├── dashboard/ (summary-cards, realtime-chart, top-devices-table, network-status-card)
│   │   ├── devices/ (devices-table, device-row-actions, device-search, status-badge,
│   │   │            assign-user-dialog, discover-button, device-form-dialog, delete-device-dialog)
│   │   ├── device/  (device-overview, device-realtime-chart, speed-limit-form,
│   │   │            usage-charts, block-toggle)
│   │   ├── usage/   (usage-summary-cards, usage-range-picker, daily-chart, monthly-chart,
│   │   │            usage-table, export-csv-button)
│   │   ├── limits/  (limits-table, limit-switch)
│   │   ├── users/   (users-table, user-form-dialog, delete-user-dialog)
│   │   ├── settings/ (system-status-panel, poller-settings-form, mikrotik-settings-form)
│   │   ├── auth/    (login-form)
│   │   ├── shared/  (page-header, page-container, empty-state, api-error, stat-card,
│   │   │            confirm-dialog, data-rate (formatted Mbps), bytes (formatted GB/MB))
│   │   └── ui/      # shadcn components only
│   │
│   ├── db/
│   │   ├── schema.ts                # ALL Drizzle tables (single source of truth)
│   │   ├── index.ts                 # better-sqlite3 + drizzle, WAL, auto-migrate, globalThis singleton
│   │   └── seed.ts                  # admin (+ demo user in simulated mode), default settings
│   │
│   ├── server/                      # "server-only" — the actual backend
│   │   ├── auth.ts                  # hashPassword, verifyPassword, createSession, readSession, requireUser/requireAdmin
│   │   ├── http.ts                  # ok()/fail() helpers → ApiProblem JSON, zod parse wrapper
│   │   └── services/
│   │       ├── devices.ts           # list/get/create(upsert)/rename/assign/delete/block + ownership checks
│   │       ├── usage.ts             # summary, per-device daily/monthly series, raw samples window
│   │       ├── speed-limits.ts      # get/put/toggle → DB intent + adapter apply/remove
│   │       ├── users.ts             # admin CRUD
│   │       ├── system.ts            # poller status, adapter status, settings get/patch
│   │       └── poller.ts            # THE worker loop: poll → upsert devices → deltas → samples → rollups → enforce limits → prune
│   │
│   ├── lib/
│   │   ├── config.ts                # env → appConfig (zod-validated)
│   │   ├── utils.ts                 # cn()
│   │   ├── format.ts                # formatBytes, formatRate, formatDuration (Arabic-friendly, pure)
│   │   ├── usage/
│   │   │   └── calculator.ts        # PURE: computeDelta (counter-reset safe), rollup math, range builders
│   │   ├── network/
│   │   │   ├── types.ts             # NetworkAdapter interface + shared DTOs
│   │   │   ├── index.ts             # getNetworkAdapter() factory (globalThis singleton)
│   │   │   ├── simulator.ts         # in-memory virtual network
│   │   │   └── mikrotik.ts          # routeros-api: leases/ARP discovery, counters, simple-queue, firewall block
│   │   ├── query-client.tsx         # "use client" QueryProvider
│   │   └── api/                     # browser-side data layer
│   │       ├── client.ts            # apiFetch: zod-validated responses, ApiError, ApiProblem parsing
│   │       ├── contracts/           # common.ts, device.ts, usage.ts, auth.ts, user.ts, system.ts
│   │       ├── schemas/             # Zod mirror of every DTO (shared with server via imports)
│   │       └── modules/             # per domain: keys.ts + hooks.ts
│   │           ├── auth/  devices/  traffic/  usage/  speed-limits/  users/  system/
│   │
│   └── types/index.ts               # UI view types
│
├── tests/
│   ├── usage-calculator.test.ts     # pure rollup/delta/format tests
│   ├── simulator.test.ts            # adapter contract tests
│   ├── auth.test.ts                 # hashing + session + role guards
│   ├── db-services.test.ts          # temp-file SQLite: migrate, seed, upsert, rollups, prune
│   ├── helpers/db-test-modules.ts   # dynamic import surface (env set before import)
│   └── stubs/server-only.ts         # stub for the bundler-only guard
│
└── docs/
    └── DEPLOYMENT.md                # single-VPS deployment, MikroTik prerequisites (API enabled, user perms), backup of data/netwatch.db
```

---

# 5. Database Design (Drizzle + SQLite)

## 5.1 ER overview

```txt
User (admin|user)
  │ 1
  │──< Device (mac unique, status online|offline|blocked, userId nullable = "غير مسند")
          │ 1
          │──1 SpeedLimit (downloadMbps, uploadMbps, enabled)
          │ 1
          │──< TrafficSample (raw, short retention)
          │──< UsageDaily    (unique deviceId+date)
          └──< UsageMonthly  (unique deviceId+year+month)
Settings (key/value: poll interval, retention, router config overrides)
```

## 5.2 `src/db/schema.ts` (normative — implement exactly)

```ts
import { sql, relations } from "drizzle-orm";
import { sqliteTable, integer, text, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "user"] }).notNull().default("user"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const devices = sqliteTable("devices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),                      // admin/user editable label
  macAddress: text("mac_address").notNull().unique(), // normalized uppercase AA:BB:CC:DD:EE:FF
  ipAddress: text("ip_address"),
  hostname: text("hostname"),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  status: text("status", { enum: ["online", "offline", "blocked"] }).notNull().default("offline"),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (t) => [index("devices_user_idx").on(t.userId), index("devices_status_idx").on(t.status)]);

export const speedLimits = sqliteTable("speed_limits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  deviceId: integer("device_id").notNull().unique()
    .references(() => devices.id, { onDelete: "cascade" }),
  downloadMbps: real("download_mbps").notNull(),
  uploadMbps: real("upload_mbps").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  appliedAt: integer("applied_at", { mode: "timestamp" }),   // when adapter confirmed application
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const trafficSamples = sqliteTable("traffic_samples", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  deviceId: integer("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
  downloadBytes: integer("download_bytes").notNull(),  // delta during the interval
  uploadBytes: integer("upload_bytes").notNull(),      // delta during the interval
  downloadBps: real("download_bps"),                   // instantaneous bits/s at sample time
  uploadBps: real("upload_bps"),
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
}, (t) => [index("samples_device_time_idx").on(t.deviceId, t.timestamp)]);

export const usageDaily = sqliteTable("usage_daily", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  deviceId: integer("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
  date: text("date").notNull(),                        // "YYYY-MM-DD" (server local time)
  downloadBytes: integer("download_bytes").notNull().default(0),
  uploadBytes: integer("upload_bytes").notNull().default(0),
}, (t) => [uniqueIndex("usage_daily_device_date_uq").on(t.deviceId, t.date)]);

export const usageMonthly = sqliteTable("usage_monthly", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  deviceId: integer("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  month: integer("month").notNull(),                   // 1-12
  downloadBytes: integer("download_bytes").notNull().default(0),
  uploadBytes: integer("upload_bytes").notNull().default(0),
}, (t) => [uniqueIndex("usage_monthly_device_ym_uq").on(t.deviceId, t.year, t.month)]);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});
```

Rules:

- `macAddress` is always normalized (`toUpperCase`, colon-separated) before insert/lookup — MAC is the device identity across IP changes.
- Rollups use `INSERT … ON CONFLICT DO UPDATE SET download_bytes = download_bytes + excluded.download_bytes` (Drizzle `onConflictDoUpdate` with `sql` increment) — idempotent-safe because deltas are inserted once per poll tick.
- Raw `traffic_samples` are **transient**: the poller prunes rows older than `sampleRetentionDays` every tick. Aggregates (`usage_daily`, `usage_monthly`) live forever.
- Migrations: `drizzle-kit generate` output is committed under `drizzle/`; `src/db/index.ts` runs pending migrations automatically at startup (migrator from `drizzle-orm/better-sqlite3/migrator`), then seeds if the `users` table is empty.
- `data/` is gitignored. `src/db/index.ts` creates the parent directory if missing, opens with WAL (`journal_mode = WAL`, `busy_timeout = 5000`, `foreign_keys = ON`), and stores the instance on `globalThis` (HMR-safe).

## 5.3 Volume control (why this design)

100 devices × 12 samples/min × 24h ≈ 1.7M rows/day if raw samples were kept forever — unacceptable for SQLite. Therefore:

```txt
Router/Simulator → current counters → Poller → deltas → traffic_samples (7-day window)
                                                   ↘ usage_daily / usage_monthly (permanent, 1 row per device per day/month)
```

Charts read: realtime → `traffic_samples` (last N minutes), daily → `usage_daily`, monthly → `usage_monthly`. The heavy table is always bounded.

---

# 6. Network Layer (the critical abstraction)

## 6.1 `src/lib/network/types.ts` (normative)

```ts
export type RouterDeviceSnapshot = {
  mac: string;              // normalized uppercase
  ip: string | null;
  hostname: string | null;
  online: boolean;
  rxBytesTotal: number;     // cumulative download counter (may reset on router reboot)
  txBytesTotal: number;     // cumulative upload counter
  rxBps: number | null;     // instantaneous rate if the router provides it
  txBps: number | null;
};

export type AdapterStatus = {
  mode: "simulated" | "mikrotik";
  connected: boolean;
  lastPollAt: string | null;   // ISO
  lastError: string | null;
  deviceCount: number;
};

export interface NetworkAdapter {
  readonly mode: "simulated" | "mikrotik";
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  status(): AdapterStatus;
  discover(): Promise<RouterDeviceSnapshot[]>;          // full device snapshot list
  applySpeedLimit(mac: string, downloadMbps: number, uploadMbps: number): Promise<void>;
  removeSpeedLimit(mac: string): Promise<void>;
  setBlocked(mac: string, blocked: boolean): Promise<void>;
}
```

`src/lib/network/index.ts` — `getNetworkAdapter()` returns a `globalThis` singleton chosen by `appConfig.networkMode`. **No other module may import `mikrotik.ts` or `simulator.ts` directly.**

## 6.2 Simulator adapter (`simulator.ts`)

An in-memory virtual network, deterministic-seed friendly, that behaves like a real router:

- Generates `SIM_DEVICE_COUNT` devices with realistic hostnames (`PC-Ahmed`, `iPhone-Sara`, `TV-Salon`, `Laptop-Mostafa`, `Printer-HP`, `Console-PS5`…), vendor-plausible MACs (stable per device), private IPs `192.168.1.x`.
- Each device has a traffic profile (idle / browsing / streaming / gaming / downloading) that changes over time; per-tick byte deltas fluctuate realistically (streaming ≈ 5–25 Mbps sustained, bursts, quiet hours factor).
- Counters are **monotonic** between polls (so delta math matches production) and occasionally a device goes offline/online.
- `applySpeedLimit` **actually caps** the simulated device's rate at the limit (visible in the UI charts) — proving the full loop works without hardware.
- `setBlocked(mac, true)` drops the device offline and zero-rates it; `false` restores it.
- Small artificial latency (~50–150 ms) per call so loading states are real.
- `status()` reports `connected: true`, `mode: "simulated"`.

## 6.3 MikroTik adapter (`mikrotik.ts`)

Uses `routeros-api` (RouterOS binary API, port 8728):

- `connect()` — login with `appConfig.mikrotik`; reconnect with backoff on failure; `status()` exposes `connected/lastError`.
- `discover()` — merge `/ip/dhcp-server/lease/print` (where `bound`) and `/ip/arp/print` for `mac/ip/hostname`; online state from ARP `valid` flag + lease `active`; cumulative counters from `/interface/print?stats` mapped per device where possible, else per-connection rates from `/queue/simple/print` or `/ip/firewall/connection tracking`. Where RouterOS cannot give a per-device cumulative counter, derive deltas from `rx-bits-per-second/tx-bits-per-second × interval` and document the approximation in code comments.
- `applySpeedLimit` — upsert `/queue/simple/add` with `name=netwatch-<MAC>`, `target=<ip or mac>`, `max-limit=<ul>M/<dl>M` (RouterOS order: upload/download bits).
- `removeSpeedLimit` — remove the matching `netwatch-<MAC>` queue.
- `setBlocked` — upsert/remove a `/ip/firewall/filter` drop rule `comment=netwatch-block-<MAC>` (forward chain, src-address or src-mac).
- Every call is wrapped: timeouts (10 s), typed errors, and on disconnect the poller keeps the DB intact and marks devices `offline` after `2 × poll interval` misses.

## 6.4 Background poller (`src/server/services/poller.ts` + `src/instrumentation.ts`)

`instrumentation.ts`:

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startPoller } = await import("@/server/services/poller");
    startPoller(); // idempotent globalThis singleton — never double-starts under HMR
  }
}
```

Poller tick (every `POLL_INTERVAL_MS`, serialized — a tick never overlaps the previous one):

1. `adapter.discover()` → snapshots.
2. **Upsert devices** by normalized MAC: new MAC → insert (`name` = hostname ?? `جهاز جديد`, `userId = null`, status from snapshot). Existing → update ip/hostname/lastSeenAt/status. Devices unseen for `2 × interval` → `offline`.
3. **Delta math** (`lib/usage/calculator.ts`, pure): `delta = currentTotal − lastTotal`; if `delta < 0` → counter reset → skip this sample for that device (never store negatives). Rates: prefer adapter `rxBps/txBps`, else `delta*8/intervalSeconds`.
4. Insert `traffic_samples` row per online device.
5. Roll up deltas into `usage_daily` (today) and `usage_monthly` (year/month) with `onConflictDoUpdate` increments.
6. **Enforce intent**: for every `speed_limits` row — if `enabled && !appliedAt` → `adapter.applySpeedLimit` then set `appliedAt`; if `!enabled && appliedAt` → `removeSpeedLimit` then clear `appliedAt`. For blocked devices keep the firewall rule applied. Adapter errors are logged to `settings.lastPollError` + console, never crash the loop.
7. **Prune**: delete `traffic_samples` older than `sampleRetentionDays`.
8. Record `lastPollAt` (globalThis + settings table).

The poller is the ONLY writer of `traffic_samples/usage_daily/usage_monthly`. Route handlers never sample.

---

# 7. Authentication & RBAC

- Passwords: `bcryptjs` hash (cost 10). Username lowercase-unique.
- Session: `jose` JWT `{ sub: userId, role, username }` signed with `SESSION_SECRET` (HS256), stored in httpOnly + sameSite=lax cookie `netwatch_session`, `SESSION_TTL_HOURS` expiry. `secure` when behind HTTPS.
- `src/middleware.ts`: redirects unauthenticated page requests to `/login?next=…`; rejects unauthenticated `/api/*` with `401 UNAUTHORIZED` ApiProblem (except `/api/auth/login`); rejects non-admin on `/admin/*` pages and admin-only APIs with `403 FORBIDDEN`.
- Server helpers (`src/server/auth.ts`): `getSession()` (reads cookie via `next/headers`), `requireUser()`, `requireAdmin()`, `canAccessDevice(session, device)` — **admin sees all devices; user sees only `devices.userId === session.sub`**. Every device-scoped route handler MUST call `canAccessDevice` before reading/writing.
- Ownership rules:
  - **admin**: everything, including user CRUD, device assign/block/delete, discovery, settings, all usage.
  - **user**: view own devices, own usage/charts, set/edit speed limits on own devices, rename own devices. No assign/block/delete/users/settings.
- Seeding: on first run insert admin (`ADMIN_USERNAME/ADMIN_PASSWORD`, name `مدير النظام`); in `simulated` mode also insert demo user (`user/user123`, name `مستخدم تجريبي`) and assign ~half of the simulated devices to them on first discovery so both views are demonstrable.

---

# 8. HTTP API Contract

All handlers: parse input with Zod → `422 INVALID_API_REQUEST` (ApiProblem + Arabic `title` + `fields`); auth failures `401/403`; missing rows `404 NOT_FOUND`; adapter/router failures `502 NETWORK_ADAPTER_ERROR` with Arabic detail; success `200` with `{ data: … }` envelope validated by the same Zod schemas the client uses. `src/server/http.ts` provides `ok(data)`, `fail(problem)`, `handle(fn)` wrappers so no route hand-rolls JSON.

| Method | Path | Access | Body/Query | Returns |
|---|---|---|---|---|
| POST | `/api/auth/login` | public | `{ username, password }` | `SessionUserDto` + sets cookie |
| POST | `/api/auth/logout` | auth | – | `{ ok: true }` |
| GET | `/api/auth/me` | auth | – | `SessionUserDto` |
| GET | `/api/devices` | auth | `search, status, userId(admin), page, pageSize, sort` | `PageResult<DeviceDto>` (users: own only) |
| GET | `/api/devices/[id]` | owner/admin | – | `DeviceDetailDto` (device + speedLimit + today/month totals) |
| PATCH | `/api/devices/[id]` | owner/admin | `{ name? }` | `DeviceDto` |
| DELETE | `/api/devices/[id]` | admin | – | `{ ok: true }` (removes queue/block on router too) |
| POST | `/api/devices/[id]/assign` | admin | `{ userId: number \| null }` | `DeviceDto` |
| POST | `/api/devices/[id]/block` | admin | `{ blocked: boolean }` | `DeviceDto` |
| GET | `/api/devices/[id]/speed-limit` | owner/admin | – | `SpeedLimitDto \| null` |
| PUT | `/api/devices/[id]/speed-limit` | owner/admin | `{ downloadMbps>0, uploadMbps>0, enabled }` | `SpeedLimitDto` (DB intent; poller/adapter applies) |
| GET | `/api/devices/[id]/usage` | owner/admin | `granularity=daily\|monthly, from?, to?` | `UsageSeriesDto` |
| GET | `/api/devices/[id]/traffic` | owner/admin | `minutes=60 (max 360)` | `TrafficSampleDto[]` |
| GET | `/api/traffic/live` | auth | – | `LiveTrafficDto[]` (per visible device: current Mbps, status) |
| GET | `/api/usage/summary` | auth | – | `UsageSummaryDto` (today/month in/out, online/total counts, network-wide current rate) |
| GET | `/api/users` | admin | `search, page` | `PageResult<UserDto>` (never includes passwordHash) |
| POST | `/api/users` | admin | `{ name, username, password, role }` | `UserDto` |
| PATCH | `/api/users/[id]` | admin | `{ name?, password?, role? }` | `UserDto` |
| DELETE | `/api/users/[id]` | admin | – | `{ ok: true }` (devices → unassigned, never cascade-delete devices) |
| GET | `/api/system/status` | auth | – | `SystemStatusDto` (mode, connected, lastPollAt, lastError, pollIntervalMs, sampleCount) |
| GET | `/api/settings` | admin | – | `SettingsDto` |
| PATCH | `/api/settings` | admin | `{ pollIntervalMs?, sampleRetentionDays?, mikrotik? }` | `SettingsDto` (poller picks changes up on next tick) |

Discovery: `POST /api/devices?discover=1` (admin) triggers an immediate `adapter.discover()` + upsert cycle and returns the refreshed page — no separate long-running job.

## 8.1 DTOs (`src/lib/api/contracts/`)

```ts
// common.ts
export type PageMeta = { page: number; pageSize: number; total: number; totalPages: number };
export type PageResult<T> = { items: T[]; meta: PageMeta };
export type ApiProblem = { status: number; code: string; title: string; detail?: string; fields?: Record<string, string[]> };

// auth.ts
export type Role = "admin" | "user";
export interface SessionUserDto { id: number; name: string; username: string; role: Role }

// device.ts
export type DeviceStatus = "online" | "offline" | "blocked";
export interface DeviceDto {
  id: number; name: string; macAddress: string; ipAddress: string | null; hostname: string | null;
  status: DeviceStatus; userId: number | null; userName: string | null;
  lastSeenAt: string | null; createdAt: string;
  currentDownloadMbps: number | null; currentUploadMbps: number | null; // from latest sample
  todayBytes: { download: number; upload: number };
}
export interface DeviceDetailDto extends DeviceDto {
  speedLimit: SpeedLimitDto | null;
  monthBytes: { download: number; upload: number };
}
export interface DeviceFilter { search?: string; status?: DeviceStatus; userId?: number; sort?: "name" | "newest" | "usage"; page?: number; pageSize?: number }

// usage.ts
export interface SpeedLimitDto {
  id: number; deviceId: number; downloadMbps: number; uploadMbps: number;
  enabled: boolean; appliedAt: string | null; updatedAt: string;
}
export interface TrafficSampleDto { timestamp: string; downloadBps: number; uploadBps: number; downloadBytes: number; uploadBytes: number }
export interface UsagePointDto { label: string; date: string; downloadBytes: number; uploadBytes: number }
export interface UsageSeriesDto { granularity: "daily" | "monthly"; points: UsagePointDto[]; totals: { downloadBytes: number; uploadBytes: number } }
export interface UsageSummaryDto {
  today: { downloadBytes: number; uploadBytes: number };
  month: { downloadBytes: number; uploadBytes: number };
  onlineDevices: number; totalDevices: number;
  networkDownloadMbps: number; networkUploadMbps: number;
}
export interface LiveTrafficDto { deviceId: number; name: string; status: DeviceStatus; downloadMbps: number; uploadMbps: number }

// user.ts
export interface UserDto { id: number; name: string; username: string; role: Role; deviceCount: number; createdAt: string }

// system.ts
export interface SystemStatusDto {
  networkMode: "simulated" | "mikrotik"; routerConnected: boolean;
  lastPollAt: string | null; lastError: string | null;
  pollIntervalMs: number; sampleCount: number;
}
```

`schemas/` holds a Zod schema for **every** DTO and input; the server validates outgoing payloads in dev (contract enforcement) and the client validates incoming payloads in `apiFetch` (mismatch → `ApiError 502 INVALID_API_RESPONSE` "البيانات غير مطابقة للعقد").

## 8.2 Browser client (`src/lib/api/client.ts`)

- `apiFetch<T>(path, { method, body, query, schema })`: relative `/api` paths only, `credentials: "include"`, JSON, `AbortController` timeout 15 s.
- Non-2xx → parse `ApiProblem` → throw `ApiError { status, code, title, detail, fields }` (Arabic titles surface directly in UI/toasts).
- 2xx → unwrap `{ data }` → `schema.safeParse` → on failure throw `ApiError 502 INVALID_API_RESPONSE`.
- 401 on any query → redirect to `/login` (single place, not per-hook).

---

# 9. TanStack Query Conventions

## 9.1 Provider (`src/lib/query-client.tsx`)

```tsx
"use client";
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000, gcTime: 5 * 60 * 1000,
        retry: 2, retryDelay: (i) => Math.min(1000 * 2 ** i, 15000),
        refetchOnWindowFocus: false, refetchOnReconnect: true, throwOnError: false,
      },
      mutations: { retry: 0, throwOnError: false },
    },
  }));
  return <QueryClientProvider client={queryClient}>{children}<ReactQueryDevtools initialIsOpen={false} /></QueryClientProvider>;
}
```

## 9.2 Keys (`lib/api/modules/*/keys.ts`)

```ts
export const deviceKeys = {
  all: ["devices"] as const,
  lists: () => [...deviceKeys.all, "list"] as const,
  list: (f: DeviceFilter = {}) => [...deviceKeys.lists(), normalizeFilter(f)] as const,
  detail: (id: number) => [...deviceKeys.all, "detail", id] as const,
  speedLimit: (id: number) => [...deviceKeys.detail(id), "speed-limit"] as const,
  usage: (id: number, g: "daily" | "monthly", from?: string, to?: string) => [...deviceKeys.detail(id), "usage", g, from, to] as const,
  traffic: (id: number, minutes: number) => [...deviceKeys.detail(id), "traffic", minutes] as const,
};
export const trafficKeys = { all: ["traffic"] as const, live: () => [...trafficKeys.all, "live"] as const };
export const usageKeys = { all: ["usage"] as const, summary: () => [...usageKeys.all, "summary"] as const };
export const userKeys = { all: ["users"] as const, lists: () => [...userKeys.all, "list"] as const, list: (f = {}) => [...userKeys.lists(), f] as const };
export const systemKeys = { all: ["system"] as const, status: () => [...systemKeys.all, "status"] as const, settings: () => [...systemKeys.all, "settings"] as const };
export const authKeys = { all: ["auth"] as const, me: () => [...authKeys.all, "me"] as const };
```

## 9.3 Hooks rules

- `useDevices(filter)` / `useDevice(id)` / `useLiveTraffic()` / `useUsageSummary()` / `useDeviceTraffic(id, minutes)` — `queryOptions` factories + thin `useQuery` wrappers.
- **Realtime**: `useLiveTraffic`, `useUsageSummary`, dashboard charts, and device-detail traffic use `refetchInterval: 5_000` (visible-tab only via `refetchIntervalInBackground: false`). This is polling, not websockets — acceptable for v1.
- Mutations (`useUpdateSpeedLimit`, `useRenameDevice`, `useAssignDevice`, `useBlockDevice`, `useDiscoverDevices`, `useCreateUser`…) invalidate the exact keys above and toast Arabic success/failure messages (sonner) using `ApiError.title/detail`.
- `keepPreviousData` on every paginated/filtered list.
- Pages are **thin**: server page renders a named client view; the view owns hooks, skeletons, empty and error states (`ApiErrorState` with retry). No component calls `fetch` directly; no fixture/DB import in `components/`.

---

# 10. Pages Specification (Arabic RTL)

Root layout: `<html lang="ar" dir="rtl">`, fonts **Cairo** (`--font-cairo`, body) + **JetBrains Mono** (`--font-jetbrains`, IPs/MACs/numbers/code — always rendered LTR inside RTL), `QueryProvider` → `ThemeProvider(next-themes, class, system)` → `Toaster(sonner, position="top-center", richColors)`, skip-link `#main-content`.

Authenticated shell `(app)/layout.tsx`: right-side `AppSidebar` (RTL start side) with sections: `لوحة التحكم`, `الأجهزة`, `الاستهلاك`, `حدود السرعة`, `الإعدادات`, and for admin `المستخدمون`; `Topbar` with page title, network status pill (متصل/غير متصل + وضع الشبكة: محاكاة/MikroTik), theme toggle, user menu (`تسجيل الخروج`). Collapsible to icons on tablet, `Sheet` drawer on mobile.

## 10.1 `/login`

Centered card: NetWatch logo/name `مراقبة الشبكة`, username + password, `تسجيل الدخول` button, spinner state, Arabic error for invalid credentials (`اسم المستخدم أو كلمة المرور غير صحيحة`), respects `?next=`. No signup (accounts are admin-managed).

## 10.2 `/dashboard`

1. **Summary cards** (`useUsageSummary`, 5 s polling): `الأجهزة المتصلة` (x من y), `التنزيل الآن` (Mbps), `الرفع الآن` (Mbps), `استهلاك اليوم` (down/up formatted), `استهلاك الشهر`.
2. **Realtime chart** (Recharts area/line, last 30 min from `traffic_samples` aggregated network-wide, 5 s polling): two series تنزيل/رفع in Mbps, LTR plot inside RTL card, Arabic legend/tooltip, `الوقت` axis HH:mm.
3. **Top devices** (`useLiveTraffic`): أعلى 5 أجهزة استهلاكًا الآن — name, status badge, current Mbps, mini progress bar vs fastest.
4. **Network status card** (`useSystemStatus`): mode (محاكاة/MikroTik), router connection, `آخر فحص` relative time, poll interval, last error (if any) as destructive alert.
All sections have skeletons and empty states (`لا توجد أجهزة بعد — نفّذ اكتشاف الأجهزة`).

## 10.3 `/devices`

- Toolbar: debounced search (300 ms) over name/hostname/IP/MAC, status filter select (`الكل/متصل/غير متصل/محظور`), sort, page size; admin: `اكتشاف الأجهزة` button (POST discover → toast `تم اكتشاف N جهاز جديد`), row action `إسناد إلى مستخدم` (dialog with user select incl. `غير مسند`).
- Table (shadcn Table): الجهاز (name + hostname), MAC (mono, LTR), IP (mono, LTR), المالك (admin only), الحالة (badge: متصل green / غير متصل muted / محظور red — icon + text, never color alone), السرعة الآن (↓/↑ Mbps), استهلاك اليوم, إجراءات (dropdown: `التفاصيل`, `إعادة تسمية`, admin: `إسناد`, `حظر/إلغاء حظر`, `حذف` with AlertDialog).
- Pagination footer `صفحة X من Y — N جهاز`; `keepPreviousData`; skeleton rows; empty state per filter.
- Users see only their devices; the owner column is hidden for them.

## 10.4 `/devices/[id]`

Header: device name (inline rename for owner/admin), status badge, MAC/IP mono chips, owner (admin), `آخر ظهور`. Tabs:

1. **نظرة عامة**: realtime chart for this device (last 60 min, 5 s polling) + info cards (today down/up, month down/up, first seen).
2. **السرعة** (speed limit): form (react-hook-form + zod) `حد التنزيل (ميجابت/ث)` / `حد الرفع (ميجابت/ث)` / `تفعيل الحد` switch; current applied state badge (`مُطبَّق على الراوتر` / `بانتظار التطبيق` / `غير مفعّل`); save → PUT → toast; explains in helper text that enforcement happens on the router at the next poll.
3. **الاستهلاك**: granularity toggle (يومي/شهري) + range picker (last 7/30 days, this year), stacked bars download vs upload, totals card, per-point table.
Admin extras in header dropdown: إسناد / حظر / حذف. Non-owner visit → 404 page (never 403 leak).

## 10.5 `/usage` (reports)

- Scope: network-wide (admin) or own devices (user).
- Range picker + granularity; stacked bar chart of all visible devices or per-day totals; totals cards (إجمالي التنزيل/الرفع للفترة).
- Table: لكل جهاز — name, download, upload, total, % share (progress bar).
- `تصدير CSV` button (client-generated, Arabic-friendly with BOM, columns: الجهاز,التاريخ,تنزيل (بايت),رفع (بايت)).

## 10.6 `/speed-limits`

All visible devices with their limits in one table: device, download Mbps, upload Mbps, enabled switch (instant optimistic toggle → PUT), applied state, `بدون حد` for unset (inline `إضافة حد` opens the same form dialog). Batch view must stay correct after poller applies (appliedAt refresh).

## 10.7 `/settings`

- Everyone: read-only system status panel (mode, connection, last poll, samples stored, DB path) + `تغيير كلمة المرور` form.
- Admin only: poller settings (interval seconds 5–300, retention days 1–90) and MikroTik connection form (host/port/user/password — write-only password field, `اختبار الاتصال` button hitting `/api/system/status?test=1`), warning banner when `NETWORK_MODE=simulated` (`أنت في وضع المحاكاة — لا يتم التحكم في راوتر حقيقي`).

## 10.8 `/admin/users` (admin only)

Users table: الاسم, اسم المستخدم, الدور (badge مدير/مستخدم), عدد الأجهزة, تاريخ الإنشاء, إجراءات (تعديل, تغيير كلمة المرور, حذف مع تأكيد — أجهزة المستخدم تصبح `غير مسندة`). `إضافة مستخدم` dialog with role select. Middleware + API double-guard.

## 10.9 Global states

`app/loading.tsx` skeleton, `app/error.tsx` (`"use client"`, Arabic title `حدث خطأ غير متوقع`, retry + `العودة للرئيسية`), `app/not-found.tsx` (`الصفحة غير موجودة`), `/login` for unauthenticated, 404 for unauthorized device ids.

---

# 11. Design System

- shadcn/ui `new-york`, `neutral` base, CSS variables, consistent radius; primary = network teal/blue (`#0B6E99`-ish, AA contrast); semantic tokens `success` (online), `destructive` (blocked/errors), `warning` (adapter degraded), `muted` (offline).
- Dark mode first-class: charts re-color via CSS variables (grid lines, tooltips), status badges keep contrast, verify both themes for every page.
- RTL rules: logical utilities (`ps/pe/ms/me`, `text-start/end`, `start/end`), sidebar on the start (right) side, chevrons mirrored, tables read right-to-left, **but** MAC/IP/numbers/chart plots/code stay LTR (`dir="ltr"` islands with mono font). Recharts containers get `dir="ltr"` with Arabic labels.
- Numbers: bytes formatted by `formatBytes` (بايت/كيلوبايت/ميجابايت/جيجابايت, 1 decimal) and rates by `formatRate` (Mbps, 1–2 decimals) — one implementation in `lib/format.ts`, used everywhere (no duplicated formatting).
- Responsive breakpoints tested: 360, 390, 768, 1024, 1440. Tables become card lists under `md`.
- No heavy gradients/giant text; motion limited to shadcn defaults + chart transitions.

# 12. Accessibility & Performance

- Real buttons/links only, visible focus rings, `aria-label` on icon-only buttons, `aria-live="polite"` on realtime stat regions (throttled — update text at most every 5 s), dialogs with proper focus return, forms with labels + `aria-invalid` + Arabic error text, `role="alert"` on ApiErrorState, skip link, keyboard-operable tables/dropdowns/tabs.
- Contrast ≥ AA in both themes; status = icon + text always.
- Server Components for shells; `"use client"` only where hooks/interaction exist; charts lazy via `next/dynamic` (no SSR) to avoid hydration cost; polling pauses on hidden tabs; SQLite indexes per §5.2; list endpoints always paginated (max pageSize 100).

# 13. Testing Strategy (Vitest, node environment)

`vitest.config.ts` with `@` alias, `environment: "node"`, exclude `.next`.

1. `usage-calculator.test.ts` — pure: `computeDelta` (normal, counter reset → null, zero), rollup increments, day/month key builders, `formatBytes/formatRate` edge cases (0, 1023, TB-scale, Arabic labels).
2. `simulator.test.ts` — adapter contract: `discover()` returns N devices with unique normalized MACs and monotonic counters across two polls; deltas > 0; `applySpeedLimit` caps subsequent rates below the limit; `setBlocked(true)` → offline + zero rates; `status()` shape.
3. `auth.test.ts` — hash/verify roundtrip + wrong password; JWT create/read roundtrip + expiry + tamper rejection; `canAccessDevice` matrix (admin-all, user-own, user-other → false).
4. `db-services.test.ts` — temp-file DB (unique path per run): migrations run twice safely; seed creates admin once; device upsert by MAC is idempotent (no duplicate on re-poll); usage rollup increments on conflict; retention prune removes only old samples; deleting a user sets devices `userId = null`.

`pnpm test` must be green before Phase 10 completes. Route-handler smoke tests are optional (services are the tested seam).

# 14. Build Phases (follow in order, gate each)

**Phase 1 — Scaffold + RTL shell.** Next app in repo root, pnpm, Tailwind 4, shadcn init + components, fonts, providers (Query/Theme/Toaster), `globals.css` tokens, `.env.example`, configs, `loading/error/not-found`. *Gate: `pnpm dev` renders an RTL Arabic shell with dark toggle; `pnpm lint` clean.*

**Phase 2 — Database + config.** `db/schema.ts` exactly as §5.2, `drizzle.config.ts`, generate + commit migrations, `db/index.ts` (WAL, auto-migrate, singleton), `lib/config.ts`, seed script (admin + demo user + default settings), `data/` gitignored. *Gate: fresh clone → `pnpm dev` auto-creates and migrates the DB and seeds admin; `db-services.test.ts` migrate/seed parts pass.*

**Phase 3 — Network layer.** `types.ts`, simulator (full behavior §6.2), mikrotik adapter (§6.3, may be untestable without hardware — code must compile and fail gracefully), factory + singleton. *Gate: `simulator.test.ts` green.*

**Phase 4 — Poller.** `instrumentation.ts` + `services/poller.ts` implementing §6.4 exactly (upsert, deltas, samples, rollups, enforcement, prune, no overlap, crash-proof tick). *Gate: with NETWORK_MODE=simulated, after 1 minute of `pnpm dev` the DB has devices + samples + today's rollups; counters reset & negative deltas handled (`usage-calculator.test.ts` green).*

**Phase 5 — Auth.** bcrypt + jose session, middleware, `/api/auth/*`, login page + form, `(app)` shell with sidebar/topbar/user-menu, role guards. *Gate: login/logout works; `/devices` redirects when logged out; admin vs user route access enforced; `auth.test.ts` green.*

**Phase 6 — API routes + browser data layer.** All §8 routes with Zod in/out + ApiProblem, `http.ts` wrappers, ownership checks; `lib/api` client/contracts/schemas/modules (keys + hooks) for every domain. *Gate: every endpoint exercised (curl or hooks) for admin and user; 401/403/404/422 paths verified.*

**Phase 7 — Dashboard + devices pages.** §10.2 + §10.3 with charts, polling, discovery, assign/rename/block/delete flows, skeletons/empty/error states. *Gate: simulator data flows end-to-end: discover → table → live speeds updating every 5 s.*

**Phase 8 — Device detail + speed limits + usage reports.** §10.4–§10.6. *Gate: setting a limit in the UI caps the simulated device's charted speed within 2 poll intervals; appliedAt badge flips; daily/monthly charts match rollups; CSV export downloads.*

**Phase 9 — Users + settings + system status.** §10.7–§10.8, MikroTik settings form + connection test, poller picks up interval/retention changes. *Gate: admin CRUD works; user deletion unassigns devices; non-admin cannot reach `/admin/users` (page + API).*

**Phase 10 — Hardening + docs + final gate.** A11y pass, dark-mode audit, 360–1440 responsive pass, RTL/LTR islands check, error coverage, `docs/DEPLOYMENT.md`, README (Arabic: what it is, quickstart, env table, screenshots placeholders). *Gate: full acceptance checklist below.*

# 15. Implementation Notes (what actually shipped — keep in sync)

The repository was built by following this document. Deviations forced by the
actual toolchain, all of them backwards-compatible with the spec:

1. **Next.js 16** renames `middleware.ts` → `proxy.ts` (node runtime, function
   named `proxy`). The guard lives in `src/proxy.ts` and uses a JWT-only
   verifier (`src/server/auth-edge.ts`) so the proxy bundle stays small.
2. **Zod helpers** in `src/server/http.ts` are generic over
   `z.ZodTypeAny` (`z.output<S>`), because `.catch()`/`.default()` make the
   input and output types diverge.
3. **Browser query filters** are plain TS types (`DeviceFilter`, `UserFilter`);
   the Zod schemas validate on the server. This keeps the typed filter objects
   in hooks/components readable.
4. **React 19.2 lint** forbids `setState` inside effects. Dialogs and forms are
   therefore rendered **keyed** and initialize state from props instead of
   syncing in an effect.
5. **Fonts** are self-hosted (`@fontsource-variable/cairo`,
   `@fontsource-variable/jetbrains-mono`) via `next/font/local`, so the app
   works offline and in sandboxes without Google Fonts access.
6. **shadcn/ui** components were vendored from the upstream registry
   (`new-york` style, radix base) and their imports rewritten to `@/lib/utils`
   and `@/components/ui/*`.
7. Tests stub the bundler-only `server-only` package (see `vitest.config.ts`),
   and DB tests set `DATABASE_PATH` **before** importing modules because
   `src/lib/config.ts` parses `process.env` at import time.
8. **LAN Discovery mode** (`NETWORK_MODE=lan`): discovers live network devices
   using the OS ARP table, ping sweeps, reverse DNS, and UPnP IGD without
   requiring a MikroTik router. Because standard home gateways (Huawei, TP-Link,
   Vodafone) do not expose per-device traffic accounting or queue APIs,
   unsupported operations fail fast with a typed 422 `UNSUPPORTED_OPERATION`
   and the UI adapts (status pill, disabled limit buttons, capability alerts).
9. **DNS Controller & Sinkhole**: embedded RFC 1035 UDP server running alongside
   the poller, providing local domain blocking (exact + wildcards, returning
   `0.0.0.0` or `::`), live query logging in an in-memory ring buffer, and
   per-device internet cutoff without requiring any smart router hardware.

# 16. Definition of Done — Acceptance Checklist

1. [ ] `pnpm build` succeeds (TypeScript strict, no ignored errors) and `pnpm lint` has zero errors.
2. [ ] `pnpm test` green — all four suites.
3. [ ] Fresh clone + `pnpm install` + `cp .env.example .env.local` + `pnpm dev` → auto-migrated DB, seeded admin, working login (`admin/admin123`).
4. [ ] All routes work: `/login`, `/dashboard`, `/devices`, `/devices/[id]` (3 tabs), `/usage`, `/speed-limits`, `/settings`, `/admin/users`; unknown device id → 404; logged-out → `/login`.
5. [ ] In `NETWORK_MODE=simulated` the full loop is live without any hardware: discovery adds devices, statuses change, realtime charts update every 5 s, today/month rollups grow.
6. [ ] Speed limit set in UI visibly caps the simulated device rate within 2 poll intervals and `appliedAt` reflects application; disabling removes the cap.
7. [ ] Block/unblock flips device to `blocked` (offline + zero traffic) and back.
8. [ ] RBAC: user sees only own devices everywhere (lists, live traffic, usage totals, detail-by-id → 404); admin sees all + assign + users + settings; both guarded in middleware AND route handlers.
9. [ ] `traffic_samples` pruning respects retention; `usage_daily/usage_monthly` remain; counter-reset never stores negative deltas.
10. [ ] Switching `NETWORK_MODE=mikrotik` with an unreachable router degrades gracefully: status pill `غير متصل`, last error shown in settings/dashboard, app still serves stored data, poller retries with backoff — no crash.
11. [ ] Arabic RTL correct everywhere; MAC/IP/numbers/charts LTR-inside-RTL; tested 360/390/768/1024/1440; dark + light themes audited (charts, badges, tables, dialogs).
12. [ ] Every list/detail has skeleton, empty, and error-with-retry states; every mutation has an Arabic toast; no TODO/FIXME placeholders in core functionality; no clickable divs; icon-only buttons labeled.
13. [ ] No secret (router password, session secret, hash) is ever returned by an API or exposed via `NEXT_PUBLIC_*`.
14. [ ] `docs/DEPLOYMENT.md` + README explain: single-VPS deployment (`pnpm build && pnpm start`), MikroTik prerequisites (enable API service, dedicated user with `read,write,test` policy), backup = copy `data/netwatch.db`, env table.

# 17. Strategy Provenance (how this prompt maps to the reference strategy)

Keep these invariants while building — they are what make NetWatch maintainable:

- **One switchable seam to the outside world**: the reference project swapped mock↔http transports via one flag; NetWatch swaps simulated↔mikrotik adapters via `NETWORK_MODE`. Everything above the seam (services, routes, hooks, UI) is mode-agnostic. No component ever branches on mode.
- **Contracts + Zod everywhere**: DTOs typed once in `lib/api/contracts`, mirrored by Zod, validated on both ends (server out, client in) — `INVALID_API_REQUEST` (422, field errors) / `INVALID_API_RESPONSE` (502) with Arabic titles.
- **Per-domain API modules** (`keys.ts` + `hooks.ts` quartet) are the only path from UI to data; pages stay thin; TanStack defaults (staleTime/gcTime/retry/backoff, `keepPreviousData`).
- **Derived, never duplicated**: stats on the home/dashboard are computed from stored data (`usage/summary`), never hard-coded; formatting lives in one pure module; the poller is the single writer of telemetry tables.
- **Skeleton-first loading, deliberate empty states, retryable errors** — never silent fallbacks.
- **Heavy raw data is transient; aggregates are permanent** — the retention/prune pipeline is part of correctness, not an optimization.
- **Tests target the seams**: pure calculators, the adapter contract, auth, and DB services — the same layers that would break first in production.
