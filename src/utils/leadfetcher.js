/**
 * leadFetcher.js
 * Production-ready lead fetching using ScraperAPI Structured Endpoint (JSON)
 * + per-platform deep-link scraping for LinkedIn, Upwork, Twitter, Facebook, Reddit
 */

const axios   = require('axios');
const cheerio = require('cheerio');

// ─── Environment Validation ───────────────────────────────────────────────────

function validateEnv() {
  if (!process.env.SCRAPER_API_KEY) {
    throw new Error('Missing required environment variable: SCRAPER_API_KEY');
  }
}

// ─── Logger ───────────────────────────────────────────────────────────────────

const logger = {
  info:  (msg, meta = {}) => console.log(`[INFO]  ${new Date().toISOString()} ${msg}`, Object.keys(meta).length ? meta : ''),
  warn:  (msg, meta = {}) => console.warn(`[WARN]  ${new Date().toISOString()} ${msg}`, Object.keys(meta).length ? meta : ''),
  error: (msg, meta = {}) => console.error(`[ERROR] ${new Date().toISOString()} ${msg}`, Object.keys(meta).length ? meta : ''),
};

// ─── Constants ────────────────────────────────────────────────────────────────

// ScraperAPI structured Google Search endpoint — returns clean JSON, no HTML parsing needed
const SCRAPER_GOOGLE_JSON_URL = 'https://api.scraperapi.com/structured/google/search';
// Generic scrape endpoint for deep-fetching individual pages
const SCRAPER_PAGE_URL        = 'http://api.scraperapi.com';

const MAX_RETRIES    = 3;
const RETRY_DELAY_MS = 2000;
const MAX_PAGES      = 3; // up to 30 organic results per platform

// In-memory cache: cacheKey → { ts, leads }
const cache        = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Extract unique, valid-looking emails from a text blob */
function extractEmails(text) {
  if (!text) return [];
  const raw = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [];
  return [...new Set(raw)].filter(e =>
    !e.includes('example.com') &&
    !e.includes('test.com') &&
    !e.includes('sentry.io') &&
    !e.endsWith('.png') &&
    !e.endsWith('.jpg')
  );
}

/**
 * Build the client-focused Google query.
 * When a non-Google platform is specified, add site: to constrain results.
 */
function buildSearchQuery(keyword, platform = 'Google') {
  const k = keyword.trim();
  let q = `"looking for ${k}" OR "hiring ${k}" OR "need ${k}" OR "seeking ${k}" OR "require ${k}"`;
  q += ` -freelancer -freelance -hireme -"I am ${k}" -"I'm a ${k}"`;

  const siteMap = {
    LinkedIn: 'site:linkedin.com',
    Upwork:   'site:upwork.com',
    Twitter:  'site:twitter.com OR site:x.com',
    Facebook: 'site:facebook.com',
    Reddit:   'site:reddit.com',
  };
  if (siteMap[platform]) q += ` ${siteMap[platform]}`;
  return q;
}

/** Infer company name from a URL */
function domainToCompany(url) {
  try {
    return new URL(url).hostname
      .replace(/^www\./, '')
      .split('.')[0]
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  } catch { return null; }
}

/** Map a URL back to a platform label */
function detectPlatform(url = '') {
  if (url.includes('linkedin.com'))                      return 'LinkedIn';
  if (url.includes('upwork.com'))                        return 'Upwork';
  if (url.includes('twitter.com') || url.includes('x.com')) return 'Twitter';
  if (url.includes('facebook.com'))                      return 'Facebook';
  if (url.includes('reddit.com'))                        return 'Reddit';
  if (url.includes('indeed.com'))                        return 'Indeed';
  return 'Google';
}

// ─── ScraperAPI: Structured Google Search → clean JSON ───────────────────────

/**
 * Calls ScraperAPI's /structured/google/search endpoint.
 * Returns JSON with organic_results[], no brittle HTML selectors required.
 * Docs: https://docs.scraperapi.com/making-requests/structured-data-collection/google-search
 */
async function fetchStructuredSERP(query, page = 0) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.info(`Structured SERP request`, { query: query.slice(0, 80), page: page + 1, attempt });
      const { data } = await axios.get(SCRAPER_GOOGLE_JSON_URL, {
        params: {
          api_key:      process.env.SCRAPER_API_KEY,
          query,
          page:         page + 1,   // ScraperAPI is 1-indexed
          num:          10,
          country_code: 'us',
          output:       'json',
        },
        timeout: 30000,
      });
      return data;
    } catch (err) {
      const isLast = attempt === MAX_RETRIES;
      logger.warn(`SERP attempt ${attempt} failed: ${err.message}`, { isLast });
      if (isLast) throw new Error(`ScraperAPI SERP failed after ${MAX_RETRIES} retries: ${err.message}`);
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }
}

