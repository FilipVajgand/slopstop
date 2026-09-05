/*
  * Slopstop - Shared runtime
 * Loaded before content.js (content script) and popup.js (popup page).
 * Both are classic scripts, so these top-level bindings are visible to them.
 */

/*
 * Cross-browser API handle.
 *
 * Firefox exposes promise-returning APIs on `browser` and the callback flavour
 * on the `chrome` alias, so `await chrome.storage.local.get(...)` resolves to
 * undefined there. Chrome MV3 has no `browser`, but its `chrome` APIs return
 * promises. Preferring `browser` gives us promises on both.
 */
const api = globalThis.browser ?? globalThis.chrome;

/*
 * The AI database lives in background.js, which owns every fetch: content
 * scripts inherit the page's CORS policy and zoundhub.com sends no
 * access-control-allow-origin header, so a content script silently loses that
 * source. Extension contexts do not have that restriction.
 */
const USER_LIST_KEYS = ['blockedArtists', 'blockedKeywords', 'blockedTracks'];

const EMPTY_AI_RESULT = {
    artists: [], count: 0, fetchedAt: 0, perSource: {}, stale: true,
    errors: ['background worker unavailable']
};

async function loadAiArtists({ force = false } = {}) {
    try {
        const result = await api.runtime.sendMessage({ type: 'ytmWard:getAiArtists', force });
        if (result && Array.isArray(result.artists)) return result;
    } catch (e) {
        return { ...EMPTY_AI_RESULT, errors: [String(e && e.message)] };
    }
    return EMPTY_AI_RESULT;
}
