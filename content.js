/*
 * Slopstop - YouTube Music engine
 *
 * Watches the player bar, and when the current track matches a blocked term it
 * downvotes and skips. Shared helpers (`api`, `loadAiArtists`, `USER_LIST_KEYS`)
 * come from common.js, which is loaded first.
 */

/* ---------- tuning ---------- */

// Retries per track. A skip that fails should be attempted again rather than
// written off, but never in an endless loop.
const SKIP_BUDGET = 3;

// Database names shorter than this are held back: as whole-word matches they
// would fire against ordinary words. Applied to ASCII only.
const MIN_DB_TERM_LENGTH = 3;

const SETTLE_MS = 120;            // coalesce player-bar mutation bursts
const VOTE_POLL_MS = 100;         // how often to check the downvote registered
const VOTE_POLL_TRIES = 15;
const VOTE_GRACE_MS = 400;        // let the vote request leave before navigating
const ADVANCE_CHECK_MS = 800;     // how long to give the next button to work

const CONTROLS_ID = 'slopstop-controls';
const STYLE_ID = 'slopstop-style';

/*
 * Selectors describing YouTube Music's own markup. Several have two forms
 * because the player bar's layout differs between the full and compact views.
 */
const PLAYER = {
    bar: 'ytmusic-player-bar',
    title: 'ytmusic-player-bar .title',
    byline: 'ytmusic-player-bar .byline',
    next: 'ytmusic-player-bar .next-button',
    video: 'video',
    dislike: ['.middle-controls-buttons .dislike', 'ytmusic-player-bar .dislike'],
    menu: [
        'ytmusic-player-bar .middle-controls-buttons ytmusic-menu-renderer',
        'ytmusic-player-bar ytmusic-menu-renderer'
    ],
    controlsHost: 'ytmusic-player-bar .middle-controls-buttons'
};

/* ---------- state ---------- */

let terms = [];                   // compiled: { term, source, scope, singleWord, regex }
let currentTrack = '';            // identity of the track last seen
let triesOnTrack = 0;
let sequenceRunning = false;
let surrenderedTrack = '';        // announced giving up on this one already

console.log('[Slopstop] Engine started.');

/* ---------- dom utilities ---------- */

function findFirst(selectors) {
    for (const selector of [].concat(selectors)) {
        const found = document.querySelector(selector);
        if (found) return found;
    }
    return null;
}

function whenPresent(selector) {
    const existing = document.querySelector(selector);
    if (existing) return Promise.resolve(existing);

    return new Promise(resolve => {
        const watcher = new MutationObserver(() => {
            const found = document.querySelector(selector);
            if (!found) return;
            watcher.disconnect();
            resolve(found);
        });
        watcher.observe(document.body, { childList: true, subtree: true });
    });
}

/*
 * YouTube Music's controls do not respond to a bare .click(), so the full press
 * sequence is dispatched instead.
 */
function press(element) {
    if (!element) return;

    const options = { bubbles: true, cancelable: true, view: window };
    element.dispatchEvent(new MouseEvent('mousedown', options));
    element.dispatchEvent(new MouseEvent('mouseup', options));
    element.dispatchEvent(new MouseEvent('click', options));
}

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
 * Terms are tested only against the field they describe, and artist terms
 * against the parsed artist names rather than the raw byline - the byline also
 * carries the album and year, which is how an act named "Angel" once blocked a
 * track from the album "angel's tears".
 */
