import { Pool } from 'pg';
import 'dotenv/config';
import { ChatOpenAI } from '@langchain/openai';
import { reviewClassificationSchema, reviewPromptTemplate, systemInstructions } from './prompt';

const API_KEY = process.env.OPENAI_API_KEY;
const DB_CONN_STRING = process.env.DB_CONN_STRING;
const classifierVersion = "1.5.0-gpt-5-mini";

// Test batch: the dealerships nearest Westwood, LA
// Usage: npx tsx scripts/classify_reviews.ts [dealership_count]   (default 100)
const TARGET_LAT = 34.0635;
const TARGET_LNG = -118.4455;
const TARGET_DEALERSHIP_COUNT = process.argv[2] ? parseInt(process.argv[2], 10) : 100;

if (!API_KEY || !DB_CONN_STRING) {
    console.error("Missing OPENAI_API_KEY or DB_CONN_STRING in environment variables.");
    process.exit(1);
}

const pool = new Pool({
    connectionString: DB_CONN_STRING,
});

// Helper function to manage concurrency
async function asyncPool(concurrency: number, iterable: any[], iteratorFn: (item: any) => Promise<any>) {
    const ret = [];
    const executing = new Set();
    for (const item of iterable) {
        const p = Promise.resolve().then(() => iteratorFn(item));
        ret.push(p);
        executing.add(p);
        const clean = () => executing.delete(p);
        p.then(clean).catch(clean);
        if (executing.size >= concurrency) {
            await Promise.race(executing);
        }
    }
    return Promise.all(ret);
}

async function main() {
    console.log("Starting review classification...");

    const llm = new ChatOpenAI({
        // gpt-5 models are reasoning models: no temperature, effort controls cost/quality
        model: "gpt-5-mini",
        reasoning: { effort: "medium" },
        apiKey: API_KEY
    });

    const structuredLlm = llm.withStructuredOutput(reviewClassificationSchema, {
        name: "review_classification",
    });

    try {
        // Reviews of the TARGET_DEALERSHIP_COUNT dealerships nearest the target point that
        // have not been classified by this classifier version yet
        console.log(`Fetching reviews for the ${TARGET_DEALERSHIP_COUNT} dealerships nearest (${TARGET_LAT}, ${TARGET_LNG})...`);
        const result = await pool.query(`
            WITH target AS (
                SELECT d.place_id
                FROM raw_dealerships d
                WHERE d.location IS NOT NULL
                AND EXISTS (SELECT 1 FROM raw_reviews r WHERE r.place_id = d.place_id AND r.text <> '')
                ORDER BY d.location <-> ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
                LIMIT $3
            )
            SELECT r.review_id, r.text
            FROM raw_reviews r
            JOIN target USING (place_id)
            WHERE r.text IS NOT NULL AND r.text <> ''
            AND NOT EXISTS (
                SELECT 1 FROM classified_reviews c
                WHERE c.review_id = r.review_id AND c.classifier_version = $4
            )
        `, [TARGET_LAT, TARGET_LNG, TARGET_DEALERSHIP_COUNT, classifierVersion]);

        const reviews = result.rows;
        console.log(`Found ${reviews.length} reviews.`);

        if (reviews.length === 0) {
            console.log("No reviews found. Exiting.");
            return;
        }

        console.log("Processing reviews with concurrency limit of 10...");

        // Process with concurrency 10
        const processReview = async (review: any) => {
            console.log(`Processing review ID: ${review.review_id}`);

            try {
                const promptValue = await reviewPromptTemplate.format({
                    systemInstructions: systemInstructions,
                    reviewText: review.text
                });

                const classification = await structuredLlm.invoke(promptValue);

                // Drop excerpts that are not actually in the review, then keep only
                // categories that still have at least one supporting excerpt
                const normalize = (str: string) => str.toLowerCase().replace(/\s+/g, ' ').trim();
                const reviewText = normalize(review.text);
                const excerpts = classification.excerpts
                    .map(e => ({ ...e, excerpts: e.excerpts.filter(x => reviewText.includes(normalize(x))) }))
                    .filter(e => e.excerpts.length > 0);
                const dropped = classification.excerpts.reduce((n, e) => n + e.excerpts.length, 0)
                    - excerpts.reduce((n, e) => n + e.excerpts.length, 0);
                if (dropped > 0) {
                    console.warn(`  Review ${review.review_id}: dropped ${dropped} excerpt(s) not found in review text`);
                }
                const categories = [...new Set(excerpts.map(e => e.categoryId))].sort((a, b) => a - b);

                await pool.query(`
                    INSERT INTO classified_reviews (review_id, classifier_version, categories, excerpts)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (review_id, classifier_version)
                    DO UPDATE SET
                        categories = EXCLUDED.categories,
                        excerpts = EXCLUDED.excerpts,
                        classified_at = now()
                `, [review.review_id, classifierVersion, categories, JSON.stringify(excerpts)]);

                return review.review_id;
            } catch (err) {
                console.error(`Error processing review ID ${review.review_id}:`, err);
                return null;
            }
        };

        const results = await asyncPool(10, reviews, processReview);
        const succeeded = results.filter(r => r !== null).length;
        console.log(`Wrote ${succeeded}/${reviews.length} classifications to classified_reviews (version ${classifierVersion}).`);
        if (succeeded < reviews.length) {
            console.log("Re-run to retry the failed reviews; completed ones are skipped.");
        }
    } catch (error) {
        console.error("Fatal error:", error);
    } finally {
        await pool.end();
    }
}

main();
