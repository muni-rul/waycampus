import assert from 'assert';
import fs from 'fs';
import path from 'path';

console.log('=== RUNNING SITEMAP & ROBOTS VERIFICATION ===');

const sitemapPath = path.resolve(__dirname, '../../client/public/sitemap.xml');
const robotsPath = path.resolve(__dirname, '../../client/public/robots.txt');

// 1. Read and parse sitemap.xml
const sitemapContent = fs.readFileSync(sitemapPath, 'utf8');

// Match <loc> URLs
const locMatches = [...sitemapContent.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1].trim());
console.log('Found sitemap URLs:', locMatches);

// Must contain exactly 1 URL
assert.strictEqual(locMatches.length, 1, `Sitemap must contain exactly one URL, found ${locMatches.length}`);

// URL must be exactly https://campnav-b3om.onrender.com/
const expectedUrl = 'https://campnav-b3om.onrender.com/';
assert.strictEqual(locMatches[0], expectedUrl, `Sitemap URL must be '${expectedUrl}', got '${locMatches[0]}'`);

// Check no hash URLs, no admin, no api
assert(!locMatches[0].includes('#'), 'Sitemap must not contain hash URLs');
assert(!locMatches[0].includes('admin'), 'Sitemap must not contain admin URLs');
assert(!locMatches[0].includes('api'), 'Sitemap must not contain api URLs');

// Check lastmod is today
const todayStr = '2026-11-13'; // Local current date
const lastmodMatch = sitemapContent.match(/<lastmod>(.*?)<\/lastmod>/);
assert(lastmodMatch, 'Sitemap must have a <lastmod> tag');
assert.strictEqual(lastmodMatch[1].trim(), todayStr, `lastmod must be today (${todayStr}), got ${lastmodMatch[1]}`);

// Verify valid XML structure
assert(sitemapContent.startsWith('<?xml'), 'Sitemap must start with XML declaration');
assert(sitemapContent.includes('<urlset') && sitemapContent.includes('</urlset>'), 'Sitemap must have valid urlset tags');

// 2. Verify robots.txt
const robotsContent = fs.readFileSync(robotsPath, 'utf8');
assert(robotsContent.includes('Disallow: /api/'), 'robots.txt must contain Disallow: /api/');
assert(robotsContent.includes('Sitemap: https://campnav-b3om.onrender.com/sitemap.xml'), 'robots.txt must reference sitemap');

console.log('✓ SITEMAP & ROBOTS.TXT VERIFICATION PASSED');
