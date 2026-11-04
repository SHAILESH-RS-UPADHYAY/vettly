/**
 * Key Ring (Settings): the user's own AI keys, one per provider, in the order the server tries them
 * (Gemini → Groq → Claude → OpenAI). KeyGuide: an illustrated, step-by-step "how to get a key" for each provider.
 * Passport: the signed-in account, profile, export and delete.
 * Server: GET/POST/DELETE /api/ai-key, POST /api/ai-key/test, GET /api/me/export, DELETE /api/me (see allowance.py).
 * Uses API_BASE / escapeHtml from dashboard.js, Motion.toast, window.Auth and Onboard.
 */
const KEY_PROVIDERS = [
    { id: 'gemini', name: 'Gemini', by: 'Google AI Studio', free: true, mark: 'G', prefix: 'AIza', site: 'aistudio.google.com', url: 'https://aistudio.google.com/apikey',
        open: 'Open AI Studio', blurb: 'Free with any Google account. Fast and smart: the best place to start.' },
    { id: 'groq', name: 'Groq', by: 'GroqCloud', free: true, mark: 'Q', prefix: 'gsk_', site: 'console.groq.com', url: 'https://console.groq.com/keys',
        open: 'Open Groq console', blurb: 'Free and very fast. The perfect backup when Gemini is busy.' },
    { id: 'anthropic', name: 'Claude', by: 'Anthropic Console', free: false, mark: 'C', prefix: 'sk-ant-', site: 'platform.claude.com', url: 'https://platform.claude.com/settings/keys',
        open: 'Open Claude Console', blurb: 'Paid, with prepaid credits. Lovely writing, if you already use it.' },
    { id: 'openai', name: 'OpenAI', by: 'OpenAI Platform', free: false, mark: 'O', prefix: 'sk-', site: 'platform.openai.com', url: 'https://platform.openai.com/api-keys',
        open: 'Open OpenAI Platform', blurb: 'Paid, with prepaid credits (usually from $5). The last fallback.' },
];

