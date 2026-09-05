/*
 * Slopstop - blocking engine
 *
 * Platform-agnostic. Everything that knows about a particular music service
 * lives in an adapter (see adapter-ytmusic.js for the contract); this file
 * contains no selectors and no site-specific knowledge.
 *
 * Shared helpers (`api`, `loadAiArtists`, `USER_LIST_KEYS`) come from
 * common.js, which is loaded first.
 */

/* ---------- tuning ---------- */

// Retries per track. A skip that fails should be attempted again rather than
// written off, but never in an endless loop.
const SKIP_BUDGET = 3;

// Database names shorter than this are held back: as whole-word matches they
// would fire against ordinary words. Applied to ASCII only.
const MIN_DB_TERM_LENGTH = 3;

const SETTLE_MS = 120;            // coalesce mutation bursts from the player
const VOTE_POLL_MS = 100;         // how often to check the downvote registered
const VOTE_POLL_TRIES = 15;
const VOTE_GRACE_MS = 400;        // let the vote request leave before navigating
const ADVANCE_CHECK_MS = 800;     // how long to give skip() to take effect

/* ---------- state ---------- */

let adapter = null;
let terms = [];                   // compiled: { term, source, scope, singleWord, regex }
let currentTrack = '';            // identity of the track last seen
let triesOnTrack = 0;
let sequenceRunning = false;
let surrenderedTrack = '';        // announced giving up on this one already

/* ---------- matching ---------- */

function compile(term, source, scope) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Anchor only the side that begins or ends with a word character. A blanket
    // \b...\b can never match a term ending in punctuation, which silently
    // dropped names like "M.I.A.", "Panic!" and "+44".
    const opening = /^\w/.test(term) ? '\\b' : '';
    const closing = /\w$/.test(term) ? '\\b' : '';

    return {
        term,
        source,
        scope,
        // One word is too weak a signal to match as a substring: an act called
        // "Angel" must not take out "Angel Olsen".
        singleWord: !/\s/.test(term),
        regex: new RegExp(`${opening}${escaped}${closing}`, 'i')
    };
}

/*
 * Terms are tested only against the field they describe. Artist terms go
 * against the artist names the adapter parsed out, never the raw context, which
 * on YouTube Music also carries the album and year: that is how an act named
 * "Angel" once blocked a track from the album "angel's tears".
 */
function firstMatch(track) {
    const title = track.title.toLowerCase();
    const context = (track.context || `${track.artists[0]} ${track.title}`).toLowerCase();
    const names = track.artists.map(name => name.toLowerCase());

    return terms.find(entry => {
        if (entry.scope === 'artist') {
            return entry.singleWord
                ? names.some(name => name === entry.term)
                : names.some(name => entry.regex.test(name));
        }
        if (entry.scope === 'title') return entry.regex.test(title);
        return entry.regex.test(context);
    }) || null;
}

async function rebuildTerms() {
    const saved = await api.storage.local.get(USER_LIST_KEYS);
    const savedTracks = saved.blockedTracks || [];
    const database = await loadAiArtists();

    // scope decides which field a term is tested against. Keywords are meant to
    // catch anything; artist names only the artist; saved songs only the title.
    const groups = [
        ['Your Songs', savedTracks.map(t => (t && typeof t === 'object' && t.title) ? t.title : t), 'title'],
        ['Your Artists', saved.blockedArtists || [], 'artist'],
        ['Your Keywords', saved.blockedKeywords || [], 'any'],
        ['AI Database', database.artists, 'artist']
    ];

    const seen = new Set();
    const counts = {};
    const withheld = [];
    const compiled = [];

    for (const [source, items, scope] of groups) {
        counts[source] = 0;

        for (const item of items) {
            if (typeof item !== 'string') continue;

            const term = item.trim().toLowerCase();
            if (!term || seen.has(term)) continue;

            // Length only means something for Latin text; a two-character CJK
            // name is ordinary and gets no word-boundary anchoring anyway.
            const isAscii = /^[\x20-\x7E]+$/.test(term);
            if (source === 'AI Database' && isAscii && term.length < MIN_DB_TERM_LENGTH) {
                withheld.push(item.trim());
                continue;
            }

            seen.add(term);
            compiled.push(compile(term, source, scope));
            counts[source]++;
        }
    }

    compiled.sort((a, b) => a.term.localeCompare(b.term));
    terms = compiled;

    const summary = Object.entries(counts).map(([name, n]) => `${n} ${name}`).join(', ');
    console.log(`[Slopstop] Loaded ${terms.length} terms - ${summary}`);

    if (database.stale) {
        console.warn('[Slopstop] Database is offline - using the last cached copy');
    }
    if (withheld.length) {
        console.warn(`[Slopstop] Held back ${withheld.length} entries too short to match safely: ${withheld.join(', ')}`);
    }
}

