# Monitoring & alerting

Alerts go to **[patrick@studiocartelli.com](mailto:patrick@studiocartelli.com)**.

This runbook uses **UptimeRobot** (free tier: 50 monitors, 5-minute intervals). Keyword checks are required — a bare HTTP 200 check misses pages that render an error state.

## Prerequisites

1. **Deploy to production** — uptime markers ship in app code (`src/lib/uptime-markers.ts`). Monitors will fail until the latest build is live:
  ```sh
   wrangler deploy
  ```
2. **Verify markers in page source** — UptimeRobot scans static HTML only (not JS-rendered content). Right-click each URL → **View Page Source** and confirm the marker string appears:

  | URL                                    | Marker to find                  |
  | -------------------------------------- | ------------------------------- |
  | `https://studiocartelli.com/`          | `uptime:studio-cartelli-home`   |
  | `https://studiocartelli.com/lab/chart` | `uptime:studio-cartelli-chart`  |
  | `https://studiocartelli.com/unlock`    | `uptime:studio-cartelli-unlock` |

   The chart marker is omitted when SSR data fetch fails, so a broken Last.fm/KV pipeline fails the keyword check even though the page returns 200.

## UptimeRobot account setup

1. Sign in at [uptimerobot.com](https://uptimerobot.com)
2. **My Settings → Alert contacts** → add `patrick@studiocartelli.com` (email alert contact)
3. Confirm the verification email

## Cloudflare bot protection (read before creating monitors)

Cloudflare returns **403** to some automated user agents. UptimeRobot checks must reach the site successfully or you'll get false-positive DOWN alerts.


| Plan     | Custom User-Agent                                                                                                                   | Recommended fix                           |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **Free** | Not available                                                                                                                       | WAF skip rule for UptimeRobot IPs (below) |
| **Pro**  | **Advanced → Custom HTTP headers** → `User-Agent: Mozilla/5.0 (compatible; StudioCartelli-Uptime/1.0; +https://studiocartelli.com)` | Custom header **or** IP skip              |


### WAF skip for UptimeRobot IPs (free tier)

Do this once before creating monitors if checks return 403:

1. Download UptimeRobot's current IP list: [uptimerobot.com/help/locations](https://uptimerobot.com/help/locations) (JSON link keeps the list current)
2. **Cloudflare dashboard** → **Manage Account** → **Configurations** → **Lists** → create list `uptimerobot-ips` with their IPv4 addresses
3. **Security → WAF → Custom rules → Create rule**
  - Expression: `(ip.src in $uptimerobot_ips)`
  - Action: **Skip** → All remaining custom rules (or at minimum Super Bot Fight Mode / bot protection)
4. Save and deploy the rule

After creating monitors, watch the first few checks in UptimeRobot. If status stays **UP**, no further action needed.

## Create production monitors

Create **three Keyword monitors** — not HTTP(s). HTTP monitors send HEAD requests and do not check page content.

For each monitor: **+ Add New Monitor** → monitor type **Keyword**.

### Shared settings (all three monitors)


| Field               | Value                             |
| ------------------- | --------------------------------- |
| Monitor Type        | **Keyword**                       |
| Alert When          | **Keyword Not Exists**            |
| Monitoring Interval | **5 minutes** (free-tier default) |
| Monitor Timeout     | **30 seconds**                    |
| Alert Contacts      | `patrick@studiocartelli.com`      |
| Follow Redirects    | **On**                            |


**Alert When = Keyword Not Exists** means: alert when the marker disappears from the page (site is DOWN when the marker is missing).

### Monitor 1 — Home


| Field         | Value                         |
| ------------- | ----------------------------- |
| Friendly Name | `Studio Cartelli — Home`      |
| URL           | `https://studiocartelli.com/` |
| Keyword       | `uptime:studio-cartelli-home` |


Click **Create Monitor**.

### Monitor 2 — Chart


| Field         | Value                                  |
| ------------- | -------------------------------------- |
| Friendly Name | `Studio Cartelli — Chart`              |
| URL           | `https://studiocartelli.com/lab/chart` |
| Keyword       | `uptime:studio-cartelli-chart`         |


Click **Create Monitor**.

### Monitor 3 — Unlock


| Field         | Value                               |
| ------------- | ----------------------------------- |
| Friendly Name | `Studio Cartelli — Unlock`          |
| URL           | `https://studiocartelli.com/unlock` |
| Keyword       | `uptime:studio-cartelli-unlock`     |


Click **Create Monitor**.

### Pro plan only: custom User-Agent

If on UptimeRobot Pro, skip the WAF IP list and set this on each monitor instead:

**Edit monitor → Advanced → Custom HTTP headers:**

```
User-Agent: Mozilla/5.0 (compatible; StudioCartelli-Uptime/1.0; +https://studiocartelli.com)
```

(constant: `UPTIME_MONITOR_USER_AGENT` in `src/lib/uptime-markers.ts`)

## Optional: preview smoke monitor (alert testing)

Validate alerting without touching production:

1. Find the preview Worker URL (e.g. `https://studio-cartelli-preview.<account>.workers.dev/`)
2. Create a fourth **Keyword** monitor:
  - Friendly Name: `Studio Cartelli — Preview smoke`
  - URL: preview Worker root URL
  - Keyword: `uptime:studio-cartelli-home` (after preview is deployed with marker code)
  - Alert When: **Keyword Not Exists**
3. Deploy a deliberately broken build to preview (`wrangler deploy --env preview` with a known-bad change)
4. Confirm email alert within ~10 minutes
5. Redeploy a good build and confirm monitor returns **UP**

## Cloudflare notifications (optional)

**Account → Notifications → Add** lists ~53 alert types. This account does **not** include a Workers error-rate notification — there is no “Workers Services” or “Worker exceeded error rate” option. That is expected on free/Pro plans; HTTP error-rate alerts under **Traffic Monitoring** (Advanced Error Rate, Origin Error Rate) are Enterprise-only.

UptimeRobot keyword monitors are the primary automated alerting layer. Cloudflare fills gaps below.

### Worth enabling from the available list

| Product | Alert type | Why |
| --- | --- | --- |
| **DDoS Protection** | HTTP DDoS Attack Alert | Email when CF mitigates a large HTTP attack (>100 req/s) |
| **Traffic Monitoring** | Passive Origin Monitoring | Email when Cloudflare cannot reach the origin (less relevant when the Worker *is* the origin, but harmless to enable) |

Skip **Pages → Project updates** — this site deploys as a **Worker** (`wrangler deploy`), not Cloudflare Pages.

### Error visibility without email alerts

Workers observability is enabled in `wrangler.toml` (`[observability] enabled = true`). For runtime errors, use the dashboard — there is no matching notification type on this plan:

1. **Workers & Pages** → `studio-cartelli` → **Observability** → filter for errors / 5xx
2. Live tail: `npx wrangler tail studio-cartelli`
3. Cron failures: `[cron]` logs + KV key `ops:cron:last` (below)

## Cron cache warming

Production cron (`*/5 * * * *` in `wrangler.toml`) warms chart and network KV caches via `src/lib/cron-warm.ts`.

- Failures log with `[cron]` prefix in Workers **Logs** (Real-time / Logpush)
- Last run snapshot: KV key `ops:cron:last` in `LASTFM_CHART_CACHE`

Inspect last cron status:

```sh
npx wrangler kv key get --binding=LASTFM_CHART_CACHE ops:cron:last
```

Preview has **no cron trigger** — production schedule keeps prod cache warm; preview reads its own namespace on first request.

## Checklist

- [x] Production deployed (`wrangler deploy`)
- [x] Markers visible in View Page Source for all three URLs
- [x] UptimeRobot alert contact verified (`patrick@studiocartelli.com`)
- [ ] Cloudflare WAF skip for UptimeRobot IPs (free tier) **or** custom User-Agent (Pro)
- [x] Three Keyword monitors created and showing **UP**
- [ ] Optional Cloudflare notifications (DDoS / Passive Origin Monitoring)

## Related files

- `src/lib/uptime-markers.ts` — marker strings + monitor User-Agent constant
- `src/components/UptimeMarker.astro` — hidden marker element
- `src/lib/cron-warm.ts` — cron orchestration + status snapshot
- `src/worker.ts` — scheduled handler
- `tests/uptime-markers.spec.ts` — Playwright marker coverage

