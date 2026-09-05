/*
 * Slopstop - popup
 *
 * Manages the three personal block lists and offers a read-only, searchable
 * view of the community AI database. Runs unchanged on Chrome and Firefox;
 * the `api` handle and `loadAiArtists` come from common.js.
 */

const ui = {
    tabs: document.querySelectorAll('.tab-btn'),
    list: document.getElementById('list'),
    field: document.getElementById('input'),
    addButton: document.getElementById('add'),
    entryRow: document.getElementById('input-area'),
    status: document.getElementById('status'),
    syncButton: document.getElementById('btn-refresh'),
    exportButton: document.getElementById('btn-export'),
    importButton: document.getElementById('btn-import'),
    filePicker: document.getElementById('file-input')
};

/*
 * Every tab declares how it behaves, so the shared handlers below stay free of
 * per-tab special cases. The AI view has no storage key because it is not the
 * user's list - it is fetched, cached and searched, never edited.
 */
const VIEWS = {
    keywords: { storageKey: 'blockedKeywords', prompt: 'Add a keyword…',        editable: true },
    songs:    { storageKey: 'blockedTracks',   prompt: 'Add a song title…',     editable: true },
    artists:  { storageKey: 'blockedArtists',  prompt: 'Add an artist…',        editable: true },
    ai:       { storageKey: null,              prompt: 'Search the database…',  editable: false }
};

// Painting thousands of rows on every keystroke is pointless when searching
// narrows the list far faster than scrolling does.
const DB_ROW_LIMIT = 300;
const STATUS_HOLD_MS = 3000;

let activeView = 'keywords';
let database = { names: [], syncedAt: 0 };
let statusTimer = null;

/* ---------- small helpers ---------- */

function announce(message, tone = '') {
    clearTimeout(statusTimer);
    ui.status.className = tone ? `status-bar ${tone}` : 'status-bar';
    ui.status.textContent = message;

    statusTimer = setTimeout(() => {
        ui.status.className = 'status-bar';
        ui.status.textContent = 'Ready.';
    }, STATUS_HOLD_MS);
}

/* Saved songs are objects; keywords and artists are plain strings. */
function labelFor(entry) {
    if (typeof entry === 'string') return entry;
    if (entry && entry.title) return `${entry.artist || 'Unknown'} — ${entry.title}`;
    return String(entry);
}

function describeAge(timestamp) {
    if (!timestamp) return 'never';

    const minutes = Math.floor((Date.now() - timestamp) / 60000);
    if (minutes < 1) return 'moments ago';
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    return `${Math.floor(hours / 24)}d ago`;
}

/* ---------- list building ---------- */

function emptyList() {
    ui.list.replaceChildren();
}

function noteRow(text, isError = false) {
    const row = document.createElement('li');
    row.className = isError ? 'list-note is-error' : 'list-note';
    row.textContent = text;
    return row;
}

function entryRow(entry, onRemove) {
    const row = document.createElement('li');

    const name = document.createElement('span');
    name.textContent = labelFor(entry);

    const remove = document.createElement('span');
    remove.className = 'delete-btn';
    remove.textContent = '✖';
    remove.title = 'Remove';
    remove.addEventListener('click', onRemove);

    row.append(name, remove);
    return row;
}

function summaryRow(shown, total) {
    const row = document.createElement('li');
    row.className = 'db-summary';

    const filtered = shown !== total;

    const count = document.createElement('div');
    count.className = 'db-count';
    count.textContent = filtered ? `${shown} / ${total}` : String(total);

    const caption = document.createElement('div');
    caption.className = 'db-caption';
    caption.textContent = filtered ? 'matching artists' : 'AI artists blocked';

    const meta = document.createElement('div');
    meta.className = 'db-meta';
    meta.textContent = `Synced ${describeAge(database.syncedAt)}`;

    row.append(count, caption, meta);
    return row;
}

/* ---------- views ---------- */

async function paintUserList() {
    const { storageKey } = VIEWS[activeView];
    const stored = await api.storage.local.get([storageKey]);

    // Copy before sorting; the array came straight from storage.
    const entries = [...(stored[storageKey] || [])]
        .sort((a, b) => labelFor(a).localeCompare(labelFor(b)));

    emptyList();

    if (!entries.length) {
        ui.list.append(noteRow('Nothing blocked yet.'));
        return;
    }

    for (const entry of entries) {
        ui.list.append(entryRow(entry, () => removeEntry(storageKey, entry)));
    }
}

