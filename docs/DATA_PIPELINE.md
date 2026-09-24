# VINdicated Data Pipeline — Handoff for the Visualization Team

This document explains where the dealership data lives, what each field means, and how to get it onto the map. Read **Operational warnings** before anything else: two things will break on their own if nobody acts on them.

## Operational warnings

### 1. Supabase pauses the project when it is not used
The database is a Supabase project on the free plan. Supabase **pauses free projects after about a week with no activity**. When paused, every connection fails until someone restores it from the Supabase dashboard.

**Action needed:** set up a scheduled job that touches the database at least every few days. The simplest option is a GitHub Actions cron workflow:

```yaml
# .github/workflows/supabase-keepalive.yml
name: Supabase keepalive
on:
  schedule:
    - cron: "0 12 */3 * *"   # every 3 days
  workflow_dispatch:
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: psql "$DB_CONN_STRING" -c "SELECT count(*) FROM dealership_tiers;"
        env:
          DB_CONN_STRING: ${{ secrets.DB_CONN_STRING }}
```

Store the connection string as the repository secret `DB_CONN_STRING`. Once the map reads live data from Supabase, real traffic will also keep the project awake, but keep the job anyway so that a quiet week doesn't take the site down.

### 2. The current API keys are personal and short-lived
The OpenAI key used to classify the current data set belongs to a team member's personal account and was **set to expire after 7 days** (it was created around 2026-09-23). Assume it no longer works. The Google Places key used for scraping is also a development key.

