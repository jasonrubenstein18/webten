# Webten

A Manifest V3 Chrome extension that reads the content of the page you are on and surfaces relevant prediction markets (Kalshi and Polymarket), plus an on-demand page summarizer. All LLM calls are routed through a thin server-side proxy so API keys never ship in the extension bundle.

## What it does

Two independent features, selected from the popup:

1. **Market Suggestions** — extracts the main content of the active tab, pulls the live market universe from Kalshi or Polymarket, and uses an LLM to rank which markets are most relevant to the page. Results render with prices and links back to the platform.
2. **Understand Content** — extracts the page content and produces either a structured deep summary or a short newsletter-style summary via Grok.

## Architecture

```
Popup (UI)                Service worker (background.js)            External
-----------               ------------------------------           --------
popup.html ──nav──┐
                  ├─ market-suggestions/  ──action:──┐
understand-       │   market-suggestions.html        │  market-suggestions:*   ┌─ Kalshi REST API
content/  ────────┘   (Kalshi + Polymarket UI)       ├──────────────────────►  │  Polymarket Gamma API
                                                      │  polymarket:*           └─ Proxy ─► OpenAI / Grok
contentScript.js ◄── action: extractContent ─────────┤  understand-content:*
(injected, all_urls)                                  └─ legacy (no prefix)
```

- **`background.js`** is the only registered service worker. It `importScripts` the shared config and the two market-suggestions backgrounds, then routes every `chrome.runtime` message by action prefix (`market-suggestions:`, `polymarket:`, `understand-content:`, with an unprefixed legacy fallback that maps to the Kalshi handler). Understand Content is handled inline in this file; the market handlers live in their own modules.
- **`contentScript.js`** runs on `<all_urls>` at `document_end`. It responds to `extractContent` by pulling the primary article content (priority selectors for `article`/`main`/common CMS classes), filtering nav/ads/sidebars heuristically, capping `text` at 3000 chars and `summary` at 1000 chars. It does not call any APIs.
- **Proxy (`server/proxy.js`)** is an Express service (deployed to Heroku) that holds `OPENAI_API_KEY` and `GROK_API_KEY` and forwards `POST /api/openai/*` and `POST /api/grok/*` to the upstream providers. The extension only ever talks to the proxy; keys are never in client code.
- **API client (`market-suggestions/api-client.js`)** wraps the proxy with a request timeout, exponential-backoff retries on transient/429/5xx errors, an in-memory response cache, and helpers `openaiChatCompletion`, `grokChatCompletion`, and `generateEmbedding`.

## Request flow: Market Suggestions

Both platforms follow the same shape; the difference is the market source and the relevance threshold.

1. Popup sends `{platform}:analyzePageContent` to the service worker.
2. The worker asks the content script for the page content via `extractContent`.
3. The worker fetches the current market universe (see platform notes below).
4. The page content plus a compact market list is sent to OpenAI (`gpt-4o-mini`) which returns a JSON array of `{ ticker, relevanceScore, reason }`. Markets are filtered by a minimum score, sorted, and truncated to `MAX_RELEVANT_MARKETS` (8).
5. Progress is streamed back to the popup via `progressUpdate` messages throughout.

Relevance ranking is done by the LLM returning structured JSON, not by vector similarity. (There is legacy embedding/cosine code on the Kalshi path that is not used by the active ranking flow.)

### Kalshi (`market-suggestions/market-suggestions-background.js`)

- Source: `GET https://api.elections.kalshi.com/trade-api/v2/events?status=open` (public, no auth), paginated by cursor up to `MAX_PAGES` x `EVENTS_PER_PAGE`, with `KALSHI_PAGE_DELAY` between pages and a 429-aware retry that honors `Retry-After`.
- Relevant events are expanded into sub-markets via `/trade-api/v2/markets?event_ticker=...` with bounded concurrency (`KALSHI_MAX_CONCURRENCY`).
- Price/volume normalization handles Kalshi's schema change: legacy integer-cent fields (`yes_bid`, `last_price`, ...) fall back to the newer dollar-string fields (`yes_bid_dollars`, ...) and `*_fp` floats.
- Optional per-market mispricing analysis via Grok, skipped entirely when more than `MISPRICING_SKIP_THRESHOLD` (30) markets match, and cached per ticker.

### Polymarket (`market-suggestions/market-suggestions-poly-background.js`)

- Source: `GET https://gamma-api.polymarket.com/markets` with `active=true&closed=false&end_date_min=<now>&order=volume&ascending=false`.
- Markets are grouped by parent event and transformed into Kalshi-shaped multi-outcome objects (prices converted to cents).
- Relevance threshold is stricter (>= 75) than Kalshi (>= 40); a single global ranking call is used when the prompt fits the token budget, otherwise it falls back to batched ranking.

**Important API constraints (verified against the live Gamma API):**

