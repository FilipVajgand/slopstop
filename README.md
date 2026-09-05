# Slopstop

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Firefox 142+](https://img.shields.io/badge/Firefox-142%2B-ff7139)](https://addons.mozilla.org/)
[![Chrome](https://img.shields.io/badge/Chrome-supported-4285F4)](https://developer.chrome.com/docs/extensions/)
[![Privacy First](https://img.shields.io/badge/Privacy-Local%20Storage%20Only-green)](#-privacy-policy)
[![AI Database](https://img.shields.io/badge/AI%20artists-8.9k%2B-ff4e45)](https://github.com/CennoxX/spotify-ai-blocker)

**Stop AI slop from hijacking your listening.**

Slopstop watches the YouTube Music player bar and, when a track matches your
blocklist or a community database of known AI acts, downvotes it and skips on.
One codebase runs on **Firefox and Chrome**: no build step, no bundler, no
polyfill.

Roughly **8,900 known AI acts** are blocked out of the box. Add your own
artists, songs and keywords on top.

---

## Key Features

### 1. Integrated Control
Adds **Block artist** and **Block song** buttons directly into the YouTube Music player bar. One click adds the current track to your blacklist without opening any menus.

### 2. Community AI Database
The algorithm is increasingly polluted with "AI slop", mass-produced, soulless noise designed to game the system. Roughly **8,900 known AI acts** are blocked out of the box, merged from two community-maintained sources:

| Source | Role | Licence |
| --- | --- | --- |
| [CennoxX/spotify-ai-blocker](https://github.com/CennoxX/spotify-ai-blocker) | Source of record, updated several times daily | MIT |
| [Zoundhub](https://zoundhub.com/) | Supplementary, adds entries CennoxX lacks |, |

* **Auto-Sync:** Fetched and cached locally for 6 hours, so it stays current without re-downloading on every page load. Force a sync any time with **↻ Reload DB**.
* **Offline Safe:** If the primary source is unreachable the last known good list stays active, rather than silently unblocking everyone or dropping to a partial list.
* **Browsable:** The **AI DB** tab lists every artist and is searchable, so you can check whether a specific act is on it.

### 3. Precision Blocking
Each term is only tested against the field it describes, so an artist name can never match a song title:

| List | Matched against |
| --- | --- |
| Keywords | title + artist |
| Artists | artist only |
| Songs | title only |
| AI Database | artist only |

Whole-word matching means blocking "Prince" will **not** catch "Princess Nokia", while names carrying punctuation, `M.I.A.`, `Panic!`, `+44`: still match correctly.

### 4. Keyword Filtering
Create custom rules to skip tracks based on title keywords.
* *Examples:* automatically skip anything containing "Sped Up", "Nightcore", "Commentary", or "Live at".

### 5. Transparent Logging
Every action is reported to the console, including which list the match came from, so nothing happens silently:

```
[Slopstop] Engine loaded 1374 terms - 0 Your Songs, 0 Your Artists, 1 Your Keywords, 1373 AI Database
[Slopstop] 🛑 BLOCK "Some Artist - Some Track" - matched "some artist" from AI Database (attempt 1/3)
[Slopstop] 👎 Downvoted "Some Artist - Some Track"
[Slopstop] ⏭️ Skipped "Some Artist - Some Track"
```

### 6. Privacy First Architecture
* **Local Storage Only:** all blocklists live on your device in `storage.local`.
* **No Tracking:** no external servers, no analytics, no accounts.

---

## Installation

### Firefox, Temporary Add-on
Requires Firefox 142 or newer.

1. Download or clone this repository.
2. Navigate to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…**.
4. Select the `manifest.json` file in the extension folder.

Temporary add-ons are removed when Firefox closes. A permanent install requires a Mozilla-signed build.

For development, [web-ext](https://github.com/mozilla/web-ext) reloads the extension on every file change:

```
npx web-ext run --start-url https://music.youtube.com
```

### Chrome, Load Unpacked
1. Download or clone this repository.
2. Open `chrome://extensions`.
3. Toggle **Developer mode**.
4. Click **Load unpacked** and select the extension folder.

Chrome logs a warning about the unrecognized `browser_specific_settings` key. That key is for Firefox and is safely ignored.

---

## Usage

### Blocking Content
* **From the player:** click **Block artist** or **Block song** in the player bar.
* **From the Popup:** click the extension icon to add Keywords, Artists, or specific Songs.

### Browsing the AI Blocklist
1. Open the popup and select the **AI DB** tab.
2. Type to search the database, the header shows how many entries match.
3. **↻ Reload DB** forces a fresh sync.

### Backup & Restore
**⬇ Export JSON** writes your Keywords, Artists, and Songs to a file; **⬆ Import JSON** restores them. The AI database is not included, it re-syncs on its own.

---

## Design notes

The non-obvious decisions, so they don't get undone by accident.

**All fetching happens in the background worker.** Content scripts inherit the
host page's CORS policy, and one of the databases sends no
`access-control-allow-origin` header, fetching from the content script silently
drops that source and falls back to a partial list. Extension contexts get the
cross-origin access `host_permissions` grants. Do not move fetching back.

**Terms are scoped to a field.** The player-bar byline reads
`Artist • Album • Year`, so testing an artist name against the whole string also
tests it against the album. That is how an act named "Angel" can block a track
from an album called *angel's tears*. Only the segment before the first bullet
counts, split on commas for collaborations but never on `&`: that would reduce
*Simon & Garfunkel* to a band called "Simon".

**Single-word names must match exactly.** Around a third of the database is one
word, and some are ordinary English, `Angel`, `Iris`, `Raven`, `Nova`, `Lion`.
Substring matching on those blocks *Angel Olsen* and *Nova Twins*. Multi-word
names are distinctive enough to match as substrings. Entries under three ASCII
characters are held back entirely and named in the console; the rule is ASCII-only
because a two-character CJK name is unremarkable.

**Word boundaries are one-sided.** A blanket `\bterm\b` can never match a term
ending in punctuation, silently dropping `M.I.A.`, `Panic!` and `+44`. Only sides
that begin or end with a word character get anchored.

**Skipping is guarded.** One downvote-and-skip sequence runs at a time;
overlapping ones race over the same buttons and produce a downvote with no skip.
Track identity is title **plus** artist, because AI uploads reuse titles heavily.
A failed skip retries up to three times, then gives up loudly. The seek-to-end
fallback only fires if the next button genuinely failed, running it
unconditionally cuts short whatever track the skip just landed on.

**No build step.** The manifest declares both `background.service_worker`
(Chrome) and `background.scripts` (Firefox); each browser uses its own key and
ignores the other. Firefox's linter warns about the ignored `service_worker`
key, that warning is expected.

## Privacy Policy

**Data Collection**: this extension does NOT collect, transmit, store, or sell any user data.

**Data Storage**: all data is stored locally on your device.

**Permissions**
* `storage`: saves your blocklist.
* `music.youtube.com`: reads the current song title and artist.
* `raw.githubusercontent.com`: fetches the public AI artist list.
* `zoundhub.com`: fetches the supplementary artist list.

The Firefox build declares `data_collection_permissions: { required: ["none"] }`.

---

## Credits

* **AI artist list:** [spotify-ai-blocker](https://github.com/CennoxX/spotify-ai-blocker) by [CennoxX](https://github.com/CennoxX), MIT licensed, community maintained. Its copyright notice is preserved under the terms of that licence.
* **Supplementary list:** [Zoundhub](https://zoundhub.com/) by [xoundbyte](https://github.com/xoundbyte).
* **Historical:** [Soul Over AI](https://github.com/xoundbyte/soul-over-ai) (CC BY 4.0) was the original database, deprecated March 2026.

## Origin

The idea came from [YTM-AI-Artist-Song-Blocker](https://github.com/firemountainpeak-lang/YTM-AI-Artist-Song-Blocker)
by [firemountainpeak-lang](https://github.com/firemountainpeak-lang), which
first showed that this was worth building. Slopstop is an independent
implementation and shares no code with it.

## Licence

MIT, see [LICENSE](LICENSE).
