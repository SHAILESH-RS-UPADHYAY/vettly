/**
 * Brain Bento: five bite-sized concepts a day, from the user's own field. The packs come from the profile: tech keeps
 * the curated tracks in bento-data.js (plus interview craft); every other field gets its own packs from
 * bento-fields.js, so a nurse, an MBA student or a marketer sees their own ideas with no AI and no network.
 * "Fresh today" adds six AI-written ones on request (never on page load, so opening the page spends nothing).
 * Today's box is seeded by the date and the chosen track, so it stays the same all day; lessons that match the
 * learner's Toolbelt skills move to the front. The pond above it holds every topic, floating and bouncing; tapping one
 * grows it into the lesson. Progress and the streak live in localStorage. Ask Mentor pins the lesson (mentor.js).
 */
const Bento = (() => {
    const KEY = 'vettly_bento';
    const BLANK = { done: {}, streak: 0, last: '', lang: 'en', track: 'all' };
    const state = (() => { try { return { ...BLANK, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { return { ...BLANK }; } })();
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage blocked: progress lasts this visit */ } };
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const day = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toLocaleDateString('en-CA'); };
    const doneToday = () => state.done[day()] || [];
    const text = l => ({ ...l.en, ...(state.lang === 'hi' ? l.hi : {}) });   // Hinglish where written, English for the rest
    const FRESH = { name: 'Fresh today', tone: 'asg', icon: 'sparkle' };
    let openId = null, uid = 0, ready = false, profile = {}, packs = null, fresh = null, TRACKS = {}, LESSONS = [];
    const find = id => LESSONS.find(l => l.id === id);

    // ── Which packs: from the profile's field and role ──
    function build() {
        packs = typeof bentoPacksFor === 'function' ? bentoPacksFor(profile.field, profile.role) : null;
        const craft = typeof FIELD_LESSONS !== 'undefined' ? FIELD_LESSONS.filter(l => l.track === 'craft') : [];
        if (packs === null) {
            TRACKS = { ...BENTO_TRACKS, ...(craft.length ? { craft: FIELD_TRACKS.craft } : {}) };
            LESSONS = [...BENTO_LESSONS, ...craft];
        } else {
            TRACKS = Object.fromEntries(packs.map(p => [p, FIELD_TRACKS[p]]));
            LESSONS = FIELD_LESSONS.filter(l => packs.includes(l.track));
        }
        if (fresh?.length) { TRACKS.fresh = FRESH; LESSONS.push(...fresh); }
        if (state.track !== 'all' && !TRACKS[state.track]) state.track = 'all';
        if (openId && !find(openId)) openId = null;
    }
    const primary = () => (packs ? packs[0] : null);

    // a small seeded generator, so the box is the same every time today
    function seeded(seed) {
        let h = 2166136261;
        for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
        return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    }
    function learnerWords() {
        const c = typeof contextData !== 'undefined' ? contextData : {};
        return [...(c.skills?.tags || []), c.skills?.strongest, c.skills?.learning, c.assignment?.title, c.assignment?.description, profile.role].filter(Boolean).join(' ').toLowerCase();
    }
    // the field's own pack (and anything fresh) leads Chef's Choice; interview craft fills in
    const weight = l => (l.track === 'fresh' ? 0.45 : l.track === primary() ? 0.6 : 1);
    function shuffled(seed, pool) {
        const rnd = seeded(seed);
        return pool.map(l => ({ l, r: rnd() * (state.track === 'all' ? weight(l) : 1) })).sort((a, b) => a.r - b.r).map(x => x.l);
    }
    function todaysBox() {
        const pool = LESSONS.filter(l => state.track === 'all' || l.track === state.track);
        const list = shuffled(day() + state.track + (primary() || 'tech'), pool);
        const words = learnerWords();
        const fit = l => (l.keys || []).filter(k => words.includes(k)).length;
        const forYou = words ? list.filter(l => fit(l) > 0).sort((a, b) => fit(b) - fit(a)).slice(0, 2) : [];
        return [...forYou, ...list.filter(l => !forYou.includes(l))].slice(0, 5).map(l => ({ l, forYou: forYou.includes(l) }));
    }

    // ── Diagrams: SVG drawn from the lesson's data, animated by bento.css ──
    function wrap(label, max) {
        const words = label.split(' '), lines = [''];
        words.forEach(w => { const cur = lines[lines.length - 1]; if ((cur + ' ' + w).trim().length > max && cur) lines.push(w); else lines[lines.length - 1] = (cur + ' ' + w).trim(); });
        return lines.slice(0, 3);
    }
    const label = (x, y, txt, max) => {
        const ls = wrap(txt, max);
        return `<text x="${x}" y="${y - (ls.length - 1) * 8}" text-anchor="middle">${ls.map((s, i) => `<tspan x="${x}" dy="${i ? 16 : 0}">${esc(s)}</tspan>`).join('')}</text>`;
    };
    function flow(nodes) {
        const id = `dg${++uid}`, n = nodes.length;
        const W = 150, H = 66, G = 42;
        const hw = n * W + (n - 1) * G, hPath = `M ${W / 2} ${H / 2 + 10} H ${hw - W / 2}`;
        const horiz = nodes.map((t, i) => `<g class="dg-node" style="--i:${i}"><rect x="${i * (W + G)}" y="10" width="${W}" height="${H}" rx="14"/>${label(i * (W + G) + W / 2, 10 + H / 2 + 5, t, 16)}</g>`).join('')
            + nodes.slice(1).map((_, i) => `<path class="dg-link" style="--i:${i}" d="M ${i * (W + G) + W + 4} ${10 + H / 2} h ${G - 10}" marker-end="url(#${id}h)"/>`).join('');
        const VW = 260, VH = 52, VG = 28, vh = n * VH + (n - 1) * VG, vPath = `M ${VW / 2} ${VH / 2} V ${vh - VH / 2}`;
        const vert = nodes.map((t, i) => `<g class="dg-node" style="--i:${i}"><rect x="10" y="${i * (VH + VG)}" width="${VW - 20}" height="${VH}" rx="13"/>${label(VW / 2, i * (VH + VG) + VH / 2 + 5, t, 26)}</g>`).join('')
            + nodes.slice(1).map((_, i) => `<path class="dg-link" style="--i:${i}" d="M ${VW / 2} ${i * (VH + VG) + VH + 3} v ${VG - 8}" marker-end="url(#${id}v)"/>`).join('');
        const marker = m => `<defs><marker id="${id}${m}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="dg-arrow"/></marker></defs>`;
        return `<svg class="dg dg-h" viewBox="0 0 ${hw} ${H + 20}" role="img" aria-label="${esc(nodes.join(', then '))}">${marker('h')}${horiz}<circle class="dg-packet" r="6" style="offset-path: path('${hPath}')"/></svg>`
            + `<svg class="dg dg-v" viewBox="0 0 ${VW} ${vh}" role="img" aria-label="${esc(nodes.join(', then '))}">${marker('v')}${vert}<circle class="dg-packet" r="6" style="offset-path: path('${vPath}')"/></svg>`;
    }
    function cycle(nodes) {
        const id = `dg${++uid}`, n = nodes.length, C = 170, R = 112;
        const pos = i => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [C + R * Math.cos(a), C + R * Math.sin(a)]; };
        const arcs = nodes.map((_, i) => {
            const a1 = -Math.PI / 2 + ((i + 0.28) * 2 * Math.PI) / n, a2 = -Math.PI / 2 + ((i + 0.72) * 2 * Math.PI) / n;
            return `<path class="dg-link" style="--i:${i}" d="M ${C + R * Math.cos(a1)} ${C + R * Math.sin(a1)} A ${R} ${R} 0 0 1 ${C + R * Math.cos(a2)} ${C + R * Math.sin(a2)}" marker-end="url(#${id})"/>`;
        }).join('');
        const boxes = nodes.map((t, i) => { const [x, y] = pos(i); return `<g class="dg-node" style="--i:${i}"><rect x="${x - 64}" y="${y - 25}" width="128" height="50" rx="14"/>${label(x, y + 5, t, 15)}</g>`; }).join('');
        return `<svg class="dg dg-cycle" viewBox="0 0 340 340" role="img" aria-label="${esc(nodes.join(', then ') + ', and around again')}">
            <defs><marker id="${id}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" class="dg-arrow"/></marker></defs>
            <circle class="dg-orbit" cx="${C}" cy="${C}" r="${R}"/>${arcs}${boxes}
            <circle class="dg-packet dg-packet-loop" r="6" style="offset-path: path('M ${C} ${C - R} A ${R} ${R} 0 1 1 ${C - 0.01} ${C - R}')"/></svg>`;
    }
    function layers(nodes) {
        const n = nodes.length, W = 340, H = 48, G = 14, h = n * H + (n - 1) * G;
        return `<svg class="dg dg-layers" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(nodes.join(', then '))}">`
            + nodes.map((t, i) => { const inset = Math.min(i * 10, 40); return `<g class="dg-node dg-layer" style="--i:${i}"><rect x="${inset}" y="${i * (H + G)}" width="${W - inset * 2}" height="${H}" rx="12"/>${label(W / 2, i * (H + G) + H / 2 + 5, t, 34)}</g>`; }).join('')
            + `</svg>`;
    }
    function compare(d) {
        return `<div class="dg-compare">${[d.left, d.right].map((col, k) => `<div class="dg-col" style="--i:${k}"><h4>${esc(col[0])}</h4><ul>${col.slice(1).map((p, i) => `<li style="--i:${i + k * 2}">${esc(p)}</li>`).join('')}</ul></div>`).join('<span class="dg-vs" aria-hidden="true">vs</span>')}</div>`;
    }
    const diagram = d => d.type === 'compare' ? compare(d) : d.type === 'cycle' ? cycle(d.nodes) : d.type === 'layers' ? layers(d.nodes) : flow(d.nodes);

    // ── Rendering ──
    function ring(done) {
        const C = 2 * Math.PI * 22;
        return `<svg class="bento-ring" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="22"/><circle class="ring-fill" cx="26" cy="26" r="22" style="stroke-dasharray:${C};stroke-dashoffset:${C * (1 - done / 5)}"/></svg>`;
    }
    function renderBar(page) {
        const done = Math.min(doneToday().length, 5);
        const when = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
        page.querySelector('[data-bento-date]').textContent = when;
        page.querySelector('[data-bento-progress]').innerHTML = `${ring(done)}<span><b class="num">${done}</b> of 5 eaten today</span>`;
        page.querySelector('[data-bento-streak]').innerHTML = `<svg aria-hidden="true"><use href="#i-fire"/></svg><b class="num">${state.streak}</b> day streak`;
        const chips = [['all', { name: "Chef's Choice", icon: 'sparkle' }], ...Object.entries(TRACKS)];
        // with subjects in the Toolbelt the six can be dealt again: a different handful of subjects each time
        const freshBtn = fresh?.length ? (profile.subjects?.length ? `<button type="button" class="chip bento-fresh" data-fresh="again"><svg aria-hidden="true"><use href="#i-refresh"/></svg>Shuffle six more from your subjects</button>` : '') : `<button type="button" class="chip bento-fresh" data-fresh><svg aria-hidden="true"><use href="#i-wand"/></svg>Write six fresh ones${profile.role ? ` for ${esc(profile.role)}` : ''}</button>`;
        page.querySelector('[data-bento-track]').innerHTML = chips.map(([k, tr]) => `<button type="button" class="chip" data-v="${k}"${tr.tone ? ` data-tone="${tr.tone}"` : ''} aria-pressed="${k === state.track}"><svg aria-hidden="true"><use href="#i-${tr.icon}"/></svg>${esc(tr.name)}</button>`).join('') + freshBtn;
        const lang = page.querySelector('#bento-lang');
        if (lang) { lang.checked = state.lang === 'hi'; lang.closest('label').hidden = !LESSONS.some(l => l.hi); }
        const sub = page.querySelector('[data-bento-sub]');
        if (sub) sub.textContent = packs ? `Five bite-sized ideas from ${TRACKS[primary()].name.toLowerCase()}, packed fresh every morning` : 'Five bite-sized concepts, packed fresh every morning';
    }
    function renderBox(page) {
        const done = doneToday();
        page.querySelector('#bento-box').innerHTML = todaysBox().map(({ l, forYou }, i) => {
            const t = text(l), tr = TRACKS[l.track];
            const isDone = done.includes(l.id);
            return `<button type="button" class="bento-cell${isDone ? ' is-done' : ''}" data-id="${l.id}" data-tone="${tr.tone}" style="--i:${i}" aria-pressed="${openId === l.id}">
                <span class="cell-lid" aria-hidden="true"></span>
                <span class="cell-top"><span class="cell-no num">${i + 1}</span><span class="cell-track"><svg aria-hidden="true"><use href="#i-${tr.icon}"/></svg>${esc(tr.name)}</span></span>
                <span class="cell-title">${esc(t.title)}</span>
                <span class="cell-hook">${esc(t.hook)}</span>
                ${i === 0 && t.analogy ? `<span class="cell-quote">${esc(t.analogy)}</span>` : ''}
                <span class="cell-foot"><span class="cell-time">3 min</span>${forYou ? '<span class="cell-for">For your role</span>' : ''}${isDone ? '<span class="cell-done"><svg aria-hidden="true"><use href="#i-check-bold"/></svg>Learned</span>' : ''}</span>
            </button>`;
        }).join('');
    }
    function related(l) {
        const bank = (typeof prep !== 'undefined' && prep.entries) || [];
        return bank.map((e, i) => ({ e, n: i + 1 }))
            .filter(({ e }) => { const hay = `${e.question} ${(e.keywords || []).join(' ')}`.toLowerCase(); return (l.keys || []).some(k => hay.includes(k)); })
            .slice(0, 2);
    }
    function renderLesson(page, focus) {
        const panel = page.querySelector('#bento-lesson');
        const l = find(openId);
        if (!l) { panel.hidden = true; return; }
        const t = text(l), tr = TRACKS[l.track];
        const isDone = doneToday().includes(l.id);
        const rel = related(l);
        const follow = Array.isArray(t.follow) ? t.follow.filter(Boolean) : [];
        panel.hidden = false;
        panel.dataset.tone = tr.tone;
        panel.dataset.trackName = tr.name;
        panel._question = t.q;
        panel._answer = `${t.a}\n\n${t.body}`;
        panel.innerHTML = `
            <header class="lesson-head">
                <span class="tone-pill" data-tone="${tr.tone}"><svg aria-hidden="true"><use href="#i-${tr.icon}"/></svg>${esc(tr.name)}</span>
                <h2 class="lesson-title" tabindex="-1">${esc(t.title)}</h2>
                <p class="lesson-hook">${esc(t.hook)}</p>
                <button type="button" class="btn btn-ghost btn-icon lesson-close" data-close aria-label="Close the lesson"><svg aria-hidden="true"><use href="#i-x-bold"/></svg></button>
            </header>
            ${l.diagram ? `<figure class="lesson-diagram" data-tone="${tr.tone}">${diagram(l.diagram)}</figure>` : ''}
            <div class="lesson-grid">
                <section class="lesson-block"><h3><svg aria-hidden="true"><use href="#i-books"/></svg>In plain words</h3><p>${esc(t.body)}</p></section>
                ${t.analogy ? `<section class="lesson-block lesson-analogy"><h3><svg aria-hidden="true"><use href="#i-bulb"/></svg>Picture it</h3><p>${esc(t.analogy)}</p></section>` : ''}
            </div>
            <section class="lesson-block lesson-interview">
                <h3><svg aria-hidden="true"><use href="#i-chats"/></svg>Say it in the interview</h3>
                <p class="lesson-q">${esc(t.q)}</p>
                <button type="button" class="q-reveal" data-reveal><svg aria-hidden="true"><use href="#i-sparkle"/></svg>Reveal a model answer</button>
                <p class="lesson-a" hidden>${esc(t.a)}</p>
            </section>
            ${follow.length ? `<section class="lesson-block">
                <h3><svg aria-hidden="true"><use href="#i-lightning"/></svg>They might ask next</h3>
                <div class="lesson-follow">${follow.map(f => `<button type="button" class="chip" data-follow="${esc(f)}"><svg aria-hidden="true"><use href="#i-chats"/></svg>${esc(f)}</button>`).join('')}</div>
            </section>` : ''}
            ${rel.length ? `<section class="lesson-block"><h3><svg aria-hidden="true"><use href="#i-target"/></svg>From your Prep bank</h3><div class="lesson-related">${rel.map(({ e, n }) => `<button type="button" class="lesson-rel" data-jump="${n}"><span class="badge-pill q-no">Q${n}</span><span>${esc(e.question)}</span></button>`).join('')}</div></section>` : ''}
            <footer class="lesson-actions">
                <button type="button" class="btn btn-secondary prep-btn-mentor" data-ask><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#mentor-mark"/></svg>Ask Mentor</button>
                <button type="button" class="btn btn-primary" data-done${isDone ? ' disabled' : ''}><svg aria-hidden="true"><use href="#i-check-bold"/></svg>${isDone ? 'Learned today' : 'Mark as learned'}</button>
            </footer>`;
        if (focus) requestAnimationFrame(() => panel.scrollIntoView({ behavior: Motion.calm() ? 'auto' : 'smooth', block: 'start' }));
    }
    function renderMenu(page) {
        const done = new Set(Object.values(state.done).flat());
        page.querySelector('#bento-menu-list').innerHTML = Object.entries(TRACKS).map(([k, tr]) => `
            <div class="menu-track" data-tone="${tr.tone}"><h3><svg aria-hidden="true"><use href="#i-${tr.icon}"/></svg>${esc(tr.name)}</h3>
            ${LESSONS.filter(l => l.track === k).map(l => `<button type="button" class="menu-item" data-open="${l.id}">${done.has(l.id) ? '<svg aria-hidden="true"><use href="#i-check-bold"/></svg>' : '<i aria-hidden="true"></i>'}${esc(text(l).title)}</button>`).join('')}</div>`).join('');
    }
    function render() {
        const page = document.getElementById('page-bento');
        if (!page || !ready) return;
        renderBar(page);
        renderBox(page);
        renderLesson(page, false);
        renderMenu(page);
        Pond.fill();
    }

    // ── The pond: every topic floating, drifting and bouncing off the walls and each other ──
    const Pond = (() => {
        let water, items = [], raf = 0, last = 0, W = 0, H = 0, pointer = null, seen = false, stir = 0, mounted = false, lastW = 0;
        const still = () => Motion.calm();
        const pick = () => {
            const pool = LESSONS.filter(l => state.track === 'all' || l.track === state.track);
            const done = new Set(Object.values(state.done).flat()), box = new Set(todaysBox().map(x => x.l.id));
            const mixed = shuffled(day() + 'pond' + stir, pool);
            return [...mixed.filter(l => !done.has(l.id)), ...mixed.filter(l => done.has(l.id))].map(l => ({ l, done: done.has(l.id), today: box.has(l.id) }));
        };
        function fill() {
            water = document.querySelector('#bento-pond [data-pond]');
            if (!water) return;
            mount();
            const hint = document.querySelector('#bento-pond [data-pond-hint]');
            if (hint) hint.textContent = state.track === 'all' ? 'Every topic, floating free. Tap one to open it.' : `Every topic in ${TRACKS[state.track].name}. Tap one to open it.`;
            const list = pick();
            water.innerHTML = list.map(({ l, done, today }, i) => {
                const tr = TRACKS[l.track];
                return `<button type="button" class="pond-bubble${done ? ' is-done' : ''}${today ? ' is-today' : ''}" data-pond-open="${l.id}" data-tone="${tr.tone}" style="--i:${i};--bob:${(2.6 + ((i * 37) % 19) / 10).toFixed(1)}s">
                    <span class="pb-bob"><span class="pb-face"><svg aria-hidden="true"><use href="#i-${done ? 'check-bold' : tr.icon}"/></svg><span class="pb-t">${esc(text(l).title)}</span>${done ? '<span class="sr-only">(learned)</span>' : ''}</span></span></button>`;
            }).join('');
            water.classList.toggle('is-still', still());
            layout();
        }
        // keep as many bubbles as sit comfortably in the water, placed so they start apart
        function layout() {
            cancelAnimationFrame(raf); raf = 0;
            if (still()) { items = []; return; }
            W = water.clientWidth; H = water.clientHeight; lastW = W;
            if (!W || !H) { items = []; return; }
            const all = [...water.children].map(el => ({ el, w: el.offsetWidth, h: el.offsetHeight }));
            const budget = W * H * (W < 520 ? 0.5 : 0.4);
            let used = 0;
            items = [];
            for (const b of all) {
                if (used + b.w * b.h > budget || b.w > W - 8) { b.el.remove(); continue; }
                used += b.w * b.h; items.push(b);
            }
            const rnd = seeded(day() + stir + W);
            const free = (x, y, b) => items.every(o => o === b || o.x === undefined || x + b.w + 6 < o.x || o.x + o.w + 6 < x || y + b.h + 6 < o.y || o.y + o.h + 6 < y);
            items.forEach(b => {
                let x, y, tries = 0;
                do { x = rnd() * (W - b.w); y = rnd() * (H - b.h); } while (!free(x, y, b) && ++tries < 40);
                const a = rnd() * Math.PI * 2, sp = 14 + rnd() * 18;
                Object.assign(b, { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, cruise: sp, held: false });
                b.el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
                b.el._b = b;
            });
            run();
        }
        function squash(b, axis, speed) {
            if (speed < 18 || b.squashing) return;
            b.squashing = true;
            const s = Math.min(0.16, speed / 900);
            const k = axis === 'x' ? [`scale(${1 - s}, ${1 + s * 0.6})`] : [`scale(${1 + s * 0.6}, ${1 - s})`];
            const a = b.el.querySelector('.pb-face').animate([{ transform: 'none' }, { transform: k[0] }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
            a.onfinish = a.oncancel = () => { b.squashing = false; };
        }
        function step(t) {
            raf = 0;
            if (!seen || document.hidden || !items.length) { last = 0; return; }
            const dt = Math.min(0.04, (t - (last || t)) / 1000); last = t;
            for (const b of items) {
                if (b.held) continue;
                // near the cursor a bubble slows right down, so it is easy to catch; away from it, a lazy drift
                const near = pointer ? Math.max(0, 1 - Math.hypot(b.x + b.w / 2 - pointer.x, b.y + b.h / 2 - pointer.y) / 160) : 0;
                const sp = Math.hypot(b.vx, b.vy) || 1, goal = b.cruise * (1 - near * 0.9);
                const k = 1 + (goal / sp - 1) * Math.min(1, dt * (near ? 6 : 1.2));
                b.vx *= k; b.vy *= k;
                b.x += b.vx * dt; b.y += b.vy * dt;
                if (b.x < 0) { b.x = 0; squash(b, 'x', Math.abs(b.vx)); b.vx = Math.abs(b.vx); }
                else if (b.x + b.w > W) { b.x = W - b.w; squash(b, 'x', Math.abs(b.vx)); b.vx = -Math.abs(b.vx); }
                if (b.y < 0) { b.y = 0; squash(b, 'y', Math.abs(b.vy)); b.vy = Math.abs(b.vy); }
                else if (b.y + b.h > H) { b.y = H - b.h; squash(b, 'y', Math.abs(b.vy)); b.vy = -Math.abs(b.vy); }
            }
            for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {   // bump, part, bounce
                const a = items[i], c = items[j];
                const ox = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x), oy = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y);
                if (ox <= 0 || oy <= 0 || (a.held && c.held)) continue;
                const ax = ox < oy, sa = a.held ? 0 : c.held ? 1 : 0.5, sc = 1 - sa;
                if (ax) {
                    const dir = a.x + a.w / 2 < c.x + c.w / 2 ? -1 : 1;
                    a.x += dir * ox * sa; c.x -= dir * ox * sc;
                    if ((c.vx - a.vx) * dir > 0) { const v = a.vx; if (!a.held) a.vx = c.held ? -a.vx : c.vx; if (!c.held) c.vx = a.held ? -c.vx : v; }
                } else {
                    const dir = a.y + a.h / 2 < c.y + c.h / 2 ? -1 : 1;
                    a.y += dir * oy * sa; c.y -= dir * oy * sc;
                    if ((c.vy - a.vy) * dir > 0) { const v = a.vy; if (!a.held) a.vy = c.held ? -a.vy : c.vy; if (!c.held) c.vy = a.held ? -c.vy : v; }
                }
            }
            for (const b of items) {
                b.x = Math.max(0, Math.min(W - b.w, b.x)); b.y = Math.max(0, Math.min(H - b.h, b.y));
                b.el.style.transform = `translate3d(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px, 0)`;
            }
            raf = requestAnimationFrame(step);
        }
        function run() { if (!raf && seen && !document.hidden && items.length) { last = 0; raf = requestAnimationFrame(step); } }

        function mount() {
            if (mounted) return;
            mounted = true;
            const pond = document.getElementById('bento-pond');
            new IntersectionObserver(([e]) => { seen = e.isIntersecting; run(); }).observe(water);
            document.addEventListener('visibilitychange', run);
            let t;
            new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => { if (water.clientWidth && Math.abs(water.clientWidth - lastW) > 24) fill(); else { W = water.clientWidth; H = water.clientHeight; } }, 180); }).observe(water);
            const local = e => { const r = water.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
            water.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') pointer = local(e); });
            water.addEventListener('pointerleave', () => { pointer = null; });
            // hovering or focusing a bubble holds it still so it can be read and clicked
            const hold = (e, on) => { const b = e.target.closest?.('.pond-bubble')?._b; if (b) { b.held = on; if (!on) { b.vx = (Math.random() - 0.5) * b.cruise * 2; b.vy = (Math.random() - 0.5) * b.cruise * 2; } } };
            water.addEventListener('pointerover', e => { if (e.pointerType === 'mouse') hold(e, true); });
            water.addEventListener('pointerout', e => { if (e.pointerType === 'mouse' && !e.target.closest('.pond-bubble')?.contains(e.relatedTarget)) hold(e, false); });
            water.addEventListener('focusin', e => hold(e, true));
            water.addEventListener('focusout', e => hold(e, false));
            // a finger on a bubble holds it for the tap; a tap on open water sends a ripple and nearby bubbles bounce away
            water.addEventListener('pointerdown', e => {
                if (e.target.closest('.pond-bubble')) { if (e.pointerType !== 'mouse') { hold(e, true); const b = e.target.closest('.pond-bubble'); setTimeout(() => { if (document.activeElement !== b && b._b) b._b.held = false; }, 900); } return; }
                if (still()) return;
                const p = local(e);
                items.forEach(b => {
                    const dx = b.x + b.w / 2 - p.x, dy = b.y + b.h / 2 - p.y, d = Math.hypot(dx, dy) || 1;
                    if (d < 220) { const f = (1 - d / 220) * 260; b.vx += (dx / d) * f; b.vy += (dy / d) * f; }
                });
                const ring = document.createElement('span');
                ring.className = 'pond-ripple'; ring.style.left = `${p.x}px`; ring.style.top = `${p.y}px`;
                water.append(ring); setTimeout(() => ring.remove(), 900);
            });
            pond.addEventListener('click', e => {
                const b = e.target.closest('[data-pond-open]');
                if (b) grow(b);
                else if (e.target.closest('[data-pond-stir]')) { stir++; fill(); }
            });
        }

        // the tapped bubble grows into the lesson card
        function grow(btn) {
            const id = btn.dataset.pondOpen, from = btn.getBoundingClientRect();
            const page = document.getElementById('page-bento'), panel = page.querySelector('#bento-lesson');
            openId = id;
            page.querySelectorAll('.bento-cell').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.id === openId)));
            renderLesson(page, false);
            water.querySelectorAll('.pond-bubble').forEach(b => b.classList.toggle('is-open', b === btn));
            panel.querySelector('.lesson-title')?.focus({ preventScroll: true });
            // glide the page so the lesson lands near the top, and fly the bubble to exactly where it will land
            const r0 = panel.getBoundingClientRect();
            let scroller = panel.parentElement;
            while (scroller && scroller !== document.body && !(/(auto|scroll)/.test(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight)) scroller = scroller.parentElement;
            if (!scroller || scroller === document.body) scroller = document.scrollingElement;
            const top0 = scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top;
            const needs = r0.top < top0 || r0.top > innerHeight * 0.45;
            const max = scroller.scrollHeight - scroller.clientHeight;
            const target = needs ? Math.max(0, Math.min(max, scroller.scrollTop + r0.top - top0 - 16)) : scroller.scrollTop;
            const to = { left: r0.left, width: r0.width, top: r0.top - (target - scroller.scrollTop), height: r0.height };
            if (still()) { if (needs) scroller.scrollTo({ top: target, behavior: 'auto' }); return; }
            if (needs) scroller.scrollTo({ top: target, behavior: 'smooth' });
            const ghost = document.createElement('div');
            ghost.className = 'pond-ghost'; ghost.dataset.tone = btn.dataset.tone; ghost.setAttribute('aria-hidden', 'true');
            ghost.innerHTML = `<span>${esc(btn.querySelector('.pb-t').textContent)}</span>`;
            document.body.append(ghost);
            const end = { left: `${to.left}px`, top: `${Math.max(to.top, 8)}px`, width: `${to.width}px`, height: `${Math.min(to.height, innerHeight - Math.max(to.top, 8) - 8)}px` };
            panel.style.opacity = '0';
            const a = ghost.animate([
                { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, borderRadius: '999px' },
                { offset: 0.35, left: `${from.left - 6}px`, top: `${from.top - 10}px`, width: `${from.width + 12}px`, height: `${from.height + 8}px`, borderRadius: '999px' },
                { ...end, borderRadius: '22px' },
            ], { duration: 620, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'forwards' });
            a.onfinish = () => {
                panel.style.opacity = '';
                panel.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
                ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' }).onfinish = () => ghost.remove();
            };
        }
        return { fill };
    })();

    function open(id) {
        openId = openId === id ? null : id;
        const page = document.getElementById('page-bento');
        page.querySelectorAll('.bento-cell').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.id === openId)));
        page.querySelectorAll('.pond-bubble').forEach(b => b.classList.toggle('is-open', b.dataset.pondOpen === openId));
        const cell = page.querySelector(`.bento-cell[data-id="${id}"]`);
        if (openId && cell && !Motion.calm()) cell.animate([{ transform: 'none' }, { transform: 'translateY(-10px) scale(1.03) rotate(-1deg)' }, { transform: 'none' }], { duration: 520, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
        renderLesson(page, Boolean(openId));
    }
    function markDone(btn) {
        const today = day();
        const list = state.done[today] || (state.done[today] = []);
        if (list.includes(openId)) return;
        list.push(openId);
        if (state.last !== today) { state.streak = state.last === day(-1) ? state.streak + 1 : 1; state.last = today; }
        save();
        Motion.burst(btn, 18, ['var(--ok)', 'var(--accent)', 'var(--c-sys)', 'var(--c-beh)']);
        const page = document.getElementById('page-bento');
        const box = todaysBox();
        if (box.every(({ l }) => list.includes(l.id))) page.querySelectorAll('.bento-cell').forEach((c, i) => setTimeout(() => Motion.burst(c, 14), i * 120));
        const next = box.find(({ l }) => !list.includes(l.id));
        renderBar(page); renderBox(page); renderMenu(page);
        const bubble = page.querySelector(`.pond-bubble[data-pond-open="${openId}"]`);
        if (bubble) { bubble.classList.add('is-done'); bubble.querySelector('use')?.setAttribute('href', '#i-check-bold'); }
        if (next) setTimeout(() => open(next.l.id), 700); else { openId = null; renderLesson(page, false); }
    }

    // ── Fresh today: six concepts the AI writes for this role, only when asked ──
    function setFresh(lessons) {
        fresh = lessons.filter(l => l?.en?.title).map(l => ({ ...l, track: 'fresh', keys: l.keys || [] }));
        build();
    }
    async function writeFresh(btn) {
        btn.disabled = true; btn.classList.add('is-busy');
        const was = btn.innerHTML;
        btn.innerHTML = '<svg aria-hidden="true"><use href="#i-wand"/></svg>Writing six for you…';
        try {
            const d = await (await fetch(`${API_BASE}/api/bento/field${btn.dataset.fresh === 'again' ? '?again=1' : ''}`)).json();
            if (!d.lessons?.length) throw new Error(d.error || "Couldn't write fresh ones just now. Today's box still has plenty.");
            setFresh(d.lessons);
            state.track = 'fresh'; openId = null; save(); render();
            Motion.toast('Six fresh ideas, written for you. They stay all day.');
        } catch (e) {
            btn.disabled = false; btn.classList.remove('is-busy'); btn.innerHTML = was;
            Motion.toast(e.message || 'Something went wrong.', 'error');
        }
    }

    (function wire() {
        const page = document.getElementById('page-bento');
        if (!page) return;
        page.addEventListener('click', e => {
            const b = e.target.closest('button');
            if (!b || b.closest('#bento-pond')) return;
            if ('fresh' in b.dataset) writeFresh(b);
            else if (b.closest('[data-bento-track]')) { state.track = b.dataset.v; openId = null; save(); render(); }
            else if (b.classList.contains('bento-cell')) open(b.dataset.id);
            else if (b.dataset.open) { openId = null; open(b.dataset.open); }
            else if ('close' in b.dataset) open(openId);
            else if ('reveal' in b.dataset) {
                const a = b.nextElementSibling;
                a.hidden = false; b.remove();
                if (!Motion.calm()) a.animate([{ opacity: 0, transform: 'translateY(8px)', filter: 'blur(4px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 460, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
            }
            else if ('ask' in b.dataset) mentorPin(page.querySelector('#bento-lesson'));
            else if (b.dataset.follow) { mentorPin(page.querySelector('#bento-lesson')); setTimeout(() => mentorSend(b.dataset.follow), 350); }
            else if (b.dataset.jump) mentorJump(Number(b.dataset.jump));
            else if ('done' in b.dataset) markDone(b);
        });
        page.querySelector('#bento-lang')?.addEventListener('change', e => { state.lang = e.target.checked ? 'hi' : 'en'; save(); render(); });
    })();

    // The profile decides the packs; onboarding calls this again after the user changes field or role
    async function useField() {
        await window.Auth?.ready;
        try { const r = await fetch(`${API_BASE}/api/profile`); if (r.ok) profile = await r.json(); } catch (e) { /* offline: keep what we had */ }
        fresh = null;
        build();
        ready = true;
        if (document.body.dataset.section === 'bento') render();
        try {   // today's fresh six, if they were already written (peek never spends an answer)
            const d = await (await fetch(`${API_BASE}/api/bento/field?peek=1`)).json();
            if (d.lessons?.length) { setFresh(d.lessons); if (document.body.dataset.section === 'bento') render(); }
        } catch (e) { /* no fresh ones today */ }
    }
    build();
    useField();

    return { render, useField };
})();

// modules talk to each other through window: a top-level const is not a window property
window.Bento = Bento;
