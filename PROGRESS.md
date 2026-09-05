# Slopstop — progress & tasks

Working notes for picking this up across sessions. Update as things land.

---

## Where things stand

Firefox + Chrome extension that skips and downvotes AI-generated artists on
YouTube Music. Started life as a port of someone else's Chrome extension; the
current work is making it independently ours so it can be published.

| | |
| --- | --- |
| Repo | `FilipVajgand/slopstop` (**private**) — clean history, no upstream commits |
| Old repo | `FilipVajgand/ytm-ai-blocker-firefox` — dev history, keep private, do not publish |
| Extension name | Slopstop |
| Add-on ID | `slopstop@filipvajgand` (not yet signed — still free to change) |
| Version | 1.0.0 |
| Min Firefox | 142 |
| Site | `slopstop.filipvajgand.com` → 164.90.246.186 (Apache, same box as apex). Pages built in `site/`; **not deployed yet** — see `site/DEPLOY.md` |

---

## The blocker: upstream has no licence

Upstream is [firemountainpeak-lang/YTM-AI-Artist-Song-Blocker](https://github.com/firemountainpeak-lang/YTM-AI-Artist-Song-Blocker)
with **no LICENSE file** → all rights reserved by default. We cannot publish or
distribute while their code is in ours.

- Asked: [issue #4](https://github.com/firemountainpeak-lang/YTM-AI-Artist-Song-Blocker/issues/4), opened 2026-08-28 — **no reply**
- Author's last commit: 2026-01-26. But they replied to issue #3 on 2026-07-25, so they do read issues.
- Decision: stop waiting, rewrite their code out.

**Publishing to either store requires warranting you hold distribution rights**
(Firefox Add-on Distribution Agreement §5(c); Chrome has an equivalent).

Both preconditions are now met: the rewrite is done (3% left, all generic idiom)
and `slopstop` has clean history. The remaining judgement call is whether to make
the repo public — flip with
`gh repo edit FilipVajgand/slopstop --visibility public --accept-visibility-change-consequences`.

---

## Rewrite scorecard

How much upstream code is left. Regenerate with the snippet at the bottom.

| File | Substantive lines | From upstream | |
| --- | --- | --- | --- |
| `manifest.json` | 37 | 14 | 38% — spec-dictated keys only, nothing to do |
| `popup.html` | 218 | 8 | 4% ✅ |
| `content.js` | 360 | 11 | 3% ✅ rewritten |
| `popup.js` | 223 | 0 | 0% ✅ rewritten |
| `common.js` | 23 | 0 | 0% ✅ ours |
| `background.js` | 122 | 0 | 0% ✅ ours |
| **Total** | **983** | **33** | **3%** (was 37%) |

The 33 remaining lines are generic JavaScript with no other plausible form
(`setTimeout(() => {`, `} else {`, `clearInterval(poll)`) plus manifest keys the
MV3 spec dictates. **The rewrite is done.**

Not everything left is protectable. DOM selectors like `ytmusic-player-bar .title`
are facts about YouTube Music, not expression — those can stay. What must go is
their comments, naming, code organisation and design.

---

## Tasks

### To make the code ours — DONE
- [x] ~~Rewrite `popup.js`~~ — done, 53% → 0%
- [x] ~~Rewrite `content.js`~~ — done, 31% → 3%
- [x] ~~Re-create the repo without upstream history~~ — `FilipVajgand/slopstop`, single commit
- [x] ~~Rename repo to match the brand~~ — new repo is `slopstop`
- [x] ~~Rewrite the README~~ — port framing gone, replaced with design notes and an Origin note

### Before publishing
- [x] ~~Add `LICENSE` (MIT)~~
- [x] ~~Credit CennoxX's list as MIT and preserve its notice~~
- [ ] Screenshots — Chrome wants 1280×800, AMO is flexible
- [x] ~~Privacy policy page~~ — written; live at `/privacy.html` once deployed
- [x] ~~Support contact~~ — filip.vajgand@gmail.com, on both pages
- [ ] **Disclose the auto-downvoting** in both store listings. It modifies the user's YouTube account; undisclosed account-modifying behaviour gets rejected.
- [ ] Test properly in Chrome — `chrome://extensions` → Load unpacked. Never fully runtime-tested there (branded Chrome blocks `--load-extension`, so only the manifest is verified).

### Website
- [x] ~~Build the site~~ — `site/index.html` + `site/privacy.html`, matching the extension's design
- [ ] **Deploy it.** Apache returns 403 for the subdomain (no vhost) and has no TLS cert. Steps in `site/DEPLOY.md`: rsync, vhost, certbot.
- [ ] Link to it from `filipvajgand.com`

### Store submission
- [ ] Chrome Web Store — **$5 one-time** developer registration
- [ ] Firefox AMO — free
- [ ] Edge Add-ons — free, accepts the Chrome package

---

## Facts worth not re-deriving

**Data sources.** The original database (`xoundbyte/soul-over-ai`) was deprecated
2026-03-11, data frozen 2026-02-16. Replaced by:
- [CennoxX/spotify-ai-blocker](https://github.com/CennoxX/spotify-ai-blocker) — **MIT**, updated several times daily, ~7,400 artists. Source of record.
- [Zoundhub](https://zoundhub.com/) `/api/artists/all` — ~8,500 artists, adds ~1,370 CennoxX lacks. **No licence, undocumented endpoint, and stagnant** (only 16% of CennoxX's last-60-day additions). Supplementary only.
- Merged total ≈ 8,750.

**Zoundhub sends no CORS header.** That is why all fetching lives in
`background.js` — content scripts inherit the page's CORS policy and silently
lose that source. Do not move fetching back into the content script.

**Cross-browser manifest.** `background` declares both `service_worker` (Chrome)
and `scripts` (Firefox); each browser ignores the other's. `browser_specific_settings`
is Firefox-only. This is why there is no build step. Firefox's linter warns about
the ignored `service_worker` key — that warning is expected and correct.

**Icons** are original (`icons/*.svg` → `npm run icons`). One source per size:
the note is illegible below ~48px, so 16 and 32 keep only the ring and slash.

**Unsigned installs.** Release and Beta Firefox ignore
`xpinstall.signatures.required`. Only Developer Edition, Nightly and ESR honour
it. For a permanent install without touching AMO, use Developer Edition.

---

## Commands

```bash
npm run start     # web-ext run, opens YouTube Music with auto-reload
npm run lint      # web-ext lint — expect 0 errors, 1 known warning
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
for f in ['content.js','popup.js','popup.html','manifest.json','common.js','background.js']:
    cur=sub(lines('HEAD',f)); up=set(sub(lines('cc22700',f)))
    shared=[l for l in cur if l in up]; tot+=len(cur); up_tot+=len(shared)
    print(f"{f:<16}{len(cur):>5}{len(shared):>6}{round(len(shared)/len(cur)*100) if cur else 0:>5}%")
print(f"{'TOTAL':<16}{tot:>5}{up_tot:>6}{round(up_tot/tot*100):>5}%")
PY
```

`cc22700` is the last upstream commit — the baseline everything is compared against.
