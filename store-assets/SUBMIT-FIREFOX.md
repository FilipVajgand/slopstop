# Submitting to Firefox Add-ons

Free, no developer fee. Everything needed is in this folder.

Pre-flight is clean as of 2026-09-05: `web-ext lint` reports 0 errors on the
listed channel, the package is 12 files at 29 KB, and both required URLs return
200.

## What you upload

```
store-assets/slopstop-1.0.0.zip
```

Rebuild it any time with `npm run build`, which writes to `web-ext-artifacts/`.

## Steps

### 1. Account

Sign in at <https://addons.mozilla.org/developers/> with a Firefox account.
There is no fee and nothing to pay.

### 2. Start the submission

**Submit a New Add-on**, then choose **On this site** for the listed channel.
That publishes it publicly and gives users automatic updates.

The alternative, **On your own**, only signs the file for self-distribution. You
do not want that here.

### 3. Upload

Upload `slopstop-1.0.0.zip`. The validator runs immediately and should pass with
one warning about `background.service_worker`, which is expected: Firefox ignores
that key and uses `background.scripts`. It keeps the same codebase working on
Chrome.

When asked whether the sources need to be provided, answer **no**. Nothing is
minified, obfuscated or generated; the longest line in the whole extension is
131 characters.

### 4. Compatibility

Tick **Firefox** only. Leave **Firefox for Android** unticked, for the reason in
`LISTING.md`: the content script targets the desktop player bar and the mobile
DOM is untested. It can be added later.

### 5. Listing details

Copy from `LISTING.md`. The fields map like this:

| AMO field | Source |
| --- | --- |
| Name | `Slopstop` |
| Summary | the short summary block |
| Description | the description block |
| Category | Other |
| Support email | filip.vajgand@gmail.com |
| Homepage | https://slopstop.filipvajgand.com |
| Privacy policy | https://slopstop.filipvajgand.com/privacy.html |
| Licence | MIT |
| Screenshots | `01-keywords.png`, `02-database.png`, `03-search.png` |

AMO also asks a data-collection question. Answer that **no data is collected**,
which matches `data_collection_permissions: { required: ["none"] }` in the
manifest.

### 6. Notes for the reviewer

Paste the reviewer-notes block from `LISTING.md`. It covers the three things a
reviewer would otherwise have to work out for themselves: the deliberate thumbs
down on the user's account, the two remote list downloads being data rather than
code, and the dual background keys.

This is worth doing. The thumbs down is the one behaviour that looks alarming
without an explanation.

## After submitting

Review usually takes a few days. You get an email either way. Once approved the
add-on installs permanently on release Firefox, with automatic updates, and the
"not in the stores yet" block on the site can be replaced with the real link.

## Shipping an update later

1. Raise `version` in `manifest.json`
2. `npm run lint && npm run build`
3. Upload the new zip under the same add-on

The add-on id `slopstop@filipvajgand` is what ties versions together, so leave
it alone.

## If you ever want the CLI instead

`web-ext sign` can upload without the web UI, using API credentials from
<https://addons.mozilla.org/developers/addon/api/key/>:

```bash
npx web-ext sign --api-key=JWT_ISSUER --api-secret=JWT_SECRET --channel=listed
```

Useful for later updates. The first submission still needs the web UI for the
listing metadata, so there is no benefit to it today. Keep the secret out of the
repo and out of your shell history.
