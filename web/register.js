/**
 * The register: Live Copilot as an old, well-kept book. Every conversation is a chapter (server: /api/chats).
 * New chapter = the page turns. Archive = the page slides onto the shelf. Tear out = it flies to The Attic.
 * Answers are written in ink, word by word, with a pen nib leading the line. A chapter clock counts the time you
 * spend (synced to the chapter), and a practice stopwatch times your own spoken answers (saved with your message).
 * Uses chatHistory / createAssistantBubble / formatChatMessage / switchSection from dashboard.js; GSAP if loaded.
 */
const Register = (() => {
    const LOOK_KEY = 'vettly_register_look', INK_KEY = 'vettly_register_ink';
    const LOOKS = [
        ['manuscript', 'Manuscript', 'Aged parchment, sepia ink, an illuminated first letter'],
        ['notebook', 'Field notebook', 'Kraft covers, grid paper, pencil and blue ink'],
        ['ledger', 'Ledger', 'Green-ruled columns and a red margin'],
        ['night', 'Night library', 'Dark leather and gold ink, by candlelight'],
        ['plain', 'Plain chat', 'Simple bubbles, no ink'],
    ];
    const $ = id => document.getElementById(id);
    const icon = n => `<svg aria-hidden="true"><use href="#i-${n}"/></svg>`;
    const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches || !!window.Motion?.calm?.();
    const roman = n => { let out = '', x = n; for (const [v, r] of [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) while (x >= v) { out += r; x -= v; } return out || 'I'; };
    const clock = ms => { const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`; };
    const api = async (method, path, body) => {
        const res = await fetch(`${API_BASE}${path}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body && JSON.stringify(body) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || data.detail || `HTTP ${res.status}`);
        return data;
    };

    let list = [], openId = null, current = null, query = '', stats = {};

    /* ── the index ── */
    function title(c) { return c.title || c.auto_title || 'A blank page'; }
    function when(iso) {
        if (!iso) return '';
        const d = new Date(iso), today = new Date();
        const days = Math.round((today.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 864e5);
        return days === 0 ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : days === 1 ? 'Yesterday' : days < 7 ? d.toLocaleDateString(undefined, { weekday: 'long' }) : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    }
    function item(c, i) {
        return `<li style="--i:${i}"><button type="button" class="reg-item${c.id === openId ? ' is-open' : ''}" data-open="${c.id}" aria-current="${c.id === openId}">
            <span class="reg-item-no">${roman(c.number)}</span>
            <span class="reg-item-text"><b>${escapeHtml(title(c))}</b><small>${when(c.updated)} · ${c.count} ${c.count === 1 ? 'note' : 'notes'}${c.elapsed_ms > 59000 ? ` · ${clock(c.elapsed_ms)}` : ''}</small></span></button></li>`;
    }
    function renderIndex() {
        const q = query.toLowerCase();
        const match = c => !q || title(c).toLowerCase().includes(q);
        const live = list.filter(c => !c.archived && match(c)), shelf = list.filter(c => c.archived && match(c));
        $('reg-list').innerHTML = live.length ? live.map(item).join('') : `<li class="reg-empty">${q ? 'No chapter by that name.' : 'No chapters yet.'}</li>`;
        $('reg-archived').innerHTML = shelf.length ? shelf.map(item).join('') : '<li class="reg-empty">Nothing on the shelf.</li>';
        $('reg-shelf-n').textContent = list.filter(c => c.archived).length;
    }

    /* ── the open page ── */
    function renderHead() {
        if (!current) return;
        $('reg-num').textContent = roman(current.number);
        $('reg-date').textContent = new Date(current.created || Date.now()).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
        $('reg-date').dateTime = current.created || '';
        $('reg-title').textContent = title(current) === 'A blank page' ? 'A new chapter' : title(current);
        const arch = document.querySelector('[data-reg="archive"]');
        arch.querySelector('span').textContent = current.archived ? 'Unshelve' : 'Archive';
        arch.title = current.archived ? 'Take this chapter off the shelf' : 'Put this chapter on the archive shelf';
    }
    function welcome() {
        return `<div class="chat-welcome reg-welcome">
            <span class="chat-welcome-badge"><i></i>A fresh page</span>
            <h3>Ask what an interviewer would ask</h3>
            <p>The answer is written back in your voice, from whatever is in your Toolbelt. Time yourself with the stopwatch if you answer out loud first.</p>
            <div class="chat-suggestions">
                ${['Tell me about yourself', 'Why do you want this role?', 'Tell me about a challenge you solved and what you learned', 'What are your strengths and weaknesses?']
                    .map(q => `<button class="chat-suggestion" onclick="sendChatSuggestion(${escapeHtml(JSON.stringify(q))})">${escapeHtml(q.replace(/ and what you learned$/, ''))}</button>`).join('')}
            </div></div>`;
    }
    function decorateUser(bubble, msg) {
        bubble.classList.add('reg-q');
        if (msg?.think_ms) bubble.insertAdjacentHTML('beforeend', `<span class="reg-spoke" title="Your practice stopwatch">${icon('clock')}spoke for ${clock(msg.think_ms)}</span>`);
        if (msg?.ts) bubble.dataset.time = new Date(msg.ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }
    function renderMessages(messages) {
        const box = $('chat-messages');
        chatHistory = messages.map(m => ({ role: m.role, content: m.content }));
        if (!messages.length) { box.innerHTML = welcome(); return; }
        box.innerHTML = '';
        let lastQ = '';
        messages.forEach(m => {
            if (m.role === 'user') {
                lastQ = m.content;
                const b = document.createElement('div');
                b.className = 'chat-bubble user';
                b.textContent = m.content;
                decorateUser(b, m);
                box.appendChild(b);
            } else {
                const b = createAssistantBubble(m.content, lastQ);
                if (m.ts) b.dataset.time = new Date(m.ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
                box.appendChild(b);
            }
        });
        requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
    }

    /* ── page movements ── */
    const page = () => $('reg-page');
    // the page turns: a leaf lifts from the right edge and swings over the spine
    function turn(swap, dir = 1) {
        if (calm() || current?.look === 'plain' || look() === 'plain') { swap(); return Promise.resolve(); }
        const p = page(), leaf = document.createElement('div');
        leaf.className = 'reg-leaf';
        leaf.style.transformOrigin = dir > 0 ? 'left center' : 'right center';
        p.appendChild(leaf);
        swap();
        const from = 0, to = dir > 0 ? -178 : 178;
        if (window.gsap) {
            return new Promise(res => gsap.fromTo(leaf, { rotateY: from, '--shade': 0 }, { rotateY: to, '--shade': 1, duration: 0.95, ease: 'power2.inOut', onComplete: () => { leaf.remove(); res(); } }));
        }
        return leaf.animate([{ transform: `perspective(1800px) rotateY(${from}deg)` }, { transform: `perspective(1800px) rotateY(${to}deg)` }], { duration: 950, easing: 'cubic-bezier(.65,0,.35,1)' }).finished.then(() => leaf.remove());
    }
    // a copy of the page flies somewhere (The Attic, the shelf) while the real page shows the next chapter
    function fly(kind, target) {
        if (calm()) return Promise.resolve();
        const p = page(), r = p.getBoundingClientRect(), ghost = p.cloneNode(true);
        ghost.removeAttribute('id'); ghost.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
        ghost.className += ` reg-ghost reg-ghost-${kind}`;
        Object.assign(ghost.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: 0, zIndex: 900, pointerEvents: 'none' });
        document.body.appendChild(ghost);
        const t = target?.getBoundingClientRect?.() || { left: r.left, top: innerHeight, width: 40, height: 40 };
        const dx = t.left + t.width / 2 - (r.left + r.width / 2), dy = t.top + t.height / 2 - (r.top + r.height / 2);
        const frames = kind === 'tear'
            ? [{ transform: 'none', clipPath: 'inset(0 0 0 0)', opacity: 1 },
               { transform: 'translate(10px, -14px) rotate(-3deg)', clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 3% 90%, 0 80%, 4% 70%, 0 60%, 3% 50%, 0 40%, 4% 30%, 0 20%, 3% 10%)', opacity: 1, offset: 0.25 },
               { transform: `translate(${dx}px, ${dy}px) rotate(${dx < 0 ? -28 : 28}deg) scale(0.06)`, clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 3% 90%, 0 80%, 4% 70%, 0 60%, 3% 50%, 0 40%, 4% 30%, 0 20%, 3% 10%)', opacity: 0.4 }]
            : [{ transform: 'none', opacity: 1 }, { transform: 'translateY(-10px) scale(0.96) rotate(-1deg)', opacity: 1, offset: 0.2 },
               { transform: `translate(${dx}px, ${dy}px) scale(0.05) rotate(-6deg)`, opacity: 0.3 }];
        return ghost.animate(frames, { duration: kind === 'tear' ? 1100 : 900, easing: 'cubic-bezier(.55,0,.25,1)' }).finished.then(() => {
            ghost.remove();
            target?.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(.34,1.56,.64,1)' });
        });
    }

    /* ── ink: words appear as if written, a nib leading the line ── */
    function write(bubble) {
        const content = bubble?.querySelector('.chat-bubble-content');
        if (!content || calm() || look() === 'plain' || ink() === 'typed') return;
        const words = [];
        const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
        const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(node => {
            if (!node.nodeValue.trim()) return;
            const frag = document.createDocumentFragment();
            node.nodeValue.split(/(\s+)/).forEach(tok => {
                if (!tok) return;
                if (/^\s+$/.test(tok)) { frag.appendChild(document.createTextNode(tok)); return; }
                const w = document.createElement('span'); w.className = 'ink'; w.textContent = tok; frag.appendChild(w); words.push(w);
            });
            node.replaceWith(frag);
        });
        if (!words.length) return;
        const total = words.reduce((n, w) => n + w.textContent.length, 0);
        const per = Math.max(7, Math.min(32, 5200 / total));   // long answers write faster, so nothing takes forever
        const nib = document.createElement('span'); nib.className = 'reg-nib'; nib.innerHTML = icon('pen'); bubble.appendChild(nib);
        bubble.classList.add('is-writing');
        let t = 0;
        const box = $('chat-messages');
        words.forEach((w, i) => {
            const d = t; t += 40 + w.textContent.length * per;
            w.style.animationDelay = `${d}ms`;
            w.style.animationDuration = `${Math.max(140, w.textContent.length * per)}ms`;
            setTimeout(() => {
                if (!nib.isConnected) return;
                const br = bubble.getBoundingClientRect(), wr = w.getBoundingClientRect();
                nib.style.transform = `translate(${wr.right - br.left}px, ${wr.top - br.top + wr.height * 0.15}px)`;
                if (i % 6 === 0 && box.scrollHeight - box.scrollTop - box.clientHeight < 180) box.scrollTop = box.scrollHeight;
            }, d);
        });
        // once written, the words stay written: no replay when you come back to the page
        setTimeout(() => { nib.remove(); bubble.classList.remove('is-writing'); words.forEach(w => { w.classList.remove('ink'); w.style.animation = 'none'; }); }, t + 300);
    }

    /* ── the chapter clock: counts while you are on this page and the tab is visible ── */
    let base = 0, since = 0, lastSaved = 0, tick = 0;
    const running = () => document.visibilityState === 'visible' && document.body.dataset.section === 'chat' && !!current;
    const elapsed = () => base + (since ? Date.now() - since : 0);
    function clockTick() {
        const on = running();
        if (on && !since) since = Date.now();
        if (!on && since) { base += Date.now() - since; since = 0; persist(); }
        $('reg-elapsed').textContent = clock(elapsed());
        page()?.classList.toggle('clock-on', on);
        if (on && Date.now() - lastSaved > 20000) persist();
        sw.paint();
    }
    async function persist() {
        if (!current) return;
        lastSaved = Date.now();
        const ms = elapsed();
        if (ms <= (current.elapsed_ms || 0)) return;
        current.elapsed_ms = ms;
        const row = list.find(c => c.id === current.id); if (row) row.elapsed_ms = ms;
        try { await api('PATCH', `/api/chats/${current.id}`, { elapsed_ms: ms }); } catch (e) { /* next tick tries again */ }
    }
    function startClock(ms) { base = ms || 0; since = 0; clockTick(); }

    /* ── the practice stopwatch: time yourself answering out loud; the time is saved with your next message ── */
    const sw = (() => {
        let acc = 0, start = 0;
        const now = () => acc + (start ? Date.now() - start : 0);
        function paint() {
            const ms = now(), btn = $('reg-sw'); if (!btn) return;
            $('reg-sw-time').textContent = clock(ms);
            $('reg-sw-label').textContent = start ? 'Speaking…' : ms ? 'Paused' : 'Stopwatch';
            btn.setAttribute('aria-pressed', String(!!start));
            btn.dataset.zone = ms < 60000 ? 'ok' : ms < 120000 ? 'warn' : 'bad';   // 1–2 minutes is the sweet spot
            btn.style.setProperty('--sw', String(Math.min(1, ms / 120000)));
            document.querySelector('[data-reg="sw-reset"]').hidden = !ms;
        }
        return {
            toggle() { if (start) { acc += Date.now() - start; start = 0; } else start = Date.now(); paint(); },
            reset() { acc = 0; start = 0; paint(); },
            take() { const ms = now(); if (!ms) return null; acc = 0; start = 0; paint(); return Math.round(ms); },
            paint,
        };
    })();

    /* ── actions ── */
    async function load() {
        try {
            const r = await api('GET', '/api/chats');
            list = r.chapters; openId = r.open; stats = r.stats || {};
            current = await api('POST', `/api/chats/${openId}/open`);
            renderIndex(); renderHead(); renderMessages(current.messages || []); startClock(current.elapsed_ms);
        } catch (e) { console.warn('Register could not load:', e); }
    }
    async function openChapter(id, dir = 1) {
        if (id === openId) { closeIndex(); return; }
        await persist();
        let next;
        try { next = await api('POST', `/api/chats/${id}/open`); } catch (e) { Motion.toast(e.message, 'error'); return; }
        closeIndex();
        await turn(() => { current = next; openId = id; renderHead(); renderMessages(next.messages || []); renderIndex(); startClock(next.elapsed_ms); }, dir);
    }
    async function newChapter() {
        if (document.body.dataset.section !== 'chat') switchSection('chat', { animate: true });
        await persist();
        try {
            const r = await api('POST', '/api/chats', {});
            list = r.chapters; const next = r.chapter;
            closeIndex();
            await turn(() => { current = next; openId = next.id; renderHead(); renderMessages([]); renderIndex(); startClock(0); });
            setTimeout(() => $('chat-input')?.focus(), 80);
        } catch (e) { Motion.toast(`Could not begin a new chapter: ${e.message}`, 'error'); }
    }
    async function archive() {
        if (!current) return;
        const shelve = !current.archived;
        try { await api('PATCH', `/api/chats/${current.id}`, { archived: shelve }); } catch (e) { Motion.toast(e.message, 'error'); return; }
        const row = list.find(c => c.id === current.id); if (row) row.archived = shelve;
        current.archived = shelve;
        if (shelve) {
            const shelf = matchMedia('(max-width: 63.99rem)').matches ? $('reg-title') : document.querySelector('#reg-shelf summary');
            const flight = fly('shelf', shelf);
            const nextLive = list.find(c => !c.archived);
            Motion.toast('On the archive shelf. Find it under Chapters → Archive shelf.', 'ok');
            await flight;
            if (nextLive) await openChapter(nextLive.id); else await newChapter();
        } else { renderHead(); renderIndex(); Motion.toast('Back on the desk.', 'ok'); }
    }
    let armed = 0;
    async function tearOut(btn) {
        if (!current) return;
        if (!armed) {   // two taps instead of a browser dialog
            armed = setTimeout(() => { armed = 0; btn.querySelector('span').textContent = 'Tear out'; }, 3500);
            btn.querySelector('span').textContent = 'Tap again';
            return;
        }
        clearTimeout(armed); armed = 0; btn.querySelector('span').textContent = 'Tear out';
        const gone = current;
        const attic = window.Tabs?.hidden?.('attic') ? null : (matchMedia('(max-width: 47.99rem)').matches ? $('nav-more') : $('nav-attic'));
        const flight = fly('tear', attic);
        try {
            const r = await api('DELETE', `/api/chats/${gone.id}`);
            list = r.chapters; openId = r.open;
            const next = await api('POST', `/api/chats/${openId}/open`);
            await flight;
            current = next; renderHead(); renderMessages(next.messages || []); renderIndex(); startClock(next.elapsed_ms);
            Motion.toast(`“${title(gone)}” is waiting in The Attic.`, 'ok');
            window.loadRecycleBin?.();
        } catch (e) { Motion.toast(`Could not tear it out: ${e.message}`, 'error'); }
    }
    function rename() {
        const btn = $('reg-title'); if (!current || !btn) return;
        const input = document.createElement('input');
        input.className = 'reg-title-input'; input.value = current.title || ''; input.placeholder = current.auto_title || 'Name this chapter';
        input.setAttribute('aria-label', 'Chapter name'); input.maxLength = 80;
        btn.replaceWith(input); input.focus(); input.select();
        let done = false;
        const finish = async save => {
            if (done) return; done = true;
            input.replaceWith(btn);
            if (save && input.value.trim() !== (current.title || '')) {
                try { const m = await api('PATCH', `/api/chats/${current.id}`, { title: input.value }); current.title = m.title; const row = list.find(c => c.id === current.id); if (row) row.title = m.title; }
                catch (e) { Motion.toast(e.message, 'error'); }
            }
            renderHead(); renderIndex();
        };
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } if (e.key === 'Escape') { e.preventDefault(); finish(false); } });
        input.addEventListener('blur', () => finish(true));
    }
    // after a message lands: counts, first-question titles and order refresh without reloading the page
    async function touch() {
        try { const r = await api('GET', '/api/chats'); list = r.chapters; stats = r.stats || {}; current = { ...current, ...(list.find(c => c.id === current.id) || {}) }; renderIndex(); renderHead(); } catch (e) { /* the next action refreshes */ }
    }

    // phones: the index is a drawer
    function openIndex() { $('register').classList.add('index-open'); $('reg-search')?.focus({ preventScroll: true }); }
    function closeIndex() { $('register')?.classList.remove('index-open'); }

    /* ── looks (chosen in the Atelier) ── */
    const look = () => { try { return localStorage.getItem(LOOK_KEY) || 'manuscript'; } catch (e) { return 'manuscript'; } };
    const ink = () => { try { return localStorage.getItem(INK_KEY) || 'hand'; } catch (e) { return 'hand'; } };
    function applyLook() { const r = $('register'); if (r) r.dataset.look = look(); renderAtelier(); }
    function renderAtelier() {
        const box = document.getElementById('atelier-book');
        if (!box) return;
        box.innerHTML = `
            <div class="toolbelt-card-header"><h3>${icon('book').replace('<svg', '<svg class="h-ico"')}The Copilot's book</h3></div>
            <p class="toolbelt-card-desc">How Live Copilot looks: a register you write in, or a plain chat.</p>
            <div class="book-looks" role="radiogroup" aria-label="Copilot look">
                ${LOOKS.map(([id, name, sub]) => `<button type="button" class="book-look" role="radio" aria-checked="${look() === id}" data-book-look="${id}">
                    <span class="book-swatch" data-look="${id}" aria-hidden="true"><i></i><i></i><i></i><b>Aa</b></span><b>${name}</b><small>${sub}</small></button>`).join('')}
            </div>
            <label class="tab-switch"><input type="checkbox" data-book-ink ${ink() === 'hand' ? 'checked' : ''}><span class="tab-switch-ui" aria-hidden="true"></span><span><b>Write answers in ink</b><small>Words appear as if handwritten, a nib leading the line. Off: answers appear at once.</small></span></label>`;
    }
    document.addEventListener('click', e => {
        const b = e.target.closest('[data-book-look]');
        if (b) { try { localStorage.setItem(LOOK_KEY, b.dataset.bookLook); } catch (err) { /* */ } applyLook(); }
    });
    document.addEventListener('change', e => { if (e.target.matches('[data-book-ink]')) { try { localStorage.setItem(INK_KEY, e.target.checked ? 'hand' : 'typed'); } catch (err) { /* */ } } });

    /* ── wiring ── */
    function wire() {
        const reg = $('register'); if (!reg) return;
        reg.addEventListener('click', e => {
            const o = e.target.closest('[data-open]'); if (o) { openChapter(o.dataset.open); return; }
            const b = e.target.closest('[data-reg]'); if (!b) return;
            ({ new: newChapter, archive, delete: () => tearOut(b), rename, sw: () => sw.toggle(), 'sw-reset': () => sw.reset(), index: openIndex, 'close-index': closeIndex })[b.dataset.reg]?.();
        });
        $('reg-search')?.addEventListener('input', e => { query = e.target.value.trim(); renderIndex(); });
        document.addEventListener('visibilitychange', clockTick);
        addEventListener('pagehide', persist);
        tick = setInterval(clockTick, 1000);
        applyLook();
        if (window.Shortcuts) {
            Shortcuts.add({ id: 'new-chapter', keys: ['n'], label: 'New Copilot chapter', group: 'Live Copilot', icon: 'book', run: newChapter });
            Shortcuts.add({ id: 'stopwatch', keys: ['t'], label: 'Start or pause the practice stopwatch', group: 'Live Copilot', icon: 'clock', run: () => { if (document.body.dataset.section !== 'chat') switchSection('chat', { animate: true }); sw.toggle(); } });
        }
    }
    wire();

    return {
        load, newChapter, write, decorateUser, touch, renderAtelier,
        openId: () => openId,
        takeLap: () => sw.take(),
        stats: () => ({ messages: stats.messages ?? 0, minutes: Math.round((stats.elapsed_ms || 0) / 60000), chapters: stats.chapters ?? list.length }),
    };
})();
window.Register = Register;
