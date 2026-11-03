/**
 * Shortcuts, the command palette and tab visibility.
 * One registry (LIST) drives the real keyboard shortcuts, the list in the Atelier and the palette, so nothing shown
 * there can be a dummy. Other modules add their own with Shortcuts.add({...}) (the Copilot adds "new chapter").
 * Hidden tabs are saved to the account (POST /api/prefs) and cached locally so they apply before the first paint.
 * Uses switchSection / closeMoreSheet from dashboard.js and toggleTheme from appearance.js.
 */
const Shortcuts = (() => {
    const mac = /Mac|iPhone|iPad|iPod/i.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent);
    const CAP = { mod: mac ? '⌘' : 'Ctrl', shift: mac ? '⇧' : 'Shift', alt: mac ? '⌥' : 'Alt', enter: mac ? '↩' : 'Enter', esc: 'Esc' };
    const cap = k => CAP[k] || (k.length === 1 ? k.toUpperCase() : k);
    const go = (name, after) => () => {
        if (typeof closeMoreSheet === 'function') closeMoreSheet();
        switchSection(name, { animate: true });
        if (after) setTimeout(after, 380);
    };
    const focus = id => () => document.getElementById(id)?.focus({ preventScroll: false });

    // keys: one combo (['mod','k']) or a sequence (seq: true, ['g','p'] = press G, then P)
    const LIST = [
        { id: 'palette', keys: ['mod', 'k'], label: 'Search and commands', group: 'Anywhere', icon: 'command', run: () => Palette.open() },
        { id: 'keys', keys: ['?'], label: 'Show every shortcut', group: 'Anywhere', icon: 'keyboard', run: go('atelier', () => document.getElementById('atelier-keys-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' })) },
        { id: 'theme', keys: ['shift', 'd'], label: 'Switch light and dark', group: 'Anywhere', icon: 'half', run: () => toggleTheme() },
        { id: 'go-home', keys: ['g', 'd'], seq: true, label: 'Daybook', group: 'Go to', icon: 'house', run: go('home') },
        { id: 'go-setup', keys: ['g', 't'], seq: true, label: 'Agent Toolbelt', group: 'Go to', icon: 'toolbox', run: go('setup') },
        { id: 'go-prep', keys: ['g', 'p'], seq: true, label: 'Prep Studio', group: 'Go to', icon: 'target', run: go('prep') },
        { id: 'go-bento', keys: ['g', 'b'], seq: true, label: 'Brain Bento', group: 'Go to', icon: 'bento', run: go('bento') },
        { id: 'go-chat', keys: ['g', 'c'], seq: true, label: 'Live Copilot', group: 'Go to', icon: 'chats', run: go('chat') },
        { id: 'go-attic', keys: ['g', 'a'], seq: true, label: 'The Attic', group: 'Go to', icon: 'attic', run: go('attic') },
        { id: 'go-atelier', keys: ['g', 'l'], seq: true, label: 'Atelier (looks)', group: 'Go to', icon: 'palette', run: go('atelier') },
        { id: 'go-settings', keys: ['g', 's'], seq: true, label: 'Settings', group: 'Go to', icon: 'gear', run: go('settings') },
        { id: 'go-aboutme', keys: ['g', 'm'], seq: true, label: 'About me', group: 'Go to', icon: 'user', run: go('aboutme') },
        { id: 'prep-search', keys: ['/'], label: 'Search your questions', group: 'Prep Studio', icon: 'search', run: go('prep', focus('prep-search')) },
        { id: 'send', keys: ['enter'], label: 'Send your message', group: 'While typing in Live Copilot', info: true },
        { id: 'newline', keys: ['shift', 'enter'], label: 'New line', group: 'While typing in Live Copilot', info: true },
        { id: 'close', keys: ['esc'], label: 'Close any open window', group: 'Anywhere', info: true },
    ];

    function add(entry) {
        const at = LIST.findIndex(e => e.id === entry.id);
        if (at >= 0) LIST[at] = entry; else LIST.push(entry);
        render();
    }

    const typing = t => !!t.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
    let pending = null, pendingTimer = 0;
    function onKey(e) {
        if (e.defaultPrevented || e.repeat || e.isComposing) return;
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
        const mod = mac ? e.metaKey : e.ctrlKey;
        // the palette opens from anywhere, even while typing; everything else waits until you are not typing
        if (mod && !e.altKey && k === 'k') { e.preventDefault(); Palette.toggle(); return; }
        if (typing(e.target) || document.querySelector('dialog[open]:not(#more-sheet)') || mod || e.altKey) return;
        if (pending) {
            const hit = LIST.find(x => x.seq && x.keys[0] === pending && x.keys[1] === k && x.run);
            pending = null; clearTimeout(pendingTimer);
            if (hit) { e.preventDefault(); hit.run(); }
            return;
        }
        if (LIST.some(x => x.seq && x.keys[0] === k)) { pending = k; pendingTimer = setTimeout(() => { pending = null; }, 1200); return; }
        const hit = LIST.find(x => !x.seq && !x.info && x.run && x.keys.length === (e.shiftKey && k !== '?' ? 2 : 1)
            && x.keys[x.keys.length - 1] === k && (x.keys[0] === 'shift') === (e.shiftKey && k !== '?'));
        if (hit) { e.preventDefault(); hit.run(); }
    }

    const kbd = keys => keys.map(cap).map(c => `<kbd>${c}</kbd>`).join('<span class="kbd-plus">+</span>');
    const kbdSeq = x => x.seq ? `<kbd>${cap(x.keys[0])}</kbd><span class="kbd-then">then</span><kbd>${cap(x.keys[1])}</kbd>` : kbd(x.keys);

    // the Atelier list: grouped, every row real
    function render() {
        const box = document.getElementById('keys-list');
        if (!box) return;
        const groups = [...new Set(LIST.map(x => x.group))];
        box.innerHTML = groups.map(g => `
            <section class="keys-group"><h4>${g}</h4>
                ${LIST.filter(x => x.group === g).map(x => `<div class="keys-row"><span class="keys-label">${x.icon ? `<svg aria-hidden="true"><use href="#i-${x.icon}"/></svg>` : ''}${x.label}</span><span class="keys-combo">${kbdSeq(x)}</span></div>`).join('')}
            </section>`).join('');
    }

    function init() {
        document.addEventListener('keydown', onKey);
        document.addEventListener('click', e => { if (e.target.closest('[data-palette-open]')) { if (typeof closeMoreSheet === 'function') closeMoreSheet(); Palette.open(); } });
        render();
    }
    init();
    return { add, list: () => LIST, kbd: kbdSeq, mac };
})();

