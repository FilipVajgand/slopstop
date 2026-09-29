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
     * YouTube Music has two player bars and a page gets one of them for its
     * whole life: an experiment flag (music_web_enable_wiz_miniplayer) read at
     * startup decides which. Selectors are relative to the bar element.
     */
    const LAYOUTS = [
        {
            // The redesign that reached accounts in September 2026: track info
            // on the left, transport in the middle, the thumbs as one pill on
            // the right. The pill can be missing (it was in a signed-out
            // session), and then tracks are skipped without a downvote.
            //
            // In very narrow windows the player page adds a second copy,
            // marked top-player-bar, ahead of this one in the document.
            bar: 'ytmusic-miniplayer:not(.top-player-bar)',
            title: '.ytmusicTrackInfoTitle',
            byline: '.ytmusicTrackInfoBylineItem',
            // Below 616px the bar switches to a compact view that drops these
            // class names but keeps the element type YouTube logs clicks under.
            next: ['.ytmusicPlayerControlsNextButton button', '[client-ve-type="36841"] button'],
            dislike: 'dislike-button-view-model button',

            // Right after the thumbs pill, as on the classic bar. The pill
            // renders after the bar and is missing during ads, which is why
            // the position is checked again rather than set once.
            place(controls, bar) {
                const section = bar.querySelector('.ytMusicMiniPlayerRightSection');
                if (!section) return; // compact view, no room for them

                const pill = section.querySelector('.ytMusicMiniPlayerActionBar');
                if (pill) pill.after(controls);
                else section.prepend(controls);
            },
            placed(controls, bar) {
                const pill = bar.querySelector('.ytMusicMiniPlayerActionBar');
                return !pill || controls.previousElementSibling === pill;
            }
        },
        {
            // The bar this extension was written against. Several entries have
            // two forms because it differs between the full and compact views.
            bar: 'ytmusic-player-bar',
            title: '.title',
            byline: '.byline',
            next: '.next-button',
            dislike: ['.middle-controls-buttons .dislike', '.dislike'],

            place(controls, bar) {
                const menu = findIn(bar, ['.middle-controls-buttons ytmusic-menu-renderer', 'ytmusic-menu-renderer']);
                const host = menu ? menu.parentNode : bar.querySelector('.middle-controls-buttons');
                if (!host) return;

                if (menu && menu.nextSibling) host.insertBefore(controls, menu.nextSibling);
                else host.append(controls);
            },
            placed() {
                return true;
            }
        }
    ];

    let controls = null;

    function locate() {
        for (const layout of LAYOUTS) {
            const bar = document.querySelector(layout.bar);
            if (bar) return { layout, bar };
        }
        return null;
    }

    function findIn(root, selectors) {
        for (const selector of [].concat(selectors)) {
            const found = root.querySelector(selector);
            if (found) return found;
        }
        return null;
    }

    // The element for one of the current layout's selectors, e.g. find('next').
    function find(key) {
        const current = locate();
        return current ? findIn(current.bar, current.layout[key]) : null;
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
            /* The new bar spaces its right-hand controls itself and leaves
               them little room, so the labels must not squash onto two lines. */
            ytmusic-miniplayer #${CONTROLS_ID} {
                margin: 0;
                flex-shrink: 0;
            }
            #${CONTROLS_ID} button {
                white-space: nowrap;
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
            const existing = locate();
            if (existing) return Promise.resolve(existing.bar);

            return new Promise(resolve => {
                const watcher = new MutationObserver(() => {
                    const found = locate();
                    if (!found) return;
                    watcher.disconnect();
                    resolve(found.bar);
                });
                watcher.observe(document.body, { childList: true, subtree: true });
            });
        },

        watchTargets() {
            const current = locate();
            if (!current) return [];

            // characterData because a title can change as an edit to its text
            // node rather than as a new node.
            return [{
                node: current.bar,
                options: { subtree: true, childList: true, attributes: true, characterData: true }
            }];
        },

        readNowPlaying() {
            const current = locate();
            if (!current) return null;

            const titleNode = current.bar.querySelector(current.layout.title);
            const bylineNodes = current.bar.querySelectorAll(current.layout.byline);
            if (!titleNode || !bylineNodes.length) return null;

            const title = titleNode.textContent.trim();
            // The new bar can split the byline into items with the dots drawn
            // between them; joining restores the classic bar's single string.
            const byline = Array.from(bylineNodes, node => node.textContent.trim())
                .filter(Boolean)
                .join(' • ');

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
            const wrapper = find('dislike');
            if (!wrapper) return null; // no control on this layout

            const button = wrapper.querySelector('button') || wrapper;
            return wrapper.getAttribute('aria-pressed') === 'true'
                || button.getAttribute('aria-pressed') === 'true';
        },

        downvote() {
            const wrapper = find('dislike');
            if (!wrapper) return;
            press(wrapper.querySelector('button') || wrapper);
        },

        skip() {
            const next = find('next');
            if (!next) return false;
            press(next);
            return true;
        },

        forceEnd() {
            const video = document.querySelector('video');
            if (!video || !isFinite(video.duration) || video.duration <= 0) return false;
            video.currentTime = video.duration;
            return true;
        },

        controlsMounted() {
            const current = locate();
            return !!(current && controls && current.bar.contains(controls)
                && current.layout.placed(controls, current.bar));
        },

        mountControls({ onBlockArtist, onBlockSong }) {
            const current = locate();
            if (!current) return;

            // Built once and moved as needed: the new bar re-renders its
            // sections, and a wrong position is fixed by moving, not rebuilding.
            if (!controls) {
                controls = document.createElement('div');
                controls.id = CONTROLS_ID;
                controls.append(
                    controlButton('Block artist', onBlockArtist),
                    controlButton('Block song', onBlockSong)
                );
            }

            installStyles();
            current.layout.place(controls, current.bar);
        }
    };
})());
