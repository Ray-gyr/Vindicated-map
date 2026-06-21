import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import 'dotenv/config';
import { ChatOpenAI } from '@langchain/openai';
import { reviewClassificationSchema, reviewPromptTemplate, systemInstructions } from './prompt';

const API_KEY = process.env.OPENAI_API_KEY;
const DB_CONN_STRING = process.env.DB_CONN_STRING;
const classifierVersion = "1.0.0-gpt-4o-mini";

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
        model: "gpt-4o-mini",
        temperature: 0,
        apiKey: API_KEY
    });

    const structuredLlm = llm.withStructuredOutput(reviewClassificationSchema, {
        name: "review_classification",
    });

    try {
        // Fetch 200 reviews for processing
        console.log("Fetching 200 reviews from database...");
        // Exclude those we already processed (status = 'processed') if status column is active, 
        // but for now we just get 50 rows.
        const result = await pool.query(`
            SELECT review_id, text 
            FROM raw_reviews 
            WHERE text IS NOT NULL AND text != ''
            AND (status = 'unprocessed' OR status IS NULL)
            LIMIT 200
        `);

        const reviews = result.rows;
        console.log(`Found ${reviews.length} reviews.`);

        if (reviews.length === 0) {
            console.log("No reviews found. Exiting.");
            return;
        }

        const classifiedDate = new Date().toISOString();
        const outputPath = path.join(__dirname, 'classified_reviews.csv');

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

                const outputRecord = {
                    review_id: review.review_id,
                    original_text: review.text,
                    categories: classification.categories,
                    excerpts: classification.excerpts,
                    classifier_version: classifierVersion,
                    classified_date: classifiedDate
                };

                return outputRecord;
            } catch (err) {
                console.error(`Error processing review ID ${review.review_id}:`, err);
                return null;
            }
        };

        const results = await asyncPool(10, reviews, processReview);

        // Filter out nulls from errors
        const validResults = results.filter(r => r !== null);

        console.log(`Writing ${validResults.length} records to ${outputPath}...`);

        // Function to escape CSV fields
        const escapeCSV = (val: any) => {
            if (val === null || val === undefined) return '';
            const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
            if (str.includes(',') || str.includes('\n') || str.includes('"')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        // Check if file exists to write header
        const fileExists = fs.existsSync(outputPath);

        let csvContent = '';
        if (!fileExists) {
            csvContent += 'review_id,original_text,categories,excerpts,classifier_version,classified_date\n';
        }

        for (const r of validResults) {
            const row = [
                r.review_id,
                r.original_text,
                r.categories,
                r.excerpts,
                r.classifier_version,
                r.classified_date
            ].map(escapeCSV).join(',');
            csvContent += row + '\n';
        }

        await fs.promises.appendFile(outputPath, csvContent, 'utf-8');

        // Mark as processed in database
        if (validResults.length > 0) {
            console.log("Updating database to mark reviews as processed...");
            const processedIds = validResults.map(r => r.review_id);
            // $1 is an array of IDs
            await pool.query(
                `UPDATE raw_reviews SET status = 'processed' WHERE review_id = ANY($1)`,
                [processedIds]
            );
        }

        console.log("Done!");
    } catch (error) {
        console.error("Fatal error:", error);
    } finally {
        await pool.end();
    }
}

main();
