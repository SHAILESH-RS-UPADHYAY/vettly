/**
 * Onboarding and the user's field: a ten-page first-visit dialog (two animated pages on what Vettly is, three questions,
 * three animated pages on how the backend works, then "Power it up" with the two free keys and "Make it yours" with the
 * Atelier, shortcuts and The Attic; scenes in onboard-scenes.js) whose answers shape every prompt, the Prep Studio
 * category tiles and the default role. Uses dashboard.js globals, KEY_PROVIDERS/KeyRing/KeyGuide and Tabs.
 */
const Onboard = (() => {
    const FIELDS = ['Technology', 'Business & management (MBA)', 'Human resources', 'Healthcare', 'Finance & accounting', 'Sales', 'Marketing',
        'Design', 'Education', 'Operations & supply chain', 'Law', 'Hospitality', 'Government & public service', 'Other'];
    const LEVELS = ['Student or fresher', 'Early career', 'Mid-level', 'Senior', 'Lead or manager'];
    // [icon, hint] for each option in the pretty dropdowns (picker.js)
    const FIELD_META = {
        'Technology': ['code', 'Software, data, AI, IT'], 'Business & management (MBA)': ['briefcase', 'Strategy, product, consulting'],
        'Human resources': ['user', 'Recruiting, HRBP, payroll, L&D'],
        'Healthcare': ['shield', 'Nursing, medicine, pharmacy'], 'Finance & accounting': ['list-checks', 'CA, banking, audit, analysis'],
        'Sales': ['lightning', 'Business development, accounts'], 'Marketing': ['target', 'Brand, digital, SEO, content'],
        'Design': ['palette', 'UX, UI, graphic, product'], 'Education': ['books', 'Teaching, training, tutoring'],
        'Operations & supply chain': ['path', 'Logistics, procurement, planning'], 'Law': ['scroll', 'Corporate, litigation, compliance'],
        'Hospitality': ['star', 'Hotels, food, travel, aviation'], 'Government & public service': ['cap', 'UPSC, policy, NGOs'],
        'Other': ['pencil', 'Type your own field'],
    };
    const LEVEL_META = { 'Student or fresher': ['cap', 'Final year, or under a year of work'], 'Early career': ['path', '1 to 3 years'],
        'Mid-level': ['briefcase', '3 to 7 years'], 'Senior': ['star', '7 years or more'], 'Lead or manager': ['user', 'You lead a team or people'] };
    const opt = (v, meta, on) => `<option${on ? ' selected' : ''}${meta ? ` data-icon="${meta[0]}" data-hint="${meta[1]}"` : ''}>${v}</option>`;
    // roles to tap, by field; and the roles the empty box types out, always in this order
    const FIELD_ROLES = {
        'Technology': ['Software developer', 'Backend developer', 'Frontend developer', 'AI/ML engineer', 'Data analyst', 'DevOps engineer'],
        'Business & management (MBA)': ['Product manager', 'Business analyst', 'Management consultant', 'Marketing manager', 'Operations manager', 'Strategy associate'],
        'Human resources': ['HR executive', 'Talent acquisition specialist', 'HR generalist', 'HR business partner', 'Learning and development specialist', 'Compensation and benefits analyst'],
        'Healthcare': ['Staff nurse, ICU', 'Staff nurse, ward', 'Junior resident (MBBS)', 'Medical officer', 'Pharmacist', 'Clinical research associate'],
        'Finance & accounting': ['Financial analyst', 'Chartered accountant', 'Audit associate', 'Investment banking analyst', 'Credit analyst', 'Tax consultant'],
        'Sales': ['Business development executive', 'Inside sales representative', 'Account manager', 'Sales manager', 'Customer success manager', 'Pre-sales consultant'],
        'Marketing': ['Digital marketing executive', 'SEO specialist', 'Content strategist', 'Brand manager', 'Performance marketer', 'Social media manager'],
        'Design': ['UX designer', 'UI designer', 'Product designer', 'Graphic designer', 'UX researcher', 'Motion designer'],
        'Education': ['Primary school teacher', 'High school teacher', 'Lecturer', 'Instructional designer', 'Corporate trainer', 'Academic counsellor'],
        'Operations & supply chain': ['Operations executive', 'Supply chain analyst', 'Procurement specialist', 'Logistics coordinator', 'Warehouse manager', 'Planning analyst'],
        'Law': ['Legal associate', 'Corporate lawyer', 'Litigation associate', 'Compliance officer', 'Legal counsel', 'Paralegal'],
        'Hospitality': ['Front office executive', 'Guest relations executive', 'Food and beverage manager', 'Hotel management trainee', 'Cabin crew', 'Event coordinator'],
        'Government & public service': ['Civil services (UPSC)', 'Policy analyst', 'Programme officer (NGO)', 'Public health officer', 'Research associate', 'Bank PO'],
    };
    const ROLE_CYCLE = ['Software developer', 'Full-stack developer', 'Product manager (MBA)', 'Business analyst (MBA)', 'Management consultant',
        'AI/ML engineer', 'Generative AI engineer', 'Prompt engineer', 'Data scientist', 'Staff nurse, ICU', 'Digital marketing executive',
        'SEO specialist', 'Financial analyst', 'HR executive', 'UX designer'];
    const MAX_ROLES = 4, SEP = ' · ';   // roles are saved as a list; prompts read them joined (role names can hold commas)
    const rolesOf = p => (Array.isArray(p.roles) && p.roles.length ? p.roles : String(p.role || '').split(SEP)).map(r => r.trim()).filter(Boolean).slice(0, MAX_ROLES);
    const TONES = ['gen', 'beh', 'tech', 'dsa', 'proj', 'sys', 'sit', 'hr', 'asg'];
    const ICONS = ['all', 'brain', 'target', 'path', 'toolbox', 'layout', 'bulb', 'chats', 'star'];
    let profile = {}, current = null, typer = null;
    const stopTyping = () => { typer?.(); typer = null; };
    const esc = s => escapeHtml(String(s || ''));

    const hasTour = () => typeof Tour !== 'undefined';
    const S = typeof OnboardScenes !== 'undefined' ? OnboardScenes : null;
    // Pages: 0-1 show what Vettly is, 2-4 ask about you (saved on 4), 5-7 show how the backend works, 8 the free keys,
    // 9 the Atelier
    const SAVE = 4, NAME = 2, ROLE = 4, KEYS = 8;
    const touch = () => matchMedia('(hover: none)').matches;
    const MOD = () => (window.Shortcuts?.mac ? '⌘' : 'Ctrl');
    const MARK = '<span class="brand-ring"><span class="m-orb brand-orb" data-look="glow" aria-hidden="true"></span></span>';   // Vettly's logo, the Mentor's orb (brand.js fills and colours it)
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
        ['badge', 'Candidate spec', 'About you · 3 of 3', 'What are you preparing for?', 'Pick up to four roles. Every question and model answer is pitched at them and your level.', ''],
        ['context', 'Context fusion · context_engine.py', 'How it works · 1 of 3', 'First, it learns you',
            'Your field and role are enough to start. Add a resume, GitHub, a job description or your stories whenever you like: they join one context of up to 80,000 characters, packed most important first.', 'all of it optional'],
        ['router', 'Failover router · ai/utils.py', 'How it works · 2 of 3', 'Then it finds a model that’s free',
            'Gemini goes first. If it’s busy, Groq answers, then Claude or OpenAI if you added them, so you’re never left waiting.', 'no dead ends'],
        ['polish', 'Humanizer + 7 checks · answer_validator.py', 'How it works · 3 of 3', 'Finally, it sounds like you',
            'Robotic phrases get struck out, then every answer is scored on 7 checks and rewritten until it passes. Only then does it reach Prep Studio.', 'no “as an AI…”'],
        ['keys', 'Key Ring · allowance.py', 'Power it up', 'No key needed to start',
            'Vettly’s own AI keys are switched on, so you can start right now with free answers every day. They are shared and free only for a limited time, so add your own free Gemini and Groq keys when you can (about a minute each), or a paid Claude, OpenAI or OpenRouter key. Add two, so when one is busy the other answers.', 'free for now'],
        ['yours', 'Atelier · shortcuts.js', 'Make it yours', 'Your studio, your way',
            () => `The Atelier holds the looks: themes, page styles and how Live Copilot writes. ${touch() ? '' : `Press ${MOD()} K to jump anywhere and ? for every shortcut. `}The Attic keeps what you delete; hide its tab if you never need it.`, 'try it now'],
    ];
    const PAGES = COPY.length;

    function fields(n) {
        const other = profile.field && !FIELDS.includes(profile.field);
        if (n === 2) return `<label class="ob-field"><span>Your name</span><input name="name" required maxlength="80" autocomplete="name" value="${esc(profile.name)}" placeholder="Asha Verma"></label>
            <p class="ob-error" role="alert" hidden>Add your name to continue.</p>`;
        if (n === 3) return `<label class="ob-field"><span>Your field</span>
                <select name="field" required>${FIELDS.map(f => opt(f, FIELD_META[f], profile.field === f || (other && f === 'Other'))).join('')}</select></label>
            <label class="ob-field ob-other"${other ? '' : ' hidden'}><span>Which field?</span><input name="field_other" maxlength="60" value="${other ? esc(profile.field) : ''}" placeholder="Aviation, agriculture, journalism..."></label>`;
        if (n === 4) return `<div class="ob-field ob-rolefield">
                <span class="ob-rf-head"><span id="ob-roles-l">Roles you're preparing for</span><small class="ob-rf-n" aria-live="polite"></small></span>
                <div class="ob-tray">
                    <ul class="ob-picked" aria-label="Roles you picked"></ul>
                    <span class="ob-tray-in"><input name="role_new" maxlength="80" autocomplete="organization-title" enterkeyhint="enter" aria-labelledby="ob-roles-l" aria-describedby="ob-roles-hint" placeholder="${ROLE_CYCLE[0]}">
                        <button type="button" class="ob-role-add" data-ob-role-add hidden><svg aria-hidden="true"><use href="#i-plus"/></svg>Add</button></span>
                </div>
                <input type="hidden" name="role" value="${esc(rolesOf(profile).join(SEP))}">
            </div>
            <div class="ob-roles" role="group" aria-label="Suggested roles"></div>
            <label class="ob-field"><span>Your level</span>
                <select name="level">${LEVELS.map(l => opt(l, LEVEL_META[l], profile.level === l)).join('')}</select></label>
            <p class="ob-error" role="alert" hidden>Pick a role below, or type your own.</p>`;
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
            const parts = el.dataset.v === 'role' ? val.split(SEP).filter(Boolean) : [];
            if (parts.length > 1) el.innerHTML = parts.map(p => `<span class="b-role">${esc(p)}</span>`).join('');
            else el.textContent = val || el.dataset.ph || '';
            el.classList.toggle('empty', !val);
        });
    }

    // open() asks the three questions only ("Your profile"); open({ full: true }) replays all ten pages, answers kept
    function open({ full = false } = {}) {
        let dlg = document.getElementById('onboard');
        if (!dlg) {
            dlg = document.createElement('dialog');
            dlg.id = 'onboard';
            dlg.className = 'onboard';
            document.body.appendChild(dlg);
        }
        dlg.innerHTML = dialogHtml();
        window.Brand?.fill(dlg);   // the logo orb in the header
        const form = dlg.querySelector('form');
        const pages = [...form.querySelectorAll('.ob-page')];
        const back = form.querySelector('[data-ob-back]'), next = form.querySelector('[data-ob-next]'), later = form.querySelector('[data-ob-later]');
        const editing = !!profile.onboarded && !full;   // a quick edit from "Your profile"; Redo onboarding shows every page
        let page = editing ? NAME : 0, stopScene = () => {};

        const show = n => {
            stopScene();
            stopTyping();
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
            if (n === ROLE) roleChips();   // the chips follow the field; the box types examples while the tray is empty
            pages[n].classList.remove('ob-in'); void pages[n].offsetWidth; pages[n].classList.add('ob-in');
            const stage = pages[n].querySelector('.ob-stage');
            if (S && stage) requestAnimationFrame(() => { if (page === n) stopScene = S.play(stage.dataset.scene, stage); });
            const field = pages[n].querySelector('input:not([type="hidden"]), select');
            if (!Motion.focusField(field)) next.focus({ preventScroll: true });   // touch: no keyboard until they tap a field
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
        dlg.addEventListener('close', () => { stopScene(); stopTyping(); window.Picker?.close?.(); if (hasTour()) Tour.maybeStart(); }, { once: true });

        // ── the role tray: up to four roles. Tap a chip and it flies up into the tray; type your own and press Enter;
        //    × (or Backspace in an empty box) sends one back. The empty box types out example roles. ──
        const fieldNow = () => (form.field.value === 'Other' ? (form.field_other.value.trim() || 'Other') : form.field.value);
        const tray = form.querySelector('.ob-tray'), picked = form.querySelector('.ob-picked'), roleIn = form.role_new;
        const addBtn = form.querySelector('[data-ob-role-add]'), counter = form.querySelector('.ob-rf-n');
        let roles = rolesOf(profile);
        const same = (a, b) => a.toLowerCase() === b.toLowerCase();
        const live = () => [...picked.children].filter(x => !x.classList.contains('is-leaving'));   // not the one fading out
        const chipFor = r => [...form.querySelectorAll('.ob-role')].find(c => same(c.dataset.role, r));
        const still = () => Motion.calm();
        const tokHtml = r => `<span class="ob-tok-t">${esc(r)}</span><button type="button" class="ob-tok-x" data-ob-unrole aria-label="Remove ${esc(r)}"><svg aria-hidden="true"><use href="#i-x-bold"/></svg></button>`;
        function tok(r) { const li = document.createElement('li'); li.className = 'ob-tok'; li.dataset.role = r; li.innerHTML = tokHtml(r); return li; }
        // everything that follows the list: the hidden value, the badge, the count, the chips and the box's hint
        function roleState() {
            form.role.value = roles.join(SEP);
            syncBadge(form);
            const full = roles.length >= MAX_ROLES;
            counter.textContent = roles.length ? `${roles.length} of ${MAX_ROLES}` : `up to ${MAX_ROLES}`;
            tray.classList.toggle('is-empty', !roles.length);
            tray.classList.toggle('is-full', full);
            form.querySelectorAll('.ob-role').forEach(c => {
                const on = roles.some(r => same(r, c.dataset.role));
                c.setAttribute('aria-pressed', String(on));
                c.classList.toggle('is-locked', full && !on);
            });
            if (roles.length) { stopTyping(); roleIn.placeholder = full ? 'Four picked: remove one to swap' : 'Add another role'; }
            else if (!typer) typeRoles();
            if (roles.length) { pages[ROLE].querySelector('.ob-error').hidden = true; tray.removeAttribute('aria-invalid'); }
        }
        function drawTray() { picked.replaceChildren(...roles.map(tok)); roleState(); }
        // the tray says no: a little shake, and the count lights up
        function refuse(el = tray) {
            if (still()) return;
            el.animate([{ transform: 'none' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'none' }], { duration: 360, easing: 'ease-out' });
            counter.animate([{ transform: 'scale(1)', color: 'var(--bad)' }, { transform: 'scale(1.25)', color: 'var(--bad)' }, { transform: 'scale(1)' }], { duration: 520, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
        }
        function addRole(raw, from) {
            const r = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 80);
            if (!r) return false;
            const had = live().find(li => same(li.dataset.role, r));
            if (had) { if (!still()) had.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12) rotate(-3deg)' }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }); return true; }
            if (roles.length >= MAX_ROLES) { refuse(from || tray); return false; }
            roles.push(r);
            const li = tok(r);
            picked.append(li);
            roleState();
            if (!still()) {
                const b = li.getBoundingClientRect();
                if (from) {   // thrown from the chip: up in an arc, a turn in the air, a soft landing
                    const a = from.getBoundingClientRect(), dx = a.left - b.left + (a.width - b.width) / 2, dy = a.top - b.top;
                    li.animate([
                        { transform: `translate(${dx}px, ${dy}px) scale(.92)`, opacity: 0.4 },
                        { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 34}px) rotate(-7deg) scale(1.06)`, opacity: 1, offset: 0.55 },
                        { transform: 'translate(0, 2px) rotate(1.5deg) scale(1.03)', offset: 0.86 },
                        { transform: 'none' },
                    ], { duration: 640, easing: 'cubic-bezier(0.3, 0.7, 0.3, 1)' });
                    from.animate([{ transform: 'scale(1)' }, { transform: 'scale(.9)' }, { transform: 'scale(1.06)' }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
                } else {      // typed: it pops out of the box
                    li.animate([{ transform: 'scale(.3) rotate(-12deg)', opacity: 0 }, { transform: 'scale(1.1) rotate(3deg)', opacity: 1, offset: 0.6 }, { transform: 'none' }], { duration: 520, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
                }
                li.animate([{ boxShadow: '0 0 0 0 rgba(var(--accent-rgb), .5)' }, { boxShadow: '0 0 0 10px rgba(var(--accent-rgb), 0)' }], { duration: 700, delay: from ? 520 : 300, easing: 'ease-out' });
            }
            return true;
        }
        function removeRole(r) {
            const li = live().find(x => same(x.dataset.role, r));
            roles = roles.filter(x => !same(x, r));
            roleState();
            if (!li) return;
            if (still()) { li.remove(); return; }
            // the others slide into the gap (FLIP) while this one tips over and fades
            li.classList.add('is-leaving');
            const others = live(), before = new Map(others.map(x => [x, x.getBoundingClientRect()]));
            const r0 = li.getBoundingClientRect(), host = tray.getBoundingClientRect();
            Object.assign(li.style, { position: 'absolute', left: `${r0.left - host.left - tray.clientLeft}px`, top: `${r0.top - host.top - tray.clientTop}px`, width: `${r0.width}px`, margin: '0', pointerEvents: 'none' });
            li.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(-10px) rotate(-10deg) scale(.7)', opacity: 0 }], { duration: 300, easing: 'cubic-bezier(0.55, 0, 0.7, 0.2)' }).finished.then(() => li.remove(), () => li.remove());
            others.forEach(x => { const a = before.get(x), b = x.getBoundingClientRect(); if (a.left !== b.left || a.top !== b.top) x.animate([{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)` }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }); });
            const chip = chipFor(r);
            if (chip) chip.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
        }
        function takeTyped() {
            const v = roleIn.value.trim();
            if (!v) return true;
            const ok = addRole(v);
            if (ok) { roleIn.value = ''; addBtn.hidden = true; }
            return ok;
        }
        function roleChips() {
            const box = form.querySelector('.ob-roles');
            if (!box) return;
            const list = FIELD_ROLES[fieldNow()] || ROLE_CYCLE.slice(0, 6);
            box.innerHTML = `<span class="ob-roles-k" id="ob-roles-hint">Tap to add · tap again to remove</span>${list.map((r, i) => `<button type="button" class="chip ob-role" data-role="${esc(r)}" style="--i:${i}" aria-pressed="false"><span class="ob-role-mark" aria-hidden="true"><svg class="ob-rm-plus"><use href="#i-plus"/></svg><svg class="ob-rm-tick"><use href="#i-check-bold"/></svg></span>${esc(r)}</button>`).join('')}`;
            drawTray();
        }
        form.addEventListener('click', e => {
            const chip = e.target.closest('.ob-role');
            if (chip) { if (chip.getAttribute('aria-pressed') === 'true') removeRole(chip.dataset.role); else addRole(chip.dataset.role, chip); return; }
            const x = e.target.closest('[data-ob-unrole]');
            if (x) {   // focus moves to the neighbour's ×, or back to the box
                const li = x.closest('.ob-tok'), all = live(), at = all.indexOf(li), near = all[at + 1] || all[at - 1];
                removeRole(li.dataset.role);
                if (near) near.querySelector('button').focus({ preventScroll: true }); else Motion.focusField(roleIn);
                return;
            }
            if (e.target.closest('[data-ob-role-add]')) { takeTyped(); Motion.focusField(roleIn); return; }
            if (e.target === tray || e.target === picked) Motion.focusField(roleIn) || roleIn.focus({ preventScroll: true });
        });
        roleIn.addEventListener('input', () => { addBtn.hidden = !roleIn.value.trim(); });
        roleIn.addEventListener('keydown', e => {
            if (e.key === 'Enter' && roleIn.value.trim()) { e.preventDefault(); takeTyped(); }
            else if (e.key === 'Backspace' && !roleIn.value && roles.length) { e.preventDefault(); removeRole(roles[roles.length - 1]); }
        });
        function typeRoles() {
            const input = roleIn;
            if (roles.length) return;
            if (Motion.calm()) { input.placeholder = ROLE_CYCLE[0]; return; }
            let i = 0, n = 0, back = false, t = 0;
            const tick = () => {
                if (!input.isConnected) return;
                const word = ROLE_CYCLE[i % ROLE_CYCLE.length];
                if (!back) {
                    n = Math.min(word.length, n + 1);
                    input.placeholder = `${word.slice(0, n)}▏`;
                    if (n === word.length) { back = true; t = setTimeout(tick, 1500); return; }
                    t = setTimeout(tick, 55 + Math.random() * 45);
                } else {
                    n = Math.max(0, n - 1);
                    input.placeholder = n ? `${word.slice(0, n)}▏` : '▏';
                    if (!n) { back = false; i++; t = setTimeout(tick, 320); return; }
                    t = setTimeout(tick, 28);
                }
            };
            input.placeholder = '▏';
            t = setTimeout(tick, 450);
            typer = () => { clearTimeout(t); input.placeholder = ROLE_CYCLE[i % ROLE_CYCLE.length]; };
        }

        form.addEventListener('submit', async e => {
            e.preventDefault();
            if (page === NAME && !need(form.name)) return;
            if (page === ROLE) {   // a typed role that wasn't added yet counts; none at all asks for one
                if (!takeTyped()) return;
                if (!roles.length) {
                    pages[ROLE].querySelector('.ob-error').hidden = false;
                    tray.setAttribute('aria-invalid', 'true');
                    refuse();
                    Motion.focusField(roleIn);
                    return;
                }
            }
            if (page === PAGES - 1) { dlg.close(); return; }
            if (page === KEYS) {   // Enter in a key box saves it before moving on; a bad key keeps you here
                for (const row of form.querySelectorAll('.ob-key')) if (!(await saveKey(row))) return;
                show(page + 1); return;
            }
            if (page !== SAVE) { show(page + 1); return; }
            const f = Object.fromEntries(new FormData(form));
            const body = { name: f.name.trim(), role: roles.join(SEP), roles: [...roles], level: f.level, field: f.field === 'Other' ? (f.field_other.trim() || 'Other') : f.field };
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
                window.PrepKit?.refresh();   // a new field or role brings its own subjects
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
        // a new account dresses the studio first (the Look Book), then meets Vettly (onboarding)
        if (!profile.onboarded) { if (window.LookBook && !LookBook.seen()) LookBook.open({ then: () => open() }); else open(); }
        else { loadCategories(); if (hasTour()) Tour.maybeStart(); }
    }
    start();

    // KeyGuide's last step lands back here when it was opened from the keys page
    const isOpen = () => !!(current?.dlg?.open);
    const focusKey = id => { if (isOpen()) current.focusKey(id); };
    return { open, isOpen, focusKey, name: () => profile.name, role: () => profile.role, field: () => profile.field };
})();

// modules talk to each other through window: a top-level const is not a window property
window.Onboard = Onboard;