/* ---------- track identity ---------- */

/*
 * Title alone collided constantly - AI uploads reuse titles heavily, so one
 * blocked title suppressed every later track sharing it.
 */
function identify(track) {
    return track ? `${track.title}␟${track.artists[0]}` : '';
}

function currentIdentity() {
    return identify(adapter.readNowPlaying());
}

function describe(track) {
    return `${track.artists[0]} - ${track.title}`;
}

/* ---------- skipping ---------- */

function advance(identityAtStart, label, done) {
    if (!adapter.skip()) {
        console.warn(`[Slopstop] No skip control available for "${label}"`);
    }

    setTimeout(() => {
        if (currentIdentity() === identityAtStart) {
            // Forcing the end is a fallback for a skip that did nothing. Doing it
            // unconditionally cut short whatever track the skip had landed on.
            if (adapter.forceEnd()) {
                console.warn(`[Slopstop] Skip did not advance "${label}" - forced the track to end instead`);
            } else {
                console.warn(`[Slopstop] Could not skip "${label}"`);
            }
        } else {
            console.log(`[Slopstop] Skipped "${label}"`);
        }

        if (done) done();
    }, ADVANCE_CHECK_MS);
}

function downvoteThenSkip(identityAtStart, label) {
    if (sequenceRunning) return;
    sequenceRunning = true;

    const identity = identityAtStart || currentIdentity();
    const name = label || 'the current track';
    const release = () => { sequenceRunning = false; };

    const voted = adapter.isDownvoted();

    // null means this service has no downvote, so skipping is all we can do.
    if (voted === null) {
        console.warn(`[Slopstop] No downvote control - skipping "${name}" without one`);
        advance(identity, name, release);
        return;
    }

    if (voted) {
        console.log(`[Slopstop] "${name}" was already downvoted`);
        advance(identity, name, release);
        return;
    }

    adapter.downvote();

    let checks = 0;
    const poll = setInterval(() => {
        checks++;

        // The track moved on under us, so this sequence is stale. Dropping it
        // avoids skipping whatever is playing now.
        if (currentIdentity() !== identity) {
            clearInterval(poll);
            console.log(`[Slopstop] "${name}" ended on its own mid-sequence - standing down`);
            release();
            return;
        }

        if (adapter.isDownvoted()) {
            clearInterval(poll);
            console.log(`[Slopstop] Downvoted "${name}"`);
            setTimeout(() => advance(identity, name, release), VOTE_GRACE_MS);
        } else if (checks >= VOTE_POLL_TRIES) {
            clearInterval(poll);
            console.warn(`[Slopstop] Downvote not confirmed for "${name}" - skipping anyway`);
            setTimeout(() => advance(identity, name, release), VOTE_GRACE_MS);
        }
    }, VOTE_POLL_MS);
}

/* ---------- the check ---------- */

function assessCurrentTrack() {
    const track = adapter.readNowPlaying();
    if (!track) return;

    const identity = identify(track);
    if (identity !== currentTrack) {
        currentTrack = identity;
        triesOnTrack = 0;
    }

    if (sequenceRunning) return;

    const label = describe(track);

    if (triesOnTrack >= SKIP_BUDGET) {
        // Say so once, then let it play rather than fighting forever.
        if (surrenderedTrack !== identity) {
            surrenderedTrack = identity;
            console.error(`[Slopstop] Gave up on "${label}" after ${SKIP_BUDGET} attempts - letting it play`);
        }
        return;
    }

    const hit = firstMatch(track);
    if (!hit) return;

    triesOnTrack++;
    console.log(`[Slopstop] Block "${label}" - matched "${hit.term}" from ${hit.source} (attempt ${triesOnTrack}/${SKIP_BUDGET})`);
    downvoteThenSkip(identity, label);
}

