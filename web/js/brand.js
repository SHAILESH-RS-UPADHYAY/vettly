/**
 * Vettly's logo is the Mentor's orb. Wherever it stands (the side panel, the sign-in page, onboarding, the browser
 * tab) it keeps its animation and travels through glazes: Porcelain, its home (an ivory disc, the sparkle in your
 * theme's ink), then three of twelve light glazes, then Porcelain again. The twelve sit evenly around the colour wheel
 * at one lightness, each shaped like Porcelain: a light disc with the star and orbits in a deeper shade of its colour.
 * A new glaze every 10 s (Porcelain, home, holds twice as long, so it is the one you see most), and each arrives as a
 * drop of paint thrown at the logo; bringing the pointer within 5 cm throws the next one at once. The Ask Mentor
 * button wears them too (while its orb style is the default), 5 s and two glazes apart, and the two never match. brand.css
 * registers every colour so changes blend; everything rests when the tab is hidden, under Calm, or with reduced motion.
 *
 * Also the logo's moves:
 *  - lean: within 5 cm of the pointer the logo (side panel, sign-in page, onboarding) and the Mentor button wake:
 *    a still ring fades in and the orb leans toward the pointer inside it (the open Mentor always leans)
 *  - pulse: a twirl when you change tabs
 *  - travel: it flies from the sign-in page to its place in the side panel when you sign in
 *  - the splash: on every load it draws itself on a construction sheet (markup in index.html, drawing in brand.css),
 *    takes a few throws of paint, washes back to Porcelain, then flies to its place and the page opens out from
 *    there. The full show once a day, a short one after that; afterSplash(fn) runs fn once it has landed.
 * Markup: <span class="brand-ring"><span class="m-orb brand-orb" data-look="glow" data-emblem aria-hidden="true"></span></span>
 */
