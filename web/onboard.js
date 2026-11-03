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
    const scene = name => (S ? S[name]() : '');
    // Pages: 0-1 show what Vettly is, 2-4 ask about you (saved on 4), 5-7 show how the backend works
    const PAGES = 8, SAVE = 4, NAME = 2, ROLE = 4;
    const KICKER = ['Welcome', 'Inside Vettly', 'About you', 'About you', 'About you', 'How it works · 1 of 3', 'How it works · 2 of 3', 'How it works · 3 of 3'];

    function dialogHtml() {
        const other = profile.field && !FIELDS.includes(profile.field);
        return `
        <form class="onboard-form" id="onboard-form" novalidate>
            <div class="ob-top">
                <p class="ob-count"><span class="ob-kicker"></span><span class="ob-step" aria-live="polite"></span></p>
                <div class="ob-progress" aria-hidden="true" style="--n:${PAGES}">${Array.from({ length: PAGES }, () => '<span></span>').join('')}</div>
            </div>

            <section class="ob-page" data-ob-page="0" aria-labelledby="ob-h0">
                ${scene('hero')}
                <h2 id="ob-h0">Welcome to Vettly</h2>
                <p class="onboard-lede">Your interview prep studio: questions written for your role, answers in your own voice, and a copilot to practise with.</p>
            </section>

            <section class="ob-page" data-ob-page="1" aria-labelledby="ob-h1" hidden>
                ${scene('studio')}
                <h2 id="ob-h1">Everything in one studio</h2>
                <p class="onboard-lede">Prep Studio writes your questions, Brain Bento packs five ideas every morning, and Live Copilot lets you practise out loud.</p>
            </section>

            <section class="ob-page ob-ask" data-ob-page="2" aria-labelledby="ob-h2" hidden>
                <span class="ob-mark" aria-hidden="true"><svg><use href="#i-user"/></svg></span>
                <h2 id="ob-h2">What should we call you?</h2>
                <p class="onboard-lede">Vettly uses your name when it writes answers in your voice.</p>
                <label class="ob-field"><span>Your name</span><input name="name" required maxlength="80" autocomplete="name" value="${esc(profile.name)}" placeholder="Asha Verma"></label>
                <p class="ob-error" role="alert" hidden>Add your name to continue.</p>
            </section>

            <section class="ob-page ob-ask" data-ob-page="3" aria-labelledby="ob-h3" hidden>
                <span class="ob-mark" aria-hidden="true"><svg><use href="#i-briefcase"/></svg></span>
                <h2 id="ob-h3">Which field do you work in?</h2>
                <p class="onboard-lede">This sets the Prep Studio categories and your daily concepts.</p>
                <label class="ob-field"><span>Your field</span>
                    <select name="field" required>${FIELDS.map(f => `<option${(profile.field === f || (other && f === 'Other')) ? ' selected' : ''}>${f}</option>`).join('')}</select></label>
                <label class="ob-field ob-other"${other ? '' : ' hidden'}><span>Which field?</span><input name="field_other" maxlength="60" value="${other ? esc(profile.field) : ''}" placeholder="Aviation, agriculture, journalism..."></label>
            </section>

            <section class="ob-page ob-ask" data-ob-page="4" aria-labelledby="ob-h4" hidden>
                <span class="ob-mark" aria-hidden="true"><svg><use href="#i-target"/></svg></span>
                <h2 id="ob-h4">What are you preparing for?</h2>
                <p class="onboard-lede">Questions and answers are pitched at this role and level.</p>
                <label class="ob-field"><span>Role you're preparing for</span><input name="role" required maxlength="80" value="${esc(profile.role)}" placeholder="Staff nurse, ICU"></label>
                <label class="ob-field"><span>Your level</span>
                    <select name="level">${LEVELS.map(l => `<option${profile.level === l ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
                <p class="ob-error" role="alert" hidden>Add the role you're preparing for.</p>
            </section>

            <section class="ob-page" data-ob-page="5" aria-labelledby="ob-h5" hidden>
                ${scene('context')}
                <h2 id="ob-h5">First, it learns you</h2>
                <p class="onboard-lede">Your resume, GitHub, job description and stories are packed into one context of up to 80,000 characters, most important first, so the key details never get lost.</p>
            </section>

            <section class="ob-page" data-ob-page="6" aria-labelledby="ob-h6" hidden>
                ${scene('router')}
                <h2 id="ob-h6">Then it finds a model that's free</h2>
                <p class="onboard-lede">Vettly asks Claude first, then Gemini, OpenAI and Groq. If one is busy, the next one answers, so you're never left waiting.</p>
            </section>

            <section class="ob-page" data-ob-page="7" aria-labelledby="ob-h7" hidden>
                ${scene('polish')}
                <h2 id="ob-h7">Finally, it sounds like you</h2>
                <p class="onboard-lede" data-ob-summary>Robotic phrases are stripped out, then every answer is scored on 7 checks and rewritten until it passes.</p>
            </section>

            <div class="onboard-actions">
                <button type="button" class="btn btn-ghost" data-ob-later>Not now</button>
                <span class="ob-spacer"></span>
                <button type="button" class="btn btn-secondary" data-ob-back>Back</button>
                <button type="submit" class="btn btn-primary" data-ob-next>Next</button>
            </div>
        </form>`;
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
        let page = editing ? NAME : 0;

        const show = n => {
            page = n;
            pages.forEach((p, k) => { p.hidden = k !== n; });
            dlg.setAttribute('aria-labelledby', `ob-h${n}`);
            form.querySelector('.ob-kicker').textContent = KICKER[n];
            form.querySelector('.ob-step').textContent = `${n + 1} / ${PAGES}`;
            form.querySelectorAll('.ob-progress span').forEach((d, k) => { d.classList.toggle('on', k <= n); d.classList.toggle('now', k === n); });
            back.hidden = n === 0 || n === SAVE + 1 || (editing && n === NAME);
            later.hidden = n > SAVE;
            next.textContent = n === 0 ? 'Show me around' : n === SAVE ? (editing ? 'Save changes' : 'Save and continue')
                : n === PAGES - 1 ? (hasTour() && !Tour.seen() ? 'Take the tour' : 'Start preparing') : 'Next';
            pages[n].classList.remove('ob-in'); void pages[n].offsetWidth; pages[n].classList.add('ob-in');
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
        // a fresh visitor who leaves early still gets the tour once
        dlg.addEventListener('close', () => { if (hasTour()) Tour.maybeStart(); }, { once: true });

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
                Motion.toast(`Saved. Vettly is tuned for ${profile.role} in ${profile.field}.`, 'ok');
                if (editing) dlg.close(); else show(SAVE + 1);
            } catch (err) {
                Motion.toast(`Could not save your answers: ${err.message}`, 'error');
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
