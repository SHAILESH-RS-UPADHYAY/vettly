/**
 * Vettly appearance: theme (light, dark, match device), an accent and a Mentor look for each mode,
 * format options (density, cards, corners, text size, background, motion) with one-tap presets,
 * and the particle background. Everything lands as attributes on <html>; tokens.css and mentor.css
 * do the rest. The first paint is set by the bootstrap in index.html, so nothing flashes.
 */
const Appearance = (() => {
    const THEME_KEY = 'acemate_poster_theme';      // 'dark' | 'parchment' | absent (match device)
    const STORE_KEY = 'vettly_appearance';
    const root = document.documentElement;
    const darkQuery = matchMedia('(prefers-color-scheme: dark)');

    const DEFAULTS = {
        accent: 'tangerine', accentDark: 'sky', orb: 'porcelain', orbDark: 'gloss',
        density: 'comfortable', cards: 'soft', corners: 'round', text: 'default', bg: 'particles', motion: 'full',
    };
    // fill, bright tone and text-on-fill of each accent, per mode (the same values as tokens.css)
    const ACCENTS = [
        ['tangerine', 'Tangerine', ['#c9480c', '#f06a20', '#fffaf3'], ['#ff8f52', '#ffb385', '#1a0b03']],
        ['sky', 'Sky', ['#1f72b6', '#4aa8e8', '#f5faff'], ['#5cc0ec', '#9ad8f5', '#06131c']],
        ['lilac', 'Lilac', ['#6a4ddc', '#9b85f5', '#f8f5ff'], ['#b6a2ff', '#d5c8ff', '#160d33']],
        ['mint', 'Mint', ['#157a55', '#34b383', '#f2fbf6'], ['#5fd6a0', '#9cebc6', '#04170f']],
        ['rose', 'Rose', ['#c42d60', '#ec5f8f', '#fff5f8'], ['#ff8fb3', '#ffc0d3', '#2a0612']],
        ['teal', 'Teal', ['#0e7a74', '#2fb0a7', '#effbfa'], ['#4fd1c7', '#8ee6de', '#031615']],
        ['coral', 'Coral', ['#c7402f', '#f0705f', '#fff6f4'], ['#ff8a7a', '#ffc0b6', '#2a0805']],
        ['butter', 'Butter', ['#f0c33c', '#f8d76e', '#2b2100'], ['#f5d36b', '#fbe7a6', '#231a00']],
        ['periwinkle', 'Periwinkle', ['#4a5ed4', '#7487ec', '#f6f7ff'], ['#93a8ff', '#c6d1ff', '#0b1238']],
        ['graphite', 'Graphite', ['#2b3346', '#4a5470', '#f6f1e7'], ['#e6e9f2', '#ffffff', '#0d1220']],
    ];
    const PRESETS = [
        ['studio', 'Studio', 'Soft cards, round corners, particles', { density: 'comfortable', cards: 'soft', corners: 'round', text: 'default', bg: 'particles', motion: 'full' }],
        ['playful', 'Playful', 'Extra round and bouncy', { density: 'comfortable', cards: 'soft', corners: 'rounder', text: 'default', bg: 'particles', motion: 'full' }],
        ['minimal', 'Minimal', 'Outlines, crisp corners, calm', { density: 'comfortable', cards: 'outline', corners: 'crisp', text: 'default', bg: 'plain', motion: 'calm' }],
        ['compact', 'Compact', 'More on screen at once', { density: 'compact', cards: 'outline', corners: 'round', text: 'default', bg: 'grid', motion: 'full' }],
        ['focus', 'Focus', 'Larger text, nothing moving', { density: 'comfortable', cards: 'flat', corners: 'round', text: 'large', bg: 'plain', motion: 'calm' }],
    ];
    const FORMAT_KEYS = ['density', 'cards', 'corners', 'text', 'bg', 'motion'];
    const attr = k => `data-${k.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`;

    const store = {
        get(key, fallback) { try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (e) { return fallback; } },
        set(key, value) { try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch (e) { /* storage blocked */ } },
    };
    let prefs = { ...DEFAULTS };
    try { prefs = { ...DEFAULTS, ...JSON.parse(store.get(STORE_KEY, '{}')) }; } catch (e) { /* keep defaults */ }

    const themeMode = () => ({ dark: 'dark', parchment: 'light' }[store.get(THEME_KEY, '')] || 'device');
    const isDark = () => root.classList.contains('theme-dark');

    function syncThemeChrome() {
        const dark = isDark();
        const label = document.getElementById('theme-label');
        if (label) label.textContent = dark ? 'Light mode' : 'Dark mode';
        document.querySelectorAll('[data-theme-toggle-label]').forEach(el => { el.textContent = dark ? 'Switch to light mode' : 'Switch to dark mode'; });
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.content = getComputedStyle(root).getPropertyValue('--paper').trim() || (dark ? '#0d1220' : '#f6f1e7');
        Ambient.recolor();
    }

    // Swap the theme; with view transitions the new one spreads in a circle from the tapped control
    function applyDark(dark, origin) {
        if (dark === isDark()) { syncThemeChrome(); return; }
        const flip = () => { root.classList.toggle('theme-dark', dark); syncThemeChrome(); renderSettings(); };
        if (!document.startViewTransition || Motion.calm() || !origin) { flip(); return; }
        const r = origin.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
        root.classList.add('vt-theme');
        const t = document.startViewTransition(flip);
        t.ready.then(() => root.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
            { duration: 560, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' },
        )).catch(() => {});
        t.finished.finally(() => root.classList.remove('vt-theme'));
    }

    function setThemeMode(mode, origin) {
        store.set(THEME_KEY, mode === 'dark' ? 'dark' : mode === 'light' ? 'parchment' : null);
        applyDark(mode === 'dark' || (mode === 'device' && darkQuery.matches), origin);
        renderSettings();
    }
    // The sidebar and More-sheet button: flip to the opposite of what is showing
    function toggle(e) { setThemeMode(isDark() ? 'light' : 'dark', e?.currentTarget || e?.target?.closest?.('button')); }
    darkQuery.addEventListener('change', () => { if (themeMode() === 'device') applyDark(darkQuery.matches, null); });

    function set(key, value) {
        prefs[key] = value;
        root.setAttribute(attr(key), value);
        store.set(STORE_KEY, JSON.stringify(prefs));
        if (key.startsWith('accent') || key === 'cards') syncThemeChrome();
        if (key === 'bg' || key === 'motion') Ambient.restart();
        renderSettings();
    }
    function applyPreset(id) {
        const p = PRESETS.find(x => x[0] === id);
        if (!p) return;
        Object.entries(p[3]).forEach(([k, v]) => { prefs[k] = v; root.setAttribute(attr(k), v); });
        store.set(STORE_KEY, JSON.stringify(prefs));
        Ambient.restart();
        renderSettings();
    }
    function reset(origin) {
        prefs = { ...DEFAULTS };
        Object.entries(prefs).forEach(([k, v]) => root.setAttribute(attr(k), v));
        store.set(STORE_KEY, null);
        setThemeMode('device', origin);
        Ambient.restart();
        syncThemeChrome();
    }
    const activePreset = () => PRESETS.find(p => FORMAT_KEYS.every(k => p[3][k] === prefs[k]))?.[0] || null;

    // ── Settings card (index.html #appearance-card) ──
    let editMode = null;   // which mode the colour and look pickers edit: 'light' | 'dark'
    function renderSettings() {
        const card = document.getElementById('appearance-card');
        if (!card) return;
        editMode = editMode || (isDark() ? 'dark' : 'light');
        const mode = themeMode();
        card.querySelectorAll('[data-ap-theme] > button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === mode)));
        card.querySelectorAll('[data-ap-edit] > button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === editMode)));
        const box = card.querySelector('[data-ap-mode-box]');
        box.classList.toggle('preview-dark', editMode === 'dark');
        box.classList.toggle('preview-light', editMode === 'light');
        const accentKey = editMode === 'dark' ? 'accentDark' : 'accent';
        const orbKey = editMode === 'dark' ? 'orbDark' : 'orb';
        card.querySelector('[data-ap-swatches]').innerHTML = ACCENTS.map(([id, name, l, d]) => {
            const [fill, bright, on] = editMode === 'dark' ? d : l;
            return `<button type="button" class="swatch" data-ap-accent="${id}" aria-pressed="${prefs[accentKey] === id}" style="--sw:${fill};--sw2:${bright};--sw-on:${on}">
                <span class="swatch-dot" aria-hidden="true"><svg class="swatch-check"><use href="#i-check-bold"/></svg></span><span class="swatch-name">${name}</span></button>`;
        }).join('');
        card.querySelectorAll('[data-ap-orb]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.apOrb === prefs[orbKey])));
        card.querySelector('[data-ap-mode-note]').textContent = editMode === (isDark() ? 'dark' : 'light')
            ? 'Changes show right away.' : `These apply when the app is in ${editMode} mode.`;
        const current = activePreset();
        card.querySelector('[data-ap-presets]').innerHTML = PRESETS.map(([id, name, desc, o]) => `
            <button type="button" class="preset" data-ap-preset="${id}" aria-pressed="${current === id}" data-corners="${o.corners}" data-cards="${o.cards}" data-density="${o.density}">
                <span class="preset-thumb" aria-hidden="true"><i></i><i></i><i></i><b></b></span>
                <span class="preset-name">${name}</span><span class="preset-desc">${desc}</span>
            </button>`).join('');
        card.querySelectorAll('[data-ap-opt]').forEach(seg => {
            seg.querySelectorAll(':scope > button').forEach(b => b.setAttribute('aria-pressed', String(prefs[seg.dataset.apOpt] === b.dataset.v)));
        });
        card.querySelectorAll('.seg').forEach(Motion.watchSeg);
    }
    function bindSettings() {
        const card = document.getElementById('appearance-card');
        if (!card) return;
        card.addEventListener('click', e => {
            const b = e.target.closest('button');
            if (!b || !card.contains(b)) return;
            const seg = b.parentElement;
            if (seg.matches('[data-ap-theme]')) setThemeMode(b.dataset.v, b);
            else if (seg.matches('[data-ap-edit]')) { editMode = b.dataset.v; renderSettings(); }
            else if (b.dataset.apAccent) {
                const entry = ACCENTS.find(a => a[0] === b.dataset.apAccent);
                set(editMode === 'dark' ? 'accentDark' : 'accent', b.dataset.apAccent);
                const dot = card.querySelector(`[data-ap-accent="${b.dataset.apAccent}"] .swatch-dot`);
                Motion.burst(dot, 10, (editMode === 'dark' ? entry[3] : entry[2]).slice(0, 2));
            }
            else if (b.dataset.apOrb) set(editMode === 'dark' ? 'orbDark' : 'orb', b.dataset.apOrb);
            else if (b.dataset.apPreset) applyPreset(b.dataset.apPreset);
            else if (seg.matches('[data-ap-opt]')) set(seg.dataset.apOpt, b.dataset.v);
            else if (b.id === 'appearance-reset') { editMode = null; reset(b); }
        });
        renderSettings();
    }

    // ── Ambient particles: drift in the accent's glow, pause when hidden, still under Calm ──
    const Ambient = (() => {
        const canvas = document.getElementById('particle-canvas');
        const ctx = canvas?.getContext('2d');
        let w = 0, h = 0, dpr = 1, dots = [], raf = 0, rgb = '240, 106, 32';
        const mouse = { x: null, y: null, r: 140 };
        const enabled = () => canvas && prefs.bg === 'particles';
        function size() {
            if (!canvas) return;
            dpr = Math.min(devicePixelRatio || 1, 2);
            w = innerWidth; h = innerHeight;
            canvas.width = w * dpr; canvas.height = h * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const n = Math.round(Math.min(110, (w * h) / (w < 768 ? 26000 : 15000)));
            dots = Array.from({ length: n }, () => ({
                x: Math.random() * w, y: Math.random() * h,
                vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5,
                r: Math.random() * 1.8 + 0.8, a: Math.random() * 0.35 + 0.12,
            }));
        }
        function draw(move) {
            ctx.clearRect(0, 0, w, h);
            for (const p of dots) {
                if (move) {
                    p.x = (p.x + p.vx + w) % w;
                    p.y = (p.y + p.vy + h) % h;
                    if (mouse.x !== null) {
                        const dx = mouse.x - p.x, dy = mouse.y - p.y, dist = Math.hypot(dx, dy);
                        if (dist < mouse.r && dist > 0) { const f = (mouse.r - dist) / mouse.r; p.x -= (dx / dist) * f * 1.6; p.y -= (dy / dist) * f * 1.6; }
                    }
                }
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${rgb}, ${p.a})`;
                ctx.fill();
            }
        }
        function loop() { draw(true); raf = requestAnimationFrame(loop); }
        function stop() { cancelAnimationFrame(raf); raf = 0; }
        function restart() {
            stop();
            if (!enabled()) { ctx?.clearRect(0, 0, w, h); return; }
            if (!dots.length) size();
            if (Motion.calm() || document.hidden) { draw(false); return; }
            loop();
        }
        function recolor() {
            rgb = getComputedStyle(root).getPropertyValue('--glow-rgb').trim() || rgb;
            if (enabled() && !raf) draw(false);
        }
        if (canvas) {
            addEventListener('resize', () => { size(); restart(); }, { passive: true });
            addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { mouse.x = e.clientX; mouse.y = e.clientY; } }, { passive: true });
            document.addEventListener('visibilitychange', restart);
            matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', restart);
        }
        return { size, restart, recolor };
    })();

    function boot() {
        Object.entries(prefs).forEach(([k, v]) => root.setAttribute(attr(k), v));
        syncThemeChrome();
        Ambient.size();
        Ambient.restart();
        bindSettings();
    }

    return { boot, toggle, setThemeMode, set, applyPreset, reset, isDark, renderSettings };
})();

// Global names the markup calls
function toggleTheme(e) { Appearance.toggle(e); }
Appearance.boot();
