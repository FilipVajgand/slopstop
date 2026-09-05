/*
  * Slopstop - background worker
 *
 * Owns every network fetch. Content scripts run in the page's origin and are
 * subject to its CORS policy, and zoundhub.com sends no
 * access-control-allow-origin header - so a content script cannot read it and
 * would silently fall back to CennoxX alone. Extension contexts get the
 * cross-origin access granted by host_permissions, so the fetching lives here
 * and everything else asks for the result.
 *
 * Self-contained on purpose: Chrome loads this as a service worker (single
 * file), Firefox as an event page script.
 */

const api = globalThis.browser ?? globalThis.chrome;

const AI_SOURCES = [
    {
        name: 'CennoxX',
        url: 'https://raw.githubusercontent.com/CennoxX/spotify-ai-blocker/main/SpotifyAiArtists.csv',
        parse: parseArtistCsv,
        required: true
    },
    {
        name: 'Zoundhub',
        url: 'https://zoundhub.com/api/artists/all',
        parse: parseArtistJson,
        required: false
    }
];

const AI_CACHE_KEY = 'aiArtistCache';
const AI_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/* Columns are "artist,id"; names may be quoted and contain commas. */
function parseArtistCsv(text) {
    const lines = text.split(/\r?\n/);
    const names = [];

    for (let i = 1; i < lines.length; i++) { // skip header
        const line = lines[i];
        if (!line.trim()) continue;

        let name;
        if (line[0] === '"') {
            let j = 1;
            let buf = '';
            while (j < line.length) {
                if (line[j] === '"') {
                    if (line[j + 1] === '"') { buf += '"'; j += 2; continue; }
                    break;
                }
                buf += line[j++];
            }
            name = buf;
        } else {
            const comma = line.lastIndexOf(',');
            name = comma === -1 ? line : line.slice(0, comma);
        }

        name = name.trim();
        if (name) names.push(name);
    }

    return names;
}

/*
 * Accepts an array of objects ({ name, ... }), an array of bare strings, or an
 * object wrapping either. Entries flagged `removed` are dropped.
 */
function parseArtistJson(text) {
    const data = JSON.parse(text);

    let raw = [];
    if (Array.isArray(data)) raw = data;
    else if (data && Array.isArray(data.artists)) raw = data.artists;
    else if (data && typeof data === 'object') raw = Object.values(data).flat();

    return raw
        .filter(entry => !(entry && typeof entry === 'object' && entry.removed))
        .map(entry => {
            if (typeof entry === 'string') return entry;
            if (entry && typeof entry.name === 'string') return entry.name;
            return '';
        })
        .map(name => name.trim())
        .filter(Boolean);
}

async function fetchSource(source) {
    // Cache-bust so a manual refresh is not served by the HTTP cache.
    const sep = source.url.includes('?') ? '&' : '?';
    const response = await fetch(`${source.url}${sep}t=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return source.parse(await response.text());
}

/*
 * Resolves to { artists, count, fetchedAt, perSource, stale, errors }.
 * Falls back to the cached copy (however old) when the required source is
 * unavailable, so a failed sync never silently empties the blocklist.
 */
async function loadAiArtists({ force = false } = {}) {
    let cached = null;
    try {
        const stored = await api.storage.local.get([AI_CACHE_KEY]);
        cached = stored[AI_CACHE_KEY] || null;
    } catch (e) { }

    const fromCache = (stale) => ({
        artists: cached.artists,
        count: cached.artists.length,
        fetchedAt: cached.fetchedAt,
        perSource: cached.perSource || {},
        stale,
        errors: []
    });

    const age = cached ? Date.now() - (cached.fetchedAt || 0) : Infinity;
    if (!force && cached && Array.isArray(cached.artists) && age < AI_CACHE_TTL_MS) {
        return fromCache(false);
    }

    const settled = await Promise.allSettled(AI_SOURCES.map(fetchSource));

    const perSource = {};
    const errors = [];
    const merged = [];
    const seen = new Set();
    let requiredFailed = false;

    settled.forEach((result, i) => {
        const source = AI_SOURCES[i];

        if (result.status !== 'fulfilled') {
            perSource[source.name] = 0;
            errors.push(`${source.name}: ${result.reason && result.reason.message}`);
            if (source.required) requiredFailed = true;
            return;
        }

        let added = 0;
        for (const name of result.value) {
            const key = name.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(name);
            added++;
        }
        perSource[source.name] = added;
    });

    // A partial list would quietly stop blocking artists the cache still knows
    // about, so prefer stale-but-complete over fresh-but-missing.
    if (requiredFailed) {
        if (cached && Array.isArray(cached.artists)) {
            const result = fromCache(true);
            result.errors = errors;
            return result;
        }
        return { artists: [], count: 0, fetchedAt: 0, perSource, stale: true, errors };
    }

    const fetchedAt = Date.now();
    try {
        await api.storage.local.set({ [AI_CACHE_KEY]: { artists: merged, fetchedAt, perSource } });
    } catch (e) { }

    return { artists: merged, count: merged.length, fetchedAt, perSource, stale: false, errors };
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== 'ytmWard:getAiArtists') return false;

    loadAiArtists({ force: !!message.force })
        .then(sendResponse)
        .catch(e => sendResponse({
            artists: [], count: 0, fetchedAt: 0, perSource: {},
            stale: true, errors: [String(e && e.message)]
        }));

    return true; // keep the channel open for the async reply
});
