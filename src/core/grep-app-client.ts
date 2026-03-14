import axios from 'axios';
import { GrepAppResponse, SearchParams, SearchParamsSchema } from './types.js';
import { IHits, createHits, addHit, mergeHits } from './hits.js';
import { logger } from './logger.js';
import { generateCacheKey, getCachedData, cacheData } from './cache.js';
import { withRetry } from './retry.js';

/** Delay between sequential page fetches to avoid burst rate limiting (ms). */
const INTER_PAGE_DELAY_MS = 300;

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetches a single page of results from the grep.app API.
 * Wrapped with retry logic for 429/5xx resilience.
 */
async function fetchGrepApp(page: number, args: SearchParams): Promise<{ nextPage: number | null, hits: IHits, count: number }> {
    const cacheKey = generateCacheKey({ query: args.query, page });
    
    // Try to get from cache first
    const cached = await getCachedData<{ nextPage: number | null, hits: IHits, count: number }>(cacheKey);
    if (cached) {
        return cached.data;
    }

    // Fetch from API with retry on 429/5xx
    const response = await withRetry(
        () => axios.get<GrepAppResponse>('https://grep.app/api/search', {
            params: {
                q: args.query,
                page: page.toString(),
                case: args.caseSensitive ? '1' : '0',
                regexp: args.useRegex ? '1' : '0',
                words: args.wholeWords ? '1' : '0',
                repo: args.repoFilter || '',
                path: args.pathFilter || '',
                lang: args.langFilter || ''
            }
        }),
        { maxRetries: 3, baseDelay: 1000, maxDelay: 30000 }
    );

    const hits = createHits();
    const hitData = response.data.hits.hits;

    // Process and add hits
    for (const hit of hitData) {
        addHit(hits, hit.repo.raw, hit.path.raw, hit.content.snippet);
    }

    const results = {
        nextPage: page < response.data.facets.pages ? page + 1 : null,
        hits,
        count: response.data.facets.count
    };

    // Cache the results
    await cacheData(cacheKey, results, args.query);

    return results;
}

/**
 * The main search function that handles pagination and orchestrates the API calls.
 */
export const searchTool = {
    name: 'search',
    description: 'Search code across repositories using grep.app',
    parameters: SearchParamsSchema,
    annotations: {
        title: 'Code Search',
        readOnlyHint: true,
        openWorldHint: true
    },
    execute: async (args: SearchParams, { log, reportProgress }: any) => {
        logger.info(`Starting code search for query: "${args.query}"`, { query: args.query });
        log.info(`Starting code search for query: "${args.query}"`);
        
        let page = 1;
        let allHits = createHits();
        let totalCount = 0;

        while (true) {
            const results = await fetchGrepApp(page, args);
            mergeHits(allHits, results.hits);
            totalCount = results.count;

            // Report progress
            const progress = Math.min(page * 10, totalCount);
            await reportProgress({ progress, total: totalCount });

            if (!results.nextPage || page >= 5) break;

            // Delay between page fetches to avoid burst rate limiting
            await sleep(INTER_PAGE_DELAY_MS);
            page = results.nextPage;
        }

        const repoCount = Object.keys(allHits.hits).length;
        logger.info(`Search complete. Found matches in ${repoCount} repositories.`, { repoCount });
        log.info(`Search complete. Found matches in ${repoCount} repositories.`);

        // Cache the complete search results for batch retrieval
        const completeCacheKey = generateCacheKey({ query: args.query });
        const completeResults = {
            nextPage: null,
            hits: allHits,
            count: totalCount
        };
        await cacheData(completeCacheKey, completeResults, args.query);

        return {
            hits: allHits,
            count: totalCount
        };
    }
};
