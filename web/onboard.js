/**
 * Onboarding and the user's field: a short first-visit dialog (name, field, target role, level) whose answers
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

    function dialogHtml() {
        const other = profile.field && !FIELDS.includes(profile.field);
        return `
        <form method="dialog" class="onboard-form" id="onboard-form">
            <h2 id="onboard-title">Tell Vettly who you are</h2>
            <p class="onboard-lede">Four answers, and every question, model answer and daily concept is written for you.</p>
            <label class="ob-field"><span>Your name</span><input name="name" required maxlength="80" autocomplete="name" value="${esc(profile.name)}" placeholder="Asha Verma"></label>
            <label class="ob-field"><span>Your field</span>
                <select name="field" required>${FIELDS.map(f => `<option${(profile.field === f || (other && f === 'Other')) ? ' selected' : ''}>${f}</option>`).join('')}</select></label>
            <label class="ob-field ob-other"${other ? '' : ' hidden'}><span>Which field?</span><input name="field_other" maxlength="60" value="${other ? esc(profile.field) : ''}" placeholder="Aviation, agriculture, journalism..."></label>
            <label class="ob-field"><span>Role you're preparing for</span><input name="role" required maxlength="80" value="${esc(profile.role)}" placeholder="Staff nurse, ICU"></label>
            <label class="ob-field"><span>Your level</span>
                <select name="level">${LEVELS.map(l => `<option${profile.level === l ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
            <div class="onboard-actions"><button type="submit" class="btn btn-primary">Start preparing</button></div>
        </form>`;
    }

    function open() {
        let dlg = document.getElementById('onboard');
        if (!dlg) {
            dlg = document.createElement('dialog');
            dlg.id = 'onboard';
            dlg.className = 'onboard';
            dlg.setAttribute('aria-labelledby', 'onboard-title');
            document.body.appendChild(dlg);
        }
        dlg.innerHTML = dialogHtml();
        const form = dlg.querySelector('form');
        form.field.addEventListener('change', () => { form.querySelector('.ob-other').hidden = form.field.value !== 'Other'; });
        form.addEventListener('submit', async e => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(form));
            const body = { name: f.name, role: f.role, level: f.level, field: f.field === 'Other' ? (f.field_other || 'Other') : f.field };
            const btn = form.querySelector('button[type=submit]');
            btn.disabled = true;
            try {
                const res = await fetch(`${API_BASE}/api/profile`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                profile = await res.json();
                dlg.close();
                Motion.toast(`Welcome, ${profile.name.split(' ')[0]}. Vettly is set up for ${profile.role}.`, 'ok');
                loadCategories();
                if (typeof Bento !== 'undefined') Bento.useField();
            } catch (err) {
                btn.disabled = false;
                Motion.toast(`Could not save your answers: ${err.message}`, 'error');
            }
        });
        dlg.showModal();
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
        try { profile = await (await fetch(`${API_BASE}/api/profile`)).json(); } catch (e) { return; }
        if (!profile.onboarded) open(); else loadCategories();
        keyCard();
    }
    start();

    return { open, role: () => profile.role, field: () => profile.field };
})();
