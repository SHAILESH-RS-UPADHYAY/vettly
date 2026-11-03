/**
 * Guided tour: a short walkthrough that opens each page and points at its place in the navigation.
 * Runs once for a new user after onboarding; Settings and the More sheet can start it again.
 * Uses switchSection() from dashboard.js.
 */
const Tour = (() => {
    const KEY = 'vettly_tour_v1';
    const phone = () => matchMedia('(max-width: 47.99rem)').matches;

    // nav: the sidebar item to point at; on phones, items that live in More point at the More tab
    const STEPS = [
        { title: 'A quick tour of Vettly', body: 'Seven stops, about a minute. Use the buttons or your arrow keys, and press Esc to leave at any point.' },
        { section: 'home', nav: 'nav-home', title: 'Home', body: 'Your day at a glance: today’s focus, what to practise next and where you left off.' },
        { section: 'prep', nav: 'nav-prep', title: 'Prep Studio', body: 'Pick a category and Vettly writes a question for your role, then streams a model answer you can study and refine.' },
        { section: 'bento', nav: 'nav-bento', title: 'Brain Bento', body: 'Five bite-sized concepts from your field, packed fresh every morning.' },
        { section: 'chat', nav: 'nav-chat', title: 'Live Copilot', body: 'Practise answering out loud or by typing. The copilot answers in your voice, using what you have told it.' },
        { section: 'setup', nav: 'nav-setup', more: true, title: 'Agent Toolbelt', body: 'Add your resume, GitHub, the job description and your stories here. The more it knows, the more every answer sounds like you.' },
        { section: 'aboutme', nav: 'nav-aboutme', more: true, title: 'About me', body: 'Your intro, strengths and the rules for how Vettly should describe you.' },
        { section: 'settings', nav: 'nav-settings', more: true, title: 'Settings', body: 'Looks, colours, your AI answers and shortcuts. You can take this tour again from here any time.' },
    ];

    let dlg, ring, card, i = 0, startSection = 'home';

    function seen() { try { return localStorage.getItem(KEY) === 'done'; } catch (e) { return false; } }
    function markSeen() { try { localStorage.setItem(KEY, 'done'); } catch (e) { /* private mode: it may show again */ } }

    function build() {
        dlg = document.createElement('dialog');
        dlg.className = 'tour';
        dlg.setAttribute('aria-labelledby', 'tour-title');
        dlg.setAttribute('aria-describedby', 'tour-body');
        dlg.innerHTML = `
            <div class="tour-ring" aria-hidden="true"></div>
            <div class="tour-card" role="document">
                <i class="tour-tape" aria-hidden="true"></i>
                <svg class="tour-arrow" viewBox="0 0 44 28" aria-hidden="true"><path d="M42 6 C 30 2, 16 6, 4 20 m 0 0 l 1 -9 m -1 9 l 9 -2"/></svg>
                <p class="tour-head"><b class="tour-num" aria-hidden="true"></b><span class="tour-count" id="tour-count"></span></p>
                <h2 id="tour-title" tabindex="-1"></h2>
                <p id="tour-body"></p>
                <div class="tour-dots" aria-hidden="true">${STEPS.map(() => '<span></span>').join('')}</div>
                <div class="tour-actions">
                    <button type="button" class="btn btn-ghost btn-sm" data-tour="skip">Skip tour</button>
                    <span class="tour-spacer"></span>
                    <button type="button" class="btn btn-secondary btn-sm" data-tour="back">Back</button>
                    <button type="button" class="btn btn-primary btn-sm" data-tour="next">Next</button>
                </div>
            </div>`;
        document.body.appendChild(dlg);
        ring = dlg.querySelector('.tour-ring');
        card = dlg.querySelector('.tour-card');
        dlg.querySelector('[data-tour=skip]').addEventListener('click', () => finish());
        dlg.querySelector('[data-tour=back]').addEventListener('click', () => go(i - 1));
        dlg.querySelector('[data-tour=next]').addEventListener('click', () => (i < STEPS.length - 1 ? go(i + 1) : finish(true)));
        dlg.addEventListener('cancel', e => { e.preventDefault(); finish(); });   // Esc
        dlg.addEventListener('keydown', e => {
            if (e.target.closest('button') && (e.key === 'Enter' || e.key === ' ')) return;
            if (e.key === 'ArrowRight') { e.preventDefault(); if (i < STEPS.length - 1) go(i + 1); }
            if (e.key === 'ArrowLeft') { e.preventDefault(); if (i > 0) go(i - 1); }
        });
        addEventListener('resize', () => { if (dlg.open) place(); }, { passive: true });
    }

    function target(step) {
        if (!step.nav) return null;
        const el = document.getElementById(step.more && phone() ? 'nav-more' : step.nav);
        return el && el.getClientRects().length ? el : null;
    }

    // Ring around the nav item; the card sits beside the sidebar or above the phone tab bar
    function place() {
        const step = STEPS[i], el = target(step);
        dlg.classList.toggle('tour-centered', !el);
        if (!el) { ring.hidden = true; card.style.cssText = ''; return; }
        const r = el.getBoundingClientRect(), pad = 4;
        ring.hidden = false;
        Object.assign(ring.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
        const vw = innerWidth, vh = innerHeight, gap = 14;
        if (phone()) {
            card.style.cssText = `left:16px; right:16px; bottom:${vh - r.top + gap + 26}px; top:auto; --ax:${Math.max(24, Math.min(r.left + r.width / 2 - 16, vw - 56))}px;`;
        } else {
            const h = card.offsetHeight, left = Math.min(r.right + gap + 34, vw - card.offsetWidth - 16);
            const top = Math.max(16, Math.min(r.top + r.height / 2 - h / 2, vh - h - 16));
            card.style.cssText = `left:${left}px; top:${top}px; --ay:${r.top + r.height / 2 - top}px;`;
        }
    }

    function go(n) {
        i = Math.max(0, Math.min(STEPS.length - 1, n));
        const step = STEPS[i];
        if (step.section && typeof switchSection === 'function') switchSection(step.section);
        dlg.querySelector('#tour-count').textContent = i ? `Stop ${i} of ${STEPS.length - 1}` : 'Welcome · 1 minute';
        dlg.querySelector('.tour-num').textContent = i ? String(i).padStart(2, '0') : '';
        dlg.querySelector('#tour-title').textContent = step.title;
        dlg.querySelector('#tour-body').textContent = step.body + (step.more && phone() ? ' On your phone it lives under More.' : '');
        dlg.querySelectorAll('.tour-dots span').forEach((d, k) => d.classList.toggle('on', k === i));
        dlg.querySelector('[data-tour=back]').hidden = i === 0;
        const next = dlg.querySelector('[data-tour=next]');
        next.textContent = i === 0 ? 'Start the tour' : i === STEPS.length - 1 ? 'Finish' : 'Next';
        card.classList.remove('tour-in'); void card.offsetWidth; card.classList.add('tour-in');
        place();
        next.focus();
    }

    function start() {
        if (!dlg) build();
        if (dlg.open) return;
        startSection = document.body.dataset.section || 'home';
        dlg.showModal();
        go(0);
    }

    function finish(done) {
        markSeen();
        if (dlg?.open) dlg.close();
        if (typeof switchSection === 'function') switchSection(done ? 'home' : startSection, { animate: true });
        if (done && typeof Motion !== 'undefined') Motion.toast('That’s the tour. Start in Prep Studio whenever you’re ready.', 'ok');
    }

    // First visit only, and never on top of another open dialog
    function maybeStart() {
        if (seen() || document.querySelector('dialog[open]')) return;
        setTimeout(start, 350);
    }

    document.addEventListener('click', e => {
        if (!e.target.closest('[data-tour-start]')) return;
        document.getElementById('more-sheet')?.close();
        start();
    });

    return { start, maybeStart, seen };
})();

// modules talk to each other through window: a top-level const is not a window property
window.Tour = Tour;