const Brand = (() => {
    const root = document.documentElement;
    const GLAZES = [['coral', 25], ['apricot', 55], ['saffron', 85], ['pistachio', 115], ['matcha', 145], ['mint', 175],
        ['aqua', 205], ['sky', 235], ['periwinkle', 265], ['lilac', 295], ['orchid', 325], ['blush', 355]];
    const HUE = Object.fromEntries(GLAZES);
    const ORDER = [];   // Porcelain, three glazes, Porcelain, three glazes...
    GLAZES.forEach(([id], i) => { if (i % 3 === 0) ORDER.push('porcelain'); ORDER.push(id); });
    const PERIOD = 10000, MENTOR_AHEAD = 2;
    const quiet = () => matchMedia('(prefers-reduced-motion: reduce)').matches || root.dataset.motion === 'calm';
    const night = () => root.classList.contains('theme-dark');
    let at = 0, mentorAt = MENTOR_AHEAD;
    const clocks = { logo: 0, mentor: 0 };

    // every colour of the orb for one glaze; Porcelain reads the theme's own porcelain tokens (they change at night)
    function palette(id) {
        let core, deep, star;
        if (id === 'porcelain') {
            const cs = getComputedStyle(root), tok = n => cs.getPropertyValue(`--orb-porcelain-${n}`).trim();
            core = tok('core') || '#fffdf8'; deep = tok('deep') || '#ece1cd'; star = tok('star') || '#2b3346';
        } else {
            const h = HUE[id], n = night();
            core = `oklch(${n ? 0.9 : 0.93} 0.055 ${h})`; deep = `oklch(${n ? 0.8 : 0.84} 0.1 ${h})`; star = `oklch(0.52 0.14 ${h})`;
        }
        const mix = p => `color-mix(in oklch, ${star} ${p}%, transparent)`;
        return {
            core, deep, star, aura: 'transparent', ripple: mix(36), spec: 'rgba(255, 255, 255, 0.95)', sheen: 'rgba(255, 255, 255, 0.5)',
            shade: mix(14), rim: 'rgba(255, 255, 255, 0.9)', edge: mix(20), drop: mix(45), 'star-drop': mix(30),
            line: mix(24), run: mix(55), head: star, 'head-glow': 'transparent', halo: mix(32), bezel: mix(34),
        };
    }
    function paint(el, id) {
        for (const [k, v] of Object.entries(palette(id))) el.style.setProperty(`--orb-${k}`, v);
        el.dataset.brandLook = id;
    }
    function unpaint(el) {
        Object.keys(palette('porcelain')).forEach(k => el.style.removeProperty(`--orb-${k}`));
        delete el.dataset.brandLook;
    }
    // the tab's icon: the orb drawn small, in the same glaze
    function favicon(id) {
        const p = palette(id);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><radialGradient id="g" cx="38%" cy="30%" r="78%"><stop offset="0" stop-color="#fff"/><stop offset=".4" stop-color="${p.core}"/><stop offset="1" stop-color="${p.deep}"/></radialGradient></defs><circle cx="16" cy="16" r="15" fill="url(#g)" stroke="#000" stroke-opacity=".14"/><ellipse cx="16" cy="16" rx="12.6" ry="4.6" fill="none" stroke="${p.star}" stroke-opacity=".45" stroke-width="1.1" transform="rotate(-35 16 16)"/><ellipse cx="16" cy="16" rx="12.6" ry="4.6" fill="none" stroke="${p.star}" stroke-opacity=".3" stroke-width="1" transform="rotate(35 16 16)"/><path d="M16 7.2C16.7 13 19 15.3 24.8 16C19 16.7 16.7 19 16 24.8C15.3 19 13 16.7 7.2 16C13 15.3 15.3 13 16 7.2Z" fill="${p.star}"/></svg>`;
        return `data:image/svg+xml,${encodeURIComponent(svg)}`;
    }
    function icon(id) {
        let link = document.querySelector('link[rel="icon"]');
        if (!link) { link = Object.assign(document.createElement('link'), { rel: 'icon' }); document.head.append(link); }
        link.type = 'image/svg+xml';
        link.href = favicon(id);
    }
    // a new orb takes its colour at once; only changes blend
    function settle(el, id) {
        const fresh = !el.dataset.brandLook;
        if (fresh) el.style.transition = 'none';
        paint(el, id);
        if (fresh) { void el.offsetWidth; el.style.transition = ''; }
    }
    // fill and colour every logo in scope (onboarding calls this when it draws its header)
    function fill(scope = document) {
        scope.querySelectorAll('.brand-orb').forEach(el => {
            if (!el.childElementCount && typeof MENTOR_EMBLEM === 'string') el.innerHTML = MENTOR_EMBLEM;
            settle(el, ORDER[at]);
        });
    }
    // the Ask Mentor button wears the glazes while its orb style is the default (Porcelain by day, Classic glow at night);
    // a style picked in the Atelier is kept
    const mentorOrb = () => document.querySelector('#mentor-orb .m-orb');
    const mentorGlazed = () => ['porcelain', 'gloss'].includes(night() ? root.dataset.orbDark : root.dataset.orb);
    function fillMentor() {
        const orb = mentorOrb();
        if (!orb) return;
        if (!mentorGlazed()) { orb.classList.remove('glazed'); unpaint(orb); return; }
        orb.classList.add('glazed');
        settle(orb, ORDER[mentorAt]);
    }

    // ── each new glaze is thrown: a drop flies in from off to one side, splats on the orb, and the orb takes its colour ──
    function burst(x, y, color, size, toward) {
        for (let i = 0; i < 9; i++) {
            const d = document.createElement('i');
            d.className = 'paint-fleck';
            const s = size * (0.12 + Math.random() * 0.14);
            Object.assign(d.style, { left: `${x}px`, top: `${y}px`, width: `${s}px`, height: `${s}px`, background: color });
            document.body.append(d);
            const a = toward + (Math.random() - 0.5) * 2.4, dist = size * (0.5 + Math.random() * 0.9);
            d.animate([{ transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
                { transform: `translate(calc(-50% + ${Math.cos(a) * dist}px), calc(-50% + ${Math.sin(a) * dist + size * 0.25}px)) scale(.5)`, opacity: 0 }],
            { duration: 520 + Math.random() * 240, easing: 'cubic-bezier(.2, .7, .4, 1)' }).onfinish = () => d.remove();
        }
    }
    function hit(orb, id, from = Math.random() * Math.PI * 2, ms = 560) {
        const r = orb.getBoundingClientRect();
        if (quiet() || document.hidden || !r.width || r.bottom < 0 || r.top > innerHeight) { paint(orb, id); return; }
        const p = palette(id), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const dist = r.width * 2 + 40, size = Math.max(7, r.width * 0.26);
        const sx = cx + Math.cos(from) * dist, sy = cy + Math.sin(from) * dist;
        const bend = (Math.random() < 0.5 ? -1 : 1) * dist * 0.35;   // an arc, not a straight line
        const mx = (sx + cx) / 2 - Math.sin(from) * bend, my = (sy + cy) / 2 + Math.cos(from) * bend;
        const drop = document.createElement('i');
        drop.className = 'paint-drop';
        Object.assign(drop.style, { width: `${size}px`, height: `${size}px`, background: `radial-gradient(circle at 35% 30%, ${p.core}, ${p.deep} 65%)` });
        document.body.append(drop);
        const frames = [];
        for (let k = 0; k <= 8; k++) {
            const t = k / 8, u = 1 - t;
            const x = u * u * sx + 2 * u * t * mx + t * t * cx, y = u * u * sy + 2 * u * t * my + t * t * cy;
            const tx = 2 * u * (mx - sx) + 2 * t * (cx - mx), ty = 2 * u * (my - sy) + 2 * t * (cy - my);
            const stretch = 1 + t * 0.6;   // it stretches as it picks up speed
            frames.push({ transform: `translate(${x - size / 2}px, ${y - size / 2}px) rotate(${Math.atan2(ty, tx)}rad) scale(${stretch}, ${1 / stretch})` });
        }
        drop.animate(frames, { duration: ms, easing: 'cubic-bezier(.5, 0, .9, .6)' }).finished.then(() => {
            drop.remove();
            orb.style.transitionDuration = '0.55s';   // paint lands fast
            paint(orb, id);
            setTimeout(() => { orb.style.transitionDuration = ''; }, 650);
            burst(cx, cy, p.deep, r.width, Math.atan2(cy - my, cx - mx));
            orb.animate([{ scale: 1 }, { scale: 0.86, offset: 0.25 }, { scale: 1.07, offset: 0.6 }, { scale: 1 }], { duration: 560, easing: 'ease-out' });
        }, () => drop.remove());
    }

    // the next glaze in the order, never the one the other logo is wearing (so the two never match)
    function next(i, avoid) {
        do { i = (i + 1) % ORDER.length; } while (ORDER[i] === avoid);
        return i;
    }
    // the logo (side panel, sign-in page, onboarding) and the Mentor turn on their own clocks, 5 s apart
    function stepLogo() {
        at = next(at, mentorOrb() && mentorGlazed() ? ORDER[mentorAt] : null);
        document.querySelectorAll('.brand-orb').forEach(el => (el.closest('.sidebar-logo, .auth-brand, .sk-brand, .ob-brand') && el.getClientRects().length ? hit(el, ORDER[at]) : paint(el, ORDER[at])));
        icon(ORDER[at]);
    }
    function stepMentor() {
        const orb = mentorOrb();
        if (!orb || !mentorGlazed()) return;
        mentorAt = next(mentorAt, ORDER[at]);
        hit(orb, ORDER[mentorAt]);
    }
    const hold = id => (id === 'porcelain' ? PERIOD * 2 : PERIOD);   // Porcelain is home: it stays twice as long
    function schedule(which, ms) {
        clearTimeout(clocks[which]);
        if (!quiet()) clocks[which] = setTimeout(() => turn(which), ms);
    }
    function turn(which) {
        if (document.hidden) { schedule(which, PERIOD); return; }
        if (which === 'logo') stepLogo(); else stepMentor();
        schedule(which, hold(which === 'logo' ? ORDER[at] : ORDER[mentorAt]));
    }
    function run() { schedule('logo', hold(ORDER[at])); schedule('mentor', PERIOD / 2); }
    // a new look, accent or motion setting: home to Porcelain and start again; day and night or the Mentor's orb style: repaint
    let dark = night();
    new MutationObserver(list => {
        const restart = list.some(m => ['data-look', 'data-motion', 'data-accent', 'data-accent-dark'].includes(m.attributeName));
        const orbStyle = list.some(m => ['data-orb', 'data-orb-dark'].includes(m.attributeName));
        if (!restart && !orbStyle && night() === dark) return;   // <html> changes class often; only day and night matter here
        dark = night();
        if (restart) { at = 0; mentorAt = MENTOR_AHEAD; run(); }
        fill(); fillMentor(); icon(ORDER[at]);
    }).observe(root, { attributes: true, attributeFilter: ['data-look', 'data-motion', 'data-accent', 'data-accent-dark', 'data-orb', 'data-orb-dark', 'class'] });
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', run);

    // ── lean: within 5 cm of the pointer the logo and the Mentor button wake up: the still ring fades in and the orb
    //    leans toward the pointer inside it, pulled like a magnet close by. Full strength within 3.5 cm, fading out by
    //    5 cm so nothing snaps; the open Mentor always leans. ──
    const REACH = 189;   // 5 cm in CSS pixels (96 to the inch)
    let px = -1e4, py = -1e4, frame = 0;
    function lean(home) {
        frame = 0;
        // no mouse yet (phones, tablets): the open Mentor stays centred instead of leaning toward a pointer off screen
        const still = home || quiet() || px < -9e3, open = document.getElementById('mentor')?.dataset.state === 'open';
        document.querySelectorAll('#mentor-orb, .sidebar-logo .brand-ring, .auth-brand .brand-ring, .sk-brand .brand-ring, .ob-brand .brand-ring').forEach(h => {
            const r = h.getBoundingClientRect();
            if (!r.width) return;
            const dx = px - (r.left + r.width / 2), dy = py - (r.top + r.height / 2), d = Math.hypot(dx, dy) || 1;
            const near = still ? 0 : open && h.id === 'mentor-orb' ? 1 : Math.min(1, Math.max(0, (REACH - d) / (REACH * 0.3)));
            // coming close throws the next glaze at once (at most every 2.5 s, so it never flickers)
            const was = h._near || 0, now = performance.now();
            h._near = near;
            if (!still && was < 0.35 && near >= 0.65 && now - (h._thrown || 0) > 2500) { h._thrown = now; volley(h.id === 'mentor-orb' ? 'mentor' : 'logo'); }
            // at most a sixth of its size off centre; the open Mentor keeps its ring lit but stays centred in it
            const k = open && h.id === 'mentor-orb' ? 0 : near * Math.min(d * 0.12, r.width * 0.16) / d;
            h.style.setProperty('--pull-x', `${(dx * k).toFixed(1)}px`);
            h.style.setProperty('--pull-y', `${(dy * k).toFixed(1)}px`);
            h.style.setProperty('--near', near.toFixed(2));
        });
    }
    // a finger counts too, while it is on the screen: within 5 cm the logo leans toward it, and lifting it lets the logo
    // settle back to the centre (a mouse keeps leaning wherever it rests). Touch events, not pointer events, because a
    // sliding finger scrolls the page and the browser cancels its pointer, while touchmove keeps coming.
    const follow = (x, y) => { px = x; py = y; frame ||= requestAnimationFrame(() => lean(false)); };
    addEventListener('pointermove', e => { if (e.pointerType === 'mouse') follow(e.clientX, e.clientY); }, { passive: true });
    const finger = e => { const t = e.touches[0]; if (t) follow(t.clientX, t.clientY); };
    addEventListener('touchstart', finger, { passive: true });
    addEventListener('touchmove', finger, { passive: true });
    const lift = e => { if (e.touches.length) return; px = py = -1e4; cancelAnimationFrame(frame); frame = 0; lean(true); };
    addEventListener('touchend', lift, { passive: true });
    addEventListener('touchcancel', lift, { passive: true });
    document.addEventListener('mouseleave', () => lean(true));   // the pointer left the window: back to the centre
    const mentorEl = document.getElementById('mentor');   // opening or closing the Mentor changes how it leans
    if (mentorEl) new MutationObserver(() => lean(false)).observe(mentorEl, { attributes: true, attributeFilter: ['data-state'] });

    // ── pulse: one twirl of the logo in the side panel when you change tabs (its star and orbits look the same after a turn) ──
    function pulse() {
        const orb = document.querySelector('#sidebar .sidebar-logo .brand-orb');
        if (!orb || quiet() || matchMedia('(max-width: 47.99rem)').matches) return;   // phones hide it; no layout read needed
        orb.querySelector('.m-orb-art')?.animate([{ rotate: '0deg' }, { rotate: '360deg' }], { duration: 950, easing: 'cubic-bezier(0.3, 1.3, 0.5, 1)', composite: 'add' });
        orb.querySelector('.m-orb-sphere')?.animate([{ scale: 1 }, { scale: 0.84, offset: 0.28 }, { scale: 1.07, offset: 0.62 }, { scale: 1 }], { duration: 640, easing: 'ease-out' });
    }

    // ── travel: carry the logo from one place to another, then seat it with a little bounce ──
    const FLY = 'cubic-bezier(0.7, 0, 0.18, 1)';
    function seat(to) { to.animate([{ scale: 1.2 }, { scale: 1 }], { duration: 520, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }); }
    function flight(el, from, to, duration) {
        const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
        const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
        to.style.visibility = 'hidden';   // the ring waits; the logo lands in it
        const done = () => { to.style.visibility = ''; seat(to); };
        const fly = el.animate([{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(${b.width / a.width})` }], { duration, easing: FLY, fill: 'forwards' });
        fly.finished.then(done, done);
        return fly;
    }
    function travel(from, ...places) {   // to the first of the places that is on screen
        const to = places.find(el => el?.getBoundingClientRect().width);
        if (!from || !to || quiet()) return;
        const a = from.getBoundingClientRect();
        if (!a.width) return;
        const ghost = from.cloneNode(true);
        Object.assign(ghost.style, { position: 'fixed', left: `${a.left}px`, top: `${a.top}px`, margin: '0', zIndex: '3200', pointerEvents: 'none' });
        ghost.style.setProperty('--s', `${a.width}px`);
        document.body.append(ghost);
        flight(ghost, ghost, to, 900).finished.finally(() => ghost.remove());
    }

    // ── the splash ──
    const splash = document.getElementById('splash');
    let landed = null, splashed = !splash || getComputedStyle(splash).display === 'none', skipping = false;
    const waiting = [];
    if (splashed) { splash?.remove(); root.classList.remove('splashing'); }
    function afterSplash(fn) { if (splashed) fn(); else waiting.push(fn); }
    const wait = ms => new Promise(resolve => setTimeout(resolve, skipping ? 0 : ms));
    function tint(id) {   // the splash's own logo takes a glaze (brand.css blends it)
        const p = palette(id);
        splash.style.setProperty('--sp-core', p.core); splash.style.setProperty('--sp-deep', p.deep); splash.style.setProperty('--sp-ink', p.star);
    }
    // a throw: a blob of paint flies in on an arc from one side, stretched by its speed, and splats on the logo;
    // a few drops stay on the paper until the page opens
    function throwAt(id, side) {
        if (skipping) { tint(id); return Promise.resolve(); }
        const mark = splash.querySelector('.sp-orb'), r = mark.getBoundingClientRect(), p = palette(id);
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2, size = r.width * 0.34;
        const far = Math.hypot(innerWidth, innerHeight) / 2 + size, a = side * Math.PI / 180;   // side: the angle it comes from
        const sx = cx + Math.cos(a) * far, sy = cy + Math.sin(a) * far;
        const mx = (sx + cx) / 2, my = Math.min(sy, cy) - r.height * 1.6;   // the top of the arc
        const blob = document.createElement('i');
        blob.className = 'sp-blob';
        Object.assign(blob.style, { width: `${size}px`, height: `${size}px`, color: p.deep, background: `radial-gradient(circle at 34% 30%, ${p.core}, ${p.deep} 62%, ${p.star})` });
        splash.append(blob);
        const frames = [];
        for (let k = 0; k <= 12; k++) {
            const t = k / 12, u = 1 - t;
            const x = u * u * sx + 2 * u * t * mx + t * t * cx, y = u * u * sy + 2 * u * t * my + t * t * cy;
            const tx = 2 * u * (mx - sx) + 2 * t * (cx - mx), ty = 2 * u * (my - sy) + 2 * t * (cy - my), st = 1 + t * 0.7;
            frames.push({ transform: `translate(${x - size / 2}px, ${y - size / 2}px) rotate(${Math.atan2(ty, tx)}rad) scale(${st}, ${1 / st})` });
        }
        return blob.animate(frames, { duration: 560, easing: 'cubic-bezier(.45, 0, .85, .55)' }).finished.then(() => {
            blob.remove();
            tint(id);
            const toward = Math.atan2(cy - my, cx - mx);
            mark.animate([{ scale: 1 }, { scale: 0.88, offset: 0.2 }, { scale: 1.06, offset: 0.55 }, { scale: 1 }], { duration: 620, easing: 'ease-out' });
            const ring = document.createElement('i');
            ring.className = 'sp-ripple';
            Object.assign(ring.style, { left: `${cx}px`, top: `${cy}px`, width: `${r.width}px`, height: `${r.width}px`, borderColor: p.deep });
            splash.append(ring);
            ring.animate([{ transform: 'translate(-50%, -50%) scale(1)', opacity: 0.8 }, { transform: 'translate(-50%, -50%) scale(1.9)', opacity: 0 }], { duration: 700, easing: 'cubic-bezier(.2, .7, .3, 1)' }).onfinish = () => ring.remove();
            for (let i = 0; i < 14; i++) {   // the spatter: most drops fly on and fall, a few stay on the paper
                const d = document.createElement('i'), s = size * (0.1 + Math.random() * 0.22), stays = i % 4 === 0;
                d.className = stays ? 'sp-spot' : 'sp-fleck';
                Object.assign(d.style, { left: `${cx}px`, top: `${cy}px`, width: `${s}px`, height: `${s * (0.8 + Math.random() * 0.4)}px`, background: p.deep });
                splash.append(d);
                const a = toward + (Math.random() - 0.5) * 2.2, dist = r.width * (0.6 + Math.random() * (stays ? 0.7 : 1.4));
                d.animate([{ transform: 'translate(-50%, -50%) scale(.4)', opacity: 1 },
                    { transform: `translate(calc(-50% + ${Math.cos(a) * dist}px), calc(-50% + ${Math.sin(a) * dist + (stays ? 0 : r.width * 0.5)}px)) scale(1)`, opacity: stays ? 0.85 : 0 }],
                { duration: 480 + Math.random() * 260, easing: 'cubic-bezier(.15, .7, .35, 1)', fill: 'forwards' }).onfinish = () => { if (!stays) d.remove(); };
            }
        }, () => blob.remove());
    }
    async function throws() {
        const quick = root.dataset.splash === 'quick';
        // seven throws from all round the logo (the last from straight below), every load; the daily full show just takes its time
        const shots = ['coral', 'saffron', 'matcha', 'sky', 'lilac', 'blush', 'aqua'].map((id, i) => [id, [180, 0, 120, 300, 60, 240, 90][i]]);   // the 7th from straight below
        for (const [id, side] of shots) { await throwAt(id, side); await wait(quick ? 90 : 220); }
        splash.classList.add('sp-wash');   // a soft white pass, and the glaze washes back to Porcelain
        tint('porcelain');
        await wait(quick ? 360 : 520);
    }
    // where the logo lives on the page that is opening: the sign-in page, onboarding, the side panel or, on a phone, the Mentor
    function home() {
        for (const s of ['#auth-gate:not([hidden]) .sk-brand .brand-orb', '#auth-gate:not([hidden]) .auth-brand .brand-orb', '.ob-brand .brand-orb', '#sidebar .sidebar-logo .brand-orb', '#mentor-orb .m-orb']) {
            const el = document.querySelector(s), r = el?.getBoundingClientRect();
            if (r?.width && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth) return el;
        }
        return null;
    }
    function land() {
        if (splashed || splash.classList.contains('sp-leaving')) return;
        splash.classList.add('sp-leaving');
        const mark = splash.querySelector('.sp-orb'), curtain = splash.querySelector('.sp-curtain'), to = home();
        let x = innerWidth / 2, y = innerHeight / 2;
        if (to) {
            const b = to.getBoundingClientRect();
            x = b.left + b.width / 2; y = b.top + b.height / 2;
            landed = to;
            flight(mark, mark, to, 820).finished.finally(release);   // the page's own entrance starts as the logo lands
        } else {
            mark.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.4)' }], { duration: 520, easing: FLY, fill: 'forwards' }).finished.finally(release);
        }
        // the page opens out from where the logo lands
        splash.style.setProperty('--hx', `${x}px`); splash.style.setProperty('--hy', `${y}px`);
        splash.classList.add('sp-open');
        const far = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 60;
        curtain.animate({ '--sp-hole': ['0px', `${far}px`] }, { duration: 760, delay: 380, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'forwards' });
        curtain.animate([{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: 760, delay: 380, fill: 'forwards' })
            .finished.finally(() => { release(); splash.remove(); root.classList.remove('splashing'); });
    }
    function release() {
        if (splashed) return;
        splashed = true;
        waiting.splice(0).forEach(fn => fn());
    }
    if (!splashed) {
        const word = splash.querySelector('.sp-word span:last-child');
        const drawn = Promise.all((word?.getAnimations() || []).map(a => a.finished)).catch(() => {});
        const ready = new Promise(resolve => {
            const ok = () => !root.classList.contains('auth-checking');
            if (ok()) { resolve(); return; }
            new MutationObserver((_, o) => { if (ok()) { o.disconnect(); resolve(); } }).observe(root, { attributes: true, attributeFilter: ['class'] });
        });
        // a click or a key skips ahead: the drawing finishes at once and the paint lands without its flight
        const skip = () => {
            skipping = true;
            splash.getAnimations({ subtree: true }).forEach(a => { try { a.finish(); } catch (e) { /* the endless ones */ } });
        };
        splash.addEventListener('pointerdown', skip);
        addEventListener('keydown', skip, { once: true });
        drawn.then(() => { splash.classList.add('sp-built'); return throws(); })
            .then(() => Promise.all([ready, document.fonts?.ready]))
            .then(() => requestAnimationFrame(land));
        setTimeout(land, 14000);   // never keep anyone waiting on the logo
    }

    // a volley: seven glazes, six from all round and the seventh from straight below, landing on the next glaze in the order.
    // Clicking or coming close to the logo or the Mentor button throws one; so does coming back to the tab (keep: true
    // ends on the glaze it already wore)
    // a bubble's pop, made on the spot: a short sine that swoops up, each one a little higher (only after a click,
    // the one time browsers let a page make a sound)
    let audio = null;
    function bubble(step) {
        try {
            audio ||= new (window.AudioContext || window.webkitAudioContext)();
            const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain(), f = 380 * 2 ** (step / 7);
            o.type = 'sine';
            o.frequency.setValueAtTime(f, t);
            o.frequency.exponentialRampToValueAtTime(f * 2.6, t + 0.07);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.16, t + 0.008);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
            o.connect(g).connect(audio.destination);
            o.start(t); o.stop(t + 0.12);
        } catch (e) { /* no Web Audio: silent */ }
    }
    const LOGOS = '.sidebar-logo .brand-orb, .sk-brand .brand-orb, .auth-brand .brand-orb, .ob-brand .brand-orb';
    function volley(which, { keep = false, ms = 560, gap = 260, sound = false } = {}) {
        const mentor = which === 'mentor';
        const orb = mentor ? (mentorGlazed() && mentorOrb()) : [...document.querySelectorAll(LOGOS)].find(el => el.getClientRects().length);
        if (!orb || !splashed || quiet()) return;
        const now = performance.now();
        if (now < (orb._lands?.at(-1) || 0) + 150) {   // one is already flying (the pointer woke it): a click still hears its pops
            if (sound) (orb._lands || []).forEach((at, i) => at > now && setTimeout(() => bubble(i), at - now));
            return;
        }
        orb._lands = [0, 1, 2, 3, 4, 5, 6].map(i => now + i * gap + ms);
        if (!keep && mentor) mentorAt = next(mentorAt, ORDER[at]);
        if (!keep && !mentor) { at = next(at, mentorOrb() && mentorGlazed() ? ORDER[mentorAt] : null); icon(ORDER[at]); }
        const end = ORDER[mentor ? mentorAt : at];
        if (!mentor) document.querySelectorAll('.brand-orb').forEach(el => { if (el !== orb) paint(el, end); });
        const pool = GLAZES.map(([id]) => id).filter(id => id !== end).sort(() => Math.random() - 0.5).slice(0, 6);
        const tilt = Math.random() * Math.PI / 3;   // the six sides turn a little each time, so no two volleys match
        // six from all round (alternating sides), the seventh, its new glaze, from straight below
        [...pool, end].forEach((id, i) => setTimeout(() => hit(orb, id, i < 6 ? tilt + [0, 3, 1, 4, 2, 5][i] * Math.PI / 3 : Math.PI / 2, ms), i * gap));
        if (sound) orb._lands.forEach((at, i) => setTimeout(() => bubble(i), at - now));   // a pop as each drop lands
        schedule(which, hold(end) + 6 * gap + ms);   // the clock waits for the volley to land
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) volley('logo', { keep: true, ms: 420, gap: 180 }); });   // back on the tab: a touch quicker
    document.addEventListener('click', e => {
        const h = e.target.closest('#mentor-orb, .sidebar-logo, .sk-brand, .auth-brand, .ob-brand');
        if (h) volley(h.id === 'mentor-orb' ? 'mentor' : 'logo', { sound: true });
    });

    fill(); fillMentor(); icon(ORDER[at]); run();
    // show(id): every logo, and the Mentor if it wears glazes, in one glaze now (for previews and checks)
    function show(id) {
        document.querySelectorAll('.brand-orb').forEach(el => paint(el, id));
        const orb = mentorOrb();
        if (orb && mentorGlazed()) paint(orb, id);
    }
    return { fill, glazes: () => [...ORDER], favicon, pulse, travel, afterSplash, show, get landed() { return landed; } };
})();
window.Brand = Brand;
