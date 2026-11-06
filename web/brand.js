/**
 * Vettly's logo is the Mentor's orb. Wherever it stands (the side panel, the sign-in page, onboarding, the browser
 * tab) it keeps its animation and slowly travels through colours. It starts on Porcelain, its home colour (an ivory
 * disc, the sparkle in your accent's ink), then eases through the looks and comes back: Poster orange, Studio clay,
 * Blueprint blue, Bubblegum pink, Sakura blossom, Lavender, Strawberry, Mermaid teal. Register's ink stays out.
 * brand.css registers every colour so each blends into the next; the logo rests when the tab is hidden, under Calm,
 * or with reduced motion.
 *
 * Also the logo's moves:
 *  - lean: the Mentor button and the logo in the side panel wake as the pointer comes within 5 cm: a still ring
 *    fades in and the orb leans toward the pointer inside it (the open Mentor always leans)
 *  - pulse: a twirl when you change tabs
 *  - travel: it flies from the sign-in page to its place in the side panel when you sign in
 *  - the splash: on every load it draws itself (markup in index.html, drawing in brand.css), then flies to its
 *    place and the page opens out from there; afterSplash(fn) runs fn once it has landed
 * Markup: <span class="brand-ring"><span class="m-orb brand-orb" data-look="glow" data-emblem aria-hidden="true"></span></span>
 */