/* ── Command palette: every registry entry plus a few one-off commands, fuzzy-searched ── */
const Palette = (() => {
    let dlg, input, listEl, items = [], index = 0;
    const EXTRA = () => [
        { id: 'tour', label: 'Take the guided tour', group: 'Help', icon: 'path', run: () => window.Tour?.start() },
        { id: 'onboarding', label: 'Redo onboarding', group: 'Help', icon: 'user', run: () => window.Onboard?.open() },
        { id: 'attic-toggle', label: Tabs.hidden('attic') ? 'Show The Attic tab' : 'Hide The Attic tab', group: 'Tabs', icon: 'attic', run: () => Tabs.set('attic', Tabs.hidden('attic')) },
        ...(window.Auth?.enabled?.() ? [{ id: 'signout', label: 'Sign out', group: 'Account', icon: 'sign-out', run: () => window.Auth.signOut() }] : []),
    ];

    // subsequence match, rewarding starts of words and consecutive letters
    function score(q, text) {
        if (!q) return 1;
        const t = text.toLowerCase();
        let s = 0, at = -1, run = 0;
        for (const ch of q.toLowerCase()) {
            const i = t.indexOf(ch, at + 1);
            if (i < 0) return 0;
            run = i === at + 1 ? run + 1 : 0;
            s += 1 + run * 2 + (i === 0 || t[i - 1] === ' ' ? 3 : 0);
            at = i;
        }
        return s - t.length * 0.01;
    }

    function build() {
        dlg = document.createElement('dialog');
        dlg.className = 'palette';
        dlg.setAttribute('aria-label', 'Search and commands');
        dlg.innerHTML = `
            <div class="palette-box">
                <label class="palette-search"><svg aria-hidden="true"><use href="#i-search"/></svg>
                    <input type="text" placeholder="Pages and commands…" aria-label="Search commands" role="combobox" aria-expanded="true" aria-controls="palette-list" autocomplete="off" spellcheck="false">
                    <kbd>esc</kbd></label>
                <ul class="palette-list" id="palette-list" role="listbox"></ul>
                <p class="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↩</kbd> open</span><span>${Shortcuts.kbd({ keys: ['mod', 'k'] })} anywhere</span></p>
            </div>`;
        document.body.appendChild(dlg);
        input = dlg.querySelector('input');
        listEl = dlg.querySelector('.palette-list');
        input.addEventListener('input', () => { index = 0; draw(); });
        input.addEventListener('keydown', e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
            else if (e.key === 'Enter') { e.preventDefault(); pick(items[index]); }
        });
        listEl.addEventListener('click', e => { const li = e.target.closest('[data-i]'); if (li) pick(items[Number(li.dataset.i)]); });
        listEl.addEventListener('pointermove', e => { const li = e.target.closest('[data-i]'); if (li && Number(li.dataset.i) !== index) { index = Number(li.dataset.i); mark(); } });
        dlg.addEventListener('click', e => { if (e.target === dlg) close(); });   // the backdrop
    }

    function draw() {
        const q = input.value.trim();
        const all = [...Shortcuts.list().filter(x => x.run), ...EXTRA()];
        items = all.map(x => ({ ...x, s: Math.max(score(q, x.label), score(q, `${x.group} ${x.label}`) * 0.8) }))
            .filter(x => x.s > 0).sort((a, b) => (q ? b.s - a.s : 0));
        listEl.innerHTML = items.length ? items.map((x, i) => `
            <li role="option" data-i="${i}" id="pal-${i}" aria-selected="${i === index}">
                <span class="pal-ico"><svg aria-hidden="true"><use href="#i-${x.icon || 'caret-right'}"/></svg></span>
                <span class="pal-text"><b>${x.label}</b><small>${x.group}</small></span>
                ${x.keys ? `<span class="pal-keys">${Shortcuts.kbd(x)}</span>` : ''}
            </li>`).join('') : '<li class="pal-empty">Nothing matches. Try “bento”, “dark” or “tour”.</li>';
        mark();
    }
    function mark() {
        listEl.querySelectorAll('[data-i]').forEach(li => li.setAttribute('aria-selected', String(Number(li.dataset.i) === index)));
        input.setAttribute('aria-activedescendant', items.length ? `pal-${index}` : '');
        listEl.querySelector(`[data-i="${index}"]`)?.scrollIntoView({ block: 'nearest' });
    }
    function move(d) { if (!items.length) return; index = (index + d + items.length) % items.length; mark(); }
    function pick(x) { if (!x) return; close(); setTimeout(() => x.run(), 60); }
    function open() {
        if (!dlg) build();
        if (dlg.open) return;
        input.value = ''; index = 0; draw();
        dlg.showModal();
        input.focus();
    }
    function close() { if (dlg?.open) dlg.close(); }
    return { open, close, toggle: () => (dlg?.open ? close() : open()) };
})();

