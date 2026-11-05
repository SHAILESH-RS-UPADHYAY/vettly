/**
 * The Look Book: right after sign-up, before onboarding, the user dresses their studio. A large live preview of the
 * app (built from the real components, so every look's own fonts, cards and tape show) and a rail of the nine looks,
 * each a miniature in its own colours. Tapping a look restyles the whole app, spreading out of the tapped card as a
 * circle; Day / Night / Match device switches the theme the same way. Arrow keys preview, Enter wears, Esc reverts.
 * "Skip" keeps the default look. Shown once (localStorage), and again any time from the Atelier or the palette.
 * Motion: GSAP SplitText (the title) and GSAP for the preview's entrance, WAAPI for the cards, a small drag-with-
 * momentum for the rail on a mouse; Calm and reduced motion turn it all off. Uses Appearance (appearance.js), Motion and the icon sprite.
 */
const LookBook = (() => {
    const SEEN = 'vettly_lookbook_v1';
    const icon = (n, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
    const calm = () => !!window.Motion?.calm?.() || matchMedia('(prefers-reduced-motion: reduce)').matches;
    const seen = () => { try { return localStorage.getItem(SEEN) === 'done'; } catch (e) { return true; } };
    const markSeen = () => { try { localStorage.setItem(SEEN, 'done'); } catch (e) { /* private mode */ } };
    let dlg = null, startLook = null, startMode = null, onDone = null, picked = null, splits = [], dragOff = null, ro = null;

    // the preview: real components at desk size, scaled to fit, so a look's own fonts, cards and tape all show
    function previewHtml(name) {
        const nav = [['house', 'Daybook'], ['toolbox', 'Agent Toolbelt'], ['target', 'Prep Studio'], ['bento', 'Brain Bento'], ['chats', 'Live Copilot']];
        const day = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
        return `
        <div class="lb-window" aria-hidden="true">
            <div class="lb-bar"><i></i><i></i><i></i><span>vettly · daybook</span></div>
            <div class="lb-app">
                <aside class="lb-side">
                    <span class="lb-logo">${icon('dots-grid')}Vettly</span>
                    ${nav.map(([i, t], k) => `<span class="lb-nav${k ? '' : ' on'}">${icon(i)}${t}</span>`).join('')}
                </aside>
                <div class="lb-main">
                    <div class="poster-header lb-head"><p class="lb-date">${day}</p><h1>Good evening, <em>${name}</em></h1></div>
                    <div class="lb-grid">
                        <article class="toolbelt-card lb-card lb-next"><small>Up next</small><b>Feed your Agent Toolbelt</b><p>Add a resume or a job post and every answer is about you.</p><span class="btn btn-primary btn-sm">${icon('toolbox')}Open Toolbelt</span></article>
                        <article class="toolbelt-card lb-card"><small>Streak</small><b class="lb-big">3 days</b><span class="lb-week">${'<i></i>'.repeat(4)}${'<i class="off"></i>'.repeat(3)}</span></article>
                        <article class="toolbelt-card lb-card"><small>Brain Bento</small><span class="lb-ring"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15"/><circle class="f" cx="18" cy="18" r="15" pathLength="1"/></svg><b>2 of 5</b></span></article>
                    </div>
                    <article class="toolbelt-card lb-card lb-ink"><small>Live Copilot</small><p class="lb-q">Q. Tell me about yourself.</p><p class="lb-a">I'm a final-year student who turns messy problems into plans people can act on…</p><span class="chip">${icon('sparkle')}Ask Mentor</span></article>
                </div>
            </div>
        </div>`;
    }
    function cardHtml(l, i) {
        return `<button type="button" class="lb-look" role="radio" aria-checked="false" tabindex="-1" data-look="${l.id}" style="--i:${i}">
            <span class="look-thumb" data-thumb="${l.id}" aria-hidden="true"><span class="s"><i></i><i></i><i></i><i></i></span><span class="m"><span class="h"></span><span class="g"><span class="c"></span><span class="c"></span></span></span></span>
            <span class="lb-name">${l.name}${l.id === Appearance.defaultLook ? '<span class="tag-default">Default</span>' : ''}</span>
            <span class="lb-desc">${l.desc}</span>
            <span class="lb-wearing" aria-hidden="true">${icon('check-bold')}Wearing</span>
        </button>`;
    }

    function build(name) {
        dlg = document.createElement('dialog');
        dlg.className = 'lookbook';
        dlg.setAttribute('aria-labelledby', 'lb-title');
        dlg.innerHTML = `
            <div class="lb-sheet">
                <header class="lb-top">
                    <div class="lb-intro">
                        <p class="lb-kicker">${icon('palette')}Before we begin</p>
                        <h2 id="lb-title">Dress your studio</h2>
                        <p class="lb-lede">Tap a look and the whole of Vettly changes. Try as many as you like; you can change it any time in the Atelier.</p>
                    </div>
                    <div class="lb-modes" role="radiogroup" aria-label="Day or night">
                        ${[['light', 'sun', 'Day'], ['dark', 'moon', 'Night'], ['device', 'half', 'Match device']].map(([v, ic, t]) => `<button type="button" role="radio" data-mode="${v}" aria-checked="false">${icon(ic)}<span>${t}</span></button>`).join('')}
                    </div>
                </header>
                <div class="lb-stage">${previewHtml(name)}<p class="lb-caption" aria-live="polite"></p></div>
                <div class="lb-rail-wrap">
                    <button type="button" class="lb-arrow lb-go-prev" data-lb-scroll="-1" aria-label="Earlier looks" tabindex="-1">${icon('caret-right')}</button>
                    <div class="lb-rail" role="radiogroup" aria-label="Looks">${Appearance.looks().map(cardHtml).join('')}</div>
                    <button type="button" class="lb-arrow lb-go-next" data-lb-scroll="1" aria-label="More looks" tabindex="-1">${icon('caret-right')}</button>
                </div>
                <footer class="lb-foot">
                    <button type="button" class="btn btn-ghost" data-lb="skip">Skip<span class="lb-long">, keep the default</span></button>
                    <span class="lb-hint" aria-hidden="true"><kbd>←</kbd><kbd>→</kbd> to try · <kbd>Enter</kbd> to wear</span>
                    <button type="button" class="btn btn-primary" data-lb="wear"><span>Wear this look</span>${icon('caret-right')}</button>
                </footer>
            </div>`;
        document.body.appendChild(dlg);
        dlg.addEventListener('click', e => {
            const look = e.target.closest('.lb-look'); if (look) { pick(look.dataset.look, look); return; }
            const mode = e.target.closest('[data-mode]'); if (mode) { Appearance.setThemeMode(mode.dataset.mode, mode); setTimeout(syncModes, 30); return; }
            const arrow = e.target.closest('[data-lb-scroll]');
            if (arrow) { const r = dlg.querySelector('.lb-rail'); r.scrollBy({ left: Number(arrow.dataset.lbScroll) * r.clientWidth * 0.7, behavior: calm() ? 'auto' : 'smooth' }); return; }
            const b = e.target.closest('[data-lb]'); if (b) (b.dataset.lb === 'wear' ? wear(b) : skip());
        });
        dlg.addEventListener('cancel', e => { e.preventDefault(); skip(); });   // Esc puts things back
        dlg.addEventListener('keydown', e => {
            if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter'].includes(e.key)) return;
            if (e.target.closest('.lb-modes, .lb-foot')) return;
            const cards = [...dlg.querySelectorAll('.lb-look')], at = cards.findIndex(c => c.dataset.look === picked);
            if (e.key === 'Enter') { e.preventDefault(); wear(dlg.querySelector('[data-lb="wear"]')); return; }
            e.preventDefault();
            const n = e.key === 'Home' ? 0 : e.key === 'End' ? cards.length - 1 : (at + (/Right|Down/.test(e.key) ? 1 : -1) + cards.length) % cards.length;
            cards[n].focus(); pick(cards[n].dataset.look, cards[n]);
        });
        fit();
        ro = new ResizeObserver(fit);
        ro.observe(dlg.querySelector('.lb-stage'));
    }

    // the preview is a desk-sized page scaled into the stage
    function fit() {
        const stage = dlg?.querySelector('.lb-stage'), win = dlg?.querySelector('.lb-window');
        if (!stage || !win || !stage.clientWidth) return;
        const s = Math.min((stage.clientWidth - 40) / 980, (stage.clientHeight - 44) / 600, 1);
        win.style.setProperty('--lb-scale', String(Math.max(0.2, s)));
    }
    function syncModes() {
        const mode = Appearance.themeMode();
        dlg.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
    }
    function mark(id) {
        const looks = Appearance.looks(), l = looks.find(x => x.id === id);
        dlg.querySelectorAll('.lb-look').forEach(c => {
            const on = c.dataset.look === id;
            c.setAttribute('aria-checked', String(on));
            c.tabIndex = on ? 0 : -1;
        });
        dlg.querySelector('.lb-caption').textContent = l ? `${l.name}: ${l.desc}` : '';
        dlg.querySelector('[data-lb="wear"] span').textContent = id === startLook ? 'Keep this look' : `Wear ${l?.name || 'this look'}`;
    }
    function pick(id, card) {
        if (id === picked) return;
        picked = id;
        mark(id);
        Appearance.applyLook(id, card);   // the whole app restyles, spreading out of the tapped card
        card?.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
        if (calm()) return;
        card?.animate([{ transform: 'translateY(-12px) scale(1.04)' }, { transform: 'translateY(-14px) scale(1.06) rotate(-1.5deg)' }, { transform: 'none' }], { duration: 560, easing: 'cubic-bezier(.34,1.56,.64,1)' });
        // the preview settles into its new clothes a beat after the reveal
        setTimeout(() => {
            if (!dlg?.open) return;
            dlg.querySelectorAll('.lb-window .lb-card, .lb-window .lb-head').forEach((el, i) => el.animate(
                [{ transform: 'translateY(10px) scale(.97)', opacity: 0.4 }, { transform: 'none', opacity: 1 }],
                { duration: 520, delay: i * 55, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' }));
        }, 260);
    }

    function intro() {
        if (calm() || !window.gsap) return;
        const g = window.gsap;
        if (window.SplitText) {
            g.registerPlugin(SplitText);
            const split = SplitText.create(dlg.querySelector('#lb-title'), { type: 'chars,words', aria: 'auto' });
            splits.push(split);
            g.from(split.chars, { yPercent: 120, rotate: 12, opacity: 0, duration: 0.7, ease: 'back.out(1.8)', stagger: 0.03, delay: 0.15 });
        }
        g.from(dlg.querySelectorAll('.lb-kicker, .lb-lede, .lb-modes'), { y: 14, opacity: 0, duration: 0.6, ease: 'power3.out', stagger: 0.08, delay: 0.1 });
        // WAAPI, not GSAP: GSAP writes scale/translate inline, and those place and size the preview
        dlg.querySelector('.lb-window').animate([{ transform: 'perspective(1200px) translateY(60px) rotateX(16deg)', opacity: 0 }, { transform: 'none', opacity: 1 }],
            { duration: 900, delay: 200, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' });
        dlg.querySelectorAll('.lb-look').forEach((c, i) => c.animate(   // WAAPI: it sits on top of the card's own CSS transition
            [{ transform: `translateY(70px) rotate(${i % 2 ? 5 : -5}deg)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
            { duration: 700, delay: 350 + i * 60, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'backwards' }));
        g.from(dlg.querySelector('.lb-foot'), { y: 20, opacity: 0, duration: 0.5, ease: 'power3.out', delay: 0.6 });
    }

    // the rail: a mouse can drag it (it glides on after you let go) and a wheel scrolls it sideways; touch swipes natively
    function rail() {
        const el = dlg.querySelector('.lb-rail');
        const ends = () => {
            dlg?.querySelector('.lb-go-prev')?.toggleAttribute('hidden', el.scrollLeft < 8);
            dlg?.querySelector('.lb-go-next')?.toggleAttribute('hidden', el.scrollLeft + el.clientWidth > el.scrollWidth - 8);
        };
        el.addEventListener('scroll', ends, { passive: true }); requestAnimationFrame(ends);
        if (!matchMedia('(pointer: fine)').matches) return;
        let down = null, moved = false, v = 0, last = 0, raf = 0;
        const move = e => {
            const dx = e.clientX - down.x;
            if (!moved && Math.abs(dx) > 6) { moved = true; el.classList.add('is-dragging'); }
            if (moved) { el.scrollLeft = down.left - dx; v = e.clientX - last; last = e.clientX; }
        };
        const up = () => {
            removeEventListener('pointermove', move); removeEventListener('pointerup', up);
            down = null; el.classList.remove('is-dragging');
            if (moved && !calm()) { const glide = () => { el.scrollLeft -= v; v *= 0.92; if (Math.abs(v) > 0.4) raf = requestAnimationFrame(glide); }; raf = requestAnimationFrame(glide); }
            setTimeout(() => { moved = false; }, 0);
        };
        el.addEventListener('pointerdown', e => {
            if (e.pointerType !== 'mouse' || e.button) return;
            cancelAnimationFrame(raf); down = { x: e.clientX, left: el.scrollLeft }; moved = false; v = 0; last = e.clientX;
            addEventListener('pointermove', move); addEventListener('pointerup', up);
        });
        el.addEventListener('click', e => { if (moved) { e.stopPropagation(); e.preventDefault(); } }, true);   // a drag is not a pick
        el.addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { el.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
        dragOff = () => { cancelAnimationFrame(raf); up(); };
    }

    function open({ then = null } = {}) {
        if (!window.Appearance) { then?.(); return; }
        if (dlg?.open) return;
        onDone = then;
        startLook = Appearance.look(); startMode = Appearance.themeMode(); picked = null;
        const name = (window.Onboard?.name?.() || '').split(/\s+/)[0] || 'there';
        dlg?.remove();
        build(name);
        dlg.showModal();
        fit();
        syncModes();
        picked = startLook; mark(startLook);
        const current = dlg.querySelector(`.lb-look[data-look="${startLook}"]`);
        current?.focus({ preventScroll: true });
        current?.scrollIntoView({ inline: 'center', block: 'nearest' });
        intro();
        rail();
    }
    function close() {
        markSeen();
        splits.forEach(s => s.revert()); splits = [];
        dragOff?.(); dragOff = null; ro?.disconnect();
        const d = dlg, done = onDone; onDone = null;
        const finish = () => { d?.close(); d?.remove(); if (dlg === d) dlg = null; done?.(); };
        if (calm() || !d) finish();
        else d.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.97) translateY(10px)' }], { duration: 260, easing: 'ease-in' }).finished.then(finish, finish);
    }
    function wear(btn) {
        if (!calm()) window.Motion?.burst?.(btn, 22, ['var(--accent)', 'var(--ok)', 'var(--c-beh)', 'var(--c-sys)']);
        const l = Appearance.looks().find(x => x.id === picked);
        if (picked !== startLook) window.Motion?.toast?.(`Wearing ${l?.name}. Change it any time in the Atelier.`, 'ok');
        setTimeout(close, calm() ? 0 : 380);
    }
    function skip() {   // put back what was there when the book opened
        if (picked !== startLook) Appearance.applyLook(startLook);
        if (Appearance.themeMode() !== startMode) Appearance.setThemeMode(startMode);
        close();
    }

    return { open, seen };
})();

// modules talk to each other through window: a top-level const is not a window property
window.LookBook = LookBook;