/** Pull organic results out of the structured JSON */
function parseStructuredResults(data) {
  const organic = data?.organic_results || [];
  return organic
    .map(r => ({
      title:   r.title   || '',
      url:     r.link    || r.url || '',
      snippet: r.snippet || r.description || '',
    }))
    .filter(r => r.url && r.title);
}

// ─── ScraperAPI: Deep-fetch an individual page ────────────────────────────────

async function fetchPageContent(url) {
  try {
    const { data } = await axios.get(SCRAPER_PAGE_URL, {
      params: { api_key: process.env.SCRAPER_API_KEY, url, render: false },
      timeout: 25000,
    });
    return typeof data === 'string' ? data : JSON.stringify(data);
  } catch (err) {
    logger.warn(`Page fetch failed: ${url.slice(0, 60)}`, { error: err.message });
    return '';
  }
}

// ─── Platform-specific page parsers ──────────────────────────────────────────
// Each receives raw HTML + source URL, returns { name, company, location, emails }

function parseLinkedInPage(html, url) {
  const $ = cheerio.load(html);
  return {
    name:     $('h1').first().text().trim() || null,
    company:  $('.top-card-layout__company, .org-top-card__name').first().text().trim() || domainToCompany(url),
    location: $('.top-card__subline-item, .org-top-card__location').first().text().trim() || null,
    emails:   extractEmails($('body').text()),
  };
}

function parseUpworkPage(html, url) {
  const $ = cheerio.load(html);
  return {
    name:     $('h1, h2').first().text().trim() || null,
    company:  $('[data-test="client-name"], .client-name').first().text().trim() || null,
    location: $('[data-test="client-location"], .client-location').first().text().trim() || null,
    emails:   extractEmails($('body').text()),
  };
}

function parseTwitterPage(html) {
  const $ = cheerio.load(html);
  return {
    name:     $('[data-testid="UserName"] span, .username').first().text().trim() || null,
    company:  null,
    location: null,
    emails:   extractEmails($('body').text()),
  };
}

function parseFacebookPage(html) {
  const $ = cheerio.load(html);
  return { name: null, company: null, location: null, emails: extractEmails($('body').text()) };
}

function parseRedditPage(html) {
  const $ = cheerio.load(html);
  const postText = $('[data-testid="post-container"], .usertext-body, #siteTable').text()
    || $('body').text();
  return {
    name:     $('.author, [data-testid="post_author_link"]').first().text().trim() || null,
    company:  null,
    location: null,
    emails:   extractEmails(postText),
  };
}

function parseGenericPage(html, url) {
  const $ = cheerio.load(html);
  return {
    name:     $('h1').first().text().trim() || null,
    company:  domainToCompany(url),
    location: null,
    emails:   extractEmails($('body').text()),
  };
}

/** Route to the right parser */
function parsePage(html, url) {
  switch (detectPlatform(url)) {
    case 'LinkedIn': return parseLinkedInPage(html, url);
    case 'Upwork':   return parseUpworkPage(html, url);
    case 'Twitter':  return parseTwitterPage(html);
    case 'Facebook': return parseFacebookPage(html);
    case 'Reddit':   return parseRedditPage(html);
    default:         return parseGenericPage(html, url);
  }
}

// ─── Optional GPT Filter ─────────────────────────────────────────────────────

async function isClientPost(title, snippet) {
  if (!process.env.OPENAI_API_KEY) return true;
  try {
    const { data } = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        max_tokens: 5,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'Classify this search result. Reply ONLY with CLIENT (someone HIRING), ' +
              'FREELANCER (someone offering their own services), or OTHER.',
          },
          { role: 'user', content: `Title: ${title}\nSnippet: ${snippet}` },
        ],
      },
      {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 15000,
      }
    );
    return data.choices?.[0]?.message?.content?.trim().toUpperCase() === 'CLIENT';
  } catch (err) {
    logger.warn('GPT filter failed, including by default', { error: err.message });
    return true; // fail open
  }
}

// ─── Date Filter ─────────────────────────────────────────────────────────────

function applyDateFilters(leads, { dateFrom, dateTo } = {}) {
  if (!dateFrom && !dateTo) return leads;
  return leads.filter(({ fetchedAt: ts }) => {
    if (dateFrom && ts < dateFrom) return false;
    if (dateTo   && ts > dateTo)   return false;
    return true;
  });
}

// ─── Core: fetchLeadsForPlatform ──────────────────────────────────────────────

/**
 * Unified lead fetcher for any platform.
 *
 * Flow:
 *  1. Build Google query scoped to this platform (site:linkedin.com etc.)
 *  2. Call ScraperAPI /structured/google/search → clean JSON list of URLs
 *  3. For each URL: try snippet emails first, otherwise deep-fetch the page
 *  4. Parse page with platform-specific parser to extract email + metadata
 *  5. Return only leads with at least one valid email
 */
