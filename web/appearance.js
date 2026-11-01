/**
 * Vettly appearance: the Theme Studio in Settings and everything it drives.
 * Theme (Parchment, Spatial Dark, match device) · a look for the whole app · an accent and a Mentor logo
 * per theme · side panel · Mentor panel skin · pipeline beam · layout format with quick presets ·
 * the particle background. Every choice lands as an attribute on <html>; tokens.css, looks.css and
 * mentor.css do the rest. The first paint is set by the bootstrap in index.html, so nothing flashes.
 */
const Appearance = (() => {
    const THEME_KEY = 'acemate_poster_theme';      // 'dark' | 'parchment' | absent (match device)
    const STORE_KEY = 'vettly_appearance_v2';
    const TAB_KEY = 'vettly_studio_tab';
    const root = document.documentElement;
    const darkQuery = matchMedia('(prefers-color-scheme: dark)');

    const DEFAULTS = {
        look: 'classic', accent: 'poster', accentDark: 'spatial', orb: 'porcelain', orbDark: 'gloss',
        sidebar: 'poster', mentorSkin: 'paper', pipeline: 'stream',
        density: 'comfortable', cards: 'soft', corners: 'round', text: 'default', bg: 'particles', motion: 'full',
        tape: 'mix', pages: 'clean', bpInk: 'cyan', bpGrid: 'drafting',
    };
    // a look also brings its own colours and side panel; each stays adjustable afterwards
    const LOOKS = [
        ['classic', 'Poster Classic', 'Your original parchment poster: bright orange, tape and handwriting', { accent: 'poster', accentDark: 'spatial', sidebar: 'poster', tape: 'mix', pages: 'clean' }],
        ['register', 'Register', 'An old school register: ruled pages, red margins, torn edges and tape. A chalkboard at night', { accent: 'coral', accentDark: 'butter', sidebar: 'spiral', tape: 'mix', pages: 'register' }],
        ['studio', 'Studio Soft', 'Calm type, soft cards and frosted glass', { accent: 'tangerine', accentDark: 'sky', sidebar: 'frosted', tape: 'none', pages: 'clean' }],
        ['blueprint', 'Blueprint', 'Drafting lines, mono headings, crisp corners. Pick an ink and a grid below', { accent: 'periwinkle', accentDark: 'sky', sidebar: 'bare', tape: 'drafting', pages: 'clean' }],
        ['bubblegum', 'Bubblegum', 'Cute sticker cards with bold outlines', { accent: 'rose', accentDark: 'rose', sidebar: 'island', tape: 'candy', pages: 'clean' }],
    ];
    // Blueprint's own options: an ink (with the accent that suits it) and a grid template
    const BP_INKS = [
        ['cyan', 'Cyanotype', '#1d4ed8', '#7db4ff', { accent: 'periwinkle', accentDark: 'sky' }],
        ['green', 'Greenline', '#16803d', '#78e6a0', { accent: 'mint', accentDark: 'mint' }],
        ['red', 'Redline', '#c81e32', '#ff8296', { accent: 'coral', accentDark: 'coral' }],
        ['violet', 'Violet ink', '#6e46dc', '#b496ff', { accent: 'lilac', accentDark: 'lilac' }],
        ['amber', 'Sepia', '#b0700a', '#fabe5a', { accent: 'butter', accentDark: 'butter' }],
        ['teal', 'Teal draft', '#0e827a', '#6ee6d7', { accent: 'teal', accentDark: 'teal' }],
        ['graphite', 'Graphite', '#282e3a', '#dce1eb', { accent: 'graphite', accentDark: 'graphite' }],
    ];
    const BP_GRIDS = [
        ['drafting', 'Drafting sheet', 'Bold and fine lines, the original'],
        ['graph', 'Graph paper', 'A tight engineering grid'],
        ['dots', 'Dot grid', 'Quiet dots for sketching'],
        ['iso', 'Isometric', 'Thirty-degree lines for 3D sketches'],
        ['plain', 'Vellum', 'No grid, just the sheet'],
    ];
    // Paper & tape: for every look
    const TAPES = [
        ['mix', 'Washi mix', 'Stripes, dots, grid and pinstripe'],
        ['kraft', 'Kraft masking', 'Brown paper tape'],
        ['candy', 'Candy stripes', 'Bold, sweet and bright'],
        ['drafting', 'Drafting tape', 'Translucent, like on a blueprint'],
        ['none', 'No tape', 'Clean edges'],
    ];
    const PAGES = [
        ['clean', 'Clean cards', "The look's own cards"],
        ['register', 'Register ruled', 'Blue rules and a red margin'],
        ['torn', 'Torn edges', 'Ripped out, with punch holes'],
        ['spiral', 'Spiral bound', 'A coil along the top'],
    ];
    // fill, bright tone and text-on-fill of each accent, per theme (the same values as tokens.css)
    const ACCENTS = [
        ['poster', 'Poster orange', ['#ea580c', '#fb923c', '#ffffff'], ['#fb923c', '#fdba74', '#1a0b03']],
        ['spatial', 'Spatial sky', ['#0284c7', '#38bdf8', '#f0f9ff'], ['#38bdf8', '#7dd3fc', '#070914']],
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
    const SIDEBARS = [
        ['poster', 'Poster', 'Sand, dashed seams, the Poster V2 badge'],
        ['frosted', 'Frosted glass', 'Translucent and blurred'],
        ['slab', 'Midnight slab', 'A dark panel in any theme'],
        ['island', 'Floating island', 'Lifts off the edge'],
        ['bare', 'Bare', 'No panel, the grid shows through'],
        ['spiral', 'Spiral notebook', 'A kraft cover with a coil'],
    ];
    const SKINS = [
        ['frosted', 'Frosted', 'Soft glass frame, warm paper inside'],
        ['paper', 'Paper notebook', 'Ruled lines by day, a chalkboard at night'],
        ['glass', 'Clear glass', 'The page shows through'],
        ['midnight', 'Midnight', 'An ink panel in either theme'],
        ['bubble', 'Bubble', 'Extra round, tinted with your colour'],
    ];
    const PIPES = [
        ['stream', 'Data stream', 'Dots flowing along the line'],
        ['laser', 'Laser', 'A lit line with a racing pulse'],
        ['comet', 'Comet', 'A bright head trailing a tail'],
        ['morse', 'Morse code', 'Dot, dash, dot, dash'],
        ['lightning', 'Lightning', 'Current crackling down a wire'],
        ['aurora', 'Aurora', 'A flowing rainbow'],
        ['off', 'Off', 'No beam, only the pin card'],
    ];
    const PRESETS = [
        ['studio', 'Comfortable', 'Soft cards, round corners, particles', { density: 'comfortable', cards: 'soft', corners: 'round', text: 'default', bg: 'particles', motion: 'full' }],
        ['playful', 'Playful', 'Extra round and bouncy', { density: 'comfortable', cards: 'soft', corners: 'rounder', text: 'default', bg: 'particles', motion: 'full' }],
        ['minimal', 'Minimal', 'Outlines, crisp corners, calm', { density: 'comfortable', cards: 'outline', corners: 'crisp', text: 'default', bg: 'plain', motion: 'calm' }],
        ['compact', 'Compact', 'More on screen at once', { density: 'compact', cards: 'outline', corners: 'round', text: 'default', bg: 'grid', motion: 'full' }],
        ['focus', 'Focus', 'Larger text, nothing moving', { density: 'comfortable', cards: 'flat', corners: 'round', text: 'large', bg: 'plain', motion: 'calm' }],
    ];
    const FORMAT_KEYS = ['density', 'cards', 'corners', 'text', 'bg', 'motion'];
    const THEME_NAMES = { light: 'Parchment', dark: 'Spatial Dark' };
    const attr = k => `data-${k.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`;

    const store = {
        get(key, fallback) { try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (e) { return fallback; } },
        set(key, value) { try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch (e) { /* storage blocked */ } },
    };
    let prefs = { ...DEFAULTS };
    try { prefs = { ...DEFAULTS, ...JSON.parse(store.get(STORE_KEY, '{}')) }; } catch (e) { /* keep defaults */ }
    const save = () => store.set(STORE_KEY, JSON.stringify(prefs));

    const themeMode = () => ({ dark: 'dark', parchment: 'light' }[store.get(THEME_KEY, '')] || 'device');
    const isDark = () => root.classList.contains('theme-dark');
    const calm = () => (typeof Motion !== 'undefined' && Motion.calm());

    // SVG (SMIL) animations in the sprite and the beam ignore CSS, so they pause with Calm and reduced motion
    function syncSvgMotion() {
        const still = calm();
        document.querySelectorAll('.icon-sprite, #mentor-flow').forEach(svg => { if (still) svg.pauseAnimations?.(); else svg.unpauseAnimations?.(); });
    }

    function syncThemeChrome() {
        const dark = isDark();
        const name = THEME_NAMES[dark ? 'dark' : 'light'];
        const label = document.getElementById('theme-label');
        if (label) label.textContent = name;
        document.querySelectorAll('[data-theme-toggle-label]').forEach(el => { el.textContent = `Theme: ${name}`; });
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.content = getComputedStyle(root).getPropertyValue('--paper').trim() || (dark ? '#070914' : '#f5f0e6');
        Ambient.recolor();
    }

    // Swap the theme; with view transitions the new one spreads in a circle from the tapped control
    function applyDark(dark, origin) {
        if (dark === isDark()) { syncThemeChrome(); return; }
        const flip = () => { root.classList.toggle('theme-dark', dark); syncThemeChrome(); renderSettings(); };
        if (!document.startViewTransition || calm() || !origin) { flip(); return; }
        const r = origin.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
        root.classList.add('vt-theme');
        const t = document.startViewTransition(flip);
        t.ready.then(() => root.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
            { duration: 620, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' },
        )).catch(() => {});
        t.finished.finally(() => root.classList.remove('vt-theme'));
    }
    function setThemeMode(mode, origin) {
        store.set(THEME_KEY, mode === 'dark' ? 'dark' : mode === 'light' ? 'parchment' : null);
        applyDark(mode === 'dark' || (mode === 'device' && darkQuery.matches), origin);
        renderSettings();
    }
    function toggle(e) { setThemeMode(isDark() ? 'light' : 'dark', e?.currentTarget || e?.target?.closest?.('button')); }
    darkQuery.addEventListener('change', () => { if (themeMode() === 'device') applyDark(darkQuery.matches, null); });

    // Several attributes change at once inside one view transition, so a new look cross-fades in
    function apply(changes, { transition = false } = {}) {
        const write = () => {
            Object.entries(changes).forEach(([k, v]) => { prefs[k] = v; root.setAttribute(attr(k), v); });
            save();
            syncThemeChrome();
            syncSvgMotion();
            if ('bg' in changes || 'motion' in changes) Ambient.restart();
            renderSettings();
            Motion.pill(document.querySelector('.sidebar-nav'));
            if (typeof mentorFlowKick === 'function') mentorFlowKick();
        };
        if (transition && document.startViewTransition && !calm()) document.startViewTransition(write);
        else write();
    }
    const set = (key, value) => apply({ [key]: value }, { transition: key === 'look' || key === 'sidebar' });
    function applyLook(id) {
        const look = LOOKS.find(l => l[0] === id);
        if (look) apply({ look: id, ...look[3] }, { transition: true });
    }
    function applyPreset(id) {
        const p = PRESETS.find(x => x[0] === id);
        if (p) apply({ ...p[3] });
    }
    function reset(origin) {
        prefs = { ...DEFAULTS };
        store.set(STORE_KEY, null);
        apply({ ...DEFAULTS }, { transition: true });
        setThemeMode('device', origin);
    }
    const activePreset = () => PRESETS.find(p => FORMAT_KEYS.every(k => p[3][k] === prefs[k]))?.[0] || null;

    // ── Theme Studio (index.html #appearance-card) ──
    let editMode = null;    // which theme the colour and logo pickers edit: 'light' | 'dark'
    let tab = store.get(TAB_KEY, 'looks');
    const pressed = (on) => `aria-pressed="${on}"`;
    const tile = (kind, id, name, desc, thumb) => `
        <button type="button" class="pick" data-ap-${kind}="${id}" ${pressed(false)}>
            ${thumb}<span class="pick-name">${name}${id === DEFAULTS[{ side: 'sidebar', skin: 'mentorSkin', pipe: 'pipeline', tape: 'tape', page: 'pages', bpgrid: 'bpGrid' }[kind]] ? ' <span class="tag-default">Default</span>' : ''}</span>
            <span class="pick-desc">${desc}</span>
        </button>`;
    const pipeSvg = (id) => `<svg class="pipe-demo" data-pipe="${id}" viewBox="0 0 160 84" preserveAspectRatio="none" aria-hidden="true">
            <path class="rail" d="M30 64 C 78 64, 82 20, 130 20"/><path class="beam" d="M30 64 C 78 64, 82 20, 130 20"/>
            <path class="pulse pulse-2" pathLength="100" d="M30 64 C 78 64, 82 20, 130 20"/><path class="pulse" pathLength="100" d="M30 64 C 78 64, 82 20, 130 20"/>
            <circle class="dot" cx="30" cy="64" r="3.5"/><circle class="dot" cx="130" cy="20" r="3.5"/></svg>`;

    function renderStatic(card) {   // option tiles that never change shape: built once
        card.querySelector('[data-ap-looks]').innerHTML = LOOKS.map(([id, name, desc]) => `
            <button type="button" class="look-card" data-ap-look="${id}" ${pressed(false)}>
                <span class="look-thumb" data-thumb="${id}" aria-hidden="true"><span class="s"><i></i><i></i><i></i><i></i></span><span class="m"><span class="h"></span><span class="g"><span class="c"></span><span class="c"></span></span></span></span>
                <span class="look-name">${name}${id === DEFAULTS.look ? ' <span class="tag-default">Default</span>' : ''}</span>
                <span class="look-desc">${desc}</span>
            </button>`).join('');
        card.querySelector('[data-ap-sidebars]').innerHTML = SIDEBARS.map(([id, name, desc]) => tile('side', id, name, desc,
            `<span class="pick-thumb side-thumb" data-side="${id}" aria-hidden="true"><span class="s"><i></i><i></i><i></i></span><span class="b"><i></i><i></i></span></span>`)).join('');
        card.querySelector('[data-ap-skins]').innerHTML = SKINS.map(([id, name, desc]) => tile('skin', id, name, desc,
            `<span class="pick-thumb skin-thumb" data-skin="${id}" aria-hidden="true"><span class="p"><b></b></span></span>`)).join('');
        card.querySelector('[data-ap-pipes]').innerHTML = PIPES.map(([id, name, desc]) => tile('pipe', id, name, desc,
            `<span class="pick-thumb pipe-thumb" aria-hidden="true">${pipeSvg(id)}</span>`)).join('');
        card.querySelector('[data-ap-tapes]').innerHTML = TAPES.map(([id, name, desc]) => tile('tape', id, name, desc,
            `<span class="pick-thumb tape-thumb" data-tape="${id}" aria-hidden="true"><i></i></span>`)).join('');
        card.querySelector('[data-ap-pages]').innerHTML = PAGES.map(([id, name, desc]) => tile('page', id, name, desc,
            `<span class="pick-thumb page-thumb" data-pages="${id}" aria-hidden="true"></span>`)).join('');
        card.querySelector('[data-ap-bpgrids]').innerHTML = BP_GRIDS.map(([id, name, desc]) => tile('bpgrid', id, name, desc,
            `<span class="pick-thumb grid-thumb" data-grid="${id}" aria-hidden="true"></span>`)).join('');
    }

    function renderSettings() {
        const card = document.getElementById('appearance-card');
        if (!card) return;
        if (!card.dataset.built) { renderStatic(card); card.dataset.built = '1'; }
        editMode = editMode || (isDark() ? 'dark' : 'light');
        const mode = themeMode();
        const mark = (sel, key, val) => card.querySelectorAll(sel).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[key] === val)));
        card.querySelectorAll('[data-ap-theme] > button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === mode)));
        card.querySelectorAll('[data-ap-edit] > button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === editMode)));
        card.querySelectorAll('[data-ap-mode-box]').forEach(box => {
            box.classList.toggle('preview-dark', editMode === 'dark');
            box.classList.toggle('preview-light', editMode === 'light');
        });
        mark('[data-ap-look]', 'apLook', prefs.look);
        mark('[data-ap-side]', 'apSide', prefs.sidebar);
        mark('[data-ap-skin]', 'apSkin', prefs.mentorSkin);
        mark('[data-ap-pipe]', 'apPipe', prefs.pipeline);
        mark('[data-ap-tape]', 'apTape', prefs.tape);
        mark('[data-ap-page]', 'apPage', prefs.pages);
        mark('[data-ap-bpgrid]', 'apBpgrid', prefs.bpGrid);
        card.querySelector('[data-bp-options]').hidden = prefs.look !== 'blueprint';
        card.querySelector('[data-ap-bpinks]').innerHTML = BP_INKS.map(([id, name, light, dark]) => {
            const ink = isDark() ? dark : light;
            return `<button type="button" class="swatch" data-ap-bpink="${id}" aria-pressed="${prefs.bpInk === id}" style="--sw:${ink};--sw2:${ink};--sw-on:${isDark() ? '#0b0f17' : '#ffffff'}">
                <span class="swatch-dot" aria-hidden="true"><svg class="swatch-check"><use href="#i-check-bold"/></svg></span><span class="swatch-name">${name}</span></button>`;
        }).join('');
        mark('[data-ap-orb]', 'apOrb', prefs[editMode === 'dark' ? 'orbDark' : 'orb']);
        const accentKey = editMode === 'dark' ? 'accentDark' : 'accent';
        card.querySelector('[data-ap-swatches]').innerHTML = ACCENTS.map(([id, name, l, d]) => {
            const [fill, bright, on] = editMode === 'dark' ? d : l;
            return `<button type="button" class="swatch" data-ap-accent="${id}" aria-pressed="${prefs[accentKey] === id}" style="--sw:${fill};--sw2:${bright};--sw-on:${on}">
                <span class="swatch-dot" aria-hidden="true"><svg class="swatch-check"><use href="#i-check-bold"/></svg></span><span class="swatch-name">${name}</span></button>`;
        }).join('');
        card.querySelector('[data-ap-mode-note]').textContent = editMode === (isDark() ? 'dark' : 'light')
            ? 'Changes show right away.' : `These apply when the app is in ${THEME_NAMES[editMode]}.`;
        const current = activePreset();
        card.querySelector('[data-ap-presets]').innerHTML = PRESETS.map(([id, name, desc, o]) => `
            <button type="button" class="preset" data-ap-preset="${id}" aria-pressed="${current === id}" data-corners="${o.corners}" data-cards="${o.cards}" data-density="${o.density}">
                <span class="preset-thumb" aria-hidden="true"><i></i><i></i><i></i><b></b></span>
                <span class="preset-name">${name}</span><span class="preset-desc">${desc}</span>
            </button>`).join('');
        card.querySelectorAll('[data-ap-opt]').forEach(seg => {
            seg.querySelectorAll(':scope > button').forEach(b => b.setAttribute('aria-pressed', String(prefs[seg.dataset.apOpt] === b.dataset.v)));
        });
        card.querySelectorAll('[data-studio-tabs] > button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
        card.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== tab; });
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
            else if (seg.matches('[data-studio-tabs]')) { tab = b.dataset.tab; store.set(TAB_KEY, tab); renderSettings(); }
            else if (seg.matches('[data-ap-edit]')) { editMode = b.dataset.v; renderSettings(); }
            else if (b.dataset.apLook) { applyLook(b.dataset.apLook); burstFrom(card, `[data-ap-look="${b.dataset.apLook}"] .look-thumb`); }
            else if (b.dataset.apAccent) {
                const entry = ACCENTS.find(a => a[0] === b.dataset.apAccent);
                set(editMode === 'dark' ? 'accentDark' : 'accent', b.dataset.apAccent);
                Motion.burst(card.querySelector(`[data-ap-accent="${b.dataset.apAccent}"] .swatch-dot`), 10, (editMode === 'dark' ? entry[3] : entry[2]).slice(0, 2));
            }
            else if (b.dataset.apOrb) set(editMode === 'dark' ? 'orbDark' : 'orb', b.dataset.apOrb);
            else if (b.dataset.apSide) set('sidebar', b.dataset.apSide);
            else if (b.dataset.apSkin) { set('mentorSkin', b.dataset.apSkin); burstFrom(card, `[data-ap-skin="${b.dataset.apSkin}"] .pick-thumb`); }
            else if (b.dataset.apPipe) set('pipeline', b.dataset.apPipe);
            else if (b.dataset.apTape) { set('tape', b.dataset.apTape); burstFrom(card, `[data-ap-tape="${b.dataset.apTape}"] .pick-thumb`); }
            else if (b.dataset.apPage) apply({ pages: b.dataset.apPage }, { transition: true });
            else if (b.dataset.apBpgrid) apply({ bpGrid: b.dataset.apBpgrid }, { transition: true });
            else if (b.dataset.apBpink) {
                const ink = BP_INKS.find(i => i[0] === b.dataset.apBpink);
                apply({ bpInk: ink[0], ...ink[4] }, { transition: true });
                Motion.burst(card.querySelector(`[data-ap-bpink="${ink[0]}"] .swatch-dot`), 10, [ink[2], ink[3]]);
            }
            else if (b.dataset.apPreset) applyPreset(b.dataset.apPreset);
            else if (seg.matches('[data-ap-opt]')) set(seg.dataset.apOpt, b.dataset.v);
            else if (b.id === 'appearance-reset') { editMode = null; reset(b); }
        });
        renderSettings();
    }
    function burstFrom(card, sel) { requestAnimationFrame(() => Motion.burst(card.querySelector(sel), 12)); }

    // ── Ambient particles: drift in the accent's glow, pause when hidden, still under Calm ──
    const Ambient = (() => {
        const canvas = document.getElementById('particle-canvas');
        const ctx = canvas?.getContext('2d');
        let w = 0, h = 0, dpr = 1, dots = [], raf = 0, rgb = '234, 88, 12';
        const mouse = { x: null, y: null, r: 140 };
        const lowEnd = (navigator.hardwareConcurrency || 8) <= 4;
        const enabled = () => canvas && prefs.bg === 'particles';
        function size() {
            if (!canvas) return;
            dpr = Math.min(devicePixelRatio || 1, 2);
            w = innerWidth; h = innerHeight;
            canvas.width = w * dpr; canvas.height = h * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const density = (w < 768 ? 26000 : 15000) * (lowEnd ? 1.8 : 1);
            const n = Math.round(Math.min(110, (w * h) / density));
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
            if (calm() || document.hidden) { draw(false); return; }
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
            matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => { restart(); syncSvgMotion(); });
        }
        return { size, restart, recolor };
    })();

    function boot() {
        Object.entries(prefs).forEach(([k, v]) => root.setAttribute(attr(k), v));
        syncThemeChrome();
        syncSvgMotion();
        Ambient.size();
        Ambient.restart();
        bindSettings();
    }

    return { boot, toggle, setThemeMode, set, applyLook, applyPreset, reset, isDark, renderSettings };
})();

// Global name the markup calls
function toggleTheme(e) { Appearance.toggle(e); }
Appearance.boot();