/* ---------- blocking by hand ---------- */

async function saveAndSkip(entry, storageKey) {
    if (!entry) return;

    const saved = await api.storage.local.get([storageKey]);
    const list = saved[storageKey] || [];

    const present = list.some(item =>
        typeof entry === 'string' ? item === entry : item && item.title === entry.title
    );
    if (present) return;

    await api.storage.local.set({ [storageKey]: [...list, entry] });
    await rebuildTerms();

    const track = adapter.readNowPlaying();
    const label = track ? describe(track) : 'the current track';
    console.log(`[Slopstop] Added to ${storageKey} by hand - blocking "${label}"`);
    downvoteThenSkip(currentIdentity(), label);
}

const controlHandlers = {
    onBlockArtist() {
        const track = adapter.readNowPlaying();
        if (track) saveAndSkip(track.artists[0], 'blockedArtists');
    },
    onBlockSong() {
        const track = adapter.readNowPlaying();
        if (track) saveAndSkip({ title: track.title, artist: track.artists[0] }, 'blockedTracks');
    }
};

/* ---------- migration ---------- */

/*
 * Earlier builds saved the whole player-bar byline ("Artist • Album • Year") as
 * the artist name, so those entries could only ever match that exact
 * combination and were effectively dead. Rewrite them to just the artist.
 */
async function repairSavedArtists() {
    const saved = await api.storage.local.get(['blockedArtists', 'blockedTracks']);
    const artists = saved.blockedArtists || [];
    const tracks = saved.blockedTracks || [];

    const damaged = artists.some(a => typeof a === 'string' && a.includes('•'))
        || tracks.some(t => t && typeof t.artist === 'string' && t.artist.includes('•'));
    if (!damaged) return;

    const seen = new Set();
    const repairedArtists = [];

    for (const entry of artists) {
        if (typeof entry !== 'string') continue;
        const name = entry.split('•')[0].trim();
        const key = name.toLowerCase();
        if (!name || seen.has(key)) continue;
        seen.add(key);
        repairedArtists.push(name);
    }

    const repairedTracks = tracks.map(entry =>
        entry && typeof entry.artist === 'string'
            ? { ...entry, artist: entry.artist.split('•')[0].trim() }
            : entry
    );

    await api.storage.local.set({ blockedArtists: repairedArtists, blockedTracks: repairedTracks });
    console.log(`[Slopstop] Repaired ${artists.length - repairedArtists.length} artist entries saved by an earlier build.`);
}

/* ---------- boot ---------- */

async function start() {
    adapter = (globalThis.SLOPSTOP_ADAPTERS || []).find(candidate => candidate.matches());
    if (!adapter) return; // nothing here understands this page

    console.log(`[Slopstop] Engine started on ${adapter.label}.`);

    await repairSavedArtists();
    await rebuildTerms();
    await adapter.ready();

    adapter.mountControls(controlHandlers);
    assessCurrentTrack();

    // Players mutate constantly (progress, timestamps). Coalescing the bursts
    // means a track change is evaluated once rather than dozens of times.
    let queued = false;
    const schedule = () => {
        if (queued) return;
        queued = true;
        setTimeout(() => {
            queued = false;
            assessCurrentTrack();
            if (!adapter.controlsMounted()) adapter.mountControls(controlHandlers);
        }, SETTLE_MS);
    };

    for (const { node, options } of adapter.watchTargets()) {
        new MutationObserver(schedule).observe(node, options);
    }
}

api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    // Ignore cache writes; only edits to the user's own lists need a rebuild.
    if (!USER_LIST_KEYS.some(key => key in changes)) return;
    rebuildTerms();
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
} else {
    start();
}