/* Redraws from the in-memory copy, so it is cheap enough to run per keystroke. */
function paintDatabase() {
    const query = ui.field.value.trim().toLowerCase();
    const matches = query
        ? database.names.filter(name => name.toLowerCase().includes(query))
        : database.names;

    emptyList();
    ui.list.append(summaryRow(matches.length, database.names.length));

    if (!matches.length) {
        ui.list.append(noteRow(query ? 'No artist matches that search.' : 'Database is empty.'));
        return;
    }

    for (const name of matches.slice(0, DB_ROW_LIMIT)) {
        const row = document.createElement('li');
        const span = document.createElement('span');
        span.textContent = name;
        row.append(span);
        ui.list.append(row);
    }

    if (matches.length > DB_ROW_LIMIT) {
        const remaining = matches.length - DB_ROW_LIMIT;
        const more = document.createElement('li');
        more.className = 'list-more';
        more.textContent = `${remaining} more — search to narrow it down`;
        ui.list.append(more);
    }
}

async function syncDatabase({ force = false } = {}) {
    emptyList();
    ui.list.append(noteRow('Checking database…'));

    const result = await loadAiArtists({ force });

    database = {
        names: [...result.artists].sort((a, b) => a.localeCompare(b)),
        syncedAt: result.fetchedAt
    };

    // A total failure leaves nothing to show; a partial one still has a list.
    if (!result.count) {
        const reason = (result.errors && result.errors[0]) || 'no artists returned';
        emptyList();
        ui.list.append(noteRow(`Could not load the database — ${reason}`, true));
        announce('Sync failed', 'is-error');
        return;
    }

    paintDatabase();

    if (result.stale) announce('Offline — showing the cached list', 'is-warn');
    else announce('Database up to date', 'is-ok');
}

function paint() {
    const view = VIEWS[activeView];

    ui.field.placeholder = view.prompt;
    ui.addButton.hidden = !view.editable;

    if (view.editable) paintUserList();
    else syncDatabase();
}

/* ---------- mutations ---------- */

async function addEntry() {
    const view = VIEWS[activeView];
    if (!view.editable) return;

    const value = ui.field.value.trim();
    if (!value) return;

    const stored = await api.storage.local.get([view.storageKey]);
    const entries = stored[view.storageKey] || [];

    // Songs are stored as objects so the artist can be shown alongside.
    const addition = activeView === 'songs'
        ? { title: value, artist: 'Added by hand' }
        : value;

    const duplicate = entries.some(
        entry => labelFor(entry).toLowerCase() === labelFor(addition).toLowerCase()
    );

    if (duplicate) {
        announce('Already on the list', 'is-warn');
        return;
    }

    await api.storage.local.set({ [view.storageKey]: [...entries, addition] });
    ui.field.value = '';
    await paintUserList();
    announce('Added', 'is-ok');
}

async function removeEntry(storageKey, target) {
    const stored = await api.storage.local.get([storageKey]);
    const kept = (stored[storageKey] || []).filter(
        entry => labelFor(entry) !== labelFor(target)
    );

    await api.storage.local.set({ [storageKey]: kept });
    await paintUserList();
}

/* ---------- backup ---------- */

async function exportLists() {
    const stored = await api.storage.local.get(USER_LIST_KEYS);

    // Only the user's own lists. The AI cache is large, rebuilds itself, and
    // has no business in a personal backup.
    const payload = {};
    for (const key of USER_LIST_KEYS) payload[key] = stored[key] || [];

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);

    // The anchor is attached to the document because a detached one can have
    // its download dropped when the popup closes.
    const link = document.createElement('a');
    link.href = href;
    link.download = 'slopstop-backup.json';
    document.body.append(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(href), 10000);
    announce('Exported', 'is-ok');
}

async function importLists(file) {
    let parsed;
    try {
        parsed = JSON.parse(await file.text());
    } catch (e) {
        announce('That file is not valid JSON', 'is-error');
        return;
    }

    // Accept only known list keys, so a backup cannot overwrite anything else.
    const payload = {};
    for (const key of USER_LIST_KEYS) {
        if (Array.isArray(parsed[key])) payload[key] = parsed[key];
    }

    if (!Object.keys(payload).length) {
        announce('No block lists found in that file', 'is-error');
        return;
    }

    await api.storage.local.set(payload);
    paint();
    announce('Import complete', 'is-ok');
}

/* ---------- wiring ---------- */

for (const tab of ui.tabs) {
    tab.addEventListener('click', () => {
        for (const other of ui.tabs) other.classList.toggle('active', other === tab);
        activeView = tab.dataset.tab;
        ui.field.value = '';
        paint();
    });
}

ui.addButton.addEventListener('click', addEntry);

ui.field.addEventListener('keydown', event => {
    if (event.key === 'Enter') addEntry();
});

ui.field.addEventListener('input', () => {
    if (!VIEWS[activeView].editable) paintDatabase();
});

ui.syncButton.addEventListener('click', () => {
    if (VIEWS[activeView].editable) paintUserList();
    else syncDatabase({ force: true });
});

ui.exportButton.addEventListener('click', exportLists);
ui.importButton.addEventListener('click', () => ui.filePicker.click());

ui.filePicker.addEventListener('change', event => {
    const [file] = event.target.files;
    if (file) importLists(file);
    event.target.value = ''; // let the same file be picked again
});

paint();
