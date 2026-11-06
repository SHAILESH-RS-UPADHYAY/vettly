/**
 * The Sketchbook sign-in page comes alive once the splash has landed the logo in its ring. The page turns in from its
 * spine, a star is doodled by the name, the title is written by hand and highlighted, each to-do gets its box drawn,
 * its words written and its tick, an arrow points at the card, and the index card slides on and is taped down.
 * The card (with the real sign-in form inside) is up within a second, so nobody waits on the handwriting.
 * Calm and reduced motion get the finished page, still. auth.js calls play() when this page is the one showing.
 */
const AuthSketch = (() => {
    const gate = () => document.getElementById('auth-gate');
    const calm = () => !!window.Motion?.calm?.() || matchMedia('(prefers-reduced-motion: reduce)').matches;
    let played = false;

    function play() {
        const g = gate();
        if (!g || g.hidden || played) return;
        played = true;
        window.Brand?.fill(g);
        const gsap = window.gsap;
        if (calm() || !gsap) return;   // the finished page, as written
        g.classList.add('sk-wait');    // the words wait, hidden, for the splash to hand over
        (window.Brand?.afterSplash || (fn => fn()))(() => run(g, gsap));
    }

    function run(g, gsap) {
        const q = s => g.querySelector(s), qa = s => [...g.querySelectorAll(s)];
        const delivered = window.Brand?.landed === q('.sk-brand .brand-orb');   // the splash already put the logo in its ring
        // strokes start undrawn
        gsap.set(qa('.sk-doodle path, .sk-box rect, .sk-box path, .sk-arrow path'), { strokeDashoffset: 1 });
        g.classList.remove('sk-wait');
        const tl = gsap.timeline({ defaults: { ease: 'power2.out' }, onComplete: () => gsap.set(qa('.sk-title, .sk-say'), { clearProps: 'clipPath' }) });
        if (document.documentElement.dataset.splash === 'quick') tl.timeScale(1.35);   // a reload: the same page, written a little faster
        tl.from(q('.sk-page'), { rotateY: -24, transformPerspective: 1600, opacity: 0.4, duration: 0.9, ease: 'power3.out', clearProps: 'transform,opacity' }, 0);
        if (!delivered) tl.from(q('.sk-brand .brand-ring'), { scale: 0, rotate: -120, duration: 0.9, ease: 'back.out(1.8)' }, 0.1);
        tl.from(q('.sk-word'), { opacity: 0, x: -10, duration: 0.5 }, 0.2)
            .to(q('.sk-doodle path'), { strokeDashoffset: 0, duration: 0.7, ease: 'none' }, 0.4)
            // the title is written by hand, then highlighted
            .fromTo(q('.sk-title'), { clipPath: 'inset(-10% 100% -20% 0)' }, { clipPath: 'inset(-10% 0% -20% 0)', duration: 1.3, ease: 'none' }, 0.5)
            .fromTo(q('.sk-hl'), { '--mk': '0%' }, { '--mk': '100%', duration: 0.45, ease: 'power1.inOut' }, 1.85)
            // the card slides on and is taped down, early, so the form is ready while the list writes itself
            .from(q('.sk-card-wrap'), { x: 110, rotate: 7, opacity: 0, duration: 0.9, ease: 'power3.out' }, 0.45)
            .from(qa('.sk-tape'), { scale: 1.6, opacity: 0, duration: 0.4, stagger: 0.15, ease: 'back.out(3)' }, 1.15)
            .from(q('.auth-theme'), { y: -14, opacity: 0, duration: 0.5 }, 0.6);
        // each to-do: the box is drawn, the words are written, the tick lands
        let t = 2.1;
        qa('.sk-todo li').forEach(li => {
            const say = [...li.querySelectorAll('.sk-say')].find(el => !el.hidden) || li.querySelector('.sk-say');
            const len = (say?.textContent.length || 20) * 0.026;
            tl.to(li.querySelector('.sk-box rect'), { strokeDashoffset: 0, duration: 0.3, ease: 'none' }, t);
            if (say) tl.fromTo(say, { clipPath: 'inset(-20% 100% -30% 0)' }, { clipPath: 'inset(-20% 0% -30% 0)', duration: len, ease: 'none' }, t + 0.2);
            const tick = li.querySelector('.sk-box path');
            if (tick) tl.to(tick, { strokeDashoffset: 0, duration: 0.28, ease: 'power2.in' }, t + 0.2 + len);
            t += 0.38 + len;
        });
        tl.to(q('.sk-arrow path'), { strokeDashoffset: 0, duration: 0.6, ease: 'none' }, t)
            .from(q('.sk-signed'), { opacity: 0, y: 6, duration: 0.6 }, t + 0.25);
    }
    return { play };
})();
window.AuthSketch = AuthSketch;
