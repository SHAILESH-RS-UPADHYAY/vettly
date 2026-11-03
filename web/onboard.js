/**
 * Onboarding and the user's field: an eight-page first-visit dialog (two animated pages on what Vettly is, three questions,
 * three animated pages on how the backend works; scenes in onboard-scenes.js) whose answers
 * shape every prompt, the Prep Studio category tiles and the default role. Uses dashboard.js globals.
 */
const Onboard = (() => {
    const FIELDS = ['Technology', 'Healthcare', 'Finance & accounting', 'Sales', 'Marketing', 'Design', 'Education',
        'Operations & supply chain', 'Law', 'Hospitality', 'Government & public service', 'Other'];
    const LEVELS = ['Student or fresher', 'Early career', 'Mid-level', 'Senior', 'Lead or manager'];
    const TONES = ['gen', 'beh', 'tech', 'dsa', 'proj', 'sys', 'sit', 'hr', 'asg'];
    const ICONS = ['sparkle', 'brain', 'target', 'path', 'toolbox', 'layout', 'bulb', 'chats', 'star'];
    let profile = {};
    const esc = s => escapeHtml(String(s || ''));

    const hasTour = () => typeof Tour !== 'undefined';
    const S = typeof OnboardScenes !== 'undefined' ? OnboardScenes : null;
    // Pages: 0-1 show what Vettly is, 2-4 ask about you (saved on 4), 5-7 show how the backend works
    const PAGES = 8, SAVE = 4, NAME = 2, ROLE = 4;
    const MARK = '<svg class="ob-logo" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2l5 5-5 5-5-5zM25 11l5 5-5 5-5-5zM16 20l5 5-5 5-5-5zM7 11l5 5-5 5-5-5z"/></svg>';
    const THEME_BTN = `<button type="button" class="theme-switch" onclick="toggleTheme(event)" aria-label="Switch between light and dark">
        <svg class="ts-sun" aria-hidden="true"><use href="#i-sun"/></svg><svg class="ts-moon" aria-hidden="true"><use href="#i-moon"/></svg>
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
            'Your resume, GitHub, the job description and your stories become one context of up to 80,000 characters, packed most important first so nothing key gets lost.', 'the job always goes first'],
        ['router', 'Failover router · ai/utils.py', 'How it works · 2 of 3', 'Then it finds a model that’s free',
            'Claude goes first. If it’s busy, Gemini, OpenAI or Groq answers instead, so you’re never left waiting.', 'no dead ends'],
        ['polish', 'Humanizer + 7 checks · answer_validator.py', 'How it works · 3 of 3', 'Finally, it sounds like you',
            'Robotic phrases get struck out, then every answer is scored on 7 checks and rewritten until it passes. Only then does it reach Prep Studio.', 'no “as an AI…”'],
    ];

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
            <section class="ob-page${scene === 'badge' ? ' ob-ask' : ''}" data-ob-page="${n}" aria-labelledby="ob-h${n}"${n ? ' hidden' : ''}>
                <figure class="ob-stage" data-scene="${scene}" data-focus="${['', '', 'name', 'field', 'role'][n] || ''}">
                    ${S ? S.markup(scene) : ''}
                    <figcaption><b>Fig. ${String(n + 1).padStart(2, '0')}</b> <span>${fig}</span></figcaption>
                </figure>
                <div class="ob-copy">
                    ${n === SAVE + 1 ? '<p class="ob-saved" hidden><svg aria-hidden="true"><use href="#i-check-bold"/></svg><span></span></p>' : ''}
                    <p class="ob-num"><b>${String(n + 1).padStart(2, '0')}</b><span>/ ${String(PAGES).padStart(2, '0')}</span></p>
                    <p class="ob-kicker">${kicker}</p>
                    <h2 id="ob-h${n}" tabindex="-1">${title}</h2>
                    <p class="onboard-lede">${lede}</p>
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
                : n === PAGES - 1 ? (hasTour() && !Tour.seen() ? 'Take the tour' : 'Start preparing') : 'Next';
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
            if (page !== SAVE) { show(page + 1); return; }
            const f = Object.fromEntries(new FormData(form));
            const body = { name: f.name.trim(), role: f.role.trim(), level: f.level, field: f.field === 'Other' ? (f.field_other.trim() || 'Other') : f.field };
            next.disabled = true;
            try {
                const res = await fetch(`${API_BASE}/api/profile`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
                const errBox = pages[SAVE].querySelector('.ob-error');
                errBox.textContent = `Could not save your answers (${err.message}). Try again.`;
                errBox.hidden = false;
            } finally {
                next.disabled = false;
            }
        });
        dlg.showModal();
        show(page);
    }

    // Prep Studio tiles: the curated tech set, or eight categories written for the user's own field
    async function loadCategories() {
        const group = document.getElementById('prep-category-group');
        if (!group) return;
        try {
            const { categories } = await (await fetch(`${API_BASE}/prepare/categories`)).json();
            if (!categories?.length) return;
            group.innerHTML = categories.map((c, i) => {
                PREP_CATS[c.id] = PREP_CATS[c.id] || [c.label, TONES[i % TONES.length], ICONS[i % ICONS.length]];
                return `<button type="button" class="cat-tile category-btn${i ? '' : ' active'}" data-tone="${TONES[i % TONES.length]}" aria-pressed="${!i}" style="--i:${i}" onclick="selectCategory('${c.id}', this)"><svg aria-hidden="true"><use href="#i-${ICONS[i % ICONS.length]}"/></svg><span>${esc(c.label)}</span></button>`;
            }).join('');
            currentPrepCategory = categories[0].id;
        } catch (e) { /* keep the curated tiles */ }
    }

    // Settings: today's free AI answers and the user's own key (only where sign-in is on)
    async function keyCard() {
        const card = document.getElementById('ai-key-card');
        if (!card || !window.Auth?.enabled()) return;
        const form = document.getElementById('ai-key-form'), remove = document.getElementById('ai-key-remove');
        const show = s => {
            card.hidden = false;
            document.getElementById('ai-key-status').textContent = s.has_key
                ? `Using your own ${s.provider} key, with no daily limit.`
                : `${s.free_left} of ${s.free_limit} free AI answers left today.${s.own_keys_enabled ? ' Add your own key for unlimited answers.' : ''}`;
            remove.hidden = !s.has_key;
            form.querySelectorAll('select, input, button[type=submit]').forEach(el => { el.disabled = !s.own_keys_enabled; });
        };
        const call = async (method, body) => {
            const res = await fetch(`${API_BASE}/api/ai-key`, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            return data;
        };
        try { show(await call('GET')); } catch (e) { return; }
        const del = document.getElementById('delete-data-btn');
        del?.addEventListener('click', async () => {
            if (!del.dataset.armed) {   // two taps instead of a browser dialog
                del.dataset.armed = '1';
                del.textContent = 'Tap again to delete everything';
                setTimeout(() => { delete del.dataset.armed; del.textContent = 'Delete my data'; }, 5000);
                return;
            }
            del.disabled = true;
            const res = await fetch(`${API_BASE}/api/me`, { method: 'DELETE' });
            if (res.ok) { Motion.toast('Everything you saved in Vettly is deleted.', 'ok'); setTimeout(() => location.reload(), 1200); }
            else { del.disabled = false; Motion.toast('Could not delete your data. Try again.', 'error'); }
        });
        form.addEventListener('submit', async e => {
            e.preventDefault();
            try { show(await call('POST', { provider: form.provider.value, key: form.key.value })); form.key.value = ''; Motion.toast('Saved. Vettly now uses your own key.', 'ok'); }
            catch (err) { Motion.toast(err.message, 'error'); }
        });
        remove.addEventListener('click', async () => {
            try { show(await call('DELETE')); Motion.toast('Removed your key. You are back on the free allowance.', 'ok'); }
            catch (err) { Motion.toast(err.message, 'error'); }
        });
    }

    async function start() {
        await window.Auth?.ready;
        try {
            const res = await fetch(`${API_BASE}/api/profile`);
            if (!res.ok) return;   // an error is not "no profile yet": never open onboarding on one
            profile = await res.json();
        } catch (e) { return; }
        if (!profile.onboarded) open(); else { loadCategories(); if (hasTour()) Tour.maybeStart(); }
        keyCard();
    }
    start();

    return { open, role: () => profile.role, field: () => profile.field };
})();
