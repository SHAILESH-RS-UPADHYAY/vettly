/**
 * The Sketchbook sign-in page comes alive once the splash has landed the logo in its ring. The page turns in from its
 * spine, a star is doodled by the name, the title is written by hand and highlighted, each to-do gets its box drawn,
 * its words written and its tick, an arrow points at the card, and the index card slides on and is taped down.
 * Then a sticky note slaps on ("Nervous is normal. Unprepared is optional.") and a flashcard starts flipping through real
 * questions from different fields. The card (with the real sign-in form inside) is up within a second, so nobody
 * waits on the handwriting.
 * Calm and reduced motion get the finished page, still. auth.js calls play() when this page is the one showing.
 */
const AuthSketch = (() => {
    const gate = () => document.getElementById('auth-gate');
    const calm = () => !!window.Motion?.calm?.() || matchMedia('(prefers-reduced-motion: reduce)').matches;
    let played = false;
    // the flashcard's questions: real ones, from different fields
    const QUESTIONS = [
        ['Tell me about a shift that went wrong. What did you do?', 'ICU nurse'],
        ['Walk me through a number you are proud of.', 'Data analyst'],
        ['How would you explain fractions to a bored class?', 'School teacher'],
        ['What did you cut from a design, and why?', 'UX designer'],
        ['Tell me about a deadline you nearly missed.', 'Software engineer'],
        ['How do you calm an upset guest?', 'Hospitality'],
    ];
    // the flashcard turns over to the next question when its pencil line fills; pointing at it holds it still
    function flashcards(g, gsap) {
        const fig = g.querySelector('.sk-flash'), card = g.querySelector('.sk-flash-card'), q = g.querySelector('.sk-flash-q'), role = g.querySelector('.sk-flash-role'), timer = g.querySelector('.sk-flash-timer');
        if (!fig || !card) return;
        let i = 0, tw = null;
        fig.addEventListener('pointerenter', () => tw?.pause());
        fig.addEventListener('pointerleave', () => tw?.resume());
        const wait = () => { tw = gsap.fromTo(timer, { scaleX: 0 }, { scaleX: 1, duration: 4.2, ease: 'none', onComplete: turn }); };
        function turn() {
            if (g.hidden) return;                              // signed in: the page is gone
            if (document.hidden) { setTimeout(turn, 1500); return; }
            i = (i + 1) % QUESTIONS.length;
            gsap.timeline({ onComplete: wait })
                .to(card, { rotateY: 90, duration: 0.28, ease: 'power2.in' })
                .add(() => { q.textContent = QUESTIONS[i][0]; role.textContent = QUESTIONS[i][1]; })
                .to(card, { rotateY: 0, duration: 0.6, ease: 'back.out(1.8)' });
        }
        wait();
    }

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
        gsap.set(qa('.sk-doodle path, .sk-box rect, .sk-box path, .sk-arrow path, .sk-opt path'), { strokeDashoffset: 1 });
        g.classList.remove('sk-wait');
        const tl = gsap.timeline({ defaults: { ease: 'power2.out' }, onComplete: () => gsap.set(qa('.sk-title, .sk-say, .sk-sticky-line'), { clearProps: 'clipPath' }) });
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
            // the sticky note slaps on and is written; a red pen underlines "optional"; the flashcard slides up and starts turning
            .from(q('.sk-sticky'), { scale: 1.35, rotate: -14, opacity: 0, duration: 0.6, ease: 'back.out(2.2)' }, t + 0.3)
            .from(q('.sk-sticky-tape'), { scale: 1.8, opacity: 0, duration: 0.35, ease: 'back.out(3)' }, t + 0.72)
            .fromTo(qa('.sk-sticky-line'), { clipPath: 'inset(-20% 100% -30% 0)' }, { clipPath: 'inset(-20% 0% -30% 0)', duration: 0.55, stagger: 0.45, ease: 'none' }, t + 0.8)
            .to(q('.sk-opt path'), { strokeDashoffset: 0, duration: 0.45, ease: 'power2.inOut' }, t + 1.85)
            .from(q('.sk-flash'), { y: 26, opacity: 0, duration: 0.7, ease: 'power3.out' }, t + 0.55)
            .add(() => flashcards(g, gsap), t + 1.3)
            .from(q('.sk-signed'), { opacity: 0, y: 6, duration: 0.6 }, t + 2.1);
    }
    return { play };
})();
window.AuthSketch = AuthSketch;
