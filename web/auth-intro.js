/**
 * The sign-in page comes alive once the splash has landed the logo in its ring. Every line arrives the way it reads:
 *  - "Vettly" drops in letter by letter
 *  - the kicker: a rule draws, then the words slide out from under it
 *  - "Walk in" walks in, a step at a time; "ready." lands like a stamp, an ink line draws under it and a few drops
 *    spatter (click it for more)
 *  - "Made for ..." is a departures board: each field flips in letter by letter, in a different look's colour
 *  - the lede comes into focus word by word, then a marker swipes over what to bring
 *  - the points tick up 01 02 03 and act out their words: a frame locks onto "exact", a voice wave talks while
 *    "Answers that sound like you" appears, the 5 counts up and the morning's words rise warm, then settle to ink
 *  - the card rises tilted and settles; its tape slaps down
 *  - after: headline letters hop under the pointer, the card leans toward it, the grid paper lights up around it
 * The form is up within half a second; every word is in by about 2.8 s (quicker on a reload). Calm and reduced
 * motion get the finished page, still. auth.js calls play().
 */
const AuthIntro = (() => {
    const ROLES = [['nurses', '#e0628a'], ['analysts', '#2f6fe4'], ['engineers', '#ea580c'], ['designers', '#8b6cf0'], ['teachers', '#1fa7a2'], ['marketers', '#e5486b']];
    const GLYPHS = 'abcdefghijklmnopqrstuvwxyz';
    const gate = () => document.getElementById('auth-gate');
    const calm = () => !!window.Motion?.calm?.() || matchMedia('(prefers-reduced-motion: reduce)').matches;
    let played = false, swapTimer = 0;

    // a departures board: each letter flips through a few others before it lands, left to right
    function flap(word, text, color) {
        word.style.color = color;
        word.textContent = '';
        const cells = [...text].map(ch => word.appendChild(Object.assign(document.createElement('span'), { className: 'flap', textContent: ch })));
        cells.forEach(c => { c.style.width = `${c.getBoundingClientRect().width}px`; });   // each cell keeps its own letter's width: no jitter
        cells.forEach((c, i) => {
            let flips = 2 + i;   // later letters flip a little longer, so the word settles left to right
            const turn = (ms, ease) => c.animate([{ transform: 'rotateX(-90deg)', opacity: 0.35 }, { transform: 'none', opacity: 1 }], { duration: ms, easing: ease });
            const next = () => {
                if (flips-- > 0) { c.textContent = GLYPHS[Math.random() * 26 | 0]; turn(70, 'ease-out'); setTimeout(next, 52); }
                else { c.textContent = text[i]; turn(240, 'cubic-bezier(.34,1.56,.64,1)'); }
            };
            next();
        });
    }
    // "Made for nurses / analysts / ...", each field flipping in on the board
    function swapper(g) {
        const word = g.querySelector('[data-swap]'); if (!word) return;
        let k = 0;
        clearInterval(swapTimer);
        word.style.color = ROLES[0][1];
        if (calm()) return;
        flap(word, ...ROLES[0]);
        swapTimer = setInterval(() => {
            if (document.hidden || g.hidden) return;
            k = (k + 1) % ROLES.length;
            flap(word, ...ROLES[k]);
        }, 2600);
    }

    // a few drops of ink fly off the end of the underline
    function splash(g) {
        if (calm()) return;
        const path = g.querySelector('.at-ink'); if (!path) return;
        const r = path.getBoundingClientRect();
        for (let i = 0; i < 7; i++) {
            const d = document.createElement('i'); d.className = 'at-drop';
            Object.assign(d.style, { left: `${r.right - 6}px`, top: `${r.top + r.height * 0.45}px`, width: `${3 + Math.random() * 4}px`, height: `${3 + Math.random() * 4}px` });
            document.body.append(d);
            const a = -Math.PI / 2 + (Math.random() - 0.3) * 2.4, dist = 14 + Math.random() * 26;
            d.animate([{ transform: 'translate(0, 0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(a) * dist}px, ${Math.sin(a) * dist + 12}px) scale(.4)`, opacity: 0 }], { duration: 600 + Math.random() * 300, easing: 'cubic-bezier(.2,.8,.4,1)' }).onfinish = () => d.remove();
        }
    }

    // the 5 counts up, a number at a time
    function count(el) {
        const to = Number(el.textContent) || 5;
        for (let n = 1; n <= to; n++) {
            setTimeout(() => {
                el.textContent = n;
                el.animate([{ transform: 'translateY(55%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 150, easing: 'cubic-bezier(.2,.8,.3,1)' });
            }, (n - 1) * 95);
        }
    }

    // after the intro: the pointer lights the grid paper and the card leans toward it (mouse and trackpad only)
    function pointer(g) {
        if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
        const panel = g.querySelector('.auth-panel');
        let raf = 0, x = 0, y = 0;
        g.addEventListener('pointermove', e => {
            x = e.clientX; y = e.clientY;
            if (raf) return;
            raf = requestAnimationFrame(() => {
                raf = 0;
                g.style.setProperty('--mx', `${x}px`); g.style.setProperty('--my', `${y}px`);
                if (!panel || calm()) return;
                const r = panel.getBoundingClientRect(), dx = (x - (r.left + r.width / 2)) / innerWidth, dy = (y - (r.top + r.height / 2)) / innerHeight;
                panel.style.setProperty('--tilt-x', `${(-dy * 5).toFixed(2)}deg`); panel.style.setProperty('--tilt-y', `${(dx * 6).toFixed(2)}deg`);
            });
        }, { passive: true });
        g.addEventListener('pointerleave', () => { panel?.style.setProperty('--tilt-x', '0deg'); panel?.style.setProperty('--tilt-y', '0deg'); });
    }

    function play() {
        const g = gate();
        if (!g || g.hidden || played) return;
        played = true;
        window.Brand?.fill(g);
        g.querySelector('.at-ready')?.addEventListener('click', () => {
            splash(g);
            if (!calm()) g.querySelector('.at-ready-text')?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.14) rotate(-3deg)' }, { transform: 'none' }], { duration: 480, easing: 'cubic-bezier(.34,1.56,.64,1)' });
        });
        const gsap = window.gsap;
        if (calm() || !gsap) { g.classList.add('intro-still'); swapper(g); return; }   // the CSS fallback entrances (or none, when calm)
        g.classList.add('intro-on', 'intro-wait');   // GSAP runs the entrances; the words wait, hidden, for the splash to hand over
        (window.Brand?.afterSplash || (fn => fn()))(() => run(g, gsap));
    }

    function run(g, gsap) {
        pointer(g);
        if (window.SplitText) gsap.registerPlugin(SplitText);
        const S = window.SplitText;
        const q = s => g.querySelector(s), qa = s => [...g.querySelectorAll(s)];
        // screen readers: the brand, the lede and the second point stay plain text (split without labels, put back when
        // the intro ends); the headline keeps its letters for the hover hop, so the <h1> carries the sentence
        const title = q('.auth-title');
        if (S && title) title.setAttribute('aria-label', title.textContent.replace(/\s+/g, ' ').trim());
        const sWord = S && new S(q('.auth-word'), { type: 'chars', charsClass: 'aw-char', aria: 'none' });
        const sLede = S && new S(q('.auth-lede'), { type: 'words', wordsClass: 'al-word', aria: 'none' });
        const sSay = S && new S(q('.auth-points li:nth-child(2) .ap-in'), { type: 'chars', charsClass: 'ap-char', aria: 'none' });
        const word = sWord ? sWord.chars : [q('.auth-word')];
        const line = S ? new S(q('.at-line'), { type: 'chars', charsClass: 'at-char', aria: 'hidden' }).chars : [q('.at-line')];
        const ready = S ? new S(q('.at-ready-text'), { type: 'chars', charsClass: 'at-char', aria: 'hidden' }).chars : [q('.at-ready-text')];
        const lede = sLede ? sLede.words : [q('.auth-lede')];
        const say = sSay ? sSay.chars : [q('.auth-points li:nth-child(2) .ap-in')];
        const bars = qa('.ap-wave i'), ink = q('.at-ink path');
        const warm = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#f06a20';
        const delivered = window.Brand?.landed === q('.auth-brand .brand-orb');   // the splash already put the logo in its ring
        g.classList.remove('intro-wait');
        const tl = gsap.timeline({
            defaults: { ease: 'expo.out' },
            onComplete: () => { gsap.set([...line, ...ready], { clearProps: 'transform,opacity,filter' }); sWord?.revert(); sLede?.revert(); sSay?.revert(); g.classList.add('intro-done'); },
        });
        if (document.documentElement.dataset.splash === 'quick') tl.timeScale(1.35);   // a reload: the same show, a little quicker
        if (!delivered) tl.from(q('.auth-brand .brand-ring'), { scale: 0, rotate: -160, duration: 1.1, ease: 'back.out(1.8)' }, 0);
        tl.from(word, { yPercent: -130, rotateX: 90, opacity: 0, duration: 0.7, stagger: 0.04, ease: 'back.out(2.2)' }, 0.05)
            // the kicker: a rule draws, the words slide out from under it
            .from(q('.auth-kicker'), { '--rule': 0, duration: 0.5, ease: 'power3.inOut' }, 0.1)
            .fromTo(q('.ak-text'), { clipPath: 'inset(0% 100% 0% 0%)', x: -14 }, { clipPath: 'inset(0% 0% 0% 0%)', x: 0, duration: 0.7, ease: 'power3.inOut' }, 0.3)
            // "Walk in" walks in: each letter steps in from the left with a little bob, like feet
            .from(line, { x: -72, opacity: 0, duration: 0.95, stagger: 0.055, ease: 'power2.out' }, 0.3)
            .to(line, { keyframes: { y: [0, -15, 0, -8, 0], rotate: [0, -9, 5, -3, 0], easeEach: 'sine.inOut' }, duration: 0.95, stagger: 0.055 }, 0.3)
            // a rubber stamp: each letter comes down from the top of its own box, big and soft, then thumps flat
            .from(ready, { scale: 1.75, yPercent: -18, opacity: 0, filter: 'blur(7px)', transformOrigin: '50% 0%', rotate: i => [-10, 8, -6, 9, -7, 5][i % 6], duration: 0.62, stagger: 0.06, ease: 'back.out(2)' }, 0.62)
            .fromTo(ink, { strokeDashoffset: 1.05 }, { strokeDashoffset: 0, duration: 0.55, ease: 'power2.inOut' }, 1.0)
            .add(() => splash(g), 1.5)
            // the departures board
            .from(q('.auth-swap'), { y: 12, opacity: 0, duration: 0.6, ease: 'power3.out' }, 1.0)
            .add(() => swapper(g), 1.08)
            // the lede comes into focus, then the marker swipes over what to bring
            .from(lede, { y: 8, opacity: 0, filter: 'blur(6px)', duration: 0.6, stagger: 0.03, ease: 'power3.out' }, 1.1)
            .from(qa('.al-mark'), { '--mk': '0%', duration: 0.5, stagger: 0.24, ease: 'power2.inOut' }, 1.75)
            // the points: hairlines draw, numbers tick up
            .from(qa('.auth-points li'), { '--hair': 0, duration: 0.8, stagger: 0.12, ease: 'power3.inOut' }, 1.45)
            .from(qa('.ap-n b'), { yPercent: 110, duration: 0.55, stagger: 0.14, ease: 'back.out(2)' }, 1.5)
            // 01: rises out of its slot, then a frame locks onto "exact"
            .from(q('.auth-points li:nth-child(1) .ap-in'), { yPercent: 150, duration: 0.7, ease: 'power4.out' }, 1.58)
            .from(q('.ap-box'), { scale: 1.9, opacity: 0, rotate: 8, duration: 0.5, ease: 'back.out(3)' }, 2.02)
            // 02: said out loud, a letter at a time, while the voice wave talks; then the wave rests
            .from(say, { opacity: 0, y: 5, duration: 0.25, stagger: 0.022, ease: 'power2.out' }, 1.78)
            .from(bars, { scaleY: 0, duration: 0.3, stagger: 0.04, ease: 'back.out(2)' }, 1.72)
            .to(bars, { scaleY: () => 0.3 + Math.random() * 1.1, duration: 0.11, ease: 'sine.inOut', stagger: { each: 0.03, repeat: 9, yoyo: true }, repeatRefresh: true }, 1.95)
            .to(bars, { scaleY: 1, duration: 0.35, ease: 'back.out(2)' }, 2.6)
            // 03: the 5 counts up; the morning's words rise warm and settle to ink
            .from(q('.ap-count'), { opacity: 0, duration: 0.01 }, 1.98)
            .add(() => count(q('.ap-count')), 1.98)
            .from(q('.auth-points li:nth-child(3) .ap-in'), { y: 14, opacity: 0, color: warm, duration: 0.9, ease: 'power3.out' }, 2.0)
            // the card: up early, so the form is ready to use while the words arrive
            .from(q('.auth-panel'), { y: 56, rotateX: 16, opacity: 0, transformPerspective: 1200, duration: 1.15, ease: 'expo.out', clearProps: 'transform,opacity' }, 0.2)
            .from(q('.auth-tape'), { scale: 1.7, rotate: -24, opacity: 0, duration: 0.55, ease: 'back.out(2.6)' }, 0.85)
            .from(q('.auth-theme'), { y: -16, opacity: 0, duration: 0.6, ease: 'power3.out' }, 0.4);
    }
    return { play };
})();
window.AuthIntro = AuthIntro;