async function fetchLeadsForPlatform(keyword, platform = 'Google', filters = {}) {
  validateEnv();

  const cacheKey = `${platform.toLowerCase()}:${keyword}`;
  const cached   = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    logger.info('Cache hit', { platform, keyword, count: cached.leads.length });
    return cached.leads;
  }

  const query = buildSearchQuery(keyword, platform);
  logger.info(`Starting fetch`, { platform, keyword });
  logger.info(`Query: ${query}`);

  const allResults = [];

  // Step 1 — collect SERP results
  for (let page = 0; page < MAX_PAGES; page++) {
    try {
      const serpData = await fetchStructuredSERP(query, page);
      const results  = parseStructuredResults(serpData);
      logger.info(`${platform} SERP page ${page + 1}: ${results.length} results`);
      allResults.push(...results);
      if (results.length < 10) break; // last page
      await sleep(800);
    } catch (err) {
      logger.error(`SERP page ${page + 1} failed`, { platform, error: err.message });
      break;
    }
  }

  if (!allResults.length) {
    logger.warn(`No SERP results`, { platform, keyword });
    return [];
  }

  logger.info(`${platform}: deep-fetching ${allResults.length} URLs`);

  const leads  = [];
  const useGPT = !!process.env.OPENAI_API_KEY;

  // Step 2 — deep-fetch each result URL
  for (const result of allResults) {
    try {
      // Optional: GPT pre-filter using cheap snippet data (saves credits)
      if (useGPT) {
        const ok = await isClientPost(result.title, result.snippet);
        if (!ok) {
          logger.info(`GPT filtered out`, { title: result.title.slice(0, 50) });
          continue;
        }
      }

      // Fast path: email visible in SERP snippet
      let emails     = extractEmails(`${result.title} ${result.snippet}`);
      let parsedMeta = { name: null, company: null, location: null };

      // Slow path: fetch the real page and parse it
      if (!emails.length) {
        logger.info(`Deep-fetching page`, { url: result.url.slice(0, 80) });
        const html   = await fetchPageContent(result.url);
        const parsed = parsePage(html, result.url);
        emails       = parsed.emails;
        parsedMeta   = { name: parsed.name, company: parsed.company, location: parsed.location };
        await sleep(600); // polite delay between page fetches
      }

      if (!emails.length) {
        logger.info(`No email found, skipping`, { url: result.url.slice(0, 80) });
        continue;
      }

      for (const email of emails) {
        leads.push({
          name:          parsedMeta.name || result.title.split('|')[0].split('-')[0].trim() || null,
          email,
          platform:      detectPlatform(result.url) || platform,
          jobField:      keyword,
          jobTitle:      keyword.replace(/\b\w/g, c => c.toUpperCase()),
          company:       parsedMeta.company || domainToCompany(result.url),
          location:      parsedMeta.location || null,
          profileUrl:    result.url,
          sourceSnippet: result.snippet?.slice(0, 200),
          fetchedAt:     new Date(),
        });
      }
    } catch (err) {
      logger.warn(`Error processing result`, { url: result.url?.slice(0, 60), error: err.message });
    }
  }

  const filtered = applyDateFilters(leads, filters);

  logger.info(`${platform} fetch complete`, {
    serpResults:     allResults.length,
    withEmail:       leads.length,
    afterDateFilter: filtered.length,
  });

  cache.set(cacheKey, { ts: Date.now(), leads: filtered });
  return filtered;
}

// ─── Convenience wrapper kept for backward compat ────────────────────────────

async function fetchGoogleLeads(keyword, filters = {}) {
  return fetchLeadsForPlatform(keyword, 'Google', filters);
}

/**
 * Dispatch to all requested platforms in parallel and merge + dedup results.
 */
async function fetchLeadsFromPlatforms(keyword, platforms = [], filters = {}) {
  const SUPPORTED = ['Google', 'LinkedIn', 'Upwork', 'Twitter', 'Facebook', 'Reddit'];

  const toFetch = platforms.filter(p => {
    const supported = SUPPORTED.some(s => s.toLowerCase() === p.toLowerCase());
    if (!supported) logger.warn(`Unsupported platform, skipping: ${p}`);
    return supported;
  });

  const settled = await Promise.allSettled(
    toFetch.map(platform => fetchLeadsForPlatform(keyword, platform, filters))
  );

  const allLeads = [];
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      allLeads.push(...result.value);
    } else {
      logger.error(`${toFetch[i]} fetch failed`, { error: result.reason?.message });
    }
  });

  // Dedup across platforms by email
  const seen = new Set();
  return allLeads.filter(lead => {
    if (seen.has(lead.email)) return false;
    seen.add(lead.email);
    return true;
  });
}


// ─── Named exports ────────────────────────────────────────────────────────────

exports.validateEnv        = validateEnv;
exports.fetchGoogleLeads        = fetchGoogleLeads;
exports.fetchLeadsForPlatform   = fetchLeadsForPlatform;
exports.fetchLeadsFromPlatforms = fetchLeadsFromPlatforms;
exports.buildSearchQuery        = buildSearchQuery;
exports.extractEmails           = extractEmails;
exports.isClientPost            = isClientPost;