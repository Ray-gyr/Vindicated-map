import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import * as crypto from 'crypto';
import 'dotenv/config';

const API_KEY = process.env.API_KEY;
const DB_CONN_STRING = process.env.DB_CONN_STRING;

if (!API_KEY || !DB_CONN_STRING) {
    console.error("Missing API_KEY or DB_CONN_STRING in environment variables.");
    process.exit(1);
}

const pool = new Pool({
    connectionString: DB_CONN_STRING,
});

// -- Type Definitions for Google Places API --
interface ReviewText {
    text: string;
    languageCode?: string;
}

interface AuthorAttribution {
    displayName?: string;
    uri?: string;
    photoUri?: string;
}

interface PlaceReview {
    name?: string;
    rating?: number;
    text?: ReviewText;
    originalText?: ReviewText;
    authorAttribution?: AuthorAttribution;
    publishTime?: string;
}

interface Place {
    id: string;
    displayName?: { text: string; languageCode?: string };
    formattedAddress?: string;
    rating?: number;
    userRatingCount?: number;
    reviews?: PlaceReview[];
}

interface PlacesResponse {
    places?: Place[];
    nextPageToken?: string;
}

async function initDB() {
    console.log("Initializing database tables if they do not exist...");

    // Create raw_dealerships table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS raw_dealerships (
            place_id TEXT PRIMARY KEY,
            name TEXT,
            address TEXT,
            zip_code TEXT,
            rating NUMERIC,
            user_rating_count INTEGER,
            fetch_date TIMESTAMP WITH TIME ZONE
        );
    `);

    // Create raw_reviews table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS raw_reviews (
            review_id SERIAL PRIMARY KEY,
            place_id TEXT REFERENCES raw_dealerships(place_id),
            reviewer_id TEXT,
            text TEXT,
            rating NUMERIC,
            publish_time TIMESTAMP WITH TIME ZONE,
            fetch_date TIMESTAMP WITH TIME ZONE,
            status VARCHAR(20) DEFAULT 'unprocessed',
            UNIQUE(place_id, reviewer_id)
        );
    `);
    console.log("Database initialized.");
}

async function getZipCodes(): Promise<string[]> {
    const csvPath = path.join(process.cwd(), 'LA2OC_zipcodes_P.csv');

    try {
        await fs.promises.access(csvPath);
    } catch {
        throw new Error(`Could not find LA2OC_zipcodes_P.csv at ${csvPath}`);
    }

    const csvContent = await fs.promises.readFile(csvPath, 'utf-8');
    const lines = csvContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    // Skip header and return zip codes
    return lines.slice(1).map(line => line.split(',')[0].trim());
}

function generateFallbackReviewerId(review: PlaceReview): string {
    const name = review.authorAttribution?.displayName || 'UnknownAuthor';
    const publishTime = review.publishTime || new Date().toISOString();
    return crypto.createHash('md5').update(`${name}-${publishTime}`).digest('hex');
}

