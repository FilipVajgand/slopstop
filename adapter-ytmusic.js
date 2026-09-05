/*
 * Slopstop - YouTube Music adapter
 *
 * Everything that knows about YouTube Music's markup lives here. The engine
 * talks to this through the interface below and never touches a selector, so a
 * second service means writing another file like this one rather than editing
 * the engine.
 *
 * Contract expected by engine.js:
 *
 *   id, label          identification for logs
 *   matches()          is this adapter for the current page
 *   ready()            resolves once the player exists
 *   watchTargets()     nodes to observe for track changes
 *   readNowPlaying()   -> { title, artists[], context } or null
 *   isDownvoted()      -> true / false / null when unsupported
 *   downvote()         press the thumbs down control
 *   skip()             advance to the next track
 *   forceEnd()         fallback used only when skip() did not advance
 *   mountControls()    inject the block buttons
 *   controlsMounted()  are they already there
 */

(globalThis.SLOPSTOP_ADAPTERS ||= []).push((() => {
    const CONTROLS_ID = 'slopstop-controls';
    const STYLE_ID = 'slopstop-style';

    /*
     * Several of these have two forms because the player bar's layout differs
     * between the full and compact views.
     */
    const SELECTOR = {
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

    function findFirst(selectors) {
        for (const selector of [].concat(selectors)) {
            const found = document.querySelector(selector);
            if (found) return found;
        }
        return null;
    }

    /*
     * YouTube Music's controls do not respond to a bare .click(), so the full
     * press sequence is dispatched instead.
     */
    function press(element) {
        if (!element) return;

        const options = { bubbles: true, cancelable: true, view: window };
        element.dispatchEvent(new MouseEvent('mousedown', options));
        element.dispatchEvent(new MouseEvent('mouseup', options));
        element.dispatchEvent(new MouseEvent('click', options));
    }

    /*
     * The byline reads "Artist • Album • Year", so only its first segment names
     * the artist. Commas separate collaborators; "&" deliberately does not, or
     * "Simon & Garfunkel" would become a band called "Simon".
     */
    function splitArtists(byline) {
        const lead = byline.split('•')[0].trim();
        if (!lead) return [];

        const parts = lead.split(',').map(part => part.trim()).filter(Boolean);
        // Keep the undivided string too, for names that contain a comma.
        return parts.length > 1 ? [lead, ...parts] : [lead];
    }

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

    return {
        id: 'youtube-music',
        label: 'YouTube Music',

        matches() {
            return location.hostname === 'music.youtube.com';
        },

        ready() {
            const existing = document.querySelector(SELECTOR.bar);
            if (existing) return Promise.resolve(existing);

            return new Promise(resolve => {
                const watcher = new MutationObserver(() => {
                    const found = document.querySelector(SELECTOR.bar);
                    if (!found) return;
                    watcher.disconnect();
                    resolve(found);
                });
                watcher.observe(document.body, { childList: true, subtree: true });
            });
        },

        watchTargets() {
            const targets = [];

            const bar = document.querySelector(SELECTOR.bar);
            if (bar) {
                targets.push({
                    node: bar,
                    options: { subtree: true, childList: true, attributes: true }
                });
            }

            const title = document.querySelector(SELECTOR.title);
            if (title) {
                targets.push({
                    node: title,
                    options: { characterData: true, subtree: true, childList: true }
                });
            }

            return targets;
        },

        readNowPlaying() {
            const titleNode = document.querySelector(SELECTOR.title);
            const bylineNode = document.querySelector(SELECTOR.byline);
            if (!titleNode || !bylineNode) return null;

            const title = titleNode.textContent.trim();
            const byline = bylineNode.textContent.trim();

            // These two update independently during a track change. A read taken
            // mid-transition pairs the incoming title with the outgoing artist,
            // which can match and then mark the wrong track as handled.
            if (!title || !byline) return null;

            const artists = splitArtists(byline);
            if (!artists.length) return null;

            // context is what user keywords are matched against, so it keeps the
            // album and year the byline carries.
            return { title, artists, context: `${byline} ${title}` };
        },

        isDownvoted() {
            const wrapper = findFirst(SELECTOR.dislike);
            if (!wrapper) return null; // no control on this layout

            const button = wrapper.querySelector('button') || wrapper;
            return wrapper.getAttribute('aria-pressed') === 'true'
                || button.getAttribute('aria-pressed') === 'true';
        },

        downvote() {
            const wrapper = findFirst(SELECTOR.dislike);
            if (!wrapper) return;
            press(wrapper.querySelector('button') || wrapper);
        },

        skip() {
            const next = document.querySelector(SELECTOR.next);
            if (!next) return false;
            press(next);
            return true;
        },

        forceEnd() {
            const video = document.querySelector(SELECTOR.video);
            if (!video || !isFinite(video.duration) || video.duration <= 0) return false;
            video.currentTime = video.duration;
            return true;
        },

        controlsMounted() {
            return !!document.getElementById(CONTROLS_ID);
        },

        mountControls({ onBlockArtist, onBlockSong }) {
            if (document.getElementById(CONTROLS_ID)) return;

            const menu = findFirst(SELECTOR.menu);
            const host = menu ? menu.parentNode : document.querySelector(SELECTOR.controlsHost);
            if (!host) return;

            installStyles();

            const controls = document.createElement('div');
            controls.id = CONTROLS_ID;
            controls.append(
                controlButton('Block artist', onBlockArtist),
                controlButton('Block song', onBlockSong)
            );

            if (menu && menu.nextSibling) host.insertBefore(controls, menu.nextSibling);
            else host.append(controls);
        }
    };
})());
