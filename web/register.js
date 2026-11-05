/**
 * The register: Live Copilot as an old, well-kept book. Every conversation is a chapter (server: /api/chats).
 * New chapter = the page turns. Archive = the page slides onto the shelf. Tear out = it flies to The Attic.
 * Answers are written in ink, word by word, with a pen nib leading the line. A chapter clock counts the time you
 * spend (synced to the chapter, shown in the index). Top right of the page: the time now, and a practice stopwatch
 * that times your own spoken answers (saved with your message).
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
    // speed: chapters already fetched (data), and pages already drawn (their nodes, kept aside), so opening is instant
    const cache = new Map(), inflight = new Map(), drawn = new Map();
    let creating = null, loading = null;
    function fetchFull(id) {
        if (inflight.has(id)) return inflight.get(id);
        const p = api('GET', `/api/chats/${id}`).then(ch => { cache.set(id, ch); return ch; }).finally(() => inflight.delete(id));
        inflight.set(id, p);
        return p;
    }
    const prefetch = id => { if (id && !cache.has(id)) fetchFull(id).catch(() => { /* fetched when opened */ }); };
    const idle = fn => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 200));

    /* ── the index ── */
    const NIB = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 18.2 9.4 13.6 19.6 12 21.6 10.4 19.6 5.8 9.4Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 21.4V12.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="12" cy="10.2" r="1.5" fill="currentColor"/></svg>';
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
            <span class="reg-item-text"><b>${escapeHtml(title(c))}</b><small>${when(c.updated)} · ${c.count} ${c.count === 1 ? 'note' : 'notes'}${c.elapsed_ms > 59000 ? ` · ${clock(c.elapsed_ms)}` : ''}</small></span></button>${c.id ? `<button type="button" class="reg-item-ink" data-rename-id="${c.id}" aria-label="Rename ${escapeHtml(title(c))}" title="Rename">${NIB}</button>` : ''}</li>`;
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
    function bubbleFor(m, lastQ) {
        if (m.role === 'user') {
            const b = document.createElement('div');
            b.className = 'chat-bubble user';
            b.textContent = m.content;
            decorateUser(b, m);
            return b;
        }
        const b = createAssistantBubble(m.content, lastQ);
        if (m.ts) b.dataset.time = new Date(m.ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        return b;
    }
    // keep the page we are leaving: its nodes (with their buttons) go aside, ready to come straight back
    function stash() {
        const box = $('chat-messages');
        if (!current?.id || !box || box.querySelector('.reg-welcome, .reg-pending')) return;
        const keep = document.createElement('div');
        keep.append(...box.childNodes);
        drawn.set(current.id, { keep, count: keep.querySelectorAll(':scope > .chat-bubble').length });
    }
    function renderMessages(messages, id = current?.id) {
        const box = $('chat-messages');
        chatHistory = messages.map(m => ({ role: m.role, content: m.content }));
        const kept = id && drawn.get(id);
        drawn.delete(id);
        if (kept && kept.count === messages.length && messages.length) {   // drawn before and unchanged: put it back
            box.replaceChildren(...kept.keep.childNodes);
            box.scrollTop = box.scrollHeight;
            return;
        }
        if (!messages.length) { box.innerHTML = welcome(); return; }
        const qs = [];   // each answer's question, for the Expand button
        let lastQ = '';
        messages.forEach(m => { if (m.role === 'user') lastQ = m.content; qs.push(lastQ); });
        // the end of the chapter is what shows: draw it now, the earlier notes above it while the page is idle
        const split = Math.max(0, messages.length - 14);
        const tail = document.createDocumentFragment();
        messages.slice(split).forEach((m, i) => tail.appendChild(bubbleFor(m, qs[split + i])));
        box.replaceChildren(tail);
        box.scrollTop = box.scrollHeight;
        let end = split;
        const more = () => {
            if (!end || !box.isConnected || current?.id !== id) return;
            const start = Math.max(0, end - 10), frag = document.createDocumentFragment();
            messages.slice(start, end).forEach((m, i) => frag.appendChild(bubbleFor(m, qs[start + i])));
            const fromBottom = box.scrollHeight - box.scrollTop;
            box.prepend(frag);
            box.scrollTop = box.scrollHeight - fromBottom;   // the reader's place does not move
            end = start;
            if (end) idle(more);
        };
        if (end) idle(more);
    }
    // while a chapter we have never fetched is on its way: its name at once, and pencil lines where the notes will be
    function pending() {
        $('chat-messages').innerHTML = `<div class="reg-pending" aria-label="Opening the chapter">${'<i></i>'.repeat(5)}</div>`;
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
        const from = 0, to = dir > 0 ? -178 : 178;
        // the leaf starts flat over the page, so the next page is drawn underneath it after the first frames show
        requestAnimationFrame(() => requestAnimationFrame(swap));
        if (window.gsap) {
            return new Promise(res => gsap.fromTo(leaf, { rotateY: from, '--shade': 0 }, { rotateY: to, '--shade': 1, duration: 0.7, ease: 'power2.inOut', onComplete: () => { leaf.remove(); res(); } }));
        }
        return leaf.animate([{ transform: `perspective(1800px) rotateY(${from}deg)` }, { transform: `perspective(1800px) rotateY(${to}deg)` }], { duration: 700, easing: 'cubic-bezier(.65,0,.35,1)' }).finished.then(() => leaf.remove());
    }
    // a copy of the page flies somewhere (The Attic, the shelf) while the real page shows the next chapter
    function fly(kind, target) {
        if (calm()) return Promise.resolve();
        const p = page(), r = p.getBoundingClientRect(), ghost = p.cloneNode(false);
        // a light copy: the ribbon, the head and only the notes on screen, never the whole chapter
        const box = $('chat-messages'), shown = box.cloneNode(false), br = box.getBoundingClientRect();
        [...box.children].filter(n => { const b = n.getBoundingClientRect(); return b.bottom > br.top && b.top < br.bottom; }).slice(-8).forEach(n => shown.appendChild(n.cloneNode(true)));
        ghost.append(...[p.querySelector('.reg-ribbon'), p.querySelector('.reg-head')].filter(Boolean).map(n => n.cloneNode(true)), shown);
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
        return ghost.animate(frames, { duration: kind === 'tear' ? 900 : 720, easing: 'cubic-bezier(.55,0,.25,1)' }).finished.then(() => {
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
        const el = $('reg-elapsed'); if (el) el.textContent = clock(elapsed());   // the chapter's time is kept for the index
        nowTick();
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
    // the time now, with a little face whose hands move
    function nowTick() {
        const d = new Date(), t = $('reg-now'); if (!t) return;
        t.textContent = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
        t.dateTime = d.toISOString();
        const today = $('reg-today'); if (today) today.textContent = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
        const face = document.querySelector('.reg-face');
        if (face) {
            const sec = d.getSeconds(), min = d.getMinutes() + sec / 60, hr = (d.getHours() % 12) + min / 60;
            face.querySelector('.hh').style.transform = `rotate(${hr * 30}deg)`;
            face.querySelector('.mm').style.transform = `rotate(${min * 6}deg)`;
            face.querySelector('.ss').style.transform = `rotate(${sec * 6}deg)`;
        }
    }

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

    /* ── actions: everything moves at once; the server catches up in the background ── */
    function show(next) {
        // what we remembered of a chapter + its latest name, shelf state and time from the list
        const row = list.find(c => c.id === next.id);
        if (row) next = { ...next, title: row.title, archived: row.archived, elapsed_ms: Math.max(row.elapsed_ms || 0, next.elapsed_ms || 0), number: row.number || next.number };
        current = next; openId = next.id;
        renderHead(); renderMessages(next.messages || [], next.id); renderIndex(); startClock(next.elapsed_ms);
    }
    function load() {
        if (loading) return loading;   // boot asks twice: one load serves both
        loading = (async () => {
            try {
                const r = await api('GET', '/api/chats');
                list = r.chapters; openId = r.open; stats = r.stats || {};
                const first = await api('POST', `/api/chats/${openId}/open`);
                cache.set(first.id, first);
                show(first);
                // the chapters you are most likely to open next, fetched while nothing else is happening
                idle(() => list.filter(c => c.id !== openId).slice(0, 4).forEach(c => prefetch(c.id)));
            } catch (e) { console.warn('Register could not load:', e); }
            finally { setTimeout(() => { loading = null; }, 0); }
        })();
        return loading;
    }
    async function openChapter(id, dir = 1) {
        if (id === openId) { closeIndex(); return; }
        persist();   // the clock is saved in the background, never waited for
        stash();
        closeIndex();
        const row = list.find(c => c.id === id) || { id, number: 0, title: '', auto_title: '' };
        let next = cache.get(id);
        const wanted = next ? null : fetchFull(id);
        await turn(() => { if (next) show(next); else { current = { ...row, messages: [] }; openId = id; renderHead(); renderIndex(); pending(); startClock(row.elapsed_ms); } }, dir);
        if (!next) {
            try { next = await wanted; } catch (e) { Motion.toast(e.message, 'error'); return; }
            if (openId === id) show(next);
        } else {   // shown from memory: check quietly for notes written elsewhere since
            fetchFull(id).then(fresh => { if (openId === id && (fresh.messages || []).length !== (current.messages || []).length) show(fresh); }).catch(() => {});
        }
        api('POST', `/api/chats/${id}/open`).catch(() => { /* other devices learn next time */ });
    }
    // the chapter the next message belongs to: a brand-new one may still be on its way to the server
    const whenOpen = () => (creating || Promise.resolve(openId));
    async function newChapter() {
        if (document.body.dataset.section !== 'chat') switchSection('chat', { animate: true });
        const blankNow = !$('chat-messages')?.querySelector('.chat-bubble');   // what is on the page, not what was loaded
        if (current && blankNow && !current.archived && !creating) { closeIndex(); setTimeout(() => Motion.focusField($('chat-input')), 60); return; }   // already a fresh page
        persist();
        stash();
        closeIndex();
        const blank = { id: null, number: (list.length || 0) + 1, title: '', auto_title: '', created: new Date().toISOString(), archived: false, elapsed_ms: 0, messages: [] };
        current = blank; openId = null;   // the state moves now; the page is drawn under the turning leaf
        creating = api('POST', '/api/chats', {}).then(r => {
            list = r.chapters; const ch = r.chapter; cache.set(ch.id, ch);
            if (current === blank) { current = { ...ch, messages: [] }; openId = ch.id; renderHead(); renderIndex(); }
            return ch.id;
        }).catch(e => { Motion.toast(`Could not begin a new chapter: ${e.message}`, 'error'); return openId; }).finally(() => { creating = null; });
        await turn(() => { renderHead(); renderMessages([], current?.id || null); renderIndex(); startClock(0); });
        setTimeout(() => Motion.focusField($('chat-input')), 60);
    }
    async function archive() {
        if (!current?.id) return;
        const shelve = !current.archived, id = current.id;
        const row = list.find(c => c.id === id); if (row) row.archived = shelve;
        current.archived = shelve;
        api('PATCH', `/api/chats/${id}`, { archived: shelve }).catch(e => {   // put it back if the server says no
            if (row) row.archived = !shelve; Motion.toast(e.message, 'error'); renderIndex();
        });
        if (!shelve) { renderHead(); renderIndex(); Motion.toast('Back on the desk.', 'ok'); return; }
        const shelf = matchMedia('(max-width: 63.99rem)').matches ? $('reg-title') : document.querySelector('#reg-shelf summary');
        const flight = fly('shelf', shelf);   // the copy flies to the shelf while the real page shows the next chapter
        Motion.toast('On the archive shelf. Find it under Chapters → Archive shelf.', 'ok');
        const nextLive = list.find(c => !c.archived && c.id !== id);
        persist(); stash();
        if (nextLive) await showNow(nextLive.id); else await newChapterUnder();
        await flight;
    }
    // open a chapter without a page turn (the flying copy is the movement)
    async function showNow(id) {
        const row = list.find(c => c.id === id) || { id };
        let next = cache.get(id);
        if (next) show(next); else { current = { ...row, messages: [] }; openId = id; renderHead(); renderIndex(); pending(); startClock(row.elapsed_ms); }
        if (!next) { try { next = await fetchFull(id); if (openId === id) show(next); } catch (e) { Motion.toast(e.message, 'error'); } }
        api('POST', `/api/chats/${id}/open`).catch(() => {});
    }
    async function newChapterUnder() {
        const r = await api('POST', '/api/chats', {});
        list = r.chapters; cache.set(r.chapter.id, r.chapter); show(r.chapter);
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
        if (!gone.id) return;
        const attic = window.Tabs?.hidden?.('attic') ? null : (matchMedia('(max-width: 47.99rem)').matches ? $('nav-more') : $('nav-attic'));
        const flight = fly('tear', attic);
        cache.delete(gone.id); drawn.delete(gone.id);
        list = list.filter(c => c.id !== gone.id);
        const nextLive = list.find(c => !c.archived);
        const told = api('DELETE', `/api/chats/${gone.id}`);
        if (nextLive) await showNow(nextLive.id);
        try {
            const r = await told;
            list = r.chapters; renderIndex();
            if (!nextLive) await showNow(r.open);
            Motion.toast(`“${title(gone)}” is waiting in The Attic.`, 'ok');
            window.loadRecycleBin?.();
        } catch (e) { Motion.toast(`Could not tear it out: ${e.message}`, 'error'); load(); }
        await flight;
    }
    // Rename: the old name blots away, you write the new one on a dashed rule, and the nib inks it in
    function rename() {
        const btn = $('reg-title'); if (!current || !btn || !current.id) return;
        const head = btn.closest('.reg-head'), calm = Motion.calm();
        const box = document.createElement('span'); box.className = 'reg-rename';
        const input = document.createElement('input');
        input.className = 'reg-title-input'; input.value = current.title || ''; input.placeholder = current.auto_title || 'Name this chapter';
        input.setAttribute('aria-label', 'Chapter name'); input.setAttribute('aria-describedby', 'reg-rename-hint'); input.maxLength = 80; input.enterKeyHint = 'done';
        box.append(input, Object.assign(document.createElement('span'), { className: 'reg-rename-line' }));
        const swap = () => { btn.replaceWith(box); head.classList.add('is-renaming'); input.focus(); input.select(); };
        if (calm) swap();
        else btn.animate([{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(4px)', transform: 'translateY(2px)' }], { duration: 170, easing: 'ease-in' }).onfinish = swap;
        let done = false;
        const finish = async save => {
            if (done) return; done = true;
            const next = input.value.trim(), changed = save && next !== (current.title || '');
            box.replaceWith(btn); head.classList.remove('is-renaming');
            if (changed) {
                try { const m = await api('PATCH', `/api/chats/${current.id}`, { title: input.value }); current.title = m.title; const row = list.find(c => c.id === current.id); if (row) row.title = m.title; }
                catch (e) { Motion.toast(e.message, 'error'); }
            }
            renderHead(); renderIndex();
            if (changed) inkIn(btn); else if (!calm) btn.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
        };
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } });
        input.addEventListener('blur', () => finish(true));
    }
    // the new name is written in from left to right, the nib riding the edge of the ink, then a few drops spatter
    function inkIn(btn) {
        if (Motion.calm()) return;
        const w = btn.offsetWidth, dur = Math.min(1200, Math.max(460, btn.textContent.length * 48));
        btn.animate([{ clipPath: 'inset(-30% 100% -30% 0)' }, { clipPath: 'inset(-30% 0 -30% 0)' }], { duration: dur, easing: 'cubic-bezier(0.45, 0.05, 0.3, 1)' });
        const nib = btn.parentElement.querySelector('.reg-title-nib');
        nib?.animate([
            { opacity: 0, transform: 'translate(0, 4px) rotate(0deg)' },
            { opacity: 1, transform: 'translate(0, 0) rotate(-6deg)', offset: 0.08 },
            { opacity: 1, transform: `translate(${w * 0.5}px, -2px) rotate(4deg)`, offset: 0.5 },
            { opacity: 1, transform: `translate(${w}px, 0) rotate(-4deg)`, offset: 0.92 },
            { opacity: 0, transform: `translate(${w + 10}px, -10px) rotate(-20deg)` },
        ], { duration: dur + 160, easing: 'cubic-bezier(0.45, 0.05, 0.3, 1)' });
        setTimeout(() => {
            const r = btn.getBoundingClientRect();
            for (let i = 0; i < 6; i++) {
                const d = document.createElement('i'); d.className = 'reg-ink-drop';
                Object.assign(d.style, { left: `${r.right - 2}px`, top: `${r.top + r.height * 0.55}px` });
                document.body.appendChild(d);
                const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, dist = 10 + Math.random() * 18, s = 0.5 + Math.random() * 0.8;
                d.animate([{ transform: 'translate(0, 0) scale(1)', opacity: 0.9 }, { transform: `translate(${Math.cos(a) * dist}px, ${Math.sin(a) * dist + 8}px) scale(${s})`, opacity: 0 }], { duration: 520 + Math.random() * 240, easing: 'cubic-bezier(0.2, 0.8, 0.4, 1)' }).onfinish = () => d.remove();
            }
        }, dur * 0.92);
    }
    // after a message lands: counts, first-question titles and order refresh without reloading the page
    async function touch() {
        if (current?.id) { cache.delete(current.id); idle(() => prefetch(current?.id)); }
        try { const r = await api('GET', '/api/chats'); list = r.chapters; stats = r.stats || {}; current = { ...current, ...(list.find(c => c.id === current.id) || {}) }; renderIndex(); renderHead(); } catch (e) { /* the next action refreshes */ }
    }

    // phones: the index is a drawer
    function openIndex() { $('register').classList.add('index-open'); if (!Motion.focusField($('reg-search'))) $('reg-list')?.querySelector('button')?.focus({ preventScroll: true }); }
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
            const rn = e.target.closest('[data-rename-id]');
            if (rn) { const id = rn.dataset.renameId; (current?.id === id ? Promise.resolve() : openChapter(id)).then(() => { closeIndex?.(); setTimeout(rename, Motion.calm() ? 0 : 260); }); return; }
            const o = e.target.closest('[data-open]'); if (o) { openChapter(o.dataset.open); return; }
            const b = e.target.closest('[data-reg]'); if (!b) return;
            ({ new: newChapter, archive, delete: () => tearOut(b), rename, sw: () => sw.toggle(), 'sw-reset': () => sw.reset(), index: openIndex, 'close-index': closeIndex })[b.dataset.reg]?.();
        });
        // a hover, a touch or a keyboard focus on a chapter fetches it, so the click finds it ready
        ['pointerenter', 'focusin', 'touchstart'].forEach(ev => reg.addEventListener(ev, e => { const o = e.target.closest?.('[data-open]'); if (o) prefetch(o.dataset.open); }, { passive: true, capture: ev === 'pointerenter' }));
        $('reg-search')?.addEventListener('input', e => { query = e.target.value.trim(); renderIndex(); });
        $('reg-timebar')?.addEventListener('click', e => { const b = e.target.closest('[data-reg]'); if (b?.dataset.reg === 'sw') sw.toggle(); if (b?.dataset.reg === 'sw-reset') sw.reset(); });
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

    // the composer's hint fits on one line: a shorter one on narrow pages
    (() => {
        const input = document.getElementById('chat-input');
        if (!input || !window.ResizeObserver) return;
        new ResizeObserver(() => { if (input.clientWidth) input.placeholder = input.clientWidth < 250 ? 'Write a question…' : 'Write an interview question…'; }).observe(input);
    })();

    return {
        load, newChapter, write, decorateUser, touch, renderAtelier,
        openId: () => openId,
        whenOpen,
        takeLap: () => sw.take(),
        stats: () => ({ messages: stats.messages ?? 0, minutes: Math.round((stats.elapsed_ms || 0) / 60000), chapters: stats.chapters ?? list.length }),
    };
})();
window.Register = Register;
