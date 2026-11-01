/**
 * Brain Bento: five bite-sized concepts, packed fresh every morning (data in bento-data.js).
 * Today's box is seeded by the date and the chosen track, so it stays the same all day, and lessons that
 * match the learner's Toolbelt skills move to the front. Progress and the streak live in localStorage.
 * Ask Mentor pins the open lesson to the Split Desk (mentor.js), with the pipeline beam.
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
    let openId = null, uid = 0;

    // a small seeded generator, so the box is the same every time today
    function seeded(seed) {
        let h = 2166136261;
        for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
        return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    }
    function learnerWords() {
        const c = typeof contextData !== 'undefined' ? contextData : {};
        return [...(c.skills?.tags || []), c.skills?.strongest, c.skills?.learning, c.assignment?.title, c.assignment?.description].filter(Boolean).join(' ').toLowerCase();
    }
    function todaysBox() {
        const pool = BENTO_LESSONS.filter(l => state.track === 'all' || l.track === state.track);
        const rnd = seeded(day() + state.track);
        const list = pool.map(l => ({ l, r: rnd() })).sort((a, b) => a.r - b.r).map(x => x.l);
        const words = learnerWords();
        const fit = l => l.keys.filter(k => words.includes(k)).length;
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
        const done = doneToday().length;
        const when = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
        page.querySelector('[data-bento-date]').textContent = when;
        page.querySelector('[data-bento-progress]').innerHTML = `${ring(done)}<span><b class="num">${done}</b> of 5 eaten today</span>`;
        page.querySelector('[data-bento-streak]').innerHTML = `<svg aria-hidden="true"><use href="#i-fire"/></svg><b class="num">${state.streak}</b> day streak`;
        page.querySelectorAll('[data-bento-track] > button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === state.track)));
        const lang = page.querySelector('#bento-lang');
        if (lang) lang.checked = state.lang === 'hi';
    }
    function renderBox(page) {
        const done = doneToday();
        page.querySelector('#bento-box').innerHTML = todaysBox().map(({ l, forYou }, i) => {
            const t = text(l), tr = BENTO_TRACKS[l.track];
            const isDone = done.includes(l.id);
            return `<button type="button" class="bento-cell${isDone ? ' is-done' : ''}" data-id="${l.id}" data-tone="${tr.tone}" style="--i:${i}" aria-pressed="${openId === l.id}">
                <span class="cell-lid" aria-hidden="true"></span>
                <span class="cell-top"><span class="cell-no num">${i + 1}</span><span class="cell-track"><svg aria-hidden="true"><use href="#i-${tr.icon}"/></svg>${esc(tr.name)}</span></span>
                <span class="cell-title">${esc(t.title)}</span>
                <span class="cell-hook">${esc(t.hook)}</span>
                ${i === 0 ? `<span class="cell-quote">${esc(t.analogy)}</span>` : ''}
                <span class="cell-foot"><span class="cell-time">3 min</span>${forYou ? '<span class="cell-for">For your role</span>' : ''}${isDone ? '<span class="cell-done"><svg aria-hidden="true"><use href="#i-check-bold"/></svg>Learned</span>' : ''}</span>
            </button>`;
        }).join('');
    }
    function related(l) {
        const bank = (typeof prep !== 'undefined' && prep.entries) || [];
        return bank.map((e, i) => ({ e, n: i + 1 }))
            .filter(({ e }) => { const hay = `${e.question} ${(e.keywords || []).join(' ')}`.toLowerCase(); return l.keys.some(k => hay.includes(k)); })
            .slice(0, 2);
    }
    function renderLesson(page, focus) {
        const panel = page.querySelector('#bento-lesson');
        const l = BENTO_LESSONS.find(x => x.id === openId);
        if (!l) { panel.hidden = true; return; }
        const t = text(l), tr = BENTO_TRACKS[l.track];
        const isDone = doneToday().includes(l.id);
        const rel = related(l);
        panel.hidden = false;
        panel.dataset.tone = tr.tone;
        panel.dataset.trackName = tr.name;
        panel._question = t.q;
        panel._answer = `${t.a}\n\n${t.body}`;
        panel.innerHTML = `
            <header class="lesson-head">
                <span class="tone-pill" data-tone="${tr.tone}"><svg aria-hidden="true"><use href="#i-${tr.icon}"/></svg>${esc(tr.name)}</span>
                <h2 class="lesson-title">${esc(t.title)}</h2>
                <p class="lesson-hook">${esc(t.hook)}</p>
                <button type="button" class="btn btn-ghost btn-icon lesson-close" data-close aria-label="Close the lesson"><svg aria-hidden="true"><use href="#i-x-bold"/></svg></button>
            </header>
            <figure class="lesson-diagram" data-tone="${tr.tone}">${diagram(l.diagram)}</figure>
            <div class="lesson-grid">
                <section class="lesson-block"><h3><svg aria-hidden="true"><use href="#i-books"/></svg>In plain words</h3><p>${esc(t.body)}</p></section>
                <section class="lesson-block lesson-analogy"><h3><svg aria-hidden="true"><use href="#i-bulb"/></svg>Picture it</h3><p>${esc(t.analogy)}</p></section>
            </div>
            <section class="lesson-block lesson-interview">
                <h3><svg aria-hidden="true"><use href="#i-chats"/></svg>Say it in the interview</h3>
                <p class="lesson-q">${esc(t.q)}</p>
                <button type="button" class="q-reveal" data-reveal><svg aria-hidden="true"><use href="#i-sparkle"/></svg>Reveal a model answer</button>
                <p class="lesson-a" hidden>${esc(t.a)}</p>
            </section>
            <section class="lesson-block">
                <h3><svg aria-hidden="true"><use href="#i-lightning"/></svg>They might ask next</h3>
                <div class="lesson-follow">${t.follow.map(f => `<button type="button" class="chip" data-follow="${esc(f)}"><svg aria-hidden="true"><use href="#i-chats"/></svg>${esc(f)}</button>`).join('')}</div>
            </section>
            ${rel.length ? `<section class="lesson-block"><h3><svg aria-hidden="true"><use href="#i-target"/></svg>From your Prep bank</h3><div class="lesson-related">${rel.map(({ e, n }) => `<button type="button" class="lesson-rel" data-jump="${n}"><span class="badge-pill q-no">Q${n}</span><span>${esc(e.question)}</span></button>`).join('')}</div></section>` : ''}
            <footer class="lesson-actions">
                <button type="button" class="btn btn-secondary prep-btn-mentor" data-ask><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#mentor-mark"/></svg>Ask Mentor</button>
                <button type="button" class="btn btn-primary" data-done${isDone ? ' disabled' : ''}><svg aria-hidden="true"><use href="#i-check-bold"/></svg>${isDone ? 'Learned today' : 'Mark as learned'}</button>
            </footer>`;
        if (focus) requestAnimationFrame(() => panel.scrollIntoView({ behavior: Motion.calm() ? 'auto' : 'smooth', block: 'start' }));
    }
    function render() {
        const page = document.getElementById('page-bento');
        if (!page) return;
        renderBar(page);
        renderBox(page);
        renderLesson(page, false);
        renderMenu(page);
    }
    function renderMenu(page) {
        const done = new Set(Object.values(state.done).flat());
        page.querySelector('#bento-menu-list').innerHTML = Object.entries(BENTO_TRACKS).map(([k, tr]) => `
            <div class="menu-track" data-tone="${tr.tone}"><h3><svg aria-hidden="true"><use href="#i-${tr.icon}"/></svg>${esc(tr.name)}</h3>
            ${BENTO_LESSONS.filter(l => l.track === k).map(l => `<button type="button" class="menu-item" data-open="${l.id}">${done.has(l.id) ? '<svg aria-hidden="true"><use href="#i-check-bold"/></svg>' : '<i aria-hidden="true"></i>'}${esc(text(l).title)}</button>`).join('')}</div>`).join('');
    }

    function open(id) {
        openId = openId === id ? null : id;
        const page = document.getElementById('page-bento');
        page.querySelectorAll('.bento-cell').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.id === openId)));
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
        if (list.length === 5) page.querySelectorAll('.bento-cell').forEach((c, i) => setTimeout(() => Motion.burst(c, 14), i * 120));
        const next = todaysBox().find(({ l }) => !list.includes(l.id));
        renderBar(page); renderBox(page); renderMenu(page);
        if (next) setTimeout(() => open(next.l.id), 700); else { openId = null; renderLesson(page, false); }
    }

    (function wire() {
        const page = document.getElementById('page-bento');
        if (!page) return;
        page.addEventListener('click', e => {
            const b = e.target.closest('button');
            if (!b) return;
            if (b.closest('[data-bento-track]')) { state.track = b.dataset.v; openId = null; save(); render(); }
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

    return { render };
})();
