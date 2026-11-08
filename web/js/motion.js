/**
 * Vettly motion: the few helpers every page shares. Each one checks Motion.calm() first, so the
 * OS "reduce motion" setting and the in-app Calm option both turn movement off while state still changes.
 * Only transform and opacity are animated.
 */
const Motion = (() => {
    const reduceQuery = matchMedia('(prefers-reduced-motion: reduce)');
    const calm = () => reduceQuery.matches || document.documentElement.dataset.motion === 'calm';
    const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';

    // FLIP: measure keyed children, run the DOM change, then glide each survivor from its old spot
    function glide(container, mutate, key = 'key') {
        const before = new Map();
        if (!calm()) container.querySelectorAll(`[data-${key}]`).forEach(el => before.set(el.dataset[key], el.getBoundingClientRect()));
        mutate();
        if (calm()) return;
        container.querySelectorAll(`[data-${key}]`).forEach((el, i) => {
            const was = before.get(el.dataset[key]);
            if (!was) {   // newcomer: rise in, staggered
                el.animate([{ opacity: 0, transform: 'translateY(12px) scale(0.985)' }, { opacity: 1, transform: 'none' }],
                    { duration: 380, delay: Math.min(i, 8) * 35, easing: EASE_OUT, fill: 'backwards' });
                return;
            }
            const now = el.getBoundingClientRect();
            const dx = was.left - now.left, dy = was.top - now.top;
            if (dx || dy) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 420, easing: EASE_OUT });
        });
    }

    // Vettly's sparkle as a clip-path: four points about (x, y), turned by `turn` degrees, its waist at `waist` of its reach
    function sparkle(x, y, reach, waist, turn) {
        const pts = [];
        for (let i = 0; i < 8; i++) {
            const a = (turn + i * 45) * Math.PI / 180, r = i % 2 ? reach * waist : reach;
            pts.push(`${(x + Math.sin(a) * r).toFixed(1)}px ${(y - Math.cos(a) * r).toFixed(1)}px`);
        }
        return `polygon(${pts.join(', ')})`;
    }
    // The new page opens out of its tab through the logo's sparkle: a thin star that turns as it grows and fills
    // out until it covers the page (--vt-x and --vt-y, set by dashboard.js, are in the page's own box)
    function bloom(el, pseudoElement) {
        const cs = getComputedStyle(document.documentElement), m = document.getElementById('main-content').getBoundingClientRect();
        const x = parseFloat(cs.getPropertyValue('--vt-x')) || m.width / 2, y = parseFloat(cs.getPropertyValue('--vt-y')) || 0;
        // how far it has to open: to the farthest corner of the part of the page you can see
        const l = Math.max(0, -m.left), t = Math.max(0, -m.top), r = Math.min(m.width, innerWidth - m.left), b = Math.min(m.height, innerHeight - m.top);
        const far = Math.max(Math.hypot(l - x, t - y), Math.hypot(r - x, t - y), Math.hypot(l - x, b - y), Math.hypot(r - x, b - y));
        const frames = [];
        for (let k = 0; k <= 12; k++) {
            const p = k / 12;   // the waist ends at 0.7 of the reach, so the reach is set to clear the far corner there
            frames.push({ clipPath: sparkle(x, y, (far / 0.7) * 1.04 * p, 0.18 + 0.52 * p * p, 45 * p) });
        }
        return el.animate(frames, { duration: 780, easing: 'cubic-bezier(0.55, 0, 0.2, 1)', pseudoElement });
    }

    // Swap page content inside a view transition when the browser has them
    // Returns a promise that settles once the change has finished animating (callers load their data after it)
    function page(update) {
        const root = document.documentElement;
        if (calm()) { update(); return Promise.resolve(); }
        if (!document.startViewTransition) {   // no view transitions: the new page still opens out of its tab
            update();
            const pg = document.querySelector('.page.active');
            return pg ? bloom(pg).finished.catch(() => {}) : Promise.resolve();
        }
        root.classList.add('vt-page');
        const t = document.startViewTransition(update);
        t.ready.then(() => bloom(root, '::view-transition-new(page)')).catch(() => {});   // skipped by a resize or rotation: the update still ran
        return t.finished.catch(() => {}).finally(() => root.classList.remove('vt-page'));
    }

    // Segmented controls: a single thumb glides to the pressed option
    function thumb(seg) {
        if (!seg) return;
        let t = seg.querySelector(':scope > .seg-thumb');
        if (!t) { t = document.createElement('span'); t.className = 'seg-thumb'; t.setAttribute('aria-hidden', 'true'); seg.prepend(t); }
        const on = seg.querySelector(':scope > button[aria-pressed="true"]');
        if (!on || !on.offsetWidth) { seg.classList.remove('has-thumb'); return; }
        t.style.width = `${on.offsetWidth}px`;
        t.style.transform = `translateX(${on.offsetLeft}px)`;
        seg.classList.add('has-thumb');
    }
    function thumbs(root = document) { root.querySelectorAll('.seg').forEach(thumb); }
    const segObserver = 'ResizeObserver' in window ? new ResizeObserver(entries => entries.forEach(e => thumb(e.target))) : null;
    function watchSeg(seg) { thumb(seg); segObserver?.observe(seg); }

    // The nav highlight: one pill that follows the active item in the sidebar, rail or tab bar
    function pill(nav) {
        const p = nav?.querySelector('.nav-pill');
        // the first active item that is actually on screen (phones hide some and show More instead)
        const on = nav && [...nav.querySelectorAll('.nav-item.active')].find(el => el.offsetWidth > 0);
        if (!p) return;
        if (!on || !on.offsetWidth) { p.classList.remove('ready'); return; }
        p.style.width = `${on.offsetWidth}px`;
        p.style.height = `${on.offsetHeight}px`;
        p.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
        requestAnimationFrame(() => p.classList.add('ready'));
    }

    // Count a real figure up from its last value
    function count(el, to, { duration = 700, format = n => String(n) } = {}) {
        if (!el) return;
        const from = Number(el.dataset.count || 0);
        el.dataset.count = to;
        if (calm() || from === to) { el.textContent = format(to); return; }
        const t0 = performance.now();
        const step = t => {
            const p = Math.min(1, (t - t0) / duration);
            el.textContent = format(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
            if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    // A small burst of sparks from an element's centre (success moments only)
    function burst(el, n = 14, colors) {
        if (!el || calm()) return;
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const palette = colors || ['var(--accent-2)', 'var(--ok)', 'var(--c-sys)', 'var(--c-beh)'];
        for (let i = 0; i < n; i++) {
            const s = document.createElement('span');
            const a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
            const d = 28 + Math.random() * 34;
            s.className = 'spark';
            s.style.left = `${x}px`;
            s.style.top = `${y}px`;
            s.style.setProperty('--dx', `${Math.cos(a) * d}px`);
            s.style.setProperty('--dy', `${Math.sin(a) * d}px`);
            s.style.setProperty('--spark', palette[i % palette.length]);
            document.body.appendChild(s);
            setTimeout(() => s.remove(), 760);
        }
    }

    // Stagger index for a list that should rise in one by one
    function stagger(nodes) { [...nodes].forEach((el, i) => el.style.setProperty('--i', Math.min(i, 10))); }

    // Toasts are for failures and effects the page cannot show; errors stay until dismissed
    function toast(message, tone = 'info') {
        let tray = document.getElementById('toast-tray');
        if (!tray) {
            tray = document.createElement('div');
            tray.id = 'toast-tray';
            tray.setAttribute('role', 'status');
            tray.setAttribute('aria-live', 'polite');
            document.body.appendChild(tray);
        }
        const t = document.createElement('div');
        t.className = `toast toast-${tone}`;
        t.innerHTML = `<span></span><button type="button" aria-label="Dismiss"><svg aria-hidden="true"><use href="#i-x-bold"/></svg></button>`;
        t.querySelector('span').textContent = message;
        const close = () => { t.classList.add('out'); setTimeout(() => t.remove(), calm() ? 0 : 220); };
        t.querySelector('button').addEventListener('click', close);
        tray.appendChild(t);
        if (tone !== 'error') {
            let left = 5000, start = Date.now(), timer = setTimeout(close, left);
            t.addEventListener('pointerenter', () => { clearTimeout(timer); left -= Date.now() - start; });
            t.addEventListener('pointerleave', () => { start = Date.now(); timer = setTimeout(close, left); });
        }
    }

    // A type-in field takes focus on its own only where the main pointer is a mouse or trackpad. On phones and tablets
    // a keyboard that pops up uninvited covers half the screen, so the field waits for a tap. Returns whether it focused.
    const coarse = matchMedia('(pointer: coarse)');
    function focusField(el, opts = { preventScroll: true }) {
        if (!el) return false;
        if (el.matches('select') && el._picker) el = el._picker.btn;   // a pretty dropdown: its button, never the hidden <select>
        if (coarse.matches && el.matches('input:not([type="checkbox"], [type="radio"], [type="range"], [type="button"], [type="submit"]), textarea, [contenteditable="true"]')) return false;
        el.focus(opts); return true;
    }

    return { calm, glide, page, thumb, thumbs, watchSeg, pill, count, burst, stagger, toast, focusField };
})();

// modules talk to each other through window: a top-level const is not a window property
window.Motion = Motion;