- Each response is hard-capped at **100 markets** regardless of the requested `limit`. Pagination therefore advances `offset` by the actual count received, not by `limit`.
- Offset pagination is capped at `offset ~2000`; beyond that the API returns `HTTP 422` ("offset too large, use /markets/keyset"). The fetch treats 422 as a clean stop, not an error.
- The `/markets/keyset` endpoint can page deeper but **loops on the first ~100 results as soon as any sort order or volume filter is applied**, so it cannot return high-volume markets in ranked order.
- Net effect: the maximum retrievable set ranked by volume is the **top ~2100 markets**, which is what the extension fetches. Polymarket exposes far more total markets (180k+), but the long tail is near-zero volume and not retrievable in ranked order.

## Request flow: Understand Content

1. Popup sends `understand-content:analyzeContent` (deep) or `understand-content:quickSummary` (newsletter-style).
2. The worker extracts page content, then calls Grok (`grok-3-latest`) with the corresponding prompt and a request timeout.
3. The summary is returned to the popup; `understand-content:progressUpdate` messages drive the progress UI.

## Configuration

Runtime config lives in `common/config.js`, which is **generated** by `scripts/build-config.js` from `.env`. Do not edit the generated file by hand.

`.env` (see `.env.example`):

```
PROXY_URL=https://<your-proxy-host>
OPENAI_API_KEY=sk-...     # consumed by the proxy build step / proxy server
GROK_API_KEY=...          # consumed by the proxy build step / proxy server
```

Key `CONFIG` values (in `common/config.js`):

| Key | Default | Purpose |
| --- | --- | --- |
| `MAX_PAGES` | 20 | Kalshi event pagination cap |
| `EVENTS_PER_PAGE` | 200 | Kalshi events per page |
| `MARKETS_PER_PAGE` | 100 | Polymarket page size (matches the API's hard cap) |
| `POLYMARKET_MAX_PAGES` | 25 | Polymarket pagination cap (sized to reach the ~2100 offset ceiling) |
| `MAX_RELEVANT_MARKETS` | 8 | Max suggestions returned |
| `KALSHI_MAX_CONCURRENCY` | 4 | Parallel Kalshi sub-market fetches |
| `MISPRICING_SKIP_THRESHOLD` | 30 | Skip Grok mispricing above this match count |
| `API_TIMEOUT` / `ANALYSIS_TIMEOUT` | 30s / 180s | Per-request and per-analysis timeouts |

The relevance score thresholds (Kalshi 40, Polymarket 75) are currently inlined in the two market background scripts.

## Build and install

Prerequisites: Chrome 88+, Node.js.

```bash
npm install
npm run build        # generates common/config.js, builds CSS, copies forge into lib/
```

Load the unpacked extension:

1. Open `chrome://extensions/` and enable Developer mode.
2. Click "Load unpacked" and select this directory.
3. After changing `background.js` or any imported background script, reload the extension so the service worker is re-registered.

Useful scripts:

- `npm run build:config` — regenerate `common/config.js` from `.env`.
- `npm run build:css` / `npm run watch:css` — Tailwind build / watch.
- `npm run proxy:dev` / `npm run proxy:start` — run the proxy locally (`server/`).
- `npm run heroku:deploy` — deploy the proxy.
- `npm run test:proxy` — smoke-test the deployed proxy.

## Project layout

```
webten/
├── manifest.json                         # MV3 manifest; declares background.js, content script, host permissions
├── background.js                         # Service worker router + Understand Content (Grok) handlers
├── popup.html / popup.js / popup.css     # Top-level navigation between the two features
├── contentScript.js                      # Page content extraction (responds to extractContent)
├── common/
│   ├── config.js                         # GENERATED runtime config (proxy URL, CONFIG)
│   ├── api-client.js                     # Shared proxy client (timeout, retry, cache)
│   └── content-extraction.js, utils.js, tab-utils.js
├── market-suggestions/
│   ├── market-suggestions.html/.js/.css  # Platform selection + results UI
│   ├── market-suggestions-background.js  # Kalshi fetch, ranking, mispricing
│   ├── market-suggestions-poly-background.js  # Polymarket fetch, grouping, ranking
│   └── api-client.js                     # Proxy client instance for this module
├── understand-content/                   # Summarizer UI + summary viewer
├── server/
│   ├── proxy.js                          # Express proxy for OpenAI + Grok
│   └── Procfile, app.json, package.json
├── scripts/                              # Config build + proxy deploy/test
└── lib/                                  # forge.min.js, emailjs.min.js
```

## Security and privacy

- API keys live only on the proxy. The extension authenticates to nothing client-side; the Kalshi and Polymarket endpoints used are public.
- Page content is extracted locally and sent only to the proxy (and from there to OpenAI/Grok) to perform ranking and summarization. No content is otherwise persisted server-side.
- Caching is local: market embeddings/mispricing results use `chrome.storage.local`; the API client keeps an in-memory response cache.
- Host permissions are scoped to the Kalshi, Polymarket, and proxy origins.

## Notes and caveats

- The Polymarket volume-ranked universe is API-limited to ~2100 markets (see constraints above); this is a platform limitation, not a configuration knob.
- `node-forge` is bundled for RSA-PSS signing of authenticated Kalshi requests; the current relevance flow only uses public, unauthenticated Kalshi endpoints, so it is not on the active path.
- Version numbers are tracked in `manifest.json` (canonical) and may lag in `popup.html`/`package.json`.

This project is for research and educational use. Market suggestions are generated heuristically by an LLM and are not financial advice.
