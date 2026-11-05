/**
 * Vettly's logo is the Mentor's orb. Wherever it stands (the side panel, the sign-in page, onboarding, the browser
 * tab) it keeps its animation and slowly travels through the nine looks' colours: Poster orange, Register ink,
 * Studio clay, Blueprint blue, Bubblegum pink, Sakura blossom, Lavender, Strawberry, Mermaid teal.
 * It starts on the look you wear, eases to the next every few seconds (brand.css registers the colours so they
 * blend), and rests when the tab is hidden, under Calm, or with reduced motion.
 * Markup: <span class="m-orb brand-orb" data-look="glow" data-emblem aria-hidden="true"></span>
 * (data-look="glow" keeps it on the glossy orb whatever the Mentor's own orb style is).
 */
const Brand = (() => {
    // core, deep, glow (r, g, b), the star
    const LOOKS = {
        classic: ['#f06a20', '#a83a08', '240, 106, 32', '#fff9ee'],
        register: ['#4a6cb3', '#1f2c4a', '72, 126, 204', '#fdf6dc'],
        studio: ['#e0703a', '#8f3412', '224, 112, 58', '#fff4ea'],
        blueprint: ['#3f83f8', '#1e3a8a', '63, 131, 248', '#eef6ff'],
        bubblegum: ['#f0508a', '#9d1550', '240, 80, 138', '#fff0f6'],
        sakura: ['#f29bb5', '#b8506f', '242, 155, 181', '#fff6f8'],
        lavender: ['#a07cf0', '#5537b0', '160, 124, 240', '#f6f1ff'],
        strawberry: ['#f06b8a', '#ad2848', '240, 107, 138', '#fff3f5'],
        mermaid: ['#2fc4bf', '#1d6684', '47, 196, 191', '#effffe'],
    };
    const ORDER = Object.keys(LOOKS);
    const root = document.documentElement;
    const quiet = () => matchMedia('(prefers-reduced-motion: reduce)').matches || root.dataset.motion === 'calm';
    let at = Math.max(0, ORDER.indexOf(root.dataset.look)), timer = 0;
    const PERIOD = 6000;

    function paint(el, id) {
        const [core, deep, rgb, star] = LOOKS[id];
        el.style.setProperty('--orb-core', core);
        el.style.setProperty('--orb-deep', deep);
        el.style.setProperty('--glow-rgb', rgb);
        el.style.setProperty('--orb-aura', `rgba(${rgb}, 0.24)`);
        el.style.setProperty('--orb-ripple', `rgba(${rgb}, 0.5)`);
        el.style.setProperty('--orb-star', star);
        el.dataset.brandLook = id;
    }
    // the tab's icon: the orb drawn small, in the same colours
    function favicon(id) {
        const [core, deep, , star] = LOOKS[id];
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><radialGradient id="g" cx="38%" cy="30%" r="78%"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset=".28" stop-color="${core}"/><stop offset="1" stop-color="${deep}"/></radialGradient></defs><circle cx="16" cy="16" r="15" fill="url(#g)"/><ellipse cx="16" cy="16" rx="12.6" ry="4.6" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.1" transform="rotate(-35 16 16)"/><ellipse cx="16" cy="16" rx="12.6" ry="4.6" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1" transform="rotate(35 16 16)"/><path d="M16 7.2C16.7 13 19 15.3 24.8 16C19 16.7 16.7 19 16 24.8C15.3 19 13 16.7 7.2 16C13 15.3 15.3 13 16 7.2Z" fill="${star}"/></svg>`;
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
            paint(el, ORDER[at]);
        });
    }
    function step() {
        at = (at + 1) % ORDER.length;
        fill();
        icon(ORDER[at]);
    }
    function run() {
        clearInterval(timer); timer = 0;
        if (quiet()) return;
        timer = setInterval(() => { if (!document.hidden) step(); }, PERIOD);
    }
    // on a look change the logo starts again from the look you chose
    new MutationObserver(() => { at = Math.max(0, ORDER.indexOf(root.dataset.look)); fill(); icon(ORDER[at]); run(); })
        .observe(root, { attributes: true, attributeFilter: ['data-look', 'data-motion'] });
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', run);

    fill(); icon(ORDER[at]); run();
    return { fill, looks: () => [...ORDER], favicon };
})();
window.Brand = Brand;
