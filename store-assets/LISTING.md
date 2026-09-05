# Store listing copy

Ready to paste. Both stores restrict leading with someone else's trademark, so
the name is the brand alone and YouTube Music appears only as a description of
what it works on.

---

## Name

```
Slopstop
```

Firefox lets the listing name differ from the manifest name. Chrome takes it
from the manifest, which is already `Slopstop - AI artist blocker` (28 chars,
under the 45 limit).

## Short summary

Chrome allows 132 characters, AMO 250. This fits both:

```
Skips and downvotes AI-generated artists on YouTube Music, using a community database of around 8,900 known AI acts.
```

## Category

- Chrome Web Store: **Entertainment**
- AMO: **Other**, or **Search Tools** if Other is unavailable

## Description

```
YouTube Music keeps serving up tracks by artists that do not exist, churned out
in bulk by generative models. Slopstop watches the player, and when a blocked
artist comes on it presses thumbs down and skips to the next track. You do not
have to sit through it, and the recommendation algorithm gets the message.

About 8,900 known AI acts are covered out of the box, from two
community-maintained lists that refresh in the background. You can add your own
artists, songs and title keywords on top, such as "Sped Up" or "Nightcore".


CAREFUL MATCHING

Blocking on artist names is easy to get wrong, so the matching is deliberately
conservative:

- An artist name is only checked against the artist. The player bar also shows
  the album and the year, and matching against all of it means an act called
  "Angel" takes out anything from an album with "angel" in the title.

- Single-word names have to match exactly. Around a third of the database is one
  word, and some of those are ordinary English words like Angel, Iris, Raven and
  Nova. Without exact matching you lose Angel Olsen and Nova Twins along with
  the AI acts.

- Your own keywords still match anywhere in the title, since that is the point
  of a keyword.

Every block is written to the browser console with the term it matched and which
list that term came from, so you can always see why something was skipped.


WHAT IT DOES TO YOUR ACCOUNT

When a blocked track starts, Slopstop presses thumbs down on it and then skips.
That is a real change to your YouTube Music account, made on purpose so the
recommendations improve. It happens only for tracks matching your blocklists.


PRIVACY

Slopstop collects nothing. No analytics, no accounts, no telemetry, and no
servers of mine. Your blocklists stay on your own device. The only network
requests download two public artist lists, and they carry no information about
you or what you listen to.

Full policy: https://slopstop.filipvajgand.com/privacy.html


Open source, MIT licensed.
```

## URLs

| Field | Value |
| --- | --- |
| Homepage | `https://slopstop.filipvajgand.com` |
| Privacy policy | `https://slopstop.filipvajgand.com/privacy.html` |
| Support | `filip.vajgand@gmail.com` |

## Screenshots

`01-keywords.png`, `02-database.png`, `03-search.png` in this folder. 1280x800,
which is what the Chrome Web Store wants and AMO accepts.

## Notes for reviewers

Worth pasting into the optional reviewer-notes field. It answers the two
questions this extension will raise before anyone has to go looking.

```
Two things that may stand out on review:

1. The extension presses thumbs down on the user's YouTube Music account before
   skipping a blocked track. This is the intended behaviour and the reason
   people install it, since it trains the recommendation algorithm as well as
   skipping. It is described in the store description and in the privacy policy,
   and every occurrence is logged to the browser console. It happens only for
   tracks matching the user's own blocklists or the AI artist database.

2. The extension downloads two remote lists, from raw.githubusercontent.com and
   zoundhub.com. These are plain data files of artist names, parsed as CSV and
   JSON. No remote code is fetched or executed. The fetching happens in the
   background worker rather than the content script because zoundhub.com sends
   no access-control-allow-origin header, so a content script cannot read it.

3. The manifest declares both background.service_worker and background.scripts.
   Firefox uses scripts and ignores service_worker; Chrome does the reverse.
   This keeps one codebase working on both engines with no build step. The
   linter's BACKGROUND_SERVICE_WORKER_IGNORED warning is expected and is the
   intended behaviour.

No user data is collected or transmitted. The manifest declares
data_collection_permissions: { required: ["none"] }.
```

## Version notes (1.0.0)

AMO asks for these on the details step.

```
First release.

Blocks AI-generated artists on YouTube Music by matching the player bar
against two community-maintained databases, roughly 8,900 artists in total,
plus the user's own artist, song and keyword lists. Matched tracks are
downvoted and skipped.

Matching is scoped per field: artist terms are tested only against the parsed
artist name, never the album or year, and single-word artist names must match
exactly so that common words like "Angel" or "Nova" cannot take out unrelated
artists.
```

## Testing account

The submission checklist asks for test credentials if the add-on needs a site
account. **Do not hand over your own Google login.** Add this to the reviewer
notes instead:

```
TESTING

Reviewing the code needs no account. To watch the extension act you need a
signed-in YouTube Music session, since the player bar it reads only appears
once a track is playing. I would rather not supply a Google account, so here
is how to verify it without one:

- Load the extension and open https://music.youtube.com with the browser
  console open. It logs "[Slopstop] Engine started." followed by
  "[Slopstop] Loaded N terms" with a per-source breakdown. That confirms the
  background worker, the two downloads and the content script are all working.

- The popup works with no account at all. The AI DB tab lists and searches the
  full database, and the Keywords, Songs and Artists tabs add and remove
  entries against local storage.

- To see a block end to end, sign into any YouTube Music account and play an
  artist from the AI DB tab. The console prints the matched term, the list it
  came from, the downvote and the skip.

Happy to answer anything at filip.vajgand@gmail.com.
```

## Firefox for Android

Submit as **desktop only** for now. The minimum version (142) would allow
Android, and the popup is laid out narrow enough for it, but the content script
targets the desktop YouTube Music player bar and the mobile DOM has not been
tested. Claiming Android support untested invites a bad first review. It can be
enabled later once someone has actually tried it.
