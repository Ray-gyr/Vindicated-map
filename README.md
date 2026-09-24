# Vindicated Map - Data Pipeline Reference

> **Building the map or working with the database?** Start with [docs/DATA_PIPELINE.md](docs/DATA_PIPELINE.md). It covers the current tables, tiers, how to read the data from Supabase, and operational warnings (Supabase inactivity pausing, expiring API keys).

## Overview
This repository contains the core logic and prompts for the **Review Fetching and Classification Pipeline**. It is intended to serve as a reference for the actual website/backend team to integrate into the main production environment. 

The pipeline does two main things:
1. **Data Ingestion**: Fetches car dealership data and their reviews using the Google Places API.
2. **AI Classification**: Uses OpenAI's LLMs (via LangChain) to analyze review text, categorize the feedback, and extract relevant quotes/excerpts.

---

## Code Files to Reuse

For integrating into the main website's backend, the engineering team should focus on the following files:

### 1. AI Prompt & Data Schema (`scripts/prompt.ts`)
**This is the most critical file.** It contains the carefully tuned system instructions, prompt templates, and the `Zod` schema definition (`reviewClassificationSchema`). 
- **Action**: The backend team should port these exact strings and the structured output schema into the main app's AI service.

### 2. LLM Execution Logic (`scripts/classify_reviews.ts`)
Demonstrates how to invoke the OpenAI model (`gpt-5-mini`) using LangChain's `withStructuredOutput`. 
- **Action**: Use this as a reference for handling concurrency, invoking the LLM with the defined prompt, and parsing the JSON output.

### 3. Google API Fetching Logic (`scripts/fetch_review.ts`)
Shows the exact `POST` request to `https://places.googleapis.com/v1/places:searchText`, including the required headers (`X-Goog-FieldMask`) and pagination logic.
- **Action**: Adapt this logic to the main app's data ingestion workers or cron jobs.

---

## Database Schema Reference

To support this pipeline, the production database needs to store the raw data before passing it to the AI. Here is the reference schema for the raw tables. The classification output tables (`classified_reviews`, `dealership_tiers`) and the `dealership_map` view are documented in [docs/DATA_PIPELINE.md](docs/DATA_PIPELINE.md), and the SQL is in `db/`.

**`raw_dealerships`**
- `place_id` (TEXT, Primary Key): Unique Google Place ID.
- `name` (TEXT): Dealership name.
- `address` (TEXT): Formatted address.
- `zip_code` (TEXT): Zip code area where the dealership was searched.
- `rating` (NUMERIC): Average user rating.
- `user_rating_count` (INTEGER): Total number of ratings.
- `location` (GEOGRAPHY(Point, 4326)): Dealership coordinates (PostGIS).

**`raw_reviews`**
- `review_id` (SERIAL, Primary Key): Internal unique ID.
- `place_id` (TEXT): Foreign key referencing `raw_dealerships.place_id`.
- `reviewer_id` (TEXT): Google contributor ID or generated hash for the reviewer.
- `text` (TEXT): The content of the review.
- `rating` (NUMERIC): Star rating given by the user.
- `publish_time` (TIMESTAMP WITH TIME ZONE): Date when the review was posted.
- `status` (VARCHAR): Legacy flag, no longer used. Classification state is tracked per version in `classified_reviews`.

---

## Dependencies to Add
To run the AI classification in the main app, ensure the following packages (or their equivalents in your language stack) are installed:
- `@langchain/openai`
- `zod`

## Production Considerations & Known Issues
- **Model Selection**: The current prompt has been highly optimized and tested against a gold set. During testing with `gpt-4o-mini`, only 1 category out of 60 was misclassified. However, to minimize occasional hallucinations and misjudgments in production, it is recommended to evaluate using a more advanced model (e.g., `gpt-4o`). Add human complaint channel on the website is also necessary. 
- **Concurrency**: The AI processing is currently managed with an in-memory async pool (concurrency of 10).
- **Google API Limits**: Ensure proper rate limiting and quota management when integrating the `fetch_review.ts` logic.
