/**
 * Onboarding and the user's field: a ten-page first-visit dialog (two animated pages on what Vettly is, three questions,
 * three animated pages on how the backend works, then "Power it up" with the two free keys and "Make it yours" with the
 * Atelier, shortcuts and The Attic; scenes in onboard-scenes.js) whose answers shape every prompt, the Prep Studio
 * category tiles and the default role. Uses dashboard.js globals, KEY_PROVIDERS/KeyRing/KeyGuide and Tabs.
 */
const Onboard = (() => {
    const FIELDS = ['Technology', 'Business & management (MBA)', 'Healthcare', 'Finance & accounting', 'Sales', 'Marketing',
        'Design', 'Education', 'Operations & supply chain', 'Law', 'Hospitality', 'Government & public service', 'Other'];
    const LEVELS = ['Student or fresher', 'Early career', 'Mid-level', 'Senior', 'Lead or manager'];
    const TONES = ['gen', 'beh', 'tech', 'dsa', 'proj', 'sys', 'sit', 'hr', 'asg'];
    const ICONS = ['sparkle', 'brain', 'target', 'path', 'toolbox', 'layout', 'bulb', 'chats', 'star'];
    let profile = {}, current = null;
    const esc = s => escapeHtml(String(s || ''));

    const hasTour = () => typeof Tour !== 'undefined';
    const S = typeof OnboardScenes !== 'undefined' ? OnboardScenes : null;
    // Pages: 0-1 show what Vettly is, 2-4 ask about you (saved on 4), 5-7 show how the backend works, 8 the free keys,
    // 9 the Atelier
    const SAVE = 4, NAME = 2, ROLE = 4, KEYS = 8;
    const touch = () => matchMedia('(hover: none)').matches;
    const MOD = () => (window.Shortcuts?.mac ? '⌘' : 'Ctrl');
    const MARK = '<svg class="ob-logo" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2l5 5-5 5-5-5zM25 11l5 5-5 5-5-5zM16 20l5 5-5 5-5-5zM7 11l5 5-5 5-5-5z"/></svg>';
    const THEME_BTN = `<button type="button" class="theme-switch" onclick="toggleTheme(event)" aria-label="Switch between light and dark">
        <svg class="sunmoon" viewBox="0 0 24 24" aria-hidden="true"><defs><mask id="sm-ob"><rect x="-4" y="-4" width="32" height="32" fill="#fff"/><circle class="sm-bite" cx="18.5" cy="5.5" r="6.2" fill="#000"/></mask></defs><circle class="sm-core" cx="12" cy="12" r="5" mask="url(#sm-ob)"/><g class="sm-rays"><line x1="12" y1="1.6" x2="12" y2="3.6" transform="rotate(0 12 12)"/><line x1="12" y1="1.6" x2="12" y2="3.6" transform="rotate(45 12 12)"/><line x1="12" y1="1.6" x2="12" y2="3.6" transform="rotate(90 12 12)"/><line x1="12" y1="1.6" x2="12" y2="3.6" transform="rotate(135 12 12)"/><line x1="12" y1="1.6" x2="12" y2="3.6" transform="rotate(180 12 12)"/><line x1="12" y1="1.6" x2="12" y2="3.6" transform="rotate(225 12 12)"/><line x1="12" y1="1.6" x2="12" y2="3.6" transform="rotate(270 12 12)"/><line x1="12" y1="1.6" x2="12" y2="3.6" transform="rotate(315 12 12)"/></g></svg>
        <span class="ts-label"><span class="ts-to-dark">Dark</span><span class="ts-to-light">Light</span></span></button>`;

    // [scene, figure caption, kicker, title, lede, handwritten aside]
    const COPY = [
        ['welcome', 'Four rooms', 'Welcome', 'Your interview prep studio',
            'Vettly turns the role you want into questions, model answers in your own voice, and a copilot to practise with. Here is a one-minute look around.', 'it starts with you'],
        ['studio', 'The studio · live', 'Inside Vettly', 'Four rooms, one studio',
            'Prep Studio writes questions for your role. Brain Bento packs five ideas every morning. Live Copilot listens while you practise out loud.', 'watch the cursor'],
        ['badge', 'Candidate spec', 'About you · 1 of 3', 'What should we call you?', 'Your name goes on every answer Vettly writes in your voice.', ''],
        ['badge', 'Candidate spec', 'About you · 2 of 3', 'Which field are you in?', 'It decides your Prep Studio categories and the ideas in your daily Bento.', ''],
        ['badge', 'Candidate spec', 'About you · 3 of 3', 'What are you preparing for?', 'Every question and model answer is pitched at this role and level.', ''],
        ['context', 'Context fusion · context_engine.py', 'How it works · 1 of 3', 'First, it learns you',
            'Your field and role are enough to start. Add a resume, GitHub, a job description or your stories whenever you like: they join one context of up to 80,000 characters, packed most important first.', 'all of it optional'],
        ['router', 'Failover router · ai/utils.py', 'How it works · 2 of 3', 'Then it finds a model that’s free',
            'Gemini goes first. If it’s busy, Groq answers, then Claude or OpenAI if you added them, so you’re never left waiting.', 'no dead ends'],
        ['polish', 'Humanizer + 7 checks · answer_validator.py', 'How it works · 3 of 3', 'Finally, it sounds like you',
            'Robotic phrases get struck out, then every answer is scored on 7 checks and rewritten until it passes. Only then does it reach Prep Studio.', 'no “as an AI…”'],
        ['keys', 'Key Ring · allowance.py', 'Power it up', 'Add two free keys',
            'You get a few free answers a day. For as many as you like, add your own Gemini and Groq keys: both are free and take about a minute. Add both, so when one is busy the other answers.', 'free, both of them'],
        ['yours', 'Atelier · shortcuts.js', 'Make it yours', 'Your studio, your way',
            () => `The Atelier holds the looks: themes, page styles and how Live Copilot writes. ${touch() ? '' : `Press ${MOD()} K to jump anywhere and ? for every shortcut. `}The Attic keeps what you delete; hide its tab if you never need it.`, 'try it now'],
    ];
    const PAGES = COPY.length;

    function fields(n) {
        const other = profile.field && !FIELDS.includes(profile.field);
        if (n === 2) return `<label class="ob-field"><span>Your name</span><input name="name" required maxlength="80" autocomplete="name" value="${esc(profile.name)}" placeholder="Asha Verma"></label>
            <p class="ob-error" role="alert" hidden>Add your name to continue.</p>`;
        if (n === 3) return `<label class="ob-field"><span>Your field</span>
                <select name="field" required>${FIELDS.map(f => `<option${(profile.field === f || (other && f === 'Other')) ? ' selected' : ''}>${f}</option>`).join('')}</select></label>
            <label class="ob-field ob-other"${other ? '' : ' hidden'}><span>Which field?</span><input name="field_other" maxlength="60" value="${other ? esc(profile.field) : ''}" placeholder="Aviation, agriculture, journalism..."></label>`;
        if (n === 4) return `<label class="ob-field"><span>Role you're preparing for</span><input name="role" required maxlength="80" value="${esc(profile.role)}" placeholder="Staff nurse, ICU"></label>
            <label class="ob-field"><span>Your level</span>
                <select name="level">${LEVELS.map(l => `<option${profile.level === l ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
            <p class="ob-error" role="alert" hidden>Add the role you're preparing for.</p>`;
        if (n === KEYS) {
            if (!window.Auth?.enabled?.() || typeof KEY_PROVIDERS === 'undefined') return `<p class="ob-key-note">Running on your own computer: Vettly uses the keys in <code>backend/.env</code> (<code>GEMINI_API_KEY</code>, <code>GROQ_API_KEY</code>).</p>`;
            return `<div class="ob-keys">${KEY_PROVIDERS.filter(p => p.free).map(p => `
                <div class="ob-key" data-p="${p.id}">
                    <span class="ob-key-mark" aria-hidden="true">${p.mark}</span>
                    <span class="ob-key-head"><b>${p.name}</b><span class="kr-badge free">Free</span></span>
                    <span class="ob-key-in"><label class="sr-only" for="ob-key-${p.id}">${p.name} API key</label>
                        <input id="ob-key-${p.id}" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Paste your key (${p.prefix}…)">
                        <button type="button" class="btn btn-secondary btn-sm" data-ob-key-save>Save</button></span>
                    <p class="ob-key-state" aria-live="polite"></p>
                    <span class="ob-key-links"><a href="${p.url}" target="_blank" rel="noopener">Get a free key<svg aria-hidden="true"><use href="#i-external"/></svg></a><button type="button" data-ob-guide="${p.id}">Show me how, step by step</button></span>
                </div>`).join('')}
                <p class="ob-key-note">Keys are encrypted and only used for your own answers. Skip this if you like: change them any time in Settings → Key Ring.</p></div>`;
        }
        if (n === KEYS + 1) return `<div class="ob-yours">
                <label class="tab-switch"><input type="checkbox" data-tab-toggle="attic" checked><span class="tab-switch-ui" aria-hidden="true"></span><span><b>Show The Attic</b><small>Where deleted chats and sessions wait</small></span></label>
                <div class="ob-kbd"><p><kbd>${MOD()}</kbd><kbd>K</kbd>Jump anywhere</p><p><kbd>?</kbd>Every shortcut</p><p><kbd>Shift</kbd><kbd>D</kbd>Light or dark</p></div></div>`;
        return '';
    }

    function dialogHtml() {
        return `
        <form class="onboard-form" id="onboard-form" novalidate>
            <i class="ob-tape ob-tape-l" aria-hidden="true"></i><i class="ob-tape ob-tape-r" aria-hidden="true"></i>
            <header class="ob-head">
                <span class="ob-brand">${MARK}Vettly</span>
                <ol class="ob-progress" aria-hidden="true">${COPY.map(() => '<li></li>').join('')}</ol>
                <span class="ob-step sr-only" aria-live="polite"></span>
                ${THEME_BTN}
            </header>
            ${COPY.map(([scene, fig, kicker, title, lede, aside], n) => `
            <section class="ob-page${scene === 'badge' || scene === 'keys' ? ' ob-ask' : ''}" data-ob-page="${n}" aria-labelledby="ob-h${n}"${n ? ' hidden' : ''}>
                <figure class="ob-stage" data-scene="${scene}" data-focus="${['', '', 'name', 'field', 'role'][n] || ''}">
                    ${S ? S.markup(scene) : ''}
                    <figcaption><b>Fig. ${String(n + 1).padStart(2, '0')}</b> <span>${fig}</span></figcaption>
                </figure>
                <div class="ob-copy">
                    ${n === SAVE + 1 ? '<p class="ob-saved" hidden><svg aria-hidden="true"><use href="#i-check-bold"/></svg><span></span></p>' : ''}
                    <p class="ob-num"><b>${String(n + 1).padStart(2, '0')}</b><span>/ ${String(PAGES).padStart(2, '0')}</span></p>
                    <p class="ob-kicker">${kicker}</p>
                    <h2 id="ob-h${n}" tabindex="-1">${title}</h2>
                    <p class="onboard-lede">${typeof lede === 'function' ? lede() : lede}</p>
                    ${fields(n)}
                    ${aside ? `<p class="ob-aside" aria-hidden="true"><svg viewBox="0 0 40 20"><path d="M38 4 C 26 2, 14 6, 4 15 m 0 0 l 1 -8 m -1 8 l 8 -1"/></svg>${aside}</p>` : ''}
                </div>
            </section>`).join('')}
            <footer class="onboard-actions">
                <button type="button" class="btn btn-ghost" data-ob-later>Not now</button>
                <span class="ob-spacer"></span>
                <button type="button" class="btn btn-secondary" data-ob-back>Back</button>
                <button type="submit" class="btn btn-primary" data-ob-next><span>Next</span><svg aria-hidden="true"><use href="#i-caret-right"/></svg></button>
            </footer>
        </form>`;
    }

    // The badge on the question pages mirrors the answers as they are typed
    function syncBadge(form) {
        const f = form.field.value === 'Other' ? (form.field_other.value.trim() || 'Other') : form.field.value;
        const v = { name: form.name.value.trim(), field: f, role: form.role.value.trim(), level: form.level.value };
        v.initials = v.name ? v.name.split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase() : '?';
        form.querySelectorAll('[data-v]').forEach(el => {
            const val = v[el.dataset.v];
            el.textContent = val || el.dataset.ph || '';
            el.classList.toggle('empty', !val);
        });
    }

    function open() {
        let dlg = document.getElementById('onboard');
        if (!dlg) {
            dlg = document.createElement('dialog');
            dlg.id = 'onboard';
            dlg.className = 'onboard';
            document.body.appendChild(dlg);
        }
        dlg.innerHTML = dialogHtml();
        const form = dlg.querySelector('form');
        const pages = [...form.querySelectorAll('.ob-page')];
        const back = form.querySelector('[data-ob-back]'), next = form.querySelector('[data-ob-next]'), later = form.querySelector('[data-ob-later]');
        const editing = !!profile.onboarded;   // editing from "Your profile" asks the questions only
        let page = editing ? NAME : 0, stopScene = () => {};

        const show = n => {
            stopScene();
            page = n;
            pages.forEach((p, k) => { p.hidden = k !== n; });
            dlg.setAttribute('aria-labelledby', `ob-h${n}`);
            form.querySelector('.ob-step').textContent = `Step ${n + 1} of ${PAGES}`;
            form.querySelectorAll('.ob-progress li').forEach((d, k) => { d.classList.toggle('done', k < n); d.classList.toggle('now', k === n); });
            back.hidden = n === 0 || n === SAVE + 1 || (editing && n === NAME);
            later.hidden = n > SAVE;
            next.querySelector('span').textContent = n === 0 ? 'Show me around' : n === SAVE ? (editing ? 'Save changes' : 'Save and continue')
                : n === PAGES - 1 ? (hasTour() && !Tour.seen() ? 'Take the tour' : 'Start preparing')
                : n === KEYS && form.querySelector('.ob-key') && !form.querySelector('.ob-key.is-saved') ? 'Skip for now' : 'Next';
            if (n === KEYS) loadKeys();
            pages[n].classList.remove('ob-in'); void pages[n].offsetWidth; pages[n].classList.add('ob-in');
            const stage = pages[n].querySelector('.ob-stage');
            if (S && stage) requestAnimationFrame(() => { if (page === n) stopScene = S.play(stage.dataset.scene, stage); });
            const field = pages[n].querySelector('input, select');
            (field || next).focus({ preventScroll: true });
        };
        const need = input => {
            const err = input.closest('.ob-page').querySelector('.ob-error');
            const ok = input.value.trim().length > 0;
            if (err) err.hidden = ok;
            input.setAttribute('aria-invalid', String(!ok));
            if (!ok) input.focus();
            return ok;
        };

        // ── the keys page: paste, and the key is saved (encrypted) and checked with the provider, right there ──
        const keyRow = id => form.querySelector(`.ob-key[data-p="${id}"]`);
        const keyState = (row, text, tone = '') => { const st = row.querySelector('.ob-key-state'); st.textContent = text; row.classList.toggle('is-bad', tone === 'bad'); };
        const markSaved = (row, last4) => {
            row.classList.add('is-saved'); row.classList.remove('is-bad');
            const input = row.querySelector('input'); input.value = ''; input.disabled = true; input.placeholder = `Saved ••••${last4 || ''}`;
            row.querySelector('[data-ob-key-save]').hidden = true;
        };
        const relabel = () => { if (page === KEYS) next.querySelector('span').textContent = form.querySelector('.ob-key.is-saved') || !form.querySelector('.ob-key') ? 'Next' : 'Skip for now'; };
        async function loadKeys() {
            if (!form.querySelector('.ob-key') || !window.KeyRing) return;
            try {
                const st = await KeyRing.api('GET', '/api/ai-key');
                form.querySelectorAll('.ob-key').forEach(row => {
                    const k = st.keys?.[row.dataset.p];
                    if (k?.saved) markSaved(row, k.last4);
                    else if (!st.own_keys_enabled) { row.querySelector('input').disabled = true; keyState(row, 'Saving your own keys isn’t switched on for this site yet.', 'bad'); }
                });
                relabel();
            } catch (e) { /* offline: the boxes still work when it's back */ }
        }
        async function saveKey(row) {
            const input = row.querySelector('input'), key = input.value.trim(), btn = row.querySelector('[data-ob-key-save]');
            if (!key || row.classList.contains('is-saved')) return true;
            btn.disabled = true; keyState(row, 'Saving…');
            try {
                const st = await KeyRing.api('POST', '/api/ai-key', { provider: row.dataset.p, key });
                markSaved(row, st.keys?.[row.dataset.p]?.last4 || key.slice(-4));
                keyState(row, 'Saved. Checking it with the provider…');
                Motion.burst?.(row.querySelector('.ob-key-mark'), 12, ['var(--ok)', 'var(--accent)']);
                relabel();
                window.Daybook?.refresh?.();
                KeyRing.api('POST', '/api/ai-key/test', { provider: row.dataset.p })
                    .then(r => {
                        keyState(row, r.ok ? `✓ ${r.message}` : r.message, r.ok ? '' : 'bad');
                        if (!r.ok) {   // rejected: open the box again for a fresh key
                            row.classList.remove('is-saved');
                            Object.assign(input, { disabled: false, placeholder: 'Paste a new key' });
                            row.querySelector('[data-ob-key-save]').hidden = false;
                            relabel();
                        }
                    })
                    .catch(() => keyState(row, 'Saved. We couldn’t check it just now; Settings → Key Ring can test it later.'));
                return true;
            } catch (e) { keyState(row, e.message, 'bad'); input.focus(); return false; }
            finally { btn.disabled = false; }
        }
        form.addEventListener('click', e => {
            const s = e.target.closest('[data-ob-key-save]'); if (s) saveKey(s.closest('.ob-key'));
            const g = e.target.closest('[data-ob-guide]'); if (g && window.KeyGuide) KeyGuide.open(g.dataset.obGuide);
        });
        form.addEventListener('paste', e => { const row = e.target.closest?.('.ob-key'); if (row) setTimeout(() => saveKey(row), 0); });
        current = { dlg, focusKey: id => { show(KEYS); const row = keyRow(id); row?.querySelector('input:not(:disabled)')?.focus(); row?.scrollIntoView({ block: 'nearest' }); } };
        window.Tabs?.apply?.();

        later.addEventListener('click', () => dlg.close());
        back.addEventListener('click', () => show(page - 1));
        form.field.addEventListener('change', () => { form.querySelector('.ob-other').hidden = form.field.value !== 'Other'; });
        form.addEventListener('input', () => syncBadge(form));
        form.addEventListener('change', () => syncBadge(form));
        syncBadge(form);
        // a fresh visitor who leaves early still gets the tour once
        dlg.addEventListener('close', () => { stopScene(); if (hasTour()) Tour.maybeStart(); }, { once: true });

        form.addEventListener('submit', async e => {
            e.preventDefault();
            if (page === NAME && !need(form.name)) return;
            if (page === ROLE && !need(form.role)) return;
            if (page === PAGES - 1) { dlg.close(); return; }
            if (page === KEYS) {   // Enter in a key box saves it before moving on; a bad key keeps you here
                for (const row of form.querySelectorAll('.ob-key')) if (!(await saveKey(row))) return;
                show(page + 1); return;
            }
            if (page !== SAVE) { show(page + 1); return; }
            const f = Object.fromEntries(new FormData(form));
            const body = { name: f.name.trim(), role: f.role.trim(), level: f.level, field: f.field === 'Other' ? (f.field_other.trim() || 'Other') : f.field };
            const label = next.querySelector('span');
            const errBox = pages[SAVE].querySelector('.ob-error');
            errBox.hidden = true;
            next.disabled = true;
            next.classList.add('is-busy');
            label.textContent = 'Saving…';
            // never leave the button hanging: a cold server or a dropped connection ends in a clear message and a retry
            const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 15000);
            try {
                const res = await fetch(`${API_BASE}/api/profile`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
                if (!res.ok) {
                    const detail = await res.json().then(d => d.detail || d.error).catch(() => '');
                    throw new Error(res.status === 401 ? 'Your session ended. Sign in again, then press Save.'
                        : res.status === 429 ? (detail || 'Too many requests right now. Wait a moment and try again.')
                        : detail || `The server answered ${res.status}. Try again in a moment.`);
                }
                profile = await res.json();
                loadCategories();
                if (typeof Bento !== 'undefined') Bento.useField();
                if (editing) { dlg.close(); Motion.toast(`Saved. Vettly is tuned for ${profile.role} in ${profile.field}.`, 'ok'); return; }
                // the toast would sit under the modal, so the confirmation lives on the next page
                const saved = form.querySelector('.ob-saved');
                saved.querySelector('span').textContent = `Saved · tuned for ${profile.role} in ${profile.field}`;
                saved.hidden = false;
                show(SAVE + 1);
            } catch (err) {
                errBox.textContent = err.name === 'AbortError'
                    ? 'Vettly is taking too long to answer (it may be waking up). Press Try again.'
                    : (navigator.onLine === false ? 'You seem to be offline. Reconnect, then press Try again.' : err.message);
                errBox.hidden = false;
                label.textContent = 'Try again';
                console.warn('Onboarding save failed:', err);
                return;
            } finally {
                clearTimeout(timer);
                next.disabled = false;
                next.classList.remove('is-busy');
            }
        });
        dlg.showModal();
        show(page);
    }

    // Prep Studio tiles: the curated tech set for tech, built-in tiles for every listed field (bento-fields.js, no AI
    // needed), and for "Other" eight categories the server writes for the user's own field (or interview basics)
    function paintCategories(categories) {
        const group = document.getElementById('prep-category-group');
        if (!group || !categories?.length) return;
        group.innerHTML = categories.map((c, i) => {
            PREP_CATS[c.id] = PREP_CATS[c.id] || [c.label, TONES[i % TONES.length], ICONS[i % ICONS.length]];
            return `<button type="button" class="cat-tile category-btn${i ? '' : ' active'}" data-tone="${TONES[i % TONES.length]}" aria-pressed="${!i}" style="--i:${i}" onclick="selectCategory('${c.id}', this)"><svg aria-hidden="true"><use href="#i-${ICONS[i % ICONS.length]}"/></svg><span>${esc(c.label)}</span></button>`;
        }).join('');
        currentPrepCategory = categories[0].id;
    }
    const builtIn = pack => (window.FIELD_PREP_CATEGORIES?.[pack] || []).map(([id, label]) => ({ id, label }));
    async function loadCategories() {
        if (!document.getElementById('prep-category-group')) return;
        const packs = window.bentoPacksFor?.(profile.field, profile.role);
        if (packs === null) return;   // technology: the curated tiles already on the page
        if (packs && packs[0] !== 'craft') return paintCategories(builtIn(packs[0]));
        try {
            const { categories } = await (await fetch(`${API_BASE}/prepare/categories`)).json();
            paintCategories(categories?.length ? categories : builtIn('craft'));
        } catch (e) { paintCategories(builtIn('craft')); }
    }

    async function start() {
        await window.Auth?.ready;
        try {
            const res = await fetch(`${API_BASE}/api/profile`);
            if (!res.ok) return;   // an error is not "no profile yet": never open onboarding on one
            profile = await res.json();
        } catch (e) { return; }
        if (!profile.onboarded) open(); else { loadCategories(); if (hasTour()) Tour.maybeStart(); }
    }
    start();

    // KeyGuide's last step lands back here when it was opened from the keys page
    const isOpen = () => !!(current?.dlg?.open);
    const focusKey = id => { if (isOpen()) current.focusKey(id); };
    return { open, isOpen, focusKey, role: () => profile.role, field: () => profile.field };
})();

// modules talk to each other through window: a top-level const is not a window property
window.Onboard = Onboard;
