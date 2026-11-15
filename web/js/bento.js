/**
 * Brain Bento: five bite-sized concepts a day, from the user's own field. The packs come from the profile: tech keeps
 * the curated tracks in bento-data.js (plus interview craft); every other field gets its own packs from
 * bento-fields.js, so a nurse, an MBA student or a marketer sees their own ideas with no AI and no network.
 * "Fresh today" adds six AI-written ones on request (never on page load, so opening the page spends nothing).
 * Today's box is seeded by the date and the chosen track, so it stays the same all day; lessons that match the
 * learner's Toolbelt skills move to the front. The belt above it carries every topic round on plates, like a sushi
 * bar; tapping a plate lifts it off into the lesson. Progress and the streak live in localStorage. Ask Mentor pins the lesson (mentor.js).
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
    const FRESH = { name: 'Fresh today', tone: 'asg', icon: 'sprout' };
    // each track's plate colour, as a sushi bar lacquers its plates: red, mustard, steel, black, indigo, sage (in track order)
    const PLATES = ['#c8372d', '#d9a21b', '#8a9099', '#232326', '#2f4a78', '#5f7f63'];
    const plateOf = track => PLATES[Math.max(0, Object.keys(TRACKS).indexOf(track)) % PLATES.length];
    let openId = null, uid = 0, ready = false, profile = {}, packs = null, fresh = null, TRACKS = {}, LESSONS = [];
    // topics of one's own ("LLMs", "Kubernetes"): kept on the account, each its own track "t:slug" (main.py /api/bento/topics)
    let mine = [], mineReady = false, adding = null;
    const writing = new Map();   // slug → the request writing that topic's lessons in full
    const find = id => LESSONS.find(l => l.id === id);
    // the track on show: one of one's own topics picked last time shows once the topics have loaded
    const current = () => (TRACKS[state.track] ? state.track : 'all');
    const api = async (method, path, body) => {
        const res = await fetch(`${API_BASE}${path}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body && JSON.stringify(body) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || data.detail || 'Something went wrong. Try again in a moment.');
        return data;
    };

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
        mine.forEach(t => { TRACKS[`t:${t.slug}`] = { name: t.name, tone: 'me', icon: 'pen', mine: t.slug }; LESSONS.push(...t.lessons); });
        if (state.track !== 'all' && !TRACKS[state.track] && (mineReady || !state.track.startsWith('t:'))) state.track = 'all';
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
    // one's own topics and anything fresh lead Chef's Choice, then the field's own pack; interview craft fills in
    const weight = l => (l.track === 'fresh' || l.track.startsWith('t:') ? 0.45 : l.track === primary() ? 0.6 : 1);
    function shuffled(seed, pool) {
        const rnd = seeded(seed);
        return pool.map(l => ({ l, r: rnd() * (current() === 'all' ? weight(l) : 1) })).sort((a, b) => a.r - b.r).map(x => x.l);
    }
    // Today's box: five lessons not learned yet, in five compartments kept for the day (and the track). A lesson
    // learned leaves, and the next one in today's order takes its compartment; tomorrow's box starts afresh. Lessons
    // already learned come back only once there is nothing new left.
    function todaysBox() {
        const track = current(), learned = new Set(Object.values(state.done).flat());
        const pool = LESSONS.filter(l => track === 'all' || l.track === track);
        const order = shuffled(day() + track + (primary() || 'tech'), pool);
        const words = learnerWords();
        const fit = l => (l.keys || []).filter(k => words.includes(k)).length;
        const forYou = words ? order.filter(l => fit(l) > 0 && !learned.has(l.id)).sort((a, b) => fit(b) - fit(a)).slice(0, 2) : [];
        const queue = [...forYou, ...order.filter(l => !forYou.includes(l))];
        const spare = [...queue.filter(l => !learned.has(l.id)), ...queue.filter(l => learned.has(l.id))];
        const kept = state.box?.day === day() && state.box.track === track ? state.box.ids : [];
        const slots = kept.map(find).filter(Boolean).slice(0, 5);
        const next = () => spare.find(l => !slots.includes(l));
        for (let i = 0; i < slots.length; i++) if (learned.has(slots[i].id)) { const n = next(); if (n && !learned.has(n.id)) slots[i] = n; }
        while (slots.length < 5 && next()) slots.push(next());
        state.box = { day: day(), track, ids: slots.map(l => l.id) };
        save();
        return slots.map(l => ({ l, forYou: forYou.includes(l) }));
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
        return `<svg class="dg dg-h" viewBox="0 0 ${hw} ${H + 20}" role="img" aria-label="${esc(nodes.join(', then '))}">${marker('h')}<circle class="dg-packet" r="6" style="offset-path: path('${hPath}')"/>${horiz}</svg>`
            + `<svg class="dg dg-v" viewBox="0 0 ${VW} ${vh}" role="img" aria-label="${esc(nodes.join(', then '))}">${marker('v')}<circle class="dg-packet" r="6" style="offset-path: path('${vPath}')"/>${vert}</svg>`;
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
            <circle class="dg-orbit" cx="${C}" cy="${C}" r="${R}"/>${arcs}
            <circle class="dg-packet dg-packet-loop" r="6" style="offset-path: path('M ${C} ${C - R} A ${R} ${R} 0 1 1 ${C - 0.01} ${C - R}')"/>${boxes}</svg>`;
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
        const chips = [['all', { name: "Chef's Choice", icon: 'toque' }], ...Object.entries(TRACKS)];
        // with subjects in the Toolbelt the six can be dealt again: a different handful of subjects each time
        const freshBtn = fresh?.length ? (profile.subjects?.length ? `<button type="button" class="chip bento-fresh" data-fresh="again"><svg aria-hidden="true"><use href="#i-refresh"/></svg>Shuffle six more from your subjects</button>` : '') : `<button type="button" class="chip bento-fresh" data-fresh><svg aria-hidden="true"><use href="#i-pen"/></svg>Write six fresh ones${profile.role ? ` for ${esc(profile.role)}` : ''}</button>`;
        const chip = ([k, tr]) => `<button type="button" class="chip" data-v="${k}"${tr.tone ? ` data-tone="${tr.tone}"` : ''} aria-pressed="${k === current()}"><svg aria-hidden="true"><use href="#i-${tr.icon}"/></svg>${esc(tr.name)}</button>`;
        const own = ([k, tr]) => `<span class="chip-mine${writing.has(tr.mine) ? ' is-cooking' : ''}">${chip([k, tr])}<button type="button" class="chip-x" data-topic-remove="${tr.mine}" aria-label="Remove ${esc(tr.name)}" title="Remove"><svg aria-hidden="true"><use href="#i-x-bold"/></svg></button></span>`;
        const add = adding ? `<span class="chip-mine is-cooking"><button type="button" class="chip" aria-pressed="true" disabled><svg aria-hidden="true"><use href="#i-pen"/></svg>${esc(adding)}</button></span>`
            : mine.length < 6 ? '<button type="button" class="chip bento-add" data-topic-add><svg aria-hidden="true"><use href="#i-plus"/></svg>Your topic</button>' : '';
        page.querySelector('[data-bento-track]').innerHTML = chips.map(c => (c[1].mine ? own(c) : chip(c))).join('') + add + freshBtn;
        const lang = page.querySelector('#bento-lang');
        if (lang) { lang.checked = state.lang === 'hi'; lang.closest('label').hidden = !LESSONS.some(l => l.hi); }
        const sub = page.querySelector('[data-bento-sub]');
        if (sub) sub.textContent = packs ? `Five bite-sized ideas from ${TRACKS[primary()].name.toLowerCase()}, packed fresh every morning` : 'Five bite-sized concepts, packed fresh every morning';
    }
    function renderBox(page, arrived = -1, settled = arrived >= 0) {
        const done = doneToday(), box = page.querySelector('#bento-box');
        box.classList.toggle('is-settled', settled);
        box.innerHTML = todaysBox().map(({ l, forYou }, i) => {
            const t = text(l), tr = TRACKS[l.track];
            const isDone = done.includes(l.id);
            return `<button type="button" class="bento-cell${isDone ? ' is-done' : ''}" data-id="${l.id}" data-tone="${tr.tone}" style="--i:${i};--plate:${plateOf(l.track)}" aria-pressed="${openId === l.id}">
                <span class="cell-lid" aria-hidden="true"></span>
                <span class="cell-top"><span class="cell-no num">${i + 1}</span><span class="cell-track"><i class="cell-plate" aria-hidden="true"></i>${esc(tr.name)}</span></span>
                <span class="cell-title">${esc(t.title)}</span>
                <span class="cell-hook">${esc(t.hook)}</span>
                ${i === 0 && t.analogy ? `<span class="cell-quote">${esc(t.analogy)}</span>` : ''}
                <span class="cell-foot"><span class="cell-time">3 min</span>${forYou ? '<span class="cell-for">For your role</span>' : ''}${isDone ? '<span class="cell-done"><svg aria-hidden="true"><use href="#i-check-bold"/></svg>Learned</span>' : ''}</span>
            </button>`;
        }).join('');
        const cell = arrived >= 0 && !Motion.calm() ? box.children[arrived] : null;   // the new lesson drops into the empty compartment
        cell?.animate([{ opacity: 0, transform: 'translateY(-18px) scale(0.94) rotate(-1.5deg)' }, { opacity: 1, transform: 'none' }], { duration: 620, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
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
        if (l.pending) {   // its topic's lessons are on their way: the title now, the rest in a few seconds
            panel.hidden = false;
            panel.dataset.trackName = tr.name;
            panel.style.setProperty('--plate', plateOf(l.track));
            panel.innerHTML = `<div class="lesson-visual lesson-wait" aria-hidden="true"><span></span><span></span><span></span></div>
                <div class="lesson-body">
                    <header class="lesson-bar"><span class="lesson-track"><i aria-hidden="true"></i>${esc(tr.name)}</span>
                        <div class="lesson-tools"><button type="button" class="lesson-round lesson-close" data-close aria-label="Close the lesson" title="Close"><svg aria-hidden="true"><use href="#i-x-bold"/></svg></button></div></header>
                    <h2 class="lesson-title" tabindex="-1">${esc(t.title)}</h2>
                    <p class="lesson-hook">${esc(t.hook)}</p>
                    <p class="lesson-writing" role="status">The kitchen is writing this lesson. It opens right here in a few seconds.</p>
                    <div class="lesson-skeleton" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
                </div>`;
            writeTopic(l.track.slice(2));
            if (focus) requestAnimationFrame(() => panel.scrollIntoView({ behavior: Motion.calm() ? 'auto' : 'smooth', block: 'start' }));
            return;
        }
        const isDone = doneToday().includes(l.id);
        const rel = related(l);
        const follow = Array.isArray(t.follow) ? t.follow.filter(Boolean) : [];
        panel.hidden = false;
        panel.dataset.tone = tr.tone;
        panel.dataset.trackName = tr.name;
        panel._question = t.q;
        panel._answer = `${t.a}\n\n${t.body}`;
        panel.style.setProperty('--plate', plateOf(l.track));
        panel.innerHTML = `
            <div class="lesson-visual">
                ${l.diagram ? `<figure class="lesson-diagram">${diagram(l.diagram)}</figure>` : ''}
                ${t.analogy ? `<blockquote class="lesson-picture"><span>Picture it</span>${esc(t.analogy)}</blockquote>` : ''}
            </div>
            <div class="lesson-body">
                <header class="lesson-bar">
                    <span class="lesson-track"><i aria-hidden="true"></i>${esc(tr.name)}</span>
                    <div class="lesson-tools">
                        <button type="button" class="lesson-round prep-btn-mentor" data-ask aria-label="Ask the Mentor about this" title="Ask the Mentor about this"><svg aria-hidden="true"><use href="#i-ask"/></svg></button>
                        <button type="button" class="lesson-save" data-done${isDone ? ' disabled' : ''}>${isDone ? '<svg aria-hidden="true"><use href="#i-check-bold"/></svg>Learned today' : 'Mark as learned'}</button>
                        <button type="button" class="lesson-round lesson-close" data-close aria-label="Close the lesson" title="Close"><svg aria-hidden="true"><use href="#i-x-bold"/></svg></button>
                    </div>
                </header>
                <h2 class="lesson-title" tabindex="-1">${esc(t.title)}</h2>
                <p class="lesson-hook">${esc(t.hook)}</p>
                <p class="lesson-text">${esc(t.body)}</p>
                <section class="lesson-ask">
                    <h3>Say it in the interview</h3>
                    <p class="lesson-q">${esc(t.q)}</p>
                    <button type="button" class="lesson-reveal" data-reveal><svg aria-hidden="true"><use href="#i-eye"/></svg>Show a model answer</button>
                    <p class="lesson-a" hidden>${esc(t.a)}</p>
                </section>
                ${follow.length ? `<section class="lesson-more"><h3>They might ask next</h3><div class="lesson-follow">${follow.map(f => `<button type="button" class="lesson-chip" data-follow="${esc(f)}">${esc(f)}</button>`).join('')}</div></section>` : ''}
                ${rel.length ? `<section class="lesson-more"><h3>From your Prep bank</h3><div class="lesson-related">${rel.map(({ e, n }) => `<button type="button" class="lesson-rel" data-jump="${n}"><span class="lesson-rel-no">Q${n}</span><span>${esc(e.question)}</span></button>`).join('')}</div></section>` : ''}
            </div>`;
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
        Belt.fill();
    }

    // ── The belt: every topic rides a plate round a sushi-bar conveyor. A plate's rim is its track's colour (the card in
    // the middle says which, like a sushi bar's plate prices). Plates come out of the kitchen hatch under the curtain and
    // pass it again once a lap; under the curtain a plate may be swapped for a topic that has not been out yet, so every
    // topic comes round. Reaching for a plate eases the belt to a stop; tapping one lifts it off into the lesson.
    // Narrow screens run it as two lanes whose bends (and the hatch) sit out of sight. Calm and reduced motion set every
    // plate out, still, on the counter. Plates ride on CSS (offset-path); JS sets the path and eases the speed.
    const Belt = (() => {
        const SPEED = 32, SLAT = 24;   // px a second along the belt; one slat and its gap (bento.css draws 2 + 22)
        let section, belt, tray, track, plates = [], queue = [], mounted = false, stir = 0, size = '', inside = false, touchT = 0;
        let rate = 0, goal = 1, raf = 0, last = 0, seen = false;
        const still = () => Motion.calm();
        const base = () => (inside ? 0.35 : 1);
        const r1 = v => Math.round(v * 10) / 10;
        const pick = () => {
            const pool = LESSONS.filter(l => current() === 'all' || l.track === current());
            const done = new Set(Object.values(state.done).flat()), box = new Set(todaysBox().map(x => x.l.id));
            const mixed = shuffled(day() + 'belt' + stir, pool);
            return [...mixed.filter(l => !done.has(l.id)), ...mixed.filter(l => done.has(l.id))].map(l => ({ l, done: done.has(l.id), today: box.has(l.id) }));
        };
        // one plate: a rim in its track's colour and the name; a tick once it is learned, a heavier rim if it is in today's box
        function paint(el, item) {
            const { l, done, today } = item, tr = TRACKS[l.track];
            el._item = item;
            el.type = 'button';
            el.className = `belt-plate${done ? ' is-done' : ''}${today ? ' is-today' : ''}${l.id === openId ? ' is-open' : ''}`;
            el.dataset.pondOpen = l.id;
            el.dataset.tone = tr.tone;
            el.style.setProperty('--plate', plateOf(l.track));
            el.innerHTML = `<span class="plate-lift">${done ? '<svg class="plate-tick" aria-hidden="true"><use href="#i-check-bold"/></svg>' : ''}`
                + `<span class="plate-name">${esc(text(l).title)}</span><span class="sr-only">, ${esc(tr.name)}${done ? ', learned' : ''}${today ? ", in today's box" : ''}</span></span>`;
        }
        function fill() {
            section = document.getElementById('bento-belt');
            belt = section?.querySelector('[data-belt]');
            if (!belt) return;
            tray = belt.querySelector('[data-belt-plates]');
            track = belt.querySelector('.belt-track');
            mount();
            const hint = section.querySelector('[data-belt-hint]');
            if (hint) hint.textContent = still() ? 'Every topic, set out on the counter. Tap one to open it.'
                : current() === 'all' ? 'Every topic rides the belt. Reach for a plate and it stops.' : `Every ${TRACKS[current()].name} topic rides the belt. Reach for a plate and it stops.`;
            if (belt.hasAttribute('data-cooking')) { belt.removeAttribute('data-cooking'); setGoal(base()); }   // the kitchen is done: back to a calm pace
            const legend = belt.querySelector('[data-belt-legend]');
            if (legend) legend.innerHTML = Object.entries(TRACKS).filter(([k]) => current() === 'all' || k === current())
                .map(([k, tr]) => `<li style="--plate:${plateOf(k)}"><i></i><span>${esc(tr.name)}</span><b>${LESSONS.filter(l => l.track === k).length}</b></li>`).join('');
            layout(pick());
        }
        // the belt's shape: a stadium inside the counter, or (narrow) two lanes whose bends sit past the edges
        function shape(W, H, pw, ph, wide) {
            const top = ph / 2 + 16, bottom = H - ph / 2 - 16, r = (bottom - top) / 2, cy = top + r;
            const a = wide ? pw / 2 + 14 + r : -(pw / 2 + 6), b = wide ? W - pw / 2 - 14 - r : W + pw / 2 + 6;
            const d = wide   // starts at the hatch: top centre when wide, the far right bend when narrow
                ? `M ${r1(W / 2)} ${r1(top)} H ${r1(b)} A ${r1(r)} ${r1(r)} 0 0 1 ${r1(b)} ${r1(bottom)} H ${r1(a)} A ${r1(r)} ${r1(r)} 0 0 1 ${r1(a)} ${r1(top)} Z`
                : `M ${r1(b + r)} ${r1(cy)} A ${r1(r)} ${r1(r)} 0 0 1 ${r1(b)} ${r1(bottom)} H ${r1(a)} A ${r1(r)} ${r1(r)} 0 0 1 ${r1(a)} ${r1(top)} H ${r1(b)} A ${r1(r)} ${r1(r)} 0 0 1 ${r1(b + r)} ${r1(cy)} Z`;
            return { top, bottom, a, b, d, length: 2 * (b - a) + 2 * Math.PI * r };
        }
        function layout(list) {
            belt.classList.toggle('is-still', still());
            tray.innerHTML = ''; plates = []; queue = [];
            if (still()) { list.forEach(item => { const el = document.createElement('button'); paint(el, item); tray.append(el); }); return; }
            const W = belt.clientWidth, H = belt.clientHeight, cs = getComputedStyle(belt);
            if (!W || !H) return;   // the page is hidden: the ResizeObserver lays it out once it shows
            const pw = parseFloat(cs.getPropertyValue('--plate-w')) || 170, ph = parseFloat(cs.getPropertyValue('--plate-h')) || 58;
            let wide = cs.getPropertyValue('--belt-mode').trim() !== 'narrow', g = shape(W, H, pw, ph, wide);
            if (wide && g.b - g.a < 80) { wide = false; g = shape(W, H, pw, ph, false); }
            belt.dataset.mode = wide ? 'wide' : 'narrow';
            const n = Math.max(1, Math.min(list.length, Math.floor(g.length / (pw + 22))));
            const islW = g.b - g.a, islH = g.bottom - g.top - ph - 40;
            Object.entries({
                '--belt-path': `path("${g.d}")`, '--lap': `${(g.length / SPEED).toFixed(2)}s`, '--slat-lap': `${(SLAT / SPEED).toFixed(3)}s`, '--n': n,
                '--hatch-x': `${r1(W / 2)}px`, '--hatch-h': `${r1(g.top + ph / 2 + 10)}px`,
                '--isl-x': `${r1(g.a)}px`, '--isl-y': `${r1(g.top + ph / 2 + 20)}px`, '--isl-w': `${r1(islW)}px`, '--isl-h': `${r1(islH)}px`,
            }).forEach(([k, v]) => belt.style.setProperty(k, v));
            belt.dataset.island = wide && islW >= 260 && islH >= 110 ? 'on' : 'off';
            track.setAttribute('viewBox', `0 0 ${W} ${H}`);
            track.querySelectorAll('path').forEach(p => p.setAttribute('d', g.d));
            // the plates come out one after another; a repaint (the hatch, New plates) drops the entrance
            list.slice(0, n).forEach((item, k) => { const el = document.createElement('button'); el.style.setProperty('--k', k); paint(el, item); el.classList.add('is-new'); tray.append(el); plates.push(el); });
            queue = list.slice(n);
            size = `${W}x${H}`;
            apply();
        }
        // the speed eases toward its goal; every plate and the slats share one rate, so they never drift apart
        function apply() { belt?.getAnimations({ subtree: true }).forEach(an => { if (an.animationName === 'beltRide' || an.animationName === 'beltSlats') an.playbackRate = rate; }); }
        function setGoal(g) { goal = g; if (!raf) { last = 0; raf = requestAnimationFrame(tick); } }
        function tick(t) {
            raf = 0;
            const dt = last ? Math.min(0.05, (t - last) / 1000) : 1 / 60; last = t;
            const want = seen && !document.hidden ? goal : 0;
            rate += (want - rate) * Math.min(1, dt * 6);
            if (Math.abs(want - rate) < 0.01) rate = want;
            apply();
            if (rate !== want) raf = requestAnimationFrame(tick);
        }
        function sway() {
            const noren = belt.querySelector('.belt-noren');
            if (!noren || belt.dataset.mode !== 'wide') return;
            noren.classList.remove('is-swaying'); void noren.offsetWidth; noren.classList.add('is-swaying');
        }
        function ring() {
            const bell = belt.querySelector('.belt-bell');
            if (!bell || still() || belt.dataset.island !== 'on') return;
            bell.classList.remove('is-ringing'); void bell.offsetWidth; bell.classList.add('is-ringing');
        }
        // New plates: the belt whooshes and every plate flips over to a new topic, one after another down the line
        function spinOut() {
            stir++;
            const list = pick();
            if (still() || !plates.length) { layout(list); return; }
            queue = list.slice(plates.length);
            setGoal(5);
            setTimeout(() => setGoal(belt.contains(document.activeElement) ? 0 : base()), 900);
            plates.forEach((el, k) => setTimeout(() => {
                const out = el.querySelector('.plate-lift').animate([{ transform: 'none' }, { transform: 'rotateY(90deg) scale(0.9)' }], { duration: 170, easing: 'cubic-bezier(0.4, 0, 1, 1)' });
                out.onfinish = () => { paint(el, list[k]); el.querySelector('.plate-lift').animate([{ transform: 'rotateY(-90deg) scale(0.9)' }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }); };
            }, 70 * k));
        }
        function mount() {
            if (mounted) return;
            mounted = true;
            new IntersectionObserver(([e]) => { seen = e.isIntersecting; setGoal(goal); }).observe(belt);
            document.addEventListener('visibilitychange', () => setGoal(goal));
            let t;
            new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => { if (belt.clientWidth && `${belt.clientWidth}x${belt.clientHeight}` !== size) layout(pick()); }, 180); }).observe(belt);
            // a mouse in the bar slows the belt; on a plate (or with the keyboard in it) the belt stops; a finger holds it for a moment
            belt.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { inside = true; setGoal(base()); } });
            belt.addEventListener('pointerleave', () => { inside = false; if (!belt.contains(document.activeElement)) setGoal(base()); });
            tray.addEventListener('pointerover', e => { if (e.pointerType === 'mouse' && e.target.closest('.belt-plate')) setGoal(0); });
            tray.addEventListener('pointerout', e => {
                const p = e.target.closest('.belt-plate');
                if (e.pointerType === 'mouse' && p && !p.contains(e.relatedTarget) && !belt.contains(document.activeElement)) setGoal(base());
            });
            belt.addEventListener('focusin', () => setGoal(0));
            belt.addEventListener('focusout', e => { if (!belt.contains(e.relatedTarget)) setGoal(base()); });
            belt.addEventListener('pointerdown', e => {
                if (e.pointerType === 'mouse') return;
                setGoal(0); clearTimeout(touchT);
                touchT = setTimeout(() => { if (!belt.contains(document.activeElement)) setGoal(base()); }, 1800);
            });
            // at the hatch: the curtain sways, and a plate nobody is reaching for may go back for a topic not yet out
            tray.addEventListener('animationiteration', e => {
                if (e.animationName !== 'beltRide') return;
                const el = e.target;
                sway();
                if (!queue.length || !el._item || el.matches(':hover, :focus-within') || el.dataset.pondOpen === openId) return;
                queue.push(el._item);
                paint(el, queue.shift());
            });
            section.addEventListener('click', e => {
                const p = e.target.closest('[data-pond-open]');
                if (p) { ring(); grow(p); }
                else if (e.target.closest('[data-belt-spin]')) spinOut();
            });
        }

        // the tapped plate lifts off and grows into the lesson card
        function grow(btn) {
            const id = btn.dataset.pondOpen, from = btn.getBoundingClientRect();
            const page = document.getElementById('page-bento'), panel = page.querySelector('#bento-lesson');
            openId = id;
            page.querySelectorAll('.bento-cell').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.id === openId)));
            renderLesson(page, false);
            tray.querySelectorAll('.belt-plate').forEach(b => b.classList.toggle('is-open', b === btn));
            panel.querySelector('.lesson-title')?.focus({ preventScroll: true });
            // glide the page so the lesson lands near the top, and fly the plate to exactly where it will land
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
            ghost.className = 'belt-ghost'; ghost.style.setProperty('--plate', btn.style.getPropertyValue('--plate')); ghost.setAttribute('aria-hidden', 'true');
            ghost.innerHTML = `<span>${esc(btn.querySelector('.plate-name').textContent)}</span>`;
            document.body.append(ghost);
            const end = { left: `${to.left}px`, top: `${Math.max(to.top, 8)}px`, width: `${to.width}px`, height: `${Math.min(to.height, innerHeight - Math.max(to.top, 8) - 8)}px` };
            panel.style.opacity = '0';
            const a = ghost.animate([
                { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, borderRadius: '999px', transform: 'none' },
                { offset: 0.3, left: `${from.left - 8}px`, top: `${from.top - 26}px`, width: `${from.width + 16}px`, height: `${from.height + 10}px`, borderRadius: '999px', transform: 'rotate(-4deg)' },
                { ...end, borderRadius: '22px', transform: 'none' },
            ], { duration: 680, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'forwards' });
            a.onfinish = () => {
                panel.style.opacity = '';
                panel.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
                ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' }).onfinish = () => ghost.remove();
            };
        }
        // a lesson marked learned goes back to the kitchen: its plate lifts off, and a topic not yet learned comes out in
        // its place (if every topic is out already, the plate stays with a tick)
        function mark(id) {
            const el = tray && [...tray.querySelectorAll('.belt-plate')].find(p => p.dataset.pondOpen === id);
            if (!el?._item) return;
            const learned = new Set(Object.values(state.done).flat());
            const at = queue.findIndex(x => !learned.has(x.l.id));
            if (still() || at < 0) { paint(el, { ...el._item, done: true }); return; }
            const [next] = queue.splice(at, 1);
            queue.push({ ...el._item, done: true });
            el.querySelector('.plate-lift').animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(-24px) scale(0.7)', opacity: 0 }], { duration: 360, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' })
                .onfinish = () => { paint(el, next); el.querySelector('.plate-lift').animate([{ transform: 'translateY(16px) scale(0.7)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 560, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }); };
        }
        // while the kitchen plans a topic of one's own: the belt hurries and the curtain keeps swaying
        function cooking(name) {
            if (!belt || still()) return;
            belt.toggleAttribute('data-cooking', Boolean(name));
            const hint = section.querySelector('[data-belt-hint]');
            if (hint && name) hint.textContent = `The kitchen is preparing ${name}…`;
            setGoal(name ? 2.4 : base());
        }
        return { fill, mark, cooking };
    })();

    function open(id) {
        openId = openId === id ? null : id;
        const page = document.getElementById('page-bento');
        page.querySelectorAll('.bento-cell').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.id === openId)));
        page.querySelectorAll('.belt-plate').forEach(b => b.classList.toggle('is-open', b.dataset.pondOpen === openId));
        const cell = page.querySelector(`.bento-cell[data-id="${id}"]`);
        if (openId && cell && !Motion.calm()) cell.animate([{ transform: 'none' }, { transform: 'translateY(-10px) scale(1.03) rotate(-1deg)' }, { transform: 'none' }], { duration: 520, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
        renderLesson(page, Boolean(openId));
    }
    function markDone(btn) {
        const today = day();
        const list = state.done[today] || (state.done[today] = []);
        if (list.includes(openId)) return;
        const slot = (state.box?.ids || []).indexOf(openId);   // its compartment in today's box, if it has one
        list.push(openId);
        if (state.last !== today) { state.streak = state.last === day(-1) ? state.streak + 1 : 1; state.last = today; }
        save();
        Motion.burst(btn, 18, ['var(--ok)', 'var(--accent)', 'var(--c-sys)', 'var(--c-beh)']);
        const page = document.getElementById('page-bento');
        renderBar(page); renderBox(page, slot, true); renderMenu(page);
        Belt.mark(openId);
        if (list.length === 5) page.querySelectorAll('.bento-cell').forEach((c, i) => setTimeout(() => Motion.burst(c, 14), i * 120));   // today's five
        const box = todaysBox(), learned = new Set(Object.values(state.done).flat());
        const next = (slot >= 0 && box[(slot + 1) % box.length]) || box.find(({ l }) => !learned.has(l.id));
        if (next && !learned.has(next.l.id)) setTimeout(() => open(next.l.id), 700); else { openId = null; renderLesson(page, false); }
    }

    // ── Fresh today: six concepts the AI writes for this role, only when asked ──
    function setFresh(lessons) {
        fresh = lessons.filter(l => l?.en?.title).map(l => ({ ...l, track: 'fresh', keys: l.keys || [] }));
        build();
    }
    async function writeFresh(btn) {
        btn.disabled = true; btn.classList.add('is-busy');
        const was = btn.innerHTML;
        btn.innerHTML = '<svg aria-hidden="true"><use href="#i-pen"/></svg>Writing six for you…';
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

    // Adding a topic: its chip appears at once and the kitchen starts; the menu (step one) puts its plates on the belt,
    // then the lessons are written in the background (step two) while the person looks around
    async function addTopic(name) {
        const page = document.getElementById('page-bento');
        adding = name;
        renderBar(page);
        Belt.cooking(name);
        try {
            const { topic } = await api('POST', '/api/bento/topics', { name });
            mine = [...mine.filter(t => t.slug !== topic.slug), topic];
            state.track = `t:${topic.slug}`; openId = null; save();
            adding = null;
            build(); render();
            if (topic.lessons.some(l => l.pending)) {
                Motion.toast(`${topic.name}: ${topic.lessons.length} plates on the belt. The lessons are being written now.`);
                writeTopic(topic.slug);
            }
        } catch (e) {
            adding = null;
            Belt.cooking(null);
            renderBar(page);
            Motion.toast(e.message, 'error');
        }
    }
    function writeTopic(slug) {
        const topic = mine.find(t => t.slug === slug);
        if (!topic || !topic.lessons.some(l => l.pending)) return Promise.resolve();
        if (writing.has(slug)) return writing.get(slug);
        const page = document.getElementById('page-bento');
        const job = api('POST', `/api/bento/topics/${encodeURIComponent(slug)}/write`).then(({ topic: done }) => {
            mine = mine.map(t => (t.slug === slug ? done : t));
            build();
            renderBox(page, -1, true); renderMenu(page);
            if (find(openId)?.track === `t:${slug}`) renderLesson(page, false);
        }).catch(e => Motion.toast(e.message, 'error')).finally(() => { writing.delete(slug); renderBar(page); });
        writing.set(slug, job);
        renderBar(page);
        return job;
    }
    async function removeTopic(slug) {
        const topic = mine.find(t => t.slug === slug);
        if (!topic) return;
        mine = mine.filter(t => t !== topic);
        if (state.track === `t:${slug}`) state.track = 'all';
        save(); build(); render();
        try { await api('DELETE', `/api/bento/topics/${encodeURIComponent(slug)}`); }
        catch (e) { mine = [...mine, topic]; build(); render(); Motion.toast("Couldn't remove it just now. Try again in a moment.", 'error'); }
    }
    // the + chip turns into a small field: Enter (or leaving it with a name in it) adds the topic, Escape puts it back
    function topicField(btn) {
        const input = document.createElement('input');
        Object.assign(input, { type: 'text', className: 'chip bento-topic-input', maxLength: 48, placeholder: 'LLMs, Kubernetes, SEO…' });
        input.setAttribute('aria-label', 'A topic of your own');
        btn.replaceWith(input);
        input.focus();
        let done = false;
        const finish = go => {
            if (done) return;
            done = true;
            const name = input.value.trim();
            if (go && name.length >= 2) addTopic(name); else renderBar(document.getElementById('page-bento'));
        };
        input.addEventListener('keydown', e => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); });
        input.addEventListener('blur', () => finish(true));
    }

    (function wire() {
        const page = document.getElementById('page-bento');
        if (!page) return;
        page.addEventListener('click', e => {
            const b = e.target.closest('button');
            if (!b || b.closest('#bento-belt')) return;
            if ('fresh' in b.dataset) writeFresh(b);
            else if ('topicAdd' in b.dataset) topicField(b);
            else if (b.dataset.topicRemove) removeTopic(b.dataset.topicRemove);
            else if (b.closest('[data-bento-track]') && b.dataset.v) {
                state.track = b.dataset.v; openId = null; save(); render();
                if (state.track.startsWith('t:')) writeTopic(state.track.slice(2));   // a topic left half-written finishes when picked
            }
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
        try { mine = (await api('GET', '/api/bento/topics')).topics || []; } catch (e) { /* offline: none for now */ }
        mineReady = true;
        build();
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
