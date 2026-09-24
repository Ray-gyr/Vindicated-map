import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import 'dotenv/config';

// Exports the classified dealerships for one classifier version to the static
// GeoJSON the map prototype reads (prototype-map/data/dealerships.geojson).
// Usage: npx tsx scripts/export_geojson.ts [classifier_version] [output_path]
const DB_CONN_STRING = process.env.DB_CONN_STRING;
const classifierVersion = process.argv[2] || "1.5.0-gpt-5-mini";
const outputPath = process.argv[3] || path.join(process.cwd(), 'prototype-map', 'data', 'dealerships.geojson');

if (!DB_CONN_STRING) {
    console.error("Missing DB_CONN_STRING in environment variables.");
    process.exit(1);
}

const pool = new Pool({
    connectionString: DB_CONN_STRING,
});

// Must match the category definitions in prompt.ts
const CATEGORY_NAMES: Record<number, string> = {
    1: "Price & Fee Surprises",
    2: "Vehicle & Inventory Misrepresentation",
    3: "Contract & Document Issues",
    4: "Pressure & Manipulation",
    5: "Post-Sale Neglect",
    6: "Discriminatory Treatment",
    7: "Poor Service Quality",
    8: "Other",
};

const NO_COMPLAINTS_TEXT = "No complaints found.";

interface Excerpt {
    categoryId: number;
    excerpts: string[];
}

async function main() {
    const dealerships = await pool.query(`
        SELECT
            m.place_id, m.name, m.address, m.lat, m.lng, m.tier,
            m.category_hit_counts, m.review_count, m.flagged_review_count, m.computed_at,
            d.rating, d.user_rating_count
        FROM dealership_map m
        JOIN raw_dealerships d USING (place_id)
        WHERE m.classifier_version = $1
        ORDER BY m.name
    `, [classifierVersion]);

    const reviews = await pool.query(`
        SELECT r.place_id, r.review_id, r.rating, r.publish_time, r.text, c.categories, c.excerpts
        FROM classified_reviews c
        JOIN raw_reviews r USING (review_id)
        WHERE c.classifier_version = $1
        ORDER BY r.place_id, r.publish_time DESC NULLS LAST, r.review_id
    `, [classifierVersion]);

    const reviewsByPlace = new Map<string, any[]>();
    for (const row of reviews.rows) {
        const list = reviewsByPlace.get(row.place_id) ?? [];
        list.push(row);
        reviewsByPlace.set(row.place_id, list);
    }

    const features = dealerships.rows.map(d => {
        const placeReviews = reviewsByPlace.get(d.place_id) ?? [];
        const hits: Record<string, number> = d.category_hit_counts;

        // Most-hit category first; ties go to the lower category ID
        const categoryIds = Object.keys(hits)
            .map(Number)
            .sort((a, b) => hits[b] - hits[a] || a - b);

        // Example Text: first excerpt for the most-hit category
        let exampleText = NO_COMPLAINTS_TEXT;
        if (categoryIds.length > 0) {
            for (const review of placeReviews) {
                const match = (review.excerpts as Excerpt[]).find(e => e.categoryId === categoryIds[0]);
                if (match && match.excerpts.length > 0) {
                    exampleText = match.excerpts[0];
                    break;
                }
            }
        }

        return {
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [Number(d.lng), Number(d.lat)],
            },
            properties: {
                "Place ID": d.place_id,
                "Name": d.name,
                "Address": d.address,
                "Tier": d.tier,
                "Google Rating": d.rating === null ? null : Number(d.rating),
                "Google Rating Count": d.user_rating_count,
                "Review Count": d.review_count,
                "Flagged Review Count": d.flagged_review_count,
                "Category Hits": hits,
                "Categories": categoryIds.map(id => CATEGORY_NAMES[id]),
                "Example Text": exampleText,
                "Reviews": placeReviews.map(r => ({
                    "Review ID": r.review_id,
                    "Rating": r.rating === null ? null : Number(r.rating),
                    "Published": r.publish_time ? r.publish_time.toISOString() : null,
                    "Text": r.text,
                    "Categories": r.categories,
                    "Excerpts": (r.excerpts as Excerpt[]).map(e => ({
                        "Category": e.categoryId,
                        "Quotes": e.excerpts,
                    })),
                })),
                "Classifier Version": classifierVersion,
                "Computed At": d.computed_at.toISOString(),
            },
        };
    });

    const geojson = { type: "FeatureCollection", features };
    await fs.promises.writeFile(outputPath, JSON.stringify(geojson, null, 2) + '\n', 'utf-8');

    const reviewTotal = features.reduce((n, f) => n + f.properties["Reviews"].length, 0);
    console.log(`Wrote ${features.length} dealerships and ${reviewTotal} reviews (version ${classifierVersion}) to ${outputPath}`);
}

main()
    .catch(err => {
        console.error("Fatal error:", err);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