function firstMatch(track) {
    const title = track.title.toLowerCase();
    const everything = `${track.byline} ${track.title}`.toLowerCase();
    const names = track.artists.map(name => name.toLowerCase());

    return terms.find(entry => {
        if (entry.scope === 'artist') {
            return entry.singleWord
                ? names.some(name => name === entry.term)
                : names.some(name => entry.regex.test(name));
        }
        if (entry.scope === 'title') return entry.regex.test(title);
        return entry.regex.test(everything);
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

/* ---------- reading the player bar ---------- */

/*
 * The byline reads "Artist • Album • Year", so only its first segment names the
 * artist. Commas separate collaborators; "&" deliberately does not, or
 * "Simon & Garfunkel" would become a band called "Simon".
 */
function splitArtists(byline) {
    const lead = byline.split('•')[0].trim();
    if (!lead) return [];

    const parts = lead.split(',').map(part => part.trim()).filter(Boolean);
    // Keep the undivided string too, for names containing a comma.
    return parts.length > 1 ? [lead, ...parts] : [lead];
}

function readPlayer() {
    const titleNode = document.querySelector(PLAYER.title);
    const bylineNode = document.querySelector(PLAYER.byline);
    if (!titleNode || !bylineNode) return null;

    const title = titleNode.textContent.trim();
    const byline = bylineNode.textContent.trim();

    // These two update independently during a track change. A read taken
    // mid-transition pairs the incoming title with the outgoing artist, which
    // can match and then mark the wrong track as handled.
    if (!title || !byline) return null;

    const artists = splitArtists(byline);
    if (!artists.length) return null;

    return { title, byline, artist: artists[0], artists };
}

/*
 * Identity of a track. Title alone collided constantly - AI uploads reuse
 * titles heavily, so one blocked title suppressed every later track sharing it.
 */
function identify(track) {
    return track ? `${track.title}␟${track.artist}` : '';
}

function currentIdentity() {
    return identify(readPlayer());
}

/* ---------- skipping ---------- */

function advance(identityAtStart, label, done) {
    const nextButton = document.querySelector(PLAYER.next);
    if (nextButton) press(nextButton);
    else console.warn(`[Slopstop] No next button found for "${label}"`);

    setTimeout(() => {
        if (currentIdentity() === identityAtStart) {
            // Seeking to the end is a fallback for a next button that did
            // nothing. Doing it unconditionally cut short whatever track the
            // skip had already landed on.
            const video = document.querySelector(PLAYER.video);
            if (video && isFinite(video.duration) && video.duration > 0) {
                console.warn(`[Slopstop] Next button did not advance "${label}" - seeking to the end instead`);
                video.currentTime = video.duration;
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

    const dislike = findFirst(PLAYER.dislike);
    if (!dislike) {
        console.warn(`[Slopstop] No dislike button found - skipping "${name}" without downvoting`);
        advance(identity, name, release);
        return;
    }

    const button = dislike.querySelector('button') || dislike;
    const alreadyVoted = () =>
        dislike.getAttribute('aria-pressed') === 'true' ||
        button.getAttribute('aria-pressed') === 'true';

    if (alreadyVoted()) {
        console.log(`[Slopstop] "${name}" was already downvoted`);
        advance(identity, name, release);
        return;
    }

    press(button);

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

        if (alreadyVoted()) {
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
    const track = readPlayer();
    if (!track) return;

    const identity = identify(track);
    if (identity !== currentTrack) {
        currentTrack = identity;
        triesOnTrack = 0;
    }

    if (sequenceRunning) return;

    const label = `${track.artist} - ${track.title}`;

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

/* ---------- injected controls ---------- */

function installStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        #${CONTROLS_ID} {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            margin: 0 8px;
        }
        #${CONTROLS_ID} button {
            font: 600 11px/1 system-ui, -apple-system, sans-serif;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            color: #ff8f8f;
            background: rgba(255, 68, 68, 0.12);
            border: 1px solid rgba(255, 68, 68, 0.45);
            border-radius: 6px;
            padding: 7px 11px;
            cursor: pointer;
            transition: background 120ms ease, color 120ms ease;
        }
        #${CONTROLS_ID} button:hover {
            background: #ff4444;
            border-color: #ff4444;
            color: #fff;
        }
    `;
    document.head.append(style);
}

function controlButton(label, onActivate) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', event => {
        event.stopPropagation();
        onActivate();
    });
    return button;
}

function mountControls() {
    if (document.getElementById(CONTROLS_ID)) return;

    const menu = findFirst(PLAYER.menu);
    const host = menu ? menu.parentNode : document.querySelector(PLAYER.controlsHost);
    if (!host) return;

    installStyles();

    const controls = document.createElement('div');
    controls.id = CONTROLS_ID;

    controls.append(
        controlButton('Block artist', () => {
            const track = readPlayer();
            if (track) saveAndSkip(track.artist, 'blockedArtists');
        }),
        controlButton('Block song', () => {
            const track = readPlayer();
            if (track) saveAndSkip({ title: track.title, artist: track.artist }, 'blockedTracks');
        })
    );

    if (menu && menu.nextSibling) host.insertBefore(controls, menu.nextSibling);
    else host.append(controls);
}

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

    const track = readPlayer();
    const label = track ? `${track.artist} - ${track.title}` : 'the current track';
    console.log(`[Slopstop] Added to ${storageKey} by hand - blocking "${label}"`);
    downvoteThenSkip(currentIdentity(), label);
}

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
    await repairSavedArtists();
    await rebuildTerms();

    const bar = await whenPresent(PLAYER.bar);
    mountControls();
    assessCurrentTrack();

    // The player bar mutates constantly (progress, timestamps). Coalescing the
    // bursts means a track change is evaluated once rather than dozens of times.
    let queued = false;
    const schedule = () => {
        if (queued) return;
        queued = true;
        setTimeout(() => {
            queued = false;
            assessCurrentTrack();
            mountControls();
        }, SETTLE_MS);
    };

    new MutationObserver(schedule).observe(bar, {
        subtree: true,
        childList: true,
        attributes: true
    });

    const titleNode = document.querySelector(PLAYER.title);
    if (titleNode) {
        new MutationObserver(schedule).observe(titleNode, {
            characterData: true,
            subtree: true,
            childList: true
        });
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
