-- Classification + tier tables. Run once in the Supabase SQL editor (or psql)
-- after raw_dealerships / raw_reviews exist (fetch_review.ts creates those).

CREATE EXTENSION IF NOT EXISTS postgis;

-- Dealership coordinates, for radius search and the map.
ALTER TABLE raw_dealerships ADD COLUMN IF NOT EXISTS location geography(Point, 4326);
CREATE INDEX IF NOT EXISTS raw_dealerships_location_idx ON raw_dealerships USING GIST (location);

-- LLM output only. One row per (review, classifier version); clean reviews
-- are stored with categories = '{}' so "clean" is distinguishable from "not run".
CREATE TABLE IF NOT EXISTS classified_reviews (
    review_id          INTEGER NOT NULL REFERENCES raw_reviews(review_id) ON DELETE CASCADE,
    classifier_version TEXT NOT NULL,
    categories         SMALLINT[] NOT NULL,   -- e.g. {1,5}
    excerpts           JSONB NOT NULL,        -- [{"categoryId":5,"excerpts":["..."]}]
    classified_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (review_id, classifier_version)
);

-- Aggregated result per dealership, written by scripts/compute_tiers.ts.
--   clear:   0 categories hit across all reviews
--   caution: 1-2 unique categories, each hit in only one review
--   flagged: >2 unique categories, or any category hit in 2+ reviews
CREATE TABLE IF NOT EXISTS dealership_tiers (
    place_id               TEXT NOT NULL REFERENCES raw_dealerships(place_id) ON DELETE CASCADE,
    classifier_version     TEXT NOT NULL,
    tier                   TEXT NOT NULL CHECK (tier IN ('clear', 'caution', 'flagged')),
    category_hit_counts    JSONB NOT NULL,    -- {"1":2,"5":1} = number of reviews hitting each category
    unique_category_count  INTEGER NOT NULL,
    flagged_review_count   INTEGER NOT NULL,  -- reviews with >= 1 category
    multi_hit_review_count INTEGER NOT NULL,  -- reviews with >= 2 categories
    review_count           INTEGER NOT NULL,  -- classified reviews the tier is based on
    computed_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (place_id, classifier_version)
);

-- What the map reads: one row per dealership per classifier version.
CREATE OR REPLACE VIEW dealership_map AS
SELECT
    t.place_id,
    t.classifier_version,
    d.name,
    d.address,
    ST_Y(d.location::geometry) AS lat,
    ST_X(d.location::geometry) AS lng,
    t.tier,
    t.category_hit_counts,
    t.unique_category_count,
    t.flagged_review_count,
    t.multi_hit_review_count,
    t.review_count,
    t.computed_at
FROM dealership_tiers t
JOIN raw_dealerships d USING (place_id);
