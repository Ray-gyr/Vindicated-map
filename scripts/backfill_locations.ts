import { Pool } from 'pg';
import 'dotenv/config';

// Fills raw_dealerships.location for rows scraped before the scraper requested places.location.
// Usage: npx tsx scripts/backfill_locations.ts [limit]   (omit limit to backfill everything)
const limit = process.argv[2] ? parseInt(process.argv[2], 10) : null;
const API_KEY = process.env.API_KEY;
const DB_CONN_STRING = process.env.DB_CONN_STRING;

if (!API_KEY || !DB_CONN_STRING) {
    console.error("Missing API_KEY or DB_CONN_STRING in environment variables.");
    process.exit(1);
}

const pool = new Pool({
    connectionString: DB_CONN_STRING,
});

interface PlaceDetails {
    location?: { latitude: number; longitude: number };
}

async function main() {
    const result = await pool.query(
        `SELECT place_id, name FROM raw_dealerships WHERE location IS NULL ORDER BY place_id LIMIT $1`,
        [limit]
    );
    console.log(`Found ${result.rows.length} dealerships without a location.`);

    let updated = 0;
    for (const row of result.rows) {
        // Place Details (New): location-only field mask keeps this on the cheapest SKU
        const response = await fetch(`https://places.googleapis.com/v1/places/${row.place_id}`, {
            headers: {
                'X-Goog-Api-Key': API_KEY as string,
                'X-Goog-FieldMask': 'location'
            }
        });

        if (!response.ok) {
            console.error(`  [${row.place_id}] ${row.name}: API Error ${response.status} ${await response.text()}`);
            continue;
        }

        const data = (await response.json()) as PlaceDetails;
        if (!data.location) {
            console.warn(`  [${row.place_id}] ${row.name}: no location returned`);
            continue;
        }

        await pool.query(
            `UPDATE raw_dealerships SET location = ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography WHERE place_id = $3`,
            [data.location.latitude, data.location.longitude, row.place_id]
        );
        updated++;
    }

    console.log(`Updated ${updated}/${result.rows.length} dealerships.`);
}

main()
    .catch(err => {
        console.error("Fatal error:", err);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