async function testGooglePlacesAPI() {
    const url = 'https://places.googleapis.com/v1/places:searchText';

    await initDB();

    const allZipCodes = await getZipCodes();

    // State file for resume capability
    const stateFile = path.join(process.cwd(), 'scraper_state.json');
    let startIndex = 0;

    try {
        await fs.promises.access(stateFile);
        const stateStr = await fs.promises.readFile(stateFile, 'utf-8');
        const state = JSON.parse(stateStr);
        if (state.last_zip_code) {
            const foundIndex = allZipCodes.indexOf(state.last_zip_code);
            if (foundIndex !== -1) {
                startIndex = foundIndex;
                console.log(`[RESUME] Found previous state. Resuming from zip code: ${state.last_zip_code} (Index: ${startIndex})`);
            }
        }
    } catch (e) {
        // State file does not exist or invalid, start from beginning
        console.warn("Could not find or parse scraper_state.json, starting from beginning.");
    }

    const zipsToProcess = allZipCodes.slice(startIndex);
    console.log(`Starting to process ${zipsToProcess.length} zip codes...`);

    for (let i = 0; i < zipsToProcess.length; i++) {
        const zip = zipsToProcess[i];

        // Save current state before processing the zip code
        await fs.promises.writeFile(stateFile, JSON.stringify({ last_zip_code: zip }), 'utf-8');
        console.log(`\n[${startIndex + i + 1}/${allZipCodes.length}] Fetching dealerships for zip code: ${zip}`);

        let allPlacesForZip: Place[] = [];
        let pageToken: string | undefined = undefined;

        const baseRequestBody = {
            textQuery: `car dealerships in ${zip}`,
            includedType: "car_dealer",
            languageCode: "en"
        };

        try {
            while (allPlacesForZip.length < 60) {
                const requestBody = {
                    ...baseRequestBody,
                    ...(pageToken ? { pageToken } : {})
                };

                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Goog-Api-Key': API_KEY as string,
                        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.reviews,nextPageToken'
                    },
                    body: JSON.stringify(requestBody)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`API Error: ${response.status} ${response.statusText}\n${errorText}`);
                }

                const data: PlacesResponse = (await response.json()) as PlacesResponse;

                if (data.places && data.places.length > 0) {
                    const remainingAllowed = 60 - allPlacesForZip.length;
                    const placesToAdd = data.places.slice(0, remainingAllowed);
                    allPlacesForZip = allPlacesForZip.concat(placesToAdd);

                    console.log(`  Fetched ${placesToAdd.length} places. Total for ${zip}: ${allPlacesForZip.length}/60`);
                } else {
                    console.log(`  No places found on this page for ${zip}.`);
                    break;
                }

                pageToken = data.nextPageToken;
                if (!pageToken || allPlacesForZip.length >= 60) {
                    break;
                }

                console.log("  Waiting 2 seconds before fetching next page...");
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            // --- Database Insertion (Using Transaction) ---
            if (allPlacesForZip.length > 0) {
                console.log(`  Starting database transaction to insert ${allPlacesForZip.length} dealerships...`);
                const client = await pool.connect();

                try {
                    await client.query('BEGIN');

                    for (const place of allPlacesForZip) {
                        const placeId = place.id;
                        if (!placeId) continue;

                        const name = place.displayName?.text || '';
                        const address = place.formattedAddress || '';
                        const rating = place.rating !== undefined ? place.rating : null;
                        const userRatingCount = place.userRatingCount !== undefined ? place.userRatingCount : null;
                        const fetchDate = new Date().toISOString();

                        // Insert Dealership
                        await client.query(`
                            INSERT INTO raw_dealerships (place_id, name, address, zip_code, rating, user_rating_count, fetch_date)
                            VALUES ($1, $2, $3, $4, $5, $6, $7)
                            ON CONFLICT (place_id) 
                            DO UPDATE SET 
                                fetch_date = EXCLUDED.fetch_date,
                                rating = EXCLUDED.rating,
                                user_rating_count = EXCLUDED.user_rating_count
                        `, [placeId, name, address, zip, rating, userRatingCount, fetchDate]);

                        // Insert Reviews
                        if (place.reviews && place.reviews.length > 0) {
                            for (const review of place.reviews) {
                                let reviewerId = review.authorAttribution?.uri || '';

                                // Attempt to extract numeric ID
                                const uriMatch = reviewerId.match(/contrib\/(\d+)/);
                                if (uriMatch && uriMatch[1]) {
                                    reviewerId = uriMatch[1];
                                } else {
                                    // Fallback: Generate a hash from name and publish time
                                    reviewerId = generateFallbackReviewerId(review);
                                }

                                const text = review.text?.text || review.originalText?.text || '';
                                const reviewRating = review.rating !== undefined ? review.rating : null;
                                const publishTime = review.publishTime || null;

                                await client.query(`
                                    INSERT INTO raw_reviews (place_id, reviewer_id, text, rating, publish_time, fetch_date)
                                    VALUES ($1, $2, $3, $4, $5, $6)
                                    ON CONFLICT (place_id, reviewer_id) 
                                    DO NOTHING
                                `, [placeId, reviewerId, text, reviewRating, publishTime, fetchDate]);
                            }
                        }
                    }

                    await client.query('COMMIT');
                    console.log(`  Successfully committed data for zip code: ${zip}`);
                } catch (dbError) {
                    await client.query('ROLLBACK');
                    console.error(`  [DB Error] Transaction failed for zip code ${zip}. Rolled back.`, dbError);
                    throw dbError; // Rethrow to stop the script and trigger the outer catch block
                } finally {
                    client.release();
                }
            }

        } catch (error) {
            console.error(`\n[ERROR] Failed to execute test for ${zip}:`, error instanceof Error ? error.message : error);
            console.log(`\nStopping program to allow resume. Fix the issue and run again to resume from ${zip}`);
            await pool.end();
            process.exit(1);
        }
        console.log("  Waiting 2 seconds before fetching next zip code...");
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log("\nAll zip codes processed successfully!");
    // Delete state file if completely finished
    try {
        await fs.promises.unlink(stateFile);
        console.log("Cleared resume state file.");
    } catch {
        // Ignore if file doesn't exist
    }
    await pool.end();
}

testGooglePlacesAPI().catch(async err => {
    console.error("Fatal error:", err);
    try {
        await pool.end();
    } catch (e) {
        console.error("Error closing pool:", e);
    }
    process.exit(1);
});
