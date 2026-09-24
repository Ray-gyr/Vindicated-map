import { Pool } from 'pg';
import 'dotenv/config';

// Aggregates classified_reviews into dealership_tiers for one classifier version.
// Usage: npx tsx scripts/compute_tiers.ts [classifier_version]
const DB_CONN_STRING = process.env.DB_CONN_STRING;
const classifierVersion = process.argv[2] || "1.5.0-gpt-5-mini";

if (!DB_CONN_STRING) {
    console.error("Missing DB_CONN_STRING in environment variables.");
    process.exit(1);
}

const pool = new Pool({
    connectionString: DB_CONN_STRING,
});

async function main() {
    console.log(`Computing dealership tiers for classifier version ${classifierVersion}...`);

    // Tier rules:
    //   clear:   0 categories hit across all reviews
    //   caution: 1-2 unique categories, each hit in only one review
    //   flagged: >2 unique categories, or any category hit in 2+ reviews
    const result = await pool.query(`
        WITH reviews AS (
            SELECT r.place_id, c.review_id, c.categories
            FROM classified_reviews c
            JOIN raw_reviews r USING (review_id)
            WHERE c.classifier_version = $1
        ),
        per_dealer AS (
            SELECT
                place_id,
                COUNT(*) AS review_count,
                COUNT(*) FILTER (WHERE cardinality(categories) >= 1) AS flagged_review_count,
                COUNT(*) FILTER (WHERE cardinality(categories) >= 2) AS multi_hit_review_count
            FROM reviews
            GROUP BY place_id
        ),
        per_category AS (
            SELECT place_id, category_id, COUNT(DISTINCT review_id) AS hits
            FROM reviews, unnest(categories) AS category_id
            GROUP BY place_id, category_id
        ),
        category_summary AS (
            SELECT
                place_id,
                jsonb_object_agg(category_id::text, hits) AS category_hit_counts,
                COUNT(*) AS unique_category_count,
                MAX(hits) AS max_hits
            FROM per_category
            GROUP BY place_id
        )
        INSERT INTO dealership_tiers (
            place_id, classifier_version, tier, category_hit_counts, unique_category_count,
            flagged_review_count, multi_hit_review_count, review_count
        )
        SELECT
            p.place_id,
            $1,
            CASE
                WHEN s.place_id IS NULL THEN 'clear'
                WHEN s.unique_category_count > 2 OR s.max_hits >= 2 THEN 'flagged'
                ELSE 'caution'
            END,
            COALESCE(s.category_hit_counts, '{}'::jsonb),
            COALESCE(s.unique_category_count, 0),
            p.flagged_review_count,
            p.multi_hit_review_count,
            p.review_count
        FROM per_dealer p
        LEFT JOIN category_summary s USING (place_id)
        ON CONFLICT (place_id, classifier_version)
        DO UPDATE SET
            tier = EXCLUDED.tier,
            category_hit_counts = EXCLUDED.category_hit_counts,
            unique_category_count = EXCLUDED.unique_category_count,
            flagged_review_count = EXCLUDED.flagged_review_count,
            multi_hit_review_count = EXCLUDED.multi_hit_review_count,
            review_count = EXCLUDED.review_count,
            computed_at = now()
        RETURNING tier
    `, [classifierVersion]);

    const counts: Record<string, number> = {};
    for (const row of result.rows) {
        counts[row.tier] = (counts[row.tier] || 0) + 1;
    }
    console.log(`Wrote ${result.rows.length} dealerships:`, counts);
}

main()
    .catch(err => {
        console.error("Fatal error:", err);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