Before production:
- **Use keys owned by the project/organization**, not by an individual, and keep them in a secret manager (GitHub Actions secrets, Supabase Vault, or the hosting platform's secret store). Never commit them.
- **Rate-limit and retry API calls.** Both OpenAI and Google Places return 429 errors under load. Wrap calls in retries with exponential backoff and cap concurrency (the classifier currently runs 10 requests at a time).
- **Plan for key rotation and load balancing.** If one key's rate limit is not enough, requests can be distributed round-robin across several keys or projects, within the provider's terms of service. Rotation also means an expired or revoked key can be replaced without code changes.
- **Set spending limits** on the OpenAI and Google Cloud accounts.

## How the pipeline works

```
Google Places API ──fetch_review.ts──▶ raw_dealerships, raw_reviews
                                              │
                         backfill_locations.ts│ (lat/lng for older rows)
                                              ▼
OpenAI gpt-5-mini ◀──classify_reviews.ts── raw_reviews
        │
        ▼
classified_reviews ──compute_tiers.ts──▶ dealership_tiers
                                              │
                                              ▼
                                  dealership_map (view) ──▶ map
```

| Script | What it does |
|---|---|
| `scripts/fetch_review.ts` | Searches Google Places for car dealers by zip code and stores dealerships (with coordinates) and up to 5 reviews each. `ZIP_CODES=90024,90025` limits it to specific zip codes. |
| `scripts/backfill_locations.ts` | Fills `raw_dealerships.location` for rows scraped before coordinates were collected. Already run; only needed again for old rows. |
| `scripts/classify_reviews.ts` | Sends each review to the LLM with the prompt in `scripts/prompt.ts` and stores the categories and supporting excerpts. Currently targets the N dealerships nearest Westwood (default 100). Skips reviews already classified by the current version, so it is safe to re-run. |
| `scripts/compute_tiers.ts` | Aggregates classified reviews into one tier per dealership. |
| `db/*.sql` | Database migrations, already applied. Run in order on a fresh database. |

Run scripts with `npx tsx scripts/<name>.ts`. They read `DB_CONN_STRING`, `API_KEY` (Google Places) and `OPENAI_API_KEY` from `.env`.

## Connecting to the database

Use the **Session pooler** connection string from the Supabase dashboard (**Connect → Session pooler**), host `aws-1-us-west-2.pooler.supabase.com`, port `5432`, user `postgres.<project-ref>`. The "Direct connection" host (`db.<project-ref>.supabase.co`) is IPv6-only and fails with `ENOTFOUND` on networks without IPv6, which includes the networks we tested.

## Data model

### `dealership_map` (view) — what the map should read
One row per dealership per classifier version.

| Column | Type | Meaning |
|---|---|---|
| `place_id` | text | Google Place ID, the dealership's unique key |
| `classifier_version` | text | Which prompt/model produced the result. **Always filter on this** (see below) |
| `name`, `address` | text | From Google Places |
| `lat`, `lng` | float | Dealership coordinates |
| `tier` | text | `clear`, `caution` or `flagged` (see **Tiers**) |
| `category_hit_counts` | jsonb | Number of reviews that hit each category, e.g. `{"2":1,"7":2}`. Keys are category IDs as strings; categories with no hits are omitted |
| `unique_category_count` | int | Number of distinct categories hit |
| `flagged_review_count` | int | Reviews with at least one category |
| `multi_hit_review_count` | int | Reviews with two or more categories |
| `review_count` | int | Reviews the tier is based on (Google returns at most 5 per dealership) |
| `computed_at` | timestamptz | When the tier was computed |

### Underlying tables
- **`raw_dealerships`**: every scraped dealership. `location` is a PostGIS `geography(Point, 4326)`, with a spatial index for radius queries.
- **`raw_reviews`**: review text, star rating, publish time. The `status` column is legacy and no longer used.
- **`classified_reviews`**: one row per review per classifier version. `categories` is a `smallint[]`, and `excerpts` is `[{"categoryId": 5, "excerpts": ["verbatim quote", ...]}]`. Clean reviews are stored with `categories = '{}'`, so "clean" and "not yet classified" can be told apart.
- **`dealership_tiers`**: the aggregated result behind `dealership_map`.

### Classifier versions
Results are keyed by `(review_id, classifier_version)` and `(place_id, classifier_version)`, so a new prompt or model can be run side by side with the current one and compared before switching over.

**Policy: the database keeps only the final version.** When testing a new version, bump `classifierVersion` in `scripts/classify_reviews.ts`, run it and `compute_tiers.ts`, compare against the current version, and once the new one is accepted delete the old version's rows from `dealership_tiers` and `classified_reviews`.

The current (and only) version is **`1.5.0-gpt-5-mini`**. Earlier prompt iterations (`1.1.0` to `1.4.0`) have been removed from the database. Map queries should still filter on the version, so that a test run in progress never shows up on the map:

```sql
SELECT * FROM dealership_map WHERE classifier_version = '1.5.0-gpt-5-mini';
```

## Tiers

| Tier | Rule | Suggested color |
|---|---|---|
| `clear` | No category hit in any review | green |
| `caution` | 1–2 distinct categories, each hit by only one review | yellow |
| `flagged` | More than 2 distinct categories, **or** any category hit by 2+ reviews | red |

There is intentionally **no numeric score**. With at most 5 reviews per dealership, a percentage-style score is too noisy to be meaningful, so the three tiers are the only rating.

## Complaint categories

| ID | Category | Covers |
|---|---|---|
| 1 | Price & Fee Surprises | Charged more than advertised, agreed or quoted; undisclosed fees; unauthorized add-ons or repair work |
| 2 | Vehicle & Inventory Misrepresentation | Car or repair not as represented; problems soon after purchase; advertised car not available; damage while in the dealership's care |
| 3 | Contract & Document Issues | Confusing, altered, missing or withheld paperwork; title delays |
| 4 | Pressure & Manipulation | Aggressive, coercive or dishonest sales tactics |
| 5 | Post-Sale Neglect | Broken commitments after a completed purchase or paid service |
| 6 | Discriminatory Treatment | Treated differently because of the customer's own race, gender, nationality, age, perceived wealth or appearance, etc. |
| 7 | Poor Service Quality | Rude, dismissive or unprofessional staff; significant unexplained delays |
| 8 | Other | A specific complaint that fits none of the above |

The classifier ignores complaints about other dealerships, problems the dealership has already resolved, speculation, and minor gripes (paperwork taking a while, small selection, high prices in general). Full definitions are in `scripts/prompt.ts`; that file is the source of truth.

**Showing evidence:** each hit has verbatim excerpts in `classified_reviews.excerpts`, which work well as the popup's example text (they replace the prototype's `Example Text`). The pipeline checks that every stored excerpt actually appears in the review text.