/* ── Optional tabs (The Attic): shown or hidden per account ── */
const Tabs = (() => {
    const KEY = 'vettly_hidden_tabs';
    let hiddenTabs = [];
    try { hiddenTabs = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { /* storage blocked */ }

    function apply() {
        document.querySelectorAll('[data-tab]').forEach(el => { if (el.matches('.nav-item, .more-item')) el.hidden = hiddenTabs.includes(el.dataset.tab); });
        document.querySelectorAll('[data-tab-toggle]').forEach(cb => { cb.checked = !hiddenTabs.includes(cb.dataset.tabToggle); });
        if (window.Motion?.pill) Motion.pill(document.querySelector('.sidebar-nav'));
    }
    async function set(tab, show) {
        hiddenTabs = show ? hiddenTabs.filter(t => t !== tab) : [...new Set([...hiddenTabs, tab])];
        try { localStorage.setItem(KEY, JSON.stringify(hiddenTabs)); } catch (e) { /* storage blocked */ }
        apply();
        if (!show && document.body.dataset.section === tab) Motion?.toast?.('The Attic is hidden. Bring it back any time from the Atelier.', 'ok');
        try { await fetch(`${API_BASE}/api/prefs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hidden_tabs: hiddenTabs }) }); } catch (e) { /* saved locally; the server catches up next time */ }
    }
    document.addEventListener('change', e => { const cb = e.target.closest('[data-tab-toggle]'); if (cb) set(cb.dataset.tabToggle, cb.checked); });
    apply();
    (async () => {   // the account's choice wins over this device's cache
        await window.Auth?.ready;
        try {
            const res = await fetch(`${API_BASE}/api/profile`);
            if (!res.ok) return;
            const prefs = (await res.json()).prefs || {};
            if (Array.isArray(prefs.hidden_tabs)) { hiddenTabs = prefs.hidden_tabs; try { localStorage.setItem(KEY, JSON.stringify(hiddenTabs)); } catch (e) { /* */ } apply(); }
        } catch (e) { /* offline: keep the cache */ }
    })();
    return { set, hidden: t => hiddenTabs.includes(t), apply };
})();

// modules talk to each other through window: a top-level const is not a window property
window.Shortcuts = Shortcuts; window.Palette = Palette; window.Tabs = Tabs;
