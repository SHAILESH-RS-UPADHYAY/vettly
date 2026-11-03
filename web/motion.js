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

    // Swap page content inside a view transition when the browser has them
    function page(update) {
        const root = document.documentElement;
        if (!document.startViewTransition || calm()) { update(); return; }
        root.classList.add('vt-page');
        const t = document.startViewTransition(update);
        t.ready.catch(() => {});   // skipped by a resize or rotation: the update still ran
        t.finished.finally(() => root.classList.remove('vt-page')).catch(() => {});
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

    return { calm, glide, page, thumb, thumbs, watchSeg, pill, count, burst, stagger, toast };
})();

// modules talk to each other through window: a top-level const is not a window property
window.Motion = Motion;
