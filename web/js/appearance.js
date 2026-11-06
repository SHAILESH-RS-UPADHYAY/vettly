/**
 * Vettly appearance: the Theme Studio in Settings and everything it drives.
 * Theme (Parchment, Spatial Dark, match device) · a look for the whole app · an accent and a Mentor logo
 * per theme · side panel · Mentor panel skin · pipeline beam · layout format with quick presets ·
 * each look's workshop, the particle floaties. Every choice lands as an attribute on <html>; tokens.css, looks.css and
 * mentor.css do the rest. The first paint is set by the bootstrap in index.html, so nothing flashes.
 */
const Appearance = (() => {
    const THEME_KEY = 'acemate_poster_theme';      // 'dark' | 'device' | 'parchment' or absent (light, the default)
    const STORE_KEY = 'vettly_appearance_v2';
    const TAB_KEY = 'vettly_studio_tab';
    const root = document.documentElement;
    const darkQuery = matchMedia('(prefers-color-scheme: dark)');

    const DEFAULTS = {
        look: 'classic', accent: 'poster', accentDark: 'spatial', orb: 'porcelain', orbDark: 'gloss',
        sidebar: 'poster', mentorSkin: 'paper', pipeline: 'stream',
        density: 'comfortable', cards: 'soft', corners: 'round', text: 'default', bg: 'particles', motion: 'full',
        tape: 'mix', pages: 'clean',
    };
    // a look also brings its own colours, side panel, tape and pages; each stays adjustable afterwards
    const LOOKS = [
        ['classic', 'Poster Classic', 'Your original parchment poster: bright orange, tape and handwriting', { accent: 'poster', accentDark: 'spatial', sidebar: 'poster', tape: 'mix', pages: 'clean' }],
        ['register', 'Register', 'An old school register: ruled pages, red margins and tape. A chalkboard at night', { accent: 'coral', accentDark: 'butter', sidebar: 'spiral', tape: 'mix', pages: 'register' }],
        ['studio', 'Studio Soft', 'Calm type, soft cards and frosted glass', { accent: 'tangerine', accentDark: 'sky', sidebar: 'frosted', tape: 'none', pages: 'clean' }],
        ['blueprint', 'Blueprint', 'Drafting lines, mono headings, crisp corners', { accent: 'periwinkle', accentDark: 'sky', sidebar: 'bare', tape: 'drafting', pages: 'clean' }],
        ['bubblegum', 'Bubblegum', 'Cute sticker cards with bold outlines', { accent: 'rose', accentDark: 'rose', sidebar: 'island', tape: 'candy', pages: 'clean' }],
        ['sakura', 'Sakura', 'Cherry blossoms drifting over blush paper', { accent: 'rose', accentDark: 'rose', sidebar: 'frosted', tape: 'mix', pages: 'clean' }],
        ['lavender', 'Lavender Dream', 'Lilac skies, glassy cards and sparkles', { accent: 'lilac', accentDark: 'lilac', sidebar: 'frosted', tape: 'none', pages: 'clean' }],
        ['strawberry', 'Strawberry Milk', 'Pink milk, cream cards, scalloped edges and hearts', { accent: 'rose', accentDark: 'rose', sidebar: 'island', tape: 'candy', pages: 'clean' }],
        ['mermaid', 'Mermaid Pearl', 'Sea glass colours, pearly cards and rising bubbles', { accent: 'teal', accentDark: 'teal', sidebar: 'frosted', tape: 'none', pages: 'clean' }],
    ];
    // Every look's workshop. Tiles: [id, name, description, also?]; swatches: [id, name, day colour, night colour, also?].
    // The first option is always the look's original, so picking nothing changes nothing.
    const SHARED_GROUPS = [
        { key: 'tape', label: 'Tape', thumb: 'tape', options: [['mix', 'Washi mix', 'Stripes, dots, grid and pinstripe'], ['kraft', 'Kraft masking', 'Brown paper tape'], ['candy', 'Candy stripes', 'Bold, sweet and bright'], ['drafting', 'Drafting tape', 'Translucent, like on a blueprint'], ['none', 'No tape', 'Clean edges']] },
        { key: 'pages', label: 'Pages', thumb: 'pages', options: [['clean', 'Clean cards', "The look's own cards"], ['register', 'Register ruled', 'Blue rules and a red margin'], ['torn', 'Torn edges', 'Ripped out, with punch holes'], ['spiral', 'Spiral bound', 'A coil along the top']] },
    ];
    const WORKSHOPS = {
        classic: { title: 'Poster Workshop', icon: 'scroll', note: 'Your original poster stays as it is. Try another paper, background or headline.', groups: [
            { key: 'clPaper', label: 'Poster paper', options: [['cream', 'Cream', 'The original warm poster'], ['white', 'Gallery white', 'Crisp and bright'], ['newsprint', 'Newsprint', 'Grey paper, a printed feel'], ['kraft', 'Kraft', 'Brown packing paper']] },
            { key: 'clGrid', label: 'Background', options: [['grid', 'Blueprint grid', 'The original lines'], ['dots', 'Halftone dots', 'Print dots'], ['stripes', 'Pin stripes', 'Soft vertical stripes'], ['none', 'Plain', 'Just the paper']] },
            { key: 'clHead', label: 'Headline', options: [['syne', 'Poster wide', 'The original'], ['grotesk', 'Grotesk', 'Tighter and technical'], ['serif', 'Editorial serif', 'A magazine cover']] },
            { key: 'clNotes', label: 'Handwritten notes', options: [['on', 'Scribbles on', 'The notes stay'], ['off', 'Scribbles off', 'A cleaner poster']] },
        ] },
        register: { title: 'Notebook Studio', icon: 'pencil', note: 'Your Register stays as it is. Pick the paper, the pen and the desk it sits on.', groups: [
            { key: 'regPaper', label: 'Paper', thumb: 'paper', options: [['ledger', 'Ledger', 'Blue rules and a red margin'], ['maths', 'Maths squares', 'A squared maths copy'], ['dots', 'Bullet dots', 'Dotted, like a bullet journal'], ['pastel', 'Pastel pages', 'Soft pink, mint and lilac'], ['vintage', 'Vintage', 'Aged, tea-stained paper'], ['kraft', 'Kraft', 'Brown recycled paper']] },
            { key: 'regInk', label: 'Ink', swatch: true, options: [['blue', 'Royal blue', '#1f2c4a', '#f6e7a1', { accent: 'coral', accentDark: 'butter' }], ['black', 'Gel black', '#16181d', '#f4f4f0', { accent: 'graphite', accentDark: 'graphite' }], ['red', 'Teacher red', '#b3263a', '#ffa3a3', { accent: 'coral', accentDark: 'coral' }], ['green', 'Green ink', '#1f7a4d', '#a6f0c0', { accent: 'mint', accentDark: 'mint' }], ['purple', 'Purple gel', '#6b3fd1', '#cdb8ff', { accent: 'lilac', accentDark: 'lilac' }], ['sepia', 'Sepia', '#7a4a1e', '#f2c98d', { accent: 'tangerine', accentDark: 'butter' }]] },
            { key: 'regHand', label: 'Handwriting', thumb: 'hand', fonts: true, options: [['caveat', 'Caveat', 'Quick and loopy'], ['kalam', 'Kalam', 'Neat school handwriting'], ['patrick', 'Patrick Hand', 'Tidy print, easy to read'], ['gaegu', 'Gaegu', 'Round and bubbly'], ['shadows', 'Shadows', 'Light and airy']] },
            { key: 'regDesk', label: 'Desk', thumb: 'desk', options: [['ruled', 'Ruled', 'The desk is ruled paper too'], ['wood', 'Wooden desk', 'A warm oak table'], ['cork', 'Cork board', 'Pages pinned to cork'], ['gingham', 'Gingham', 'A cute picnic check'], ['plain', 'Plain', 'Just a quiet colour']] },
            { key: 'regDoodles', label: 'Doodles', thumb: 'doodle', options: [['none', 'None', 'Clean pages'], ['stars', 'Stars & hearts', 'Doodles across the desk'], ['stamps', 'Teacher stamps', 'Shabash! and Excellent'], ['stickers', 'Stickers', 'Little stickers on the corners']] },
            { key: 'regMarker', label: 'Highlighter', swatch: true, options: [['yellow', 'Yellow', '#ffe14d', '#ffe14d'], ['pink', 'Pink', '#ff9ccb', '#ff9ccb'], ['mint', 'Mint', '#8ff0c0', '#8ff0c0'], ['sky', 'Sky', '#9ad8ff', '#9ad8ff'], ['orange', 'Orange', '#ffb36b', '#ffb36b']] },
        ] },
        studio: { title: 'Studio Lab', icon: 'sparkle', note: 'Studio Soft stays as it is. Tune the glass, the backdrop and the depth.', groups: [
            { key: 'stGlass', label: 'Glass', options: [['frosted', 'Frosted', 'Soft blur, the original'], ['clear', 'Clear', 'See right through'], ['solid', 'Solid', 'No blur at all']] },
            { key: 'stMesh', label: 'Backdrop', options: [['none', 'Paper', 'The original'], ['aurora', 'Aurora', 'Soft moving colour'], ['sunset', 'Sunset', 'Peach into lilac'], ['ocean', 'Ocean', 'Teal into blue']] },
            { key: 'stDepth', label: 'Depth', options: [['soft', 'Soft', 'The original'], ['float', 'Floating', 'Bigger, softer shadows'], ['flat', 'Flat', 'No shadows at all']] },
        ] },
        blueprint: { title: 'Blueprint Workshop', icon: 'wand', note: 'Your Blueprint stays as it is. Re-ink it, swap the sheet, mark it up.', groups: [
            { key: 'bpInk', label: 'Ink', swatch: true, options: [['cyan', 'Cyanotype', '#1d4ed8', '#7db4ff', { accent: 'periwinkle', accentDark: 'sky' }], ['green', 'Greenline', '#16803d', '#78e6a0', { accent: 'mint', accentDark: 'mint' }], ['red', 'Redline', '#c81e32', '#ff8296', { accent: 'coral', accentDark: 'coral' }], ['violet', 'Violet ink', '#6e46dc', '#b496ff', { accent: 'lilac', accentDark: 'lilac' }], ['amber', 'Sepia', '#b0700a', '#fabe5a', { accent: 'butter', accentDark: 'butter' }], ['teal', 'Teal draft', '#0e827a', '#6ee6d7', { accent: 'teal', accentDark: 'teal' }], ['graphite', 'Graphite', '#282e3a', '#dce1eb', { accent: 'graphite', accentDark: 'graphite' }]] },
            { key: 'bpGrid', label: 'Grid template', thumb: 'grid', options: [['drafting', 'Drafting sheet', 'Bold and fine lines'], ['graph', 'Graph paper', 'A tight engineering grid'], ['dots', 'Dot grid', 'Quiet dots for sketching'], ['iso', 'Isometric', 'Lines for 3D sketches'], ['plain', 'Vellum', 'No grid, just the sheet']] },
            { key: 'bpMarks', label: 'Sheet marks', thumb: 'marks', options: [['ticks', 'Corner ticks', 'The original drafting corners'], ['cross', 'Crosshairs', 'Registration marks'], ['title', 'Title block', 'A drawing title strip'], ['dims', 'Dimension lines', 'Measured edges'], ['rivets', 'Rivets', 'An engineering plate']] },
            { key: 'bpTitle', label: 'Title style', thumb: 'title', options: [['mono', 'Mono caps', 'The original'], ['stencil', 'Stencil', 'Heavy wide letters'], ['script', "Engineer's script", 'Handwritten notes']] },
        ] },
        bubblegum: { title: 'Candy Shop', icon: 'star', note: 'Your Bubblegum stays as it is. Pick a flavour, a sticker style and some floaties.', groups: [
            { key: 'bgFlavour', label: 'Flavour', swatch: true, options: [['bubblegum', 'Bubblegum', '#c42d60', '#ff8fb3', { accent: 'rose', accentDark: 'rose' }], ['cotton', 'Cotton candy', '#1f72b6', '#9ad8f5', { accent: 'sky', accentDark: 'sky' }], ['grape', 'Grape soda', '#6a4ddc', '#b6a2ff', { accent: 'lilac', accentDark: 'lilac' }], ['lemon', 'Lemon fizz', '#f0c33c', '#f5d36b', { accent: 'butter', accentDark: 'butter' }], ['mint', 'Mint chip', '#157a55', '#5fd6a0', { accent: 'mint', accentDark: 'mint' }], ['peach', 'Peach ring', '#c7402f', '#ff8a7a', { accent: 'coral', accentDark: 'coral' }]] },
            { key: 'bgShadow', label: 'Sticker shadow', options: [['hard', 'Hard offset', 'The original'], ['soft', 'Soft glow', 'Blurred and dreamy'], ['double', 'Double', 'Two stacked layers'], ['none', 'Flat', 'No shadow at all']] },
            { key: 'bgOutline', label: 'Outline', options: [['bold', 'Bold', 'The original'], ['thin', 'Thin', 'A delicate line'], ['chunky', 'Chunky', 'An extra thick line']] },
            { key: 'bgFloat', label: 'Floaties', options: [['none', 'None', 'Just the page'], ['bubbles', 'Bubbles', 'Drifting up'], ['hearts', 'Hearts', 'Floating hearts'], ['sparkles', 'Sparkles', 'Twinkling stars']] },
        ] },
        sakura: { title: 'Sakura Garden', icon: 'sparkle', note: 'Cherry blossoms drifting across soft blush paper.', groups: [
            { key: 'skPetals', label: 'Petals', options: [['gentle', 'Gentle', 'A few petals drifting'], ['flurry', 'Flurry', 'A spring breeze'], ['none', 'Still', 'No petals']] },
            { key: 'skPaper', label: 'Paper', options: [['washi', 'Washi', 'Soft fibre paper'], ['silk', 'Silk', 'Smooth with a sheen'], ['wash', 'Watercolour', 'A pink wash']] },
            { key: 'skTitle', label: 'Headings', options: [['serif', 'Serif italic', 'Elegant'], ['brush', 'Brush script', 'Handwritten'], ['clean', 'Clean', 'Simple and bold']] },
        ] },
        lavender: { title: 'Dream Lab', icon: 'planet', note: 'Lilac skies, glassy cards and a little sparkle.', groups: [
            { key: 'lvSky', label: 'Sky', options: [['clouds', 'Cloud mesh', 'Drifting pastel clouds'], ['stars', 'Starlight', 'A dotted night sky'], ['aurora', 'Aurora', 'Ribbons of colour']] },
            { key: 'lvGlass', label: 'Glass', options: [['frosted', 'Frosted', 'Soft see-through blur'], ['pearl', 'Pearl', 'Milky and bright']] },
            { key: 'lvFloat', label: 'Sparkles', options: [['sparkles', 'Sparkles', 'Twinkling stars'], ['none', 'None', 'A quiet sky']] },
        ] },
        strawberry: { title: 'Milk Bar', icon: 'star', note: 'Strawberry milk pink, cream cards and a sweet trim.', groups: [
            { key: 'smPattern', label: 'Pattern', options: [['gingham', 'Gingham', 'A picnic check'], ['dots', 'Polka dots', 'Sweet dots'], ['stripes', 'Candy stripes', 'Soft stripes'], ['plain', 'Plain', 'Just milk']] },
            { key: 'smEdge', label: 'Card trim', options: [['scallop', 'Scallop', 'A wavy cake edge'], ['round', 'Round', 'Simply rounded'], ['lace', 'Lace', 'A dotted lace trim']] },
            { key: 'smFloat', label: 'Floaties', options: [['hearts', 'Hearts', 'Floating hearts'], ['none', 'None', 'No floaties']] },
        ] },
        mermaid: { title: 'Pearl Lagoon', icon: 'sparkle', note: 'Sea glass colours, pearly cards and shimmering edges.', groups: [
            { key: 'mpSea', label: 'Sea', swatch: true, options: [['aqua', 'Aqua', '#0e7a74', '#4fd1c7', { accent: 'teal', accentDark: 'teal' }], ['lilac', 'Lilac lagoon', '#6a4ddc', '#b6a2ff', { accent: 'lilac', accentDark: 'lilac' }], ['coral', 'Coral reef', '#c7402f', '#ff8a7a', { accent: 'coral', accentDark: 'coral' }]] },
            { key: 'mpShimmer', label: 'Shimmer', options: [['iridescent', 'Iridescent', 'A rainbow edge that turns'], ['pearl', 'Pearl', 'A soft pearly glow'], ['none', 'None', 'Plain edges']] },
            { key: 'mpFloat', label: 'Bubbles', options: [['bubbles', 'Bubbles', 'Rising from below'], ['none', 'None', 'Still water']] },
        ] },
    };
    const GROUPS = Object.fromEntries([...SHARED_GROUPS, ...Object.values(WORKSHOPS).flatMap(w => w.groups)].map(g => [g.key, g]));
    Object.values(WORKSHOPS).forEach(w => w.groups.forEach(g => { DEFAULTS[g.key] = g.options[0][0]; }));
    const FLOAT_KEYS = ['look', 'bgFloat', 'skPetals', 'lvFloat', 'smFloat', 'mpFloat'];
    // handwriting fonts load only once someone needs them
    const FONTS = { kalam: 'Kalam:wght@400;700', patrick: 'Patrick+Hand', gaegu: 'Gaegu:wght@400;700', shadows: 'Shadows+Into+Light' };
    function loadFont(id) {
        if (!FONTS[id] || document.getElementById(`font-${id}`)) return;
        const l = document.createElement('link');
        l.id = `font-${id}`; l.rel = 'stylesheet';
        l.href = `https://fonts.googleapis.com/css2?family=${FONTS[id]}&display=swap`;
        document.head.appendChild(l);
    }
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

    const themeMode = () => ({ dark: 'dark', device: 'device' }[store.get(THEME_KEY, '')] || 'light');
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

    // Day and night arrive as ink. A drop of the new theme falls onto the switch you pressed and splats, then the new
    // theme bleeds out across the page the way ink soaks into paper: a living, ragged edge, with small blooms opening
    // near it. The bleed is an SVG mask on the view transition's new page (a growing circle pushed about by turbulence,
    // drawn at half size to stay light); Calm, reduced motion and older browsers swap at once.
    const INK_TIME = 1.15;
    function inkMask(x, y) {
        const w = Math.ceil(innerWidth / 2), h = Math.ceil(innerHeight / 2), cx = x / 2, cy = y / 2;   // half size, scaled up by the mask
        const far = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)) * 1.35 + 40, seed = Math.random() * 999 | 0;
        const grow = (to, begin, dur) => `<animate attributeName="r" from="0" to="${to.toFixed(1)}" begin="${begin.toFixed(2)}s" dur="${dur.toFixed(2)}s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".25 .1 .2 1"/>`;
        // blooms: small soaks that open on their own beat, out near the edge of the spreading ink
        let blooms = '';
        for (let i = 0; i < 7; i++) {
            const a = Math.random() * Math.PI * 2, d = far * (0.25 + Math.random() * 0.45), at = (d / far) * INK_TIME * 0.7;
            blooms += `<circle cx="${(cx + Math.cos(a) * d).toFixed(1)}" cy="${(cy + Math.sin(a) * d).toFixed(1)}" r="0">${grow(40 + Math.random() * 70, at, 0.55)}</circle>`;
        }
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><filter id="i" x="-30%" y="-30%" width="160%" height="160%">`
            + `<feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="${seed}"/>`
            + `<feDisplacementMap in="SourceGraphic" scale="46" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation="1.2"/></filter></defs>`
            + `<g fill="#fff" filter="url(#i)"><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="0">${grow(far, 0, INK_TIME)}</circle>${blooms}</g></svg>`;
        return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 0 0 / 100% 100% no-repeat`;
    }
    // the drop: the new theme's paper colour, falling onto the switch; resolves when it lands
    function inkDrop(x, y, dark) {
        const d = document.createElement('i');
        d.className = 'ink-drop';
        d.style.background = dark ? 'radial-gradient(circle at 35% 30%, #3a4766, #0c111c 70%)' : 'radial-gradient(circle at 35% 30%, #ffffff, #efe6d4 70%)';
        Object.assign(d.style, { left: `${x}px`, top: `${y}px` });
        document.body.append(d);
        const fall = d.animate([
            { transform: 'translate(-50%, -260%) scale(.7, 1.25)', opacity: 0 },
            { transform: 'translate(-50%, -120%) scale(.85, 1.15)', opacity: 1, offset: 0.55 },
            { transform: 'translate(-50%, -50%) scale(1.6, .55)', opacity: 1 },
        ], { duration: 300, easing: 'cubic-bezier(.55, 0, .9, .45)' });
        return fall.finished.catch(() => {}).then(() => d.remove());
    }
    function applyDark(dark, origin) {
        if (dark === isDark()) { syncThemeChrome(); return; }
        const flip = () => { root.classList.toggle('theme-dark', dark); syncThemeChrome(); renderSettings(); };
        if (!document.startViewTransition || calm() || !origin) { flip(); return; }
        const r = origin.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        inkDrop(x, y, dark).then(() => {
            const mask = inkMask(x, y);
            const style = document.createElement('style');   // a pseudo-element can only take its mask from a stylesheet
            style.textContent = `:root.vt-theme::view-transition-new(root) { -webkit-mask: ${mask}; mask: ${mask}; animation: vt-pixels ${INK_TIME + 0.1}s linear both; }`;
            document.head.append(style);
            root.classList.add('vt-theme');
            const t = document.startViewTransition(flip);
            t.finished.finally(() => { root.classList.remove('vt-theme'); style.remove(); }).catch(() => {});
        });
    }
    function setThemeMode(mode, origin) {
        store.set(THEME_KEY, mode === 'dark' ? 'dark' : mode === 'light' ? 'parchment' : 'device');
        applyDark(mode === 'dark' || (mode === 'device' && darkQuery.matches), origin);
        renderSettings();
    }
    function toggle(e) { setThemeMode(isDark() ? 'light' : 'dark', e?.currentTarget || e?.target?.closest?.('button')); }
    darkQuery.addEventListener('change', () => { if (themeMode() === 'device') applyDark(darkQuery.matches, null); });

    // Several attributes change at once inside one view transition, so a new look cross-fades in
    function apply(changes, { transition = false, origin = null } = {}) {
        const write = () => {
            Object.entries(changes).forEach(([k, v]) => { prefs[k] = v; root.setAttribute(attr(k), v); });
            save();
            syncThemeChrome();
            syncSvgMotion();
            if (FLOAT_KEYS.some(k => k in changes)) Ambient.reset();
            else if ('bg' in changes || 'motion' in changes) Ambient.restart();
            renderSettings();
            Motion.pill(document.querySelector('.sidebar-nav'));
            if (typeof mentorFlowKick === 'function') mentorFlowKick();
        };
        if (transition && document.startViewTransition && !calm()) {
            if (!origin) { document.startViewTransition(write).ready.catch(() => {}); return; }
            // from a tapped card: the new look spreads out of it as a circle (the Look Book)
            const r = origin.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
            const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
            root.classList.add('vt-theme');
            const t = document.startViewTransition(write);
            t.ready.then(() => root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
                { duration: 700, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' })).catch(() => {});
            t.finished.finally(() => root.classList.remove('vt-theme')).catch(() => {});
        } else write();
    }
    const set = (key, value) => apply({ [key]: value }, { transition: key === 'look' || key === 'sidebar' });
    function applyLook(id, origin = null) {
        const look = LOOKS.find(l => l[0] === id);
        if (look) apply({ look: id, ...look[3] }, { transition: true, origin });
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
            ${thumb}<span class="pick-name">${name}${id === DEFAULTS[{ side: 'sidebar', skin: 'mentorSkin', pipe: 'pipeline' }[kind]] ? ' <span class="tag-default">Default</span>' : ''}</span>
            <span class="pick-desc">${desc}</span>
        </button>`;
    const pipeSvg = (id) => `<svg class="pipe-demo" data-pipe="${id}" viewBox="0 0 160 84" preserveAspectRatio="none" aria-hidden="true">
            <path class="rail" d="M30 64 C 78 64, 82 20, 130 20"/><path class="beam" d="M30 64 C 78 64, 82 20, 130 20"/>
            <path class="pulse pulse-2" pathLength="100" d="M30 64 C 78 64, 82 20, 130 20"/><path class="pulse" pathLength="100" d="M30 64 C 78 64, 82 20, 130 20"/>
            <circle class="dot" cx="30" cy="64" r="3.5"/><circle class="dot" cx="130" cy="20" r="3.5"/></svg>`;
    const THUMBS = {
        tape: v => `<span class="pick-thumb tape-thumb" data-tape="${v}" aria-hidden="true"><i></i></span>`,
        pages: v => `<span class="pick-thumb page-thumb" data-pages="${v}" aria-hidden="true"></span>`,
        grid: v => `<span class="pick-thumb grid-thumb" data-grid="${v}" aria-hidden="true"></span>`,
        marks: v => `<span class="pick-thumb marks-thumb" data-marks="${v}" aria-hidden="true"><i></i></span>`,
        title: v => `<span class="pick-thumb title-thumb" data-title="${v}" aria-hidden="true">Plan A</span>`,
        paper: v => `<span class="pick-thumb regpaper-thumb" data-paper="${v}" aria-hidden="true"><i></i></span>`,
        hand: v => `<span class="pick-thumb hand-thumb" data-hand="${v}" aria-hidden="true">Shabash!</span>`,
        desk: v => `<span class="pick-thumb desk-thumb" data-desk="${v}" aria-hidden="true"><i></i></span>`,
        doodle: v => `<span class="pick-thumb doodle-thumb" data-doodle="${v}" aria-hidden="true"><i></i></span>`,
    };
    // one row of a workshop: swatches or picture tiles, marked from prefs by renderSettings
    function groupHtml(g) {
        const night = isDark();
        const body = g.swatch
            ? g.options.map(([id, name, day, dark]) => `<button type="button" class="swatch" data-wk="${g.key}" data-v="${id}" aria-pressed="false" style="--sw:${night ? dark : day};--sw2:${night ? dark : day};--sw-on:${night ? '#10131a' : '#ffffff'}">
                <span class="swatch-dot" aria-hidden="true"><svg class="swatch-check"><use href="#i-check-bold"/></svg></span><span class="swatch-name">${name}</span></button>`).join('')
            : g.options.map(([id, name, desc]) => `<button type="button" class="pick" data-wk="${g.key}" data-v="${id}" aria-pressed="false">
                ${THUMBS[g.thumb] ? THUMBS[g.thumb](id) : `<span class="pick-thumb wk-thumb" data-wk-thumb="${g.key}" data-v="${id}" aria-hidden="true"><i></i><b></b></span>`}
                <span class="pick-name">${name}${id === DEFAULTS[g.key] ? ' <span class="tag-default">Default</span>' : ''}</span><span class="pick-desc">${desc}</span></button>`).join('');
        return `<h4>${g.label}</h4><div class="${g.swatch ? 'swatches' : 'pick-grid'} wk-row" style="--cols:${g.options.length}" role="group" aria-label="${g.label}">${body}</div>`;
    }

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
        card.querySelector('[data-ap-paper-groups]').innerHTML = SHARED_GROUPS.map(groupHtml).join('');
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
        const w = WORKSHOPS[prefs.look];
        const panel = card.querySelector('[data-look-workshop]');
        const key = `${prefs.look}:${isDark()}`;
        if (panel.dataset.for !== key) {   // rebuilt when the look changes, or the theme (swatches show its colours)
            panel.dataset.for = key;
            panel.hidden = !w;
            panel.innerHTML = w ? `<div class="lw-inner"><div class="lw-head"><svg aria-hidden="true"><use href="#i-${w.icon}"/></svg><div><h4>${w.title}</h4><p class="ap-note">${w.note}</p></div></div>${[...w.groups, ...SHARED_GROUPS].map(groupHtml).join('')}</div>` : '';
            if (w?.groups.some(g => g.fonts)) Object.keys(FONTS).forEach(loadFont);   // so handwriting tiles preview in their own font
        }
        card.querySelectorAll('[data-wk]').forEach(b => b.setAttribute('aria-pressed', String(prefs[b.dataset.wk] === b.dataset.v)));
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
            else if (b.dataset.apLook) {
                applyLook(b.dataset.apLook);
                burstFrom(card, `[data-ap-look="${b.dataset.apLook}"] .look-thumb`);
                if (WORKSHOPS[b.dataset.apLook]) setTimeout(() => card.querySelector('[data-look-workshop]')?.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'nearest' }), 450);
            }
            else if (b.dataset.apAccent) {
                const entry = ACCENTS.find(a => a[0] === b.dataset.apAccent);
                set(editMode === 'dark' ? 'accentDark' : 'accent', b.dataset.apAccent);
                Motion.burst(card.querySelector(`[data-ap-accent="${b.dataset.apAccent}"] .swatch-dot`), 10, (editMode === 'dark' ? entry[3] : entry[2]).slice(0, 2));
            }
            else if (b.dataset.apOrb) set(editMode === 'dark' ? 'orbDark' : 'orb', b.dataset.apOrb);
            else if (b.dataset.apSide) set('sidebar', b.dataset.apSide);
            else if (b.dataset.apSkin) { set('mentorSkin', b.dataset.apSkin); burstFrom(card, `[data-ap-skin="${b.dataset.apSkin}"] .pick-thumb`); }
            else if (b.dataset.apPipe) set('pipeline', b.dataset.apPipe);
            else if (b.dataset.wk) {
                const g = GROUPS[b.dataset.wk];
                const opt = g.options.find(o => o[0] === b.dataset.v);
                if (g.fonts) loadFont(opt[0]);
                apply({ [g.key]: opt[0], ...((g.swatch ? opt[4] : opt[3]) || {}) });   // no page cross-fade: rapid picks must never be swallowed
                if (g.swatch) Motion.burst(b.querySelector('.swatch-dot'), 10, [opt[2], opt[3]]);
                else Motion.burst(b.querySelector('.pick-thumb'), 10);
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
        let w = 0, h = 0, dpr = 1, dots = [], raf = 0, rgb = '234, 88, 12', petal = '245, 160, 185', kind = 'dots';
        const mouse = { x: null, y: null, r: 140 };
        const lowEnd = (navigator.hardwareConcurrency || 8) <= 4;
        const enabled = () => canvas && prefs.bg === 'particles';
        // which floaties the look asks for: dots everywhere else
        const floaties = () => ({
            bubblegum: prefs.bgFloat === 'none' ? 'dots' : prefs.bgFloat,
            sakura: prefs.skPetals === 'none' ? 'none' : prefs.skPetals === 'flurry' ? 'flurry' : 'petals',
            lavender: prefs.lvFloat === 'none' ? 'none' : 'sparkles',
            strawberry: prefs.smFloat === 'none' ? 'none' : 'hearts',
            mermaid: prefs.mpFloat === 'none' ? 'none' : 'bubbles',
        }[prefs.look] || 'dots');
        const rand = (a, b) => a + Math.random() * (b - a);
        function make(k) {
            const p = { x: rand(0, w), y: rand(0, h), vx: rand(-0.25, 0.25), vy: rand(-0.25, 0.25), r: rand(0.8, 2.6), a: rand(0.12, 0.47), rot: rand(0, 6.28), vr: rand(-0.02, 0.02), ph: rand(0, 6.28) };
            if (k === 'petals' || k === 'flurry') Object.assign(p, { r: rand(5, 9), vy: rand(0.35, 0.9) * (k === 'flurry' ? 1.7 : 1), vx: rand(0.15, 0.55), a: rand(0.45, 0.85) });
            else if (k === 'hearts') Object.assign(p, { r: rand(6, 11), vy: rand(-0.6, -0.25), vx: rand(-0.12, 0.12), a: rand(0.25, 0.55) });
            else if (k === 'bubbles') Object.assign(p, { r: rand(3, 12), vy: rand(-0.9, -0.3), vx: rand(-0.1, 0.1), a: rand(0.3, 0.6) });
            else if (k === 'sparkles') Object.assign(p, { r: rand(2, 5), vx: rand(-0.06, 0.06), vy: rand(-0.06, 0.06), a: rand(0.4, 0.9) });
            return p;
        }
        function size() {
            if (!canvas) return;
            dpr = Math.min(devicePixelRatio || 1, 2);
            w = innerWidth; h = innerHeight;
            canvas.width = w * dpr; canvas.height = h * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            kind = floaties();
            const share = { dots: 1, petals: 0.45, flurry: 0.9, hearts: 0.35, bubbles: 0.45, sparkles: 0.6, none: 0 }[kind];
            const density = (w < 768 ? 26000 : 15000) * (lowEnd ? 1.8 : 1);
            const n = Math.round(Math.min(110, (w * h) / density) * share);
            dots = Array.from({ length: n }, () => make(kind));
        }
        function shape(p, t) {
            ctx.save();
            ctx.translate(p.x, p.y);
            if (kind === 'petals' || kind === 'flurry') {
                ctx.rotate(p.rot);
                ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${petal}, ${p.a})`; ctx.fill();
                ctx.beginPath(); ctx.ellipse(-p.r * 0.3, 0, p.r * 0.35, p.r * 0.16, 0, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 255, 255, ${p.a * 0.45})`; ctx.fill();
            } else if (kind === 'hearts') {
                const s = p.r / 10;
                ctx.rotate(Math.sin(t * 0.0012 + p.ph) * 0.25); ctx.scale(s, s); ctx.translate(0, -6);
                ctx.beginPath(); ctx.moveTo(0, 2.5);
                ctx.bezierCurveTo(-1, -2, -8, -2, -8, 3); ctx.bezierCurveTo(-8, 7, -3, 9.5, 0, 12);
                ctx.bezierCurveTo(3, 9.5, 8, 7, 8, 3); ctx.bezierCurveTo(8, -2, 1, -2, 0, 2.5);
                ctx.fillStyle = `rgba(${rgb}, ${p.a})`; ctx.fill();
            } else if (kind === 'bubbles') {
                ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2);
                ctx.lineWidth = 1.2; ctx.strokeStyle = `rgba(${rgb}, ${p.a})`; ctx.stroke();
                ctx.beginPath(); ctx.arc(-p.r * 0.35, -p.r * 0.35, p.r * 0.22, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 255, 255, ${p.a})`; ctx.fill();
            } else if (kind === 'sparkles') {
                const r = p.r, k = r * 0.28;
                ctx.globalAlpha = p.a * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.002 + p.ph)));
                ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(k, -k); ctx.lineTo(r, 0); ctx.lineTo(k, k); ctx.lineTo(0, r); ctx.lineTo(-k, k); ctx.lineTo(-r, 0); ctx.lineTo(-k, -k); ctx.closePath();
                ctx.fillStyle = `rgb(${rgb})`; ctx.fill();
            } else {
                ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${rgb}, ${p.a})`; ctx.fill();
            }
            ctx.restore();
        }
        function draw(move, t = 0) {
            ctx.clearRect(0, 0, w, h);
            for (const p of dots) {
                if (move) {
                    p.x += p.vx + (kind === 'petals' || kind === 'flurry' || kind === 'hearts' ? Math.sin(t * 0.001 + p.ph) * 0.3 : 0);
                    p.y += p.vy; p.rot += p.vr;
                    if (p.y > h + 20) { p.y = -20; p.x = rand(0, w); }
                    if (p.y < -20) { p.y = h + 20; p.x = rand(0, w); }
                    p.x = (p.x + w) % w;
                    if (mouse.x !== null) {
                        const dx = mouse.x - p.x, dy = mouse.y - p.y, dist = Math.hypot(dx, dy);
                        if (dist < mouse.r && dist > 0) { const f = (mouse.r - dist) / mouse.r; p.x -= (dx / dist) * f * 1.6; p.y -= (dy / dist) * f * 1.6; }
                    }
                }
                shape(p, t);
            }
        }
        function loop(t) { draw(true, t); raf = requestAnimationFrame(loop); }
        function stop() { cancelAnimationFrame(raf); raf = 0; }
        function restart() {
            stop();
            if (!enabled()) { ctx?.clearRect(0, 0, w, h); return; }
            if (!dots.length && kind !== 'none') size();
            if (calm() || document.hidden) { draw(false); return; }
            raf = requestAnimationFrame(loop);
        }
        function reset() { size(); recolor(); restart(); }
        function recolor() {
            const cs = getComputedStyle(root);
            rgb = cs.getPropertyValue('--glow-rgb').trim() || rgb;
            petal = cs.getPropertyValue('--petal-rgb').trim() || petal;
            if (enabled() && !raf) draw(false);
        }
        if (canvas) {
            addEventListener('resize', () => { size(); restart(); }, { passive: true });
            addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { mouse.x = e.clientX; mouse.y = e.clientY; } }, { passive: true });
            document.addEventListener('visibilitychange', restart);
            matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => { restart(); syncSvgMotion(); });
        }
        return { size, restart, reset, recolor };
    })();

    function boot() {
        Object.entries(prefs).forEach(([k, v]) => root.setAttribute(attr(k), v));
        syncThemeChrome();
        syncSvgMotion();
        Ambient.size();
        Ambient.restart();
        bindSettings();
    }

    return { boot, toggle, setThemeMode, set, applyLook, applyPreset, reset, isDark, renderSettings,
        looks: () => LOOKS.map(([id, name, desc]) => ({ id, name, desc })), look: () => prefs.look, themeMode, defaultLook: DEFAULTS.look };
})();

// Global name the markup calls
function toggleTheme(e) { Appearance.toggle(e); }
Appearance.boot();

// modules talk to each other through window: a top-level const is not a window property
window.Appearance = Appearance;