// Key Ring's "your own provider": any OpenAI-compatible API. The server checks the URL (https, public host) itself.
const OWN_PRESETS = [
    { id: 'openrouter', name: 'OpenRouter', icon: 'planet', hint: 'Hundreds of models behind one key', base: 'https://openrouter.ai/api/v1', model: 'openrouter/auto', keys: 'https://openrouter.ai/settings/keys' },
    { id: 'together', name: 'Together AI', icon: 'lightning', hint: 'Open models, fast', base: 'https://api.together.xyz/v1', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', keys: 'https://api.together.ai/settings/api-keys' },
    { id: 'deepseek', name: 'DeepSeek', icon: 'brain', hint: 'Low cost, strong reasoning', base: 'https://api.deepseek.com/v1', model: 'deepseek-chat', keys: 'https://platform.deepseek.com/api_keys' },
    { id: 'mistral', name: 'Mistral', icon: 'wand', hint: 'European models', base: 'https://api.mistral.ai/v1', model: 'mistral-small-latest', keys: 'https://console.mistral.ai/api-keys' },
    { id: 'other', name: 'Other (OpenAI-compatible)', icon: 'plug', hint: 'Any API with /chat/completions', base: '', model: '', keys: '' },
];

const KeyRing = (() => {
    let status = null, ownEditing = false;
    const icon = (n, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
    const presetOf = c => OWN_PRESETS.find(p => p.base && c?.base_url?.startsWith(p.base)) || OWN_PRESETS.at(-1);

    // your own provider: a folded section under the four; saved, it shows what it uses and where it sits in the order
    function own(s) {
        const c = s.keys?.custom || {}, locked = !s.own_keys_enabled, editing = ownEditing || !c.saved;
        const pre = c.saved ? presetOf(c) : OWN_PRESETS[0];
        const body = editing ? `
            <form class="kr-own-form" data-kr="own-form" autocomplete="off">
                <label class="kr-field"><span>Provider</span><select name="preset">${OWN_PRESETS.map(p => `<option value="${p.id}" data-icon="${p.icon}" data-hint="${escapeHtml(p.hint)}"${p.id === pre.id ? ' selected' : ''}>${p.name}</option>`).join('')}</select></label>
                <label class="kr-field"><span>Base URL</span><input name="base_url" type="url" inputmode="url" spellcheck="false" placeholder="https://…/v1" value="${escapeHtml(c.base_url || pre.base)}"${locked ? ' disabled' : ''}></label>
                <label class="kr-field"><span>Model</span><input name="model" spellcheck="false" placeholder="provider/model-name" value="${escapeHtml(c.model || pre.model)}"${locked ? ' disabled' : ''}></label>
                <label class="kr-field kr-field-key"><span>API key</span><span class="kr-input"><input name="key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${c.saved ? `Leave empty to keep ••••${escapeHtml(c.last4)}` : 'Paste your key'}"${locked ? ' disabled' : ''}>
                    <button type="button" class="kr-eye" data-kr="eye" aria-label="Show the key" aria-pressed="false">${icon('eye')}</button></span></label>
                <label class="tab-switch kr-first"><input type="checkbox" name="first"${c.saved ? (c.first ? ' checked' : '') : ' checked'}><span class="tab-switch-ui" aria-hidden="true"></span><span><b>Try it first</b><small>Before Gemini; off puts it last, as a backup</small></span></label>
                <div class="kr-actions">
                    <button type="submit" class="btn btn-primary btn-sm"${locked ? ' disabled' : ''}>Save provider</button>
                    ${c.saved ? '<button type="button" class="btn btn-ghost btn-sm" data-kr="own-cancel">Cancel</button>' : ''}
                    <a class="kr-own-get" href="${pre.keys || '#'}" target="_blank" rel="noopener noreferrer"${pre.keys ? '' : ' hidden'}>Get a ${escapeHtml(pre.name)} key${icon('external')}</a>
                </div>
            </form>` : `
            <div class="kr-saved">${icon('check-bold')}<span>${escapeHtml(c.label || 'Your provider')}</span><code>${escapeHtml(c.model)}</code><code>••••${escapeHtml(c.last4)}</code></div>
            <label class="tab-switch kr-first"><input type="checkbox" data-kr="own-first"${c.first ? ' checked' : ''}><span class="tab-switch-ui" aria-hidden="true"></span><span><b>Try it first</b><small>${c.first ? 'Asked before Gemini, Groq, Claude and OpenAI' : 'Asked last, as a backup'}</small></span></label>
            <div class="kr-actions">
                <button type="button" class="btn btn-secondary btn-sm" data-kr="test">${icon('lightning')}Test</button>
                <button type="button" class="btn btn-ghost btn-sm" data-kr="own-edit">Edit</button>
                <button type="button" class="btn btn-ghost btn-sm kr-remove" data-kr="remove">Remove</button>
            </div>`;
        return `
            <details class="kr-card kr-own${c.saved ? ' is-saved' : ''}" data-p="custom"${c.saved || ownEditing ? ' open' : ''}>
                <summary><span class="kr-mark kr-own-mark" aria-hidden="true">${icon('plug')}</span><span class="kr-name"><b>Your own provider</b><small>OpenRouter, Together, DeepSeek, Mistral or any OpenAI-compatible API</small></span>
                    <span class="kr-badge ${c.saved ? 'free' : 'paid'}">${c.saved ? (c.first ? 'Tried first' : 'Tried last') : 'Optional'}</span>${icon('caret-down', 'kr-own-caret')}</summary>
                ${body}
                <p class="kr-msg" role="status" aria-live="polite"></p>
            </details>`;
    }
    const api = async (method, path, body) => {
        const res = await fetch(`${API_BASE}${path}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body && JSON.stringify(body) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || data.detail || `The server answered ${res.status}`);
        return data;
    };

    function summary(s) {
        const saved = KEY_PROVIDERS.filter(p => s.keys?.[p.id]?.saved);
        if (saved.length) return `${icon('check-bold')}<span>Using your keys: ${saved.map(p => p.name).join(' → ')}. No daily limit.</span>`;
        if (!window.Auth?.enabled?.()) return `${icon('plug')}<span>Running on your own computer: Vettly uses the keys in <code>backend/.env</code>.</span>`;
        return `${icon('lightning')}<span><b>${s.free_left} of ${s.free_limit}</b> free answers left today. Add a free key for unlimited answers.</span>`;
    }

    function card(p, i, s) {
        const k = s.keys?.[p.id] || {};
        const locked = !s.own_keys_enabled;
        const first = i === 0 && !KEY_PROVIDERS.some(x => s.keys?.[x.id]?.saved);
        return `
        <li class="kr-card${k.saved ? ' is-saved' : ''}${first ? ' is-first' : ''}" data-p="${p.id}" style="--i:${i}">
            ${first ? '<span class="kr-start">Start here</span>' : ''}
            <div class="kr-top">
                <span class="kr-mark" data-p="${p.id}" aria-hidden="true">${p.mark}<svg class="kr-ring" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" pathLength="1"/></svg></span>
                <span class="kr-name"><b>${p.name}</b><small>${p.by}</small></span>
                <span class="kr-badge ${p.free ? 'free' : 'paid'}">${p.free ? 'Free' : 'Paid'}</span>
                <span class="kr-order" title="Tried ${['first', 'second', 'third', 'last'][i]}">${i + 1}</span>
            </div>
            <p class="kr-blurb">${p.blurb}</p>
            ${k.saved ? `
            <div class="kr-saved">${icon('check-bold')}<span>Connected</span><code>••••${escapeHtml(k.last4 || '')}</code></div>
            <div class="kr-actions">
                <button type="button" class="btn btn-secondary btn-sm" data-kr="test">${icon('lightning')}Test</button>
                <button type="button" class="btn btn-ghost btn-sm" data-kr="replace">Replace</button>
                <button type="button" class="btn btn-ghost btn-sm kr-remove" data-kr="remove">Remove</button>
            </div>` : `
            <form class="kr-form" data-kr="form">
                <label class="sr-only" for="kr-${p.id}">${p.name} API key</label>
                <span class="kr-input"><input id="kr-${p.id}" name="key" type="password" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Paste your key (${p.prefix}…)"${locked ? ' disabled' : ''}>
                    <button type="button" class="kr-eye" data-kr="eye" aria-label="Show the key" aria-pressed="false">${icon('eye')}</button></span>
                <button type="submit" class="btn btn-primary btn-sm"${locked ? ' disabled' : ''}>Save</button>
            </form>`}
            <p class="kr-msg" role="status" aria-live="polite"></p>
            <div class="kr-links">
                <button type="button" class="kr-guide" data-guide="${p.id}">${icon('path')}How do I get one?</button>
                <a href="${p.url}" target="_blank" rel="noopener noreferrer">${p.open}${icon('external')}</a>
            </div>
        </li>`;
    }

    function render(s) {
        const box = document.getElementById('keyring-card');
        if (!box) return;
        status = s;
        box.innerHTML = `
            <div class="toolbelt-card-header">
                <h3>${icon('key', 'h-ico')}Key Ring</h3>
                <button type="button" class="btn btn-sm btn-secondary" data-guide="gemini">${icon('path', 'i')}Get a free key in 2 minutes</button>
            </div>
            <p class="kr-summary">${summary(s)}</p>
            <p class="toolbelt-card-desc">Bring your own AI key and Vettly has no daily limit. <b>Gemini and Groq are free.</b> Add both: if one is busy, the next one answers, in this order.</p>
            ${s.own_keys_enabled ? '' : `<p class="kr-locked">${icon('shield')}Saving your own keys isn't switched on for this site yet${window.Auth?.enabled?.() ? '' : ' (on your own computer, put keys in <code>backend/.env</code>)'}.</p>`}
            <ol class="kr-chain" aria-label="Your AI keys, in the order Vettly tries them">${KEY_PROVIDERS.map((p, i) => card(p, i, s)).join('')}</ol>
            ${own(s)}
            <p class="kr-note">${icon('shield')}Keys are encrypted before they are stored, used only for your own requests, and never shown again in full.</p>`;
        const saved = KEY_PROVIDERS.map(p => !!s.keys?.[p.id]?.saved);
        box.querySelectorAll('.kr-card').forEach((li, i) => li.classList.toggle('chain-lit', saved[i] && saved.slice(i + 1).some(Boolean)));
    }

    function msg(li, text, tone = '') { const m = li.querySelector('.kr-msg'); m.textContent = text; m.dataset.tone = tone; }

    async function save(li, input) {
        const provider = li.dataset.p, key = input.value.trim();
        if (!key) { input.focus(); msg(li, 'Paste the key first.', 'bad'); return; }
        const btn = li.querySelector('.kr-form [type=submit]');
        btn.disabled = true; btn.textContent = 'Saving…';
        try {
            render(await api('POST', '/api/ai-key', { provider, key }));
            const fresh = document.querySelector(`.kr-card[data-p="${provider}"]`);
            fresh.classList.add('just-saved');
            test(fresh);
            window.Daybook?.refresh?.();
        } catch (e) {
            btn.disabled = false; btn.textContent = 'Save';
            msg(li, e.message, 'bad');
        }
    }

    async function saveOwn(f) {
        const li = f.closest('.kr-card'), btn = f.querySelector('[type=submit]');
        const p = OWN_PRESETS.find(x => x.id === f.preset.value);
        btn.disabled = true; btn.textContent = 'Checking…';
        try {
            render(await api('POST', '/api/ai-key', { provider: 'custom', label: p.id === 'other' ? '' : p.name, base_url: f.base_url.value.trim(), model: f.model.value.trim(), key: f.key.value.trim(), first: f.first.checked }));
            ownEditing = false;
            render(status);
            const fresh = document.querySelector('.kr-own');
            fresh.classList.add('just-saved');
            test(fresh);
            window.Daybook?.refresh?.();
        } catch (e) { btn.disabled = false; btn.textContent = 'Save provider'; msg(li, e.message, 'bad'); }
    }
    async function saveOwnOrder(li, first, c) {
        try { render(await api('POST', '/api/ai-key', { provider: 'custom', label: c.label, base_url: c.base_url, model: c.model, key: '', first })); }
        catch (e) { msg(li, e.message, 'bad'); }
    }

    async function test(li) {
        msg(li, 'Checking with the provider…');
        try {
            const r = await api('POST', '/api/ai-key/test', { provider: li.dataset.p });
            msg(li, r.ok ? `✓ ${r.message}` : r.message, r.ok ? 'ok' : 'bad');
        } catch (e) { msg(li, e.message, 'bad'); }
    }

    async function remove(li, btn) {
        if (!btn.dataset.armed) {   // two taps instead of a browser dialog
            btn.dataset.armed = '1'; btn.textContent = 'Tap again to remove';
            setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = 'Remove'; } }, 4000);
            return;
        }
        try { render(await api('DELETE', `/api/ai-key?provider=${li.dataset.p}`)); window.Daybook?.refresh?.(); }
        catch (e) { msg(li, e.message, 'bad'); }
    }

    function wire() {
        const box = document.getElementById('keyring-card');
        if (!box || box.dataset.wired) return;
        box.dataset.wired = '1';
        box.addEventListener('submit', e => {
            const o = e.target.closest('[data-kr="own-form"]'); if (o) { e.preventDefault(); saveOwn(o); return; }
            const f = e.target.closest('[data-kr="form"]'); if (!f) return; e.preventDefault(); save(f.closest('.kr-card'), f.key);
        });
        // picking a preset fills in its base URL and model
        box.addEventListener('change', e => {
            const sel = e.target.closest('.kr-own-form select[name="preset"]');
            if (sel) {
                const f = sel.form, p = OWN_PRESETS.find(x => x.id === sel.value);
                if (p.base) { f.base_url.value = p.base; f.model.value = p.model; }
                const a = f.querySelector('.kr-own-get'); a.hidden = !p.keys; a.href = p.keys || '#'; a.firstChild.textContent = `Get a ${p.name} key`;
                [f.base_url, f.model].forEach(i => window.Motion?.calm?.() || i.animate([{ backgroundColor: 'var(--accent-soft)' }, { backgroundColor: 'var(--field)' }], { duration: 700 }));
            }
            const first = e.target.closest('[data-kr="own-first"]');
            if (first) { const c = status.keys.custom; saveOwnOrder(first.closest('.kr-card'), first.checked, c); }
        });
        box.addEventListener('click', e => {
            const b = e.target.closest('[data-kr]'); if (!b) return;
            const li = b.closest('.kr-card');
            if (b.dataset.kr === 'eye') {
                const input = b.closest('.kr-input').querySelector('input'), show = input.type === 'password';
                input.type = show ? 'text' : 'password';
                b.setAttribute('aria-pressed', String(show)); b.setAttribute('aria-label', show ? 'Hide the key' : 'Show the key');
                b.querySelector('use').setAttribute('href', show ? '#i-eye-off' : '#i-eye');
            }
            if (b.dataset.kr === 'test') test(li);
            if (b.dataset.kr === 'own-edit') { ownEditing = true; render(status); document.querySelector('.kr-own-form input[name="base_url"]')?.focus(); }
            if (b.dataset.kr === 'own-cancel') { ownEditing = false; render(status); }
            if (b.dataset.kr === 'remove') remove(li, b);
            if (b.dataset.kr === 'replace') {   // show the paste box again; the saved key stays until a new one is saved
                const real = status, id = li.dataset.p;
                render({ ...real, keys: { ...real.keys, [id]: { saved: false } } });
                status = real;
                document.getElementById(`kr-${id}`)?.focus();
            }
        });
        // pasting a key saves it straight away; it is what nearly everyone means
        box.addEventListener('paste', e => {
            const input = e.target.closest('.kr-form input'); if (!input) return;
            setTimeout(() => { if (input.value.trim().length >= 20) save(input.closest('.kr-card'), input); }, 0);
        });
    }

    async function load() {
        const box = document.getElementById('keyring-card');
        if (!box) return;
        wire();
        try { render(await api('GET', '/api/ai-key')); }
        catch (e) { box.innerHTML = `<div class="toolbelt-card-header"><h3>${icon('key', 'h-ico')}Key Ring</h3></div><p class="kr-locked">Couldn't load your keys (${escapeHtml(e.message)}). <button type="button" class="btn btn-sm btn-secondary" onclick="KeyRing.load()">Try again</button></p>`; }
    }

    // focus a provider's input (after the guide's last step, or from the tour)
    function focusProvider(id) {
        const input = document.getElementById(`kr-${id}`);
        if (!input) return;
        input.closest('.kr-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => input.focus({ preventScroll: true }), 450);
    }

    document.addEventListener('click', e => { const g = e.target.closest('[data-guide]'); if (g) KeyGuide.open(g.dataset.guide); });
    return { load, status: () => status, focusProvider, api };
})();

/* ── KeyGuide: how to get each key, as illustrated steps with a moving cursor ── */
const KeyGuide = (() => {
    // each step: a picture (kind + the button label to press), a title and plain words
    const STEPS = {
        gemini: [
            { kind: 'signin', title: 'Open Google AI Studio and sign in', text: 'Use any Google account. Your college Gmail works too.' },
            { kind: 'terms', title: 'Accept the terms (first visit only)', text: 'Tick the box to accept the Gemini API terms, then press Continue.' },
            { kind: 'keys', button: 'Create API key', title: 'Press “Create API key”', text: 'You are on the API keys page. If it asks for a project, pick the one it suggests or create a new one.' },
            { kind: 'copy', sample: 'AIzaSy', title: 'Copy your key', text: 'Your key starts with AIza. Press Copy.' },
            { kind: 'paste', title: 'Paste it into Vettly', text: 'Paste it into the Gemini card on the Key Ring. Vettly saves it and checks it with Google for you.' },
        ],
        groq: [
            { kind: 'signin', title: 'Open the Groq console and sign in', text: 'Google, GitHub or email all work. It is free.' },
            { kind: 'keys', button: 'Create API Key', title: 'Press “Create API Key”', text: 'You land on the API Keys page. The button is at the top.' },
            { kind: 'name', button: 'Submit', title: 'Name it “Vettly” and press Submit', text: 'Any name works. It just helps you recognise the key later.' },
            { kind: 'copy', sample: 'gsk_', once: true, title: 'Copy it now', text: 'Groq shows the key only once. It starts with gsk_.' },
            { kind: 'paste', title: 'Paste it into Vettly', text: 'Paste it into the Groq card. With Gemini and Groq both saved, you always have a free backup.' },
        ],
        anthropic: [
            { kind: 'signin', title: 'Open the Claude Console and sign in', text: 'This is the developer console, separate from the Claude chat app.' },
            { kind: 'billing', title: 'Add credits', text: 'Claude has no free tier. Add a small prepaid amount under Settings → Billing.' },
            { kind: 'keys', button: 'Create key', title: 'Settings → API keys → “Create key”', text: 'Give it a name like “Vettly”.' },
            { kind: 'copy', sample: 'sk-ant-', once: true, title: 'Copy it now', text: 'The full key is shown only once. It starts with sk-ant-.' },
            { kind: 'paste', title: 'Paste it into Vettly', text: 'Paste it into the Claude card. Vettly uses it after Gemini and Groq.' },
        ],
        openai: [
            { kind: 'signin', title: 'Open the OpenAI Platform and sign in', text: 'This is the developer platform, separate from ChatGPT.' },
            { kind: 'billing', title: 'Add credits', text: 'The API needs prepaid credits, usually from $5, under Billing.' },
            { kind: 'keys', button: 'Create new secret key', title: 'API keys → “Create new secret key”', text: 'Name it “Vettly” and create it.' },
            { kind: 'copy', sample: 'sk-', once: true, title: 'Copy it now', text: 'You will not see it again after closing. It starts with sk-.' },
            { kind: 'paste', title: 'Paste it into Vettly', text: 'Paste it into the OpenAI card. It is the last fallback.' },
        ],
    };
    let dlg, provider = 'gemini', step = 0, anim = [];
    const P = id => KEY_PROVIDERS.find(p => p.id === id);
    const icon = n => `<svg aria-hidden="true"><use href="#i-${n}"/></svg>`;

    // the little screen: a browser window drawn in Vettly's style (not a copy of the provider's site)
    function screen(p, s) {
        const t = (label, cls = '') => `<span class="kg-btn ${cls} kg-target">${label}</span>`;
        const body = {
            signin: `<div class="kg-dialog"><span class="kg-logo" data-p="${p.id}">${p.mark}</span><b>Sign in</b><small>to continue to ${p.by}</small>
                ${t('Continue with Google', 'kg-wide')}<span class="kg-btn kg-wide kg-ghost">Use another account</span></div>`,
            terms: `<div class="kg-dialog"><b>Before you start</b><span class="kg-check kg-target">☐ I accept the terms of service</span>
                <span class="kg-lines"><i></i><i></i></span>${t('Continue')}</div>`,
            keys: `<div class="kg-page"><div class="kg-side"><i></i><i class="on"></i><i></i><i></i></div><div class="kg-main">
                <div class="kg-row"><b>API keys</b>${t(s.button || 'Create key', 'kg-primary')}</div>
                <div class="kg-table"><i></i><i></i><i></i></div></div></div>`,
            name: `<div class="kg-dialog"><b>Create API key</b><span class="kg-field"><small>Name</small><span class="kg-typed">Vettly</span></span>${t(s.button || 'Create', 'kg-primary')}</div>`,
            copy: `<div class="kg-dialog"><b>Your new key</b><span class="kg-key"><code>${escapeHtml(s.sample || '')}••••••••••••••••</code>${t('Copy', 'kg-primary kg-small')}</span>
                ${s.once ? '<span class="kg-warn">⚠ Shown only once. Copy it now.</span>' : '<span class="kg-hint">Keep it private, like a password.</span>'}</div>`,
            billing: `<div class="kg-page"><div class="kg-side"><i></i><i></i><i class="on"></i><i></i></div><div class="kg-main">
                <div class="kg-row"><b>Billing</b></div><div class="kg-credit"><span>Credit balance</span><b>$0.00</b></div>${t('Add credits', 'kg-primary')}</div></div>`,
            paste: `<div class="kg-vettly"><span class="kg-vmark">${p.mark}</span><b>${p.name}</b><span class="kg-input"><span class="kg-typed">${escapeHtml(p.prefix)}••••••••••</span></span>${t('Save', 'kg-primary kg-small')}
                <span class="kg-ok">✓ Key works</span></div>`,
        }[s.kind];
        return `<div class="kg-browser"><div class="kg-bar"><i></i><i></i><i></i><span class="kg-url">${s.kind === 'paste' ? 'vettly · Key Ring' : p.site}</span></div>
            <div class="kg-view" data-kind="${s.kind}">${body}<svg class="kg-cursor" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l14 8-6 1.6L10 19z"/></svg></div></div>`;
    }

    function build() {
        dlg = document.createElement('dialog');
        dlg.className = 'kguide';
        dlg.setAttribute('aria-labelledby', 'kg-title');
        document.body.appendChild(dlg);
        dlg.addEventListener('click', e => {
            if (e.target === dlg) return close();
            const b = e.target.closest('[data-kg]'); if (!b) return;
            if (b.dataset.kg === 'close') close();
            if (b.dataset.kg === 'back') go(step - 1);
            if (b.dataset.kg === 'next') step < STEPS[provider].length - 1 ? go(step + 1) : finish();
            if (b.dataset.kg === 'tab') { provider = b.dataset.p; go(0); }
            if (b.dataset.kg === 'dot') go(Number(b.dataset.i));
        });
        dlg.addEventListener('keydown', e => {
            if (e.target.closest('input, textarea')) return;
            if (e.key === 'ArrowRight') { e.preventDefault(); if (step < STEPS[provider].length - 1) go(step + 1); }
            if (e.key === 'ArrowLeft') { e.preventDefault(); if (step > 0) go(step - 1); }
        });
    }

    function draw() {
        const p = P(provider), steps = STEPS[provider], s = steps[step], last = step === steps.length - 1;
        dlg.innerHTML = `
            <div class="kg-sheet">
                <header class="kg-head">
                    <h2 id="kg-title">${icon('key')}Get your ${p.name} key</h2>
                    <button type="button" class="kg-x" data-kg="close" aria-label="Close">${icon('x')}</button>
                    <nav class="kg-tabs" aria-label="Provider">${KEY_PROVIDERS.map(x => `<button type="button" data-kg="tab" data-p="${x.id}" aria-pressed="${x.id === provider}"><span class="kg-tmark" data-p="${x.id}">${x.mark}</span>${x.name}<small class="${x.free ? 'free' : 'paid'}">${x.free ? 'Free' : 'Paid'}</small></button>`).join('')}</nav>
                </header>
                <div class="kg-body">
                    <figure class="kg-figure">${screen(p, s)}</figure>
                    <div class="kg-text">
                        <p class="kg-step">Step ${step + 1} of ${steps.length}</p>
                        <h3>${s.title}</h3>
                        <p>${s.text}</p>
                        ${s.kind === 'paste' ? '' : `<a class="btn btn-secondary btn-sm kg-open" href="${p.url}" target="_blank" rel="noopener noreferrer">${p.open}${icon('external')}</a>`}
                        <p class="kg-tip">Their screens change now and then. If a button has moved, look for <b>API keys</b>.</p>
                    </div>
                </div>
                <footer class="kg-foot">
                    <span class="kg-dots">${steps.map((_, i) => `<button type="button" data-kg="dot" data-i="${i}" aria-label="Step ${i + 1}" aria-current="${i === step}"></button>`).join('')}</span>
                    <button type="button" class="btn btn-secondary btn-sm" data-kg="back"${step ? '' : ' hidden'}>Back</button>
                    <button type="button" class="btn btn-primary btn-sm" data-kg="next">${last ? `Paste my ${p.name} key` : 'Next'}${icon('caret-right')}</button>
                </footer>
            </div>`;
        play();
    }

    // the cursor glides to the thing to press, presses it, and the screen reacts
    function play() {
        anim.forEach(a => a.cancel()); anim = [];
        const calm = matchMedia('(prefers-reduced-motion: reduce)').matches || window.Motion?.calm?.();
        const view = dlg.querySelector('.kg-view'), target = view.querySelector('.kg-target'), cur = view.querySelector('.kg-cursor');
        if (!target || calm) { cur.style.display = 'none'; view.classList.add('kg-done'); return; }
        requestAnimationFrame(() => {
            const vr = view.getBoundingClientRect(), tr = target.getBoundingClientRect();
            const x = tr.left - vr.left + tr.width * 0.6, y = tr.top - vr.top + tr.height * 0.55;
            anim.push(cur.animate([
                { transform: `translate(${vr.width * 0.85}px, ${vr.height * 0.95}px)`, offset: 0 },
                { transform: `translate(${x}px, ${y}px)`, offset: 0.45, easing: 'cubic-bezier(.45,0,.2,1)' },
                { transform: `translate(${x}px, ${y}px) scale(0.82)`, offset: 0.52 },
                { transform: `translate(${x}px, ${y}px)`, offset: 0.6 },
                { transform: `translate(${x}px, ${y}px)`, offset: 1 },
            ], { duration: 2600, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'both' }));
            const t = setTimeout(() => view.classList.add('kg-done'), 1400);
            anim.push({ cancel: () => clearTimeout(t) });
        });
    }

    function go(n) { step = Math.max(0, Math.min(STEPS[provider].length - 1, n)); draw(); dlg.querySelector('[data-kg="next"]').focus({ preventScroll: true }); }
    function open(p = 'gemini') {
        if (!dlg) build();
        provider = STEPS[p] ? p : 'gemini'; step = 0;
        draw();
        if (!dlg.open) dlg.showModal();
        dlg.querySelector('[data-kg="next"]').focus();
    }
    function close() { anim.forEach(a => a.cancel()); if (dlg?.open) dlg.close(); }
    // the last step: go to the Key Ring and put the cursor in this provider's box
    function finish() {
        const id = provider;
        close();
        if (window.Onboard?.isOpen?.()) { Onboard.focusKey?.(id); return; }
        if (document.body.dataset.section !== 'settings') switchSection('settings', { animate: true });
        setTimeout(() => KeyRing.focusProvider(id), 420);
    }
    return { open, close };
})();

/* ── Passport: who you are here, and your data ── */
const Passport = (() => {
    const icon = (n, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
    const METHOD = { google: 'Google', github: 'GitHub', linkedin: 'LinkedIn', linkedin_oidc: 'LinkedIn', password: 'Email & password', email: 'Email code' };
    // a machine-readable line, the way real passports end
    const mrz = (name, since) => {
        const id = (name || 'CANDIDATE').toUpperCase().replace(/[^A-Z ]/g, '').trim().replace(/\s+/g, '<');
        return escapeHtml(`P<VETTLY<<${id}`.padEnd(44, '<')) + '<br>' + escapeHtml(`VT${since?.getFullYear?.() || new Date().getFullYear()}<<INTERVIEW<READY`.padEnd(44, '<'));
    };

    async function load() {
        const box = document.getElementById('passport-card');
        if (!box) return;
        await window.Auth?.ready;
        const acct = window.Auth?.account?.() || null;
        let prof = {};
        try { const r = await fetch(`${API_BASE}/api/profile`); if (r.ok) prof = await r.json(); } catch (e) { /* offline */ }
        const name = acct?.name || prof.name || 'You';
        const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '✦';
        const hosted = !!window.Auth?.enabled?.();
        box.innerHTML = `
            <div class="toolbelt-card-header"><h3>${icon('passport', 'h-ico')}Passport</h3>
                <span class="badge-pill badge-pill-${hosted ? 'emerald' : 'slate'}"><span class="badge-dot"></span>${hosted ? 'SIGNED IN' : 'ON THIS COMPUTER'}</span></div>
            <div class="pp-page">
                <div class="pp-photo">${acct?.image ? `<img src="${escapeHtml(acct.image)}" alt="" referrerpolicy="no-referrer">` : `<span>${escapeHtml(initials)}</span>`}<i class="pp-stamp" aria-hidden="true">VETTED</i></div>
                <dl class="pp-fields">
                    <div><dt>Name</dt><dd>${escapeHtml(name)}</dd></div>
                    ${acct?.email ? `<div><dt>Email</dt><dd>${escapeHtml(acct.email)}</dd></div>` : ''}
                    <div><dt>Preparing for</dt><dd>${escapeHtml(prof.role || '—')}${prof.field ? ` <small>· ${escapeHtml(prof.field)}</small>` : ''}</dd></div>
                    ${acct ? `<div><dt>Signs in with</dt><dd class="pp-methods">${(acct.methods.length ? acct.methods : ['email']).map(m => `<span>${METHOD[m] || escapeHtml(m)}</span>`).join('')}</dd></div>` : ''}
                    ${acct?.since ? `<div><dt>Member since</dt><dd>${acct.since.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</dd></div>` : ''}
                </dl>
                <p class="pp-mrz" aria-hidden="true">${mrz(name, acct?.since)}</p>
            </div>
            <div class="pp-actions">
                ${hosted ? `<button type="button" class="btn btn-secondary btn-sm" data-pp="security">${icon('shield', 'i')}Sign-in &amp; security</button>` : ''}
                <button type="button" class="btn btn-secondary btn-sm" data-pp="profile">${icon('user', 'i')}Edit my profile</button>
                <button type="button" class="btn btn-secondary btn-sm" data-pp="export">${icon('download', 'i')}Export my data</button>
                ${hosted ? `<button type="button" class="btn btn-ghost btn-sm" data-pp="signout">${icon('sign-out', 'i')}Sign out</button>` : ''}
            </div>
            <div class="danger-zone">
                <p><b>Delete my data</b><span>Removes everything you saved in Vettly. Your sign-in account stays until you delete it under Sign-in &amp; security.</span></p>
                <button type="button" class="btn btn-secondary btn-sm danger-btn" data-pp="delete">Delete my data</button>
            </div>`;
        if (!box.dataset.wired) {
            box.dataset.wired = '1';
            box.addEventListener('click', e => { const b = e.target.closest('[data-pp]'); if (b) act(b.dataset.pp, b); });
        }
    }

    async function act(what, btn) {
        if (what === 'security') window.Auth?.openProfile?.();
        if (what === 'profile') window.Onboard?.open?.();
        if (what === 'signout') window.Auth?.signOut?.();
        if (what === 'export') {
            btn.disabled = true;
            try {
                const res = await fetch(`${API_BASE}/api/me/export`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const url = URL.createObjectURL(await res.blob());
                Object.assign(document.createElement('a'), { href: url, download: `vettly-export-${new Date().toISOString().slice(0, 10)}.json` }).click();
                setTimeout(() => URL.revokeObjectURL(url), 2000);
                Motion.toast('Your data is downloading as a JSON file.', 'ok');
            } catch (e) { Motion.toast(`Could not export your data: ${e.message}`, 'error'); }
            btn.disabled = false;
        }
        if (what === 'delete') {
            if (!btn.dataset.armed) {
                btn.dataset.armed = '1'; btn.textContent = 'Tap again to delete everything';
                setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = 'Delete my data'; } }, 5000);
                return;
            }
            btn.disabled = true;
            const res = await fetch(`${API_BASE}/api/me`, { method: 'DELETE' });
            if (res.ok) { Motion.toast('Everything you saved in Vettly is deleted.', 'ok'); setTimeout(() => location.reload(), 1200); }
            else { btn.disabled = false; Motion.toast('Could not delete your data. Try again.', 'error'); }
        }
    }
    return { load };
})();

// modules talk to each other through window: a top-level const is not a window property
window.KeyRing = KeyRing; window.KeyGuide = KeyGuide; window.Passport = Passport;
