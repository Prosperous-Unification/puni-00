# Infra price research — accessed 2026-09-08

**Method note:** WebSearch's session budget was exhausted before this task started (200/200 used
by prior activity in this session), so this research relied on direct WebFetch of vendor pages.
Hetzner's public price pages render server SKU names/specs in static HTML but inject the actual
EUR/USD figures client-side via JS after page load — WebFetch only sees the pre-hydration HTML, so
those numeric prices could not be confirmed live despite multiple attempts (direct page, docs
subdomain, archive.org [fetch blocked entirely for that host], Bing snippet search, several
third-party comparison sites that 404'd). Everything marked "NOT FOUND (live)" below is a real gap,
not a guess — go to the cited URL and read the number off the page (or console.hetzner.com) rather
than trusting a remembered figure.

## 1. Hetzner Cloud (CX/CPX/CCX) + dedicated AX, one Netcup equivalent

Confirmed live (vCPU/RAM/storage came back in the page's static HTML); monthly price did not.

| Line                                  | SKU   | vCPU | RAM   | Storage     | Price/mo         | Source                                                                                      | Accessed   |
| ------------------------------------- | ----- | ---- | ----- | ----------- | ---------------- | ------------------------------------------------------------------------------------------- | ---------- |
| CX (cost-optimized, shared)           | CX33  | 4    | 8 GB  | —           | NOT FOUND (live) | [hetzner.com/cloud/cost-optimized](https://www.hetzner.com/cloud/cost-optimized/)           | 2026-09-08 |
| CX (cost-optimized, shared)           | CX43  | 8    | 16 GB | —           | NOT FOUND (live) | same                                                                                        | 2026-09-08 |
| CX (cost-optimized, shared)           | CX53  | 16   | 32 GB | —           | NOT FOUND (live) | same                                                                                        | 2026-09-08 |
| CPX (regular performance, shared)     | CPX32 | 4    | 8 GB  | 160 GB NVMe | NOT FOUND (live) | [hetzner.com/cloud/regular-performance](https://www.hetzner.com/cloud/regular-performance/) | 2026-09-08 |
| CPX (regular performance, shared)     | CPX42 | 8    | 16 GB | 320 GB NVMe | NOT FOUND (live) | same                                                                                        | 2026-09-08 |
| CPX (regular performance, shared)     | CPX62 | 16   | 32 GB | 640 GB NVMe | NOT FOUND (live) | same                                                                                        | 2026-09-08 |
| CCX (general purpose, dedicated vCPU) | CCX23 | 4    | 16 GB | 160 GB NVMe | NOT FOUND (live) | [hetzner.com/cloud/general-purpose](https://www.hetzner.com/cloud/general-purpose/)         | 2026-09-08 |
| CCX (general purpose, dedicated vCPU) | CCX43 | 16   | 64 GB | 360 GB NVMe | NOT FOUND (live) | same                                                                                        | 2026-09-08 |

**Hetzner dedicated AX entry servers** — confirmed CPU/RAM, price not found:

| SKU       | CPU                                | RAM            | Storage       | Price/mo         | Source                                                                                                | Accessed   |
| --------- | ---------------------------------- | -------------- | ------------- | ---------------- | ----------------------------------------------------------------------------------------------------- | ---------- |
| AX41-NVMe | AMD Ryzen 5 3600 (6c/12t, Zen 2)   | 64 GB DDR4     | 2×512 GB NVMe | NOT FOUND (live) | [hetzner.com/dedicated-rootserver/matrix-ax](https://www.hetzner.com/dedicated-rootserver/matrix-ax/) | 2026-09-08 |
| AX42      | AMD Ryzen 7 PRO 8700GE (8c, Zen 4) | 64 GB DDR5 ECC | 2×512 GB NVMe | NOT FOUND (live) | same                                                                                                  | 2026-09-08 |

**Netcup VPS (equivalent), fully confirmed live including VAT-inclusive price:**

| SKU          | vCPU | RAM        | Storage      | Price/mo (incl. 19% German VAT) | Source                                                 | Accessed   |
| ------------ | ---- | ---------- | ------------ | ------------------------------- | ------------------------------------------------------ | ---------- |
| VPS 1000 G12 | 4    | 8 GB DDR5  | 256 GB NVMe  | €10.37                          | [netcup.com VPS](https://www.netcup.com/en/server/vps) | 2026-09-08 |
| VPS 2000 G12 | 8    | 16 GB DDR5 | 512 GB NVMe  | €19.25                          | same                                                   | 2026-09-08 |
| VPS 8000 G12 | 16   | 64 GB DDR5 | 2048 GB NVMe | €47.95                          | same                                                   | 2026-09-08 |

(Netcup also confirmed VPS 500 G12: 2 vCPU/4 GB/€5.91, and VPS 4000 G12: 12 vCPU/32 GB/€32.41 — included for interpolation.)

## 2. Browserbase pricing tiers

Confirmed live via WebFetch of browserbase.com/pricing.

| Tier            | Price/mo | Included browser hours | Overage             | Concurrency |
| --------------- | -------- | ---------------------- | ------------------- | ----------- |
| Free            | $0       | 1 hr                   | N/A                 | 3           |
| Developer/Hobby | $20      | 100 hrs                | $0.12/hr            | 25          |
| Startup         | $99      | 500 hrs                | $0.10/hr            | 100         |
| Scale           | Custom   | 500+ hrs               | Usage-based, custom | 250+        |

Source: [browserbase.com/pricing](https://www.browserbase.com/pricing) — accessed 2026-09-08.
Tier names/exact wording ("Developer", "Startup", "Scale") should be re-checked directly, since a
single WebFetch pass paraphrased the page rather than quoting the pricing widget verbatim.

## 3. Alternative cloud browser — Steel.dev

Confirmed live via two WebFetch passes (steel.dev/pricing and docs.steel.dev/overview/pricinglimits).

| Tier       | Price/mo  | Included usage            | Overage/hr | Concurrency                |
| ---------- | --------- | ------------------------- | ---------- | -------------------------- |
| Launch     | $0 base   | $30 one-time usage credit | $0.10/hr   | 10 concurrent sessions     |
| Scale      | $250 base | $100/mo usage credit      | $0.08/hr   | 100 concurrent sessions    |
| Enterprise | Custom    | Custom credit             | Custom     | 1,000+ concurrent sessions |

Note: "included browser hours" for Launch/Scale are derived from credit ÷ rate in the docs page
summary, not stated as a flat hour count — the $30/$100 credits are the primary units. Billing is
per-minute, rounded up. Source: [steel.dev/pricing](https://steel.dev/pricing) and
[docs.steel.dev/overview/pricinglimits](https://docs.steel.dev/overview/pricinglimits) — accessed 2026-09-08.

## 4. Object storage — Hetzner Object Storage / Backblaze B2

| Provider                | Price                              | Details                                                                                                                                                                                          | Source                                                                                 | Accessed   |
| ----------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ---------- |
| Hetzner Object Storage  | NOT FOUND (live)                   | Page states base price includes 1 TB storage (≤744 TB-hours) + 1 TB egress/month, billed hourly, capped monthly; overage billed "per TB" for egress — exact € figures not present in static HTML | [hetzner.com/storage/object-storage](https://www.hetzner.com/storage/object-storage/)  | 2026-09-08 |
| Backblaze B2 (standard) | $6.95/TB-month = $0.00695/GB-month | First 10 GB always free; egress free up to 3× average monthly storage, then $0.01/GB; unlimited free egress via B2 Overdrive or via partner CDNs (Fastly/Cloudflare/bunny.net)                   | [backblaze.com/cloud-storage/pricing](https://www.backblaze.com/cloud-storage/pricing) | 2026-09-08 |
| Backblaze B2 Overdrive  | $15/TB-month = $0.015/GB-month     | High-throughput tier, unlimited free egress                                                                                                                                                      | same                                                                                   | 2026-09-08 |

## 5. GitHub Actions minute pricing + Grafana Cloud free tier

**GitHub Actions (private repos), per-minute Linux rates:**

| Runner               | $/minute |
| -------------------- | -------- |
| Linux 1-core (x64)   | $0.002   |
| Linux 2-core (x64)   | $0.006   |
| Linux 2-core (arm64) | $0.005   |

Free minutes/month included by plan (Linux minutes counted at 1× multiplier; other OSes cost more per minute and consume the same pool faster):

| Plan                    | Free minutes/mo |
| ----------------------- | --------------- |
| GitHub Free             | 2,000           |
| GitHub Pro              | 3,000           |
| GitHub Team             | 3,000           |
| GitHub Enterprise Cloud | 50,000          |

Public repos and self-hosted runners: unlimited/free regardless of plan.
Source: [docs.github.com — About billing for GitHub Actions](https://docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions) — accessed 2026-09-08.

**Grafana Cloud free tier:**

| Signal                     | Limit                | Retention |
| -------------------------- | -------------------- | --------- |
| Metrics                    | 10k active series/mo | 14 days   |
| Logs                       | 50 GB ingested/mo    | 14 days   |
| Traces                     | 50 GB ingested/mo    | 14 days   |
| Profiles                   | 50 GB ingested/mo    | 14 days   |
| Grafana (dashboards/users) | 3 active users/mo    | —         |

No credit card required; community support only. Source: [grafana.com/pricing](https://grafana.com/pricing/) — accessed 2026-09-08.

## Summary of gaps (explicitly not found)

- Exact EUR/USD monthly price for Hetzner CX33/CX43/CX53, CPX32/CPX42/CPX62, CCX23/CCX43 — page is JS-hydrated, price not in static HTML served to WebFetch. Confirm at the URLs above or console.hetzner.com.
- Exact monthly price for Hetzner AX41-NVMe / AX42 — same limitation.
- Exact €/GB or €/TB figure for Hetzner Object Storage base tier and overage — page states inclusions (1 TB storage + 1 TB egress) but not the base € price or per-TB overage rate in static HTML.
- Browserbase's exact tier _names_ as currently branded should be double-checked against the live pricing widget (this pass paraphrased rather than quoting verbatim table cells).