## Current data set (test batch)

The database holds 3,564 scraped dealerships and 13,768 reviews, but **only a test batch has been classified**: the 100 dealerships nearest Westwood (34.0635, -118.4455), all within 4.3 miles, with 443 reviews between them. All 100 have coordinates.

Results for `1.5.0-gpt-5-mini`:

| Tier | Dealerships |
|---|---|
| clear | 55 |
| caution | 22 |
| flagged | 23 |

71 of the 443 reviews hit at least one category. Reviews per category: 1 Price: 10 · 2 Vehicle: 38 · 3 Contract: 4 · 4 Pressure: 7 · 5 Post-sale: 27 · 6 Discrimination: 1 · 7 Service: 51 · 8 Other: 4.

The results were spot-checked by hand across five prompt iterations; the remaining errors are borderline cases such as mild gripes that still get flagged. Before launch, have a person review every `flagged` dealership and every Category 6 hit, since those labels carry the most weight for the dealership.

## Getting the data onto the map

The prototype in `prototype-map/` reads a static file, `data/dealerships.geojson`, and colors points by a numeric `Score` with thresholds at 30 and 60 (`js/dealerships.js`, `js/filters.js`, `js/sidebar.js`, `js/popups.js`). To use the real data:

1. **Replace `Score` with `tier`.** Swap the `step` color expressions for a `match` on `tier`, and change the low/medium/high filter checkboxes to clear/caution/flagged.
2. **Pick a data source:**
   - **Static export (simplest):** a script queries `dealership_map` for the current version and writes `dealerships.geojson`. No database access from the browser, and no RLS changes needed.
   - **Live from Supabase:** query `dealership_map` with `supabase-js` and the project's anon key. This requires the RLS change below first.

### Row Level Security — read this before querying from the browser
Supabase exposes the `public` schema through a REST API using the **anon key**, which is public by design (it ships in the front-end bundle). Access control therefore relies on Row Level Security (RLS).

RLS is **enabled with no policies** on all four tables (`db/002_enable_rls.sql`), so the anon key currently gets **zero rows** from everything, including `dealership_map` (the view uses `security_invoker = true`, so it respects the tables' RLS). The pipeline scripts connect as `postgres` and bypass RLS.

To let the map read tiers without exposing review text, add read-only policies on just the two tables the view needs:

```sql
CREATE POLICY "public read" ON dealership_tiers FOR SELECT TO anon USING (true);
CREATE POLICY "public read" ON raw_dealerships  FOR SELECT TO anon USING (true);
```

Do **not** add anon policies for `INSERT`, `UPDATE` or `DELETE`, and think twice before opening `raw_reviews` or `classified_reviews`. If the popup needs excerpts, prefer exporting them into the static GeoJSON, or expose them through a view that selects only the excerpt column. To verify what the anon role can see:

```sql
BEGIN;
SET LOCAL ROLE anon;
SELECT count(*) FROM dealership_map;   -- rows visible to the public
ROLLBACK;
```

## Known data caveats
- **Only 100 dealerships are classified**, the ones nearest Westwood. The other ~3,400 scraped dealerships have no tier yet.
- **At most 5 reviews per dealership**, the limit of the Google Places API, and 509 dealerships have none at all. Tiers are based on very little evidence, so present them as signals rather than verdicts.
- **Not every "car dealer" is a dealership.** Google's `car_dealer` type also returns rental companies, tire shops, body shops and a coworking club. These need filtering before a public launch.
- **Some scraped dealerships are far outside LA/OC** (the Bay Area, even other states), because Google's search by zip code returned them. Filter by distance or bounding box.
- **26 dealerships have no coordinates.** Google reports their Place IDs as no longer valid (closed or merged), so they should not be shown.
