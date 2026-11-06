/**
 * The sign-in page comes alive: every piece arrives its own way, then keeps a few small pleasures.
 *  - the orb logo spins in and "Vettly" drops letter by letter
 *  - the kicker wipes open; "Walk in" rises letter by letter; "ready." lands like a stamp, an ink line draws
 *    under it and a few drops spatter (click it for more)
 *  - "Made for ..." flips through fields, each in a different look's colour
 *  - the lede sharpens out of a blur word by word; each point's icon pops, its words slide in
 *  - the card rises tilted and settles; its tape slaps down
 *  - after: headline letters hop under the pointer, the card leans toward it, the grid paper lights up around it
 * Text is all there by about 1.6 s. Calm and reduced motion get the finished page, still. auth.js calls play().
 */
const AuthIntro = (() => {
    const ROLES = [['nurses', '#e0628a'], ['analysts', '#2f6fe4'], ['engineers', '#ea580c'], ['designers', '#8b6cf0'], ['teachers', '#1fa7a2'], ['marketers', '#e5486b']];
    const gate = () => document.getElementById('auth-gate');
    const calm = () => !!window.Motion?.calm?.() || matchMedia('(prefers-reduced-motion: reduce)').matches;
    let played = false, swapTimer = 0;

    // ── "Made for nurses / analysts / ..." flips like a departures board ──
    function swapper(g) {
        const word = g.querySelector('[data-swap]'); if (!word) return;
        let k = 0;
        word.style.color = ROLES[0][1];
        clearInterval(swapTimer);
        if (calm()) return;
        swapTimer = setInterval(() => {
            if (document.hidden || g.hidden) return;
            k = (k + 1) % ROLES.length;
            const [text, color] = ROLES[k];
            const out = word.animate([{ transform: 'none', opacity: 1, filter: 'blur(0)' }, { transform: 'translateY(-60%) rotateX(80deg)', opacity: 0, filter: 'blur(3px)' }], { duration: 300, easing: 'cubic-bezier(.55,0,.75,.2)' });
            out.onfinish = () => {
                word.textContent = text; word.style.color = color;
                word.animate([{ transform: 'translateY(60%) rotateX(-80deg)', opacity: 0, filter: 'blur(3px)' }, { transform: 'none', opacity: 1, filter: 'blur(0)' }], { duration: 520, easing: 'cubic-bezier(.34,1.56,.64,1)' });
            };
        }, 2100);
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
        swapper(g);
        pointer(g);
        g.querySelector('.at-ready')?.addEventListener('click', () => {
            splash(g);
            if (!calm()) g.querySelector('.at-ready-text')?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.14) rotate(-3deg)' }, { transform: 'none' }], { duration: 480, easing: 'cubic-bezier(.34,1.56,.64,1)' });
        });
        const gsap = window.gsap;
        if (calm() || !gsap) { g.classList.add('intro-still'); return; }   // the CSS fallback entrances (or none, when calm)
        g.classList.add('intro-on');
        if (window.SplitText) gsap.registerPlugin(SplitText);
        const S = window.SplitText;
        const q = s => g.querySelector(s), qa = s => [...g.querySelectorAll(s)];
        // screen readers: the brand and the lede stay plain text (split without labels, put back when the intro ends);
        // the headline keeps its letters for the hover hop, so the <h1> carries the sentence and its letters are hidden
        const title = q('.auth-title');
        if (S && title) title.setAttribute('aria-label', title.textContent.replace(/\s+/g, ' ').trim());
        const sWord = S && new S(q('.auth-word'), { type: 'chars', charsClass: 'aw-char', aria: 'none' });
        const sLede = S && new S(q('.auth-lede'), { type: 'words', wordsClass: 'al-word', aria: 'none' });
        const word = sWord ? sWord.chars : [q('.auth-word')];
        const line = S ? new S(q('.at-line'), { type: 'chars', charsClass: 'at-char', aria: 'hidden' }).chars : [q('.at-line')];
        const ready = S ? new S(q('.at-ready-text'), { type: 'chars', charsClass: 'at-char', aria: 'hidden' }).chars : [q('.at-ready-text')];
        const lede = sLede ? sLede.words : [q('.auth-lede')];
        const ink = q('.at-ink path');
        const tl = gsap.timeline({ defaults: { ease: 'expo.out' }, onComplete: () => { gsap.set([...line, ...ready], { clearProps: 'transform,opacity,filter' }); sWord?.revert(); sLede?.revert(); g.classList.add('intro-done'); } });
        tl.from(q('.auth-brand .brand-orb'), { scale: 0, rotate: -160, duration: 1.1, ease: 'back.out(1.8)' }, 0)
            .from(word, { yPercent: -130, rotateX: 90, opacity: 0, duration: 0.7, stagger: 0.04, ease: 'back.out(2.2)' }, 0.08)
            .from(q('.auth-kicker'), { clipPath: 'inset(0 100% 0 0 round 999px)', opacity: 0, duration: 0.7, ease: 'power3.inOut' }, 0.18)
            .from(line, { yPercent: 110, rotate: 9, opacity: 0, duration: 0.85, stagger: 0.035 }, 0.22)
            // a rubber stamp: each letter comes down from the top of its own box (never over "Walk in"), big and soft, then thumps flat
            .from(ready, { scale: 1.75, yPercent: -18, opacity: 0, filter: 'blur(7px)', transformOrigin: '50% 0%', rotate: i => [-10, 8, -6, 9, -7, 5][i % 6], duration: 0.62, stagger: 0.06, ease: 'back.out(2)' }, 0.5)
            .fromTo(ink, { strokeDashoffset: 1.05 }, { strokeDashoffset: 0, duration: 0.55, ease: 'power2.inOut' }, 0.88)
            .add(() => splash(g), 1.4)
            .from(q('.auth-swap'), { y: 12, opacity: 0, duration: 0.6, ease: 'power3.out' }, 0.7)
            .from(lede, { y: 8, opacity: 0, filter: 'blur(6px)', duration: 0.6, stagger: 0.014, ease: 'power3.out' }, 0.82)
            .from(qa('.auth-points li'), { x: -20, opacity: 0, duration: 0.7, stagger: 0.11, ease: 'power3.out' }, 1.05)
            .from(qa('.auth-points .ap-ico'), { scale: 0, rotate: -120, duration: 0.8, stagger: 0.11, ease: 'back.out(2.6)' }, 1.05)
            .from(q('.auth-panel'), { y: 56, rotateX: 16, opacity: 0, transformPerspective: 1200, duration: 1.15, ease: 'expo.out', clearProps: 'transform,opacity' }, 0.3)
            .from(q('.auth-tape'), { scale: 1.7, rotate: -24, opacity: 0, duration: 0.55, ease: 'back.out(2.6)' }, 0.95)
            .from(q('.auth-theme'), { y: -16, opacity: 0, duration: 0.6, ease: 'power3.out' }, 0.5);
    }
    return { play };
})();
window.AuthIntro = AuthIntro;