const Brand = (() => {
    const root = document.documentElement;
    // core, deep, glow (r, g, b), the star
    const LOOKS = {
        classic: ['#f06a20', '#a83a08', '240, 106, 32', '#fff9ee'],
        studio: ['#e0703a', '#8f3412', '224, 112, 58', '#fff4ea'],
        blueprint: ['#3f83f8', '#1e3a8a', '63, 131, 248', '#eef6ff'],
        bubblegum: ['#f0508a', '#9d1550', '240, 80, 138', '#fff0f6'],
        sakura: ['#f29bb5', '#b8506f', '242, 155, 181', '#fff6f8'],
        lavender: ['#a07cf0', '#5537b0', '160, 124, 240', '#f6f1ff'],
        strawberry: ['#f06b8a', '#ad2848', '240, 107, 138', '#fff3f5'],
        mermaid: ['#2fc4bf', '#1d6684', '47, 196, 191', '#effffe'],
    };
    const ORDER = ['porcelain', ...Object.keys(LOOKS)];
    const quiet = () => matchMedia('(prefers-reduced-motion: reduce)').matches || root.dataset.motion === 'calm';
    const PERIOD = 6000;   // each colour holds this long; Porcelain twice as long
    let at = 0, timer = 0;

    // every colour of the orb, for one look; Porcelain reads the theme's own porcelain tokens (they change at night)
    function palette(id) {
        if (id === 'porcelain') {
            const cs = getComputedStyle(root), tok = n => cs.getPropertyValue(`--orb-porcelain-${n}`).trim();
            const star = tok('star') || '#2b3346', mix = p => `color-mix(in srgb, ${star} ${p}%, transparent)`;
            return {
                core: tok('core'), deep: tok('deep'), star, aura: 'transparent', ripple: mix(36), spec: 'rgba(255, 255, 255, 0.95)',
                sheen: 'rgba(255, 255, 255, 0.5)', shade: tok('inset'), rim: 'rgba(255, 255, 255, 0.9)', edge: tok('edge'), drop: tok('drop'),
                'star-drop': mix(30), line: mix(24), run: mix(55), head: star, 'head-glow': 'transparent', halo: mix(32), bezel: mix(34),
            };
        }
        const [core, deep, rgb, star] = LOOKS[id];
        return {
            core, deep, star, aura: `rgba(${rgb}, 0.24)`, ripple: `rgba(${rgb}, 0.5)`, spec: 'rgba(255, 249, 238, 0.9)',
            sheen: 'rgba(255, 255, 255, 0.26)', shade: `color-mix(in srgb, ${deep} 34%, transparent)`, rim: 'rgba(255, 255, 255, 0.55)',
            edge: 'rgba(255, 255, 255, 0.14)', drop: `rgba(${rgb}, 0.7)`, 'star-drop': `color-mix(in srgb, ${deep} 40%, transparent)`,
            line: 'rgba(255, 249, 238, 0.3)', run: 'rgba(255, 250, 240, 0.5)', head: '#ffffff', 'head-glow': '#ffffff',
            halo: 'rgba(255, 250, 240, 0.35)', bezel: 'rgba(255, 249, 238, 0.5)',
        };
    }
    function paint(el, id) {
        for (const [k, v] of Object.entries(palette(id))) el.style.setProperty(`--orb-${k}`, v);
        el.dataset.brandLook = id;
    }
    // the tab's icon: the orb drawn small, in the same colours
    function favicon(id) {
        const p = palette(id), lines = id === 'porcelain' ? p.star : '#fff';
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><radialGradient id="g" cx="38%" cy="30%" r="78%"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset=".28" stop-color="${p.core}"/><stop offset="1" stop-color="${p.deep}"/></radialGradient></defs><circle cx="16" cy="16" r="15" fill="url(#g)"${id === 'porcelain' ? ' stroke="#000" stroke-opacity=".14"' : ''}/><ellipse cx="16" cy="16" rx="12.6" ry="4.6" fill="none" stroke="${lines}" stroke-opacity=".6" stroke-width="1.1" transform="rotate(-35 16 16)"/><ellipse cx="16" cy="16" rx="12.6" ry="4.6" fill="none" stroke="${lines}" stroke-opacity=".35" stroke-width="1" transform="rotate(35 16 16)"/><path d="M16 7.2C16.7 13 19 15.3 24.8 16C19 16.7 16.7 19 16 24.8C15.3 19 13 16.7 7.2 16C13 15.3 15.3 13 16 7.2Z" fill="${p.star}"/></svg>`;
        return `data:image/svg+xml,${encodeURIComponent(svg)}`;
    }
    function icon(id) {
        let link = document.querySelector('link[rel="icon"]');
        if (!link) { link = Object.assign(document.createElement('link'), { rel: 'icon' }); document.head.append(link); }
        link.type = 'image/svg+xml';
        link.href = favicon(id);
    }
    // fill and colour every brand orb in scope (onboarding calls this when it draws its header)
    function fill(scope = document) {
        scope.querySelectorAll('.brand-orb').forEach(el => {
            if (!el.childElementCount && typeof MENTOR_EMBLEM === 'string') el.innerHTML = MENTOR_EMBLEM;
            const fresh = !el.dataset.brandLook;   // a new orb takes its colour at once; only changes blend
            if (fresh) el.style.transition = 'none';
            paint(el, ORDER[at]);
            if (fresh) { void el.offsetWidth; el.style.transition = ''; }
        });
    }
    function step() {
        at = (at + 1) % ORDER.length;
        fill();
        icon(ORDER[at]);
        timer = setTimeout(tick, at ? PERIOD : PERIOD * 2);
    }
    function tick() { if (document.hidden) timer = setTimeout(tick, PERIOD); else step(); }
    function run() {
        clearTimeout(timer); timer = 0;
        if (!quiet()) timer = setTimeout(tick, PERIOD * 2);
    }
    // a new look, a new motion setting: home to Porcelain and start again; day and night: the same colour, repainted
    let dark = root.classList.contains('theme-dark');
    new MutationObserver(list => {
        const restart = list.some(m => m.attributeName !== 'class'), night = root.classList.contains('theme-dark');
        if (!restart && night === dark) return;   // <html> changes class often; only day and night matter here
        dark = night;
        if (restart) { at = 0; run(); }
        fill(); icon(ORDER[at]);
    }).observe(root, { attributes: true, attributeFilter: ['data-look', 'data-motion', 'data-accent', 'data-accent-dark', 'class'] });
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', run);

    // ── lean: within 5 cm of the pointer the Mentor button and the side panel's logo wake up: the still ring fades in
    //    and the orb leans toward the pointer inside it, pulled like a magnet close by. Full strength within 3.5 cm,
    //    fading out by 5 cm so nothing snaps; the open Mentor always leans. ──
    const REACH = 189;   // 5 cm in CSS pixels (96 to the inch)
    let px = -1e4, py = -1e4, frame = 0;
    function lean(home) {
        frame = 0;
        const still = home || quiet(), open = document.getElementById('mentor')?.dataset.state === 'open';
        document.querySelectorAll('#mentor-orb, .sidebar-logo .brand-ring').forEach(h => {
            const r = h.getBoundingClientRect();
            if (!r.width) return;
            const dx = px - (r.left + r.width / 2), dy = py - (r.top + r.height / 2), d = Math.hypot(dx, dy) || 1;
            const near = still ? 0 : open && h.id === 'mentor-orb' ? 1 : Math.min(1, Math.max(0, (REACH - d) / (REACH * 0.3)));
            const k = near * Math.min(d * 0.12, r.width * 0.16) / d;   // at most a sixth of its size off centre
            h.style.setProperty('--pull-x', `${(dx * k).toFixed(1)}px`);
            h.style.setProperty('--pull-y', `${(dy * k).toFixed(1)}px`);
            h.style.setProperty('--near', near.toFixed(2));
        });
    }
    addEventListener('pointermove', e => {
        if (e.pointerType !== 'mouse') return;
        px = e.clientX; py = e.clientY;
        frame ||= requestAnimationFrame(() => lean(false));
    }, { passive: true });
    document.addEventListener('mouseleave', () => lean(true));   // the pointer left the window: back to the centre
    const mentorEl = document.getElementById('mentor');   // opening or closing the Mentor changes how it leans
    if (mentorEl) new MutationObserver(() => lean(false)).observe(mentorEl, { attributes: true, attributeFilter: ['data-state'] });

    // ── pulse: one twirl of the logo in the side panel when you change tabs (its star and orbits look the same after a turn) ──
    function pulse() {
        const orb = document.querySelector('#sidebar .sidebar-logo .brand-orb');
        if (!orb || quiet() || !orb.getClientRects().length) return;
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

    // ── the splash: lands once the drawing is done and the page behind it is ready (signed in or not) ──
    const splash = document.getElementById('splash');
    let landed = null, splashed = !splash || getComputedStyle(splash).display === 'none';
    const waiting = [];
    if (splashed) { splash?.remove(); root.classList.remove('splashing'); }
    function afterSplash(fn) { if (splashed) fn(); else waiting.push(fn); }
    // where the logo lives on the page that is opening: the sign-in page, onboarding, the side panel or, on a phone, the Mentor
    function home() {
        for (const s of ['#auth-gate:not([hidden]) .auth-brand .brand-orb', '.ob-brand .brand-orb', '#sidebar .sidebar-logo .brand-orb', '#mentor-orb .m-orb']) {
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
        // a click or a key finishes the drawing at once
        const skip = () => splash.getAnimations({ subtree: true }).forEach(a => { try { a.finish(); } catch (e) { /* the endless ones */ } });
        splash.addEventListener('pointerdown', skip);
        addEventListener('keydown', skip, { once: true });
        Promise.all([drawn, ready, document.fonts?.ready]).then(() => requestAnimationFrame(land));
        setTimeout(land, 9000);   // never keep anyone waiting on the logo
    }

    fill(); icon(ORDER[at]); run();
    return { fill, looks: () => [...ORDER], favicon, pulse, travel, afterSplash, get landed() { return landed; } };
})();
window.Brand = Brand;
