# Slopstop, progress & tasks

Working notes for picking this up across sessions. Update as things land.

---

## Where things stand

Firefox + Chrome extension that skips and downvotes AI-generated artists on
YouTube Music. Started life as a port of someone else's Chrome extension; the
current work is making it independently ours so it can be published.

| | |
| --- | --- |
| Repo | `FilipVajgand/slopstop` (**private**), clean history, no upstream commits |
| Old repo | `FilipVajgand/ytm-ai-blocker-firefox`: dev history, keep private, do not publish |
| Extension name | Slopstop |
| Add-on ID | `slopstop@filipvajgand` (not yet signed, still free to change) |
| Version | 1.2.0 built, not yet uploaded. 1.1.1 is live on AMO and as the site's Chrome zip |
| Min Firefox | 142 |
| Site | `slopstop.filipvajgand.com` → 164.90.246.186 (Apache, same box as apex). Pages built in `site/`, live since 2026-09-05: see `site/DEPLOY.md` |

---

## The blocker: upstream has no licence

Upstream is [firemountainpeak-lang/YTM-AI-Artist-Song-Blocker](https://github.com/firemountainpeak-lang/YTM-AI-Artist-Song-Blocker)
with **no LICENSE file** → all rights reserved by default. We cannot publish or
distribute while their code is in ours.

- Asked: [issue #4](https://github.com/firemountainpeak-lang/YTM-AI-Artist-Song-Blocker/issues/4), opened 2026-08-28, **no reply**
- Author's last commit: 2026-01-26. But they replied to issue #3 on 2026-07-25, so they do read issues.
- Decision: stop waiting, rewrite their code out.

**Publishing to either store requires warranting you hold distribution rights**
(Firefox Add-on Distribution Agreement §5(c); Chrome has an equivalent).

Both preconditions are now met: the rewrite is done (3% left, all generic idiom)
and `slopstop` has clean history. The remaining judgement call is whether to make
the repo public, flip with
`gh repo edit FilipVajgand/slopstop --visibility public --accept-visibility-change-consequences`.

---

## Releases

1.0.0 was approved on AMO on 2026-09-08. 1.1.1 followed on 2026-09-29 and is
what both AMO and the site's Chrome zip serve now.

1.1.1 is the first build that works on YouTube Music's new player bar (see "Two
player bars" below); on an account that has the new bar, 1.0.0 never starts. It
also carries the adapter split and the 64px icon. It was confirmed on a
signed-in account with the new bar before release. Signed-out test sessions get
no thumbs on the new bar, so the downvote can only be checked that way.

The 1.1.0 zip that 1.1.1 replaced on the site is in `/root/deploy_backups/` on
the server.

1.2.0 adds the allowlist (see "Allowlist" below), prompted by a listener asking
for HUNTR/X to be unblocked. Built 2026-10-19, not yet on AMO or the site.

---

## Rewrite scorecard

How much upstream code is left. Regenerate with the snippet at the bottom.

| File | Substantive lines | From upstream | |
| --- | --- | --- | --- |
| `manifest.json` | 37 | 14 | 38%, spec-dictated keys only, nothing to do |
| `popup.html` | 218 | 8 | 4% ✅ |
| `engine.js` + `adapter-ytmusic.js` | 621 | 11 | 2% ✅ rewritten, then split |
| `popup.js` | 223 | 0 | 0% ✅ rewritten |
| `common.js` | 23 | 0 | 0% ✅ ours |
| `background.js` | 122 | 0 | 0% ✅ ours |
| **Total** | **983** | **33** | **3%** (was 37%) |

The 33 remaining lines are generic JavaScript with no other plausible form
(`setTimeout(() => {`, `} else {`, `clearInterval(poll)`) plus manifest keys the
MV3 spec dictates. **The rewrite is done.**

Not everything left is protectable. DOM selectors like `ytmusic-player-bar .title`
are facts about YouTube Music, not expression, those can stay. What must go is
their comments, naming, code organisation and design.

---

## Tasks

### To make the code ours, DONE
- [x] ~~Rewrite `popup.js`~~, done, 53% → 0%
- [x] ~~Rewrite `content.js`~~, done, 31% → 3%, then split into `engine.js` + `adapter-ytmusic.js`
- [x] ~~Re-create the repo without upstream history~~, `FilipVajgand/slopstop`, single commit
- [x] ~~Rename repo to match the brand~~, new repo is `slopstop`
- [x] ~~Rewrite the README~~, port framing gone, replaced with design notes and an Origin note

### Before publishing
- [x] ~~Add `LICENSE` (MIT)~~
- [x] ~~Credit CennoxX's list as MIT and preserve its notice~~
- [ ] Screenshots, Chrome wants 1280×800, AMO is flexible
- [x] ~~Privacy policy page~~, written; live at `/privacy.html` once deployed
- [x] ~~Support contact~~, filip.vajgand@gmail.com, on both pages
- [ ] **Disclose the auto-downvoting** in both store listings. It modifies the user's YouTube account; undisclosed account-modifying behaviour gets rejected.
- [ ] Test properly in Chrome, `chrome://extensions` → Load unpacked. Never fully runtime-tested there (branded Chrome blocks `--load-extension`, so only the manifest is verified).

### Website, DONE except the last item
- [x] ~~Build the site~~, `site/index.html` + `site/privacy.html`, matching the extension's design
- [x] ~~Deploy it~~, vhost written, Let's Encrypt cert issued (expires 2026-12-04, auto-renews), HTTP redirects to HTTPS
- [x] ~~Link to it from `filipvajgand.com`~~, added to Selected Independent Work, built and deployed

### Store submission
- [ ] ~~Chrome Web Store~~ **skipped**, not paying the $5 registration. The extension still runs on Chrome via Load unpacked and the manifest keeps its Chrome keys, so this can be revisited.
- [x] ~~Submit to Firefox AMO~~. 1.0.0 approved 2026-09-08, 1.1.1 approved 2026-09-29. Listing: https://addons.mozilla.org/en-GB/firefox/addon/slopstop-ai-artist-blocker/
- [ ] Edge Add-ons, free and accepts the same package, worth doing after Firefox lands. The AMO listing copy and reviewer notes to adapt are in history: `git show 420616f:store-assets/LISTING.md`
- [x] ~~Screenshots and icons uploaded to the AMO product page~~

---

## Facts worth not re-deriving

**Data sources.** The original database (`xoundbyte/soul-over-ai`) was deprecated
2026-03-11, data frozen 2026-02-16. Replaced by:
- [CennoxX/spotify-ai-blocker](https://github.com/CennoxX/spotify-ai-blocker), **MIT**, updated several times daily, ~7,400 artists. Source of record.
- [Zoundhub](https://zoundhub.com/) `/api/artists/all`: ~8,500 artists, adds ~1,370 CennoxX lacks. **No licence, undocumented endpoint, and stagnant** (only 16% of CennoxX's last-60-day additions). Supplementary only.
- Merged total ≈ 8,750.

**Zoundhub sends no CORS header.** That is why all fetching lives in
`background.js`: content scripts inherit the page's CORS policy and silently
lose that source. Do not move fetching back into the content script.

**Allowlist.** Upstream lists sometimes carry human artists by mistake (HUNTR/X
reached CennoxX through an accidental report, CennoxX/spotify-ai-blocker#1120).
`allowlist.json` ships with the extension for the ones we know about; users add
their own with **Not AI** in the AI DB tab (`allowedArtists` in storage.local,
part of the backup). `background.js` drops both from the AI list each time it
answers, never from the cache, so changes apply without a re-sync. The user's
Artists list is compiled separately in the engine, so a manual block still
wins. When upstream removes an entry, delete it from `allowlist.json`.

**Cross-browser manifest.** `background` declares both `service_worker` (Chrome)
and `scripts` (Firefox); each browser ignores the other's. `browser_specific_settings`
is Firefox-only. This is why there is no build step. Firefox's linter warns about
the ignored `service_worker` key, that warning is expected and correct.

**Icons** are original (`icons/*.svg` → `npm run icons`). One source per size:
the note is illegible below ~48px, so 16 and 32 keep only the ring and slash.

**The web server.** Use `root@64.23.176.162`; `aco` has no passwordless sudo.
41 vhosts carry a `## Managed by Ansible` header but **Ansible is not installed
on the box**, and vhost mtimes show they are edited by hand and rarely. The real
deploy path is `/root/deploy_one.sh <key>`, which reads per-app config from an
Elixir release (`ergexplorer_api`) and deploys as a per-app user. Slopstop is not
registered there and is deployed by plain rsync instead, which is what that
script's own comments recommend for statically built sites. Backups of docroots
go to `/root/deploy_backups/`.

**Adapter architecture.** `engine.js` is platform-agnostic and contains no
selectors. Everything that knows about a music service lives in an adapter;
`adapter-ytmusic.js` documents the contract at the top. A second service means
another adapter file added to `content_scripts` in the manifest, not changes to
the engine. Adapters self-register onto `globalThis.SLOPSTOP_ADAPTERS` and the
engine picks the first whose `matches()` returns true.

**Two player bars.** From September 2026 YouTube Music is moving accounts to a
redesigned bar. A page gets exactly one bar for its whole life, picked when the
app boots by the experiment flag `music_web_enable_wiz_miniplayer`:
`ytmusic-miniplayer` (new) or `ytmusic-player-bar` (classic), never both. The
new bar is not Polymer. Its classes are camelCase (`ytMusicMiniPlayerRightSection`),
the thumbs are `like-button-view-model` / `dislike-button-view-model` in one
pill, and it rebuilds whole sections, so the adapter re-checks where its buttons
are rather than placing them once. Below 616px it switches to a compact view
with no right section, so no buttons there; skipping still works. At the same
widths the player page adds a second copy marked `top-player-bar` ahead of the
real one in the document. The adapter keeps one selector set per bar in
`LAYOUTS`.

**Forcing the new bar for testing.** Load a throwaway extension alongside the
real one, with one content script: `matches` music.youtube.com,
`run_at: "document_start"`, `world: "MAIN"`. It has to set the flag before the
app reads it, which means trapping the `ytcfg` global:

```js
(() => {
    const apply = () => {
        const flags = window.ytcfg && ytcfg.get && ytcfg.get('EXPERIMENT_FLAGS');
        if (flags) flags.music_web_enable_wiz_miniplayer = true;
    };
    let real;
    Object.defineProperty(window, 'ytcfg', {
        configurable: true,
        get() { return real; },
        set(value) {
            real = value;
            if (value && typeof value.set === 'function') {
                const set = value.set;
                value.set = function () { const r = set.apply(this, arguments); apply(); return r; };
            }
            apply();
        }
    });
})();
```

Chrome for Testing takes both with `--load-extension=<repo>,<helper>`. For
Firefox, add the script to a scratch copy of the manifest and `web-ext run` it;
with `MOZ_HEADLESS=1`, `--verbose` and `--pref devtools.console.stdout.content=true`
the extension's console lines land in the terminal. YouTube eventually stops
serving media to headless Chrome, and the new bar then stays slid below the
viewport; skipping still works, since it only needs the queue.

**A second platform, if it comes up.** YouTube proper is the easiest port but
gives weaker coverage: the live databases are Spotify-keyed and carry no YouTube
IDs, so only the 1,279 artists in the frozen soul-over-ai data (14% of the
current 9,067) could be matched by channel ID; the rest fall back to matching the
channel name. Skipping is also only well-defined inside a playlist or with
autoplay on. Deezer may be the better second target: real dislike button, clean
artist metadata, and it labels AI tracks itself.

**Testing on Chrome.** Branded Chrome refuses `--load-extension`. Use Chrome for
Testing instead: `npx @puppeteer/browsers install chrome@stable`, then launch with
`--load-extension` and `--remote-debugging-port`, and drive it over CDP. Note that
Chrome 148+ exposes `globalThis.browser`, so the `api` shim resolves to `browser`
there rather than `chrome`; both return promises, so nothing changes.

**Unsigned installs.** Release and Beta Firefox ignore
`xpinstall.signatures.required`. Only Developer Edition, Nightly and ESR honour
it. For a permanent install without touching AMO, use Developer Edition.

---

## Commands

```bash
npm run start     # web-ext run, opens YouTube Music with auto-reload
npm run lint      # web-ext lint, expect 0 errors, 1 known warning
npm run build     # produces web-ext-artifacts/*.zip (rename to .xpi)
                  # verify with: python3 -m zipfile -l web-ext-artifacts/*.zip
                  # macOS `unzip -l` misreads these archives and reports 0 files
npm run icons     # regenerate PNGs from icons/*.svg (needs: npm i)
```

Regenerate the rewrite scorecard:

```bash
python3 - <<'PY'
import subprocess
def lines(rev,p):
    try: return subprocess.run(['git','show',f'{rev}:{p}'],capture_output=True,text=True,check=True).stdout.splitlines()
    except: return []
def sub(ls):
    return [l.strip() for l in ls if l.strip() and l.strip() not in ('}','{','};','});','),',"])") and len(l.strip())>=8]
tot=up_tot=0
for f in ['engine.js','adapter-ytmusic.js','popup.js','popup.html','manifest.json','common.js','background.js']:
    cur=sub(lines('HEAD',f)); up=set(sub(lines('cc22700',f)))
    shared=[l for l in cur if l in up]; tot+=len(cur); up_tot+=len(shared)
    print(f"{f:<16}{len(cur):>5}{len(shared):>6}{round(len(shared)/len(cur)*100) if cur else 0:>5}%")
print(f"{'TOTAL':<16}{tot:>5}{up_tot:>6}{round(up_tot/tot*100):>5}%")
PY
```

`cc22700` is the last upstream commit, the baseline everything is compared against.
