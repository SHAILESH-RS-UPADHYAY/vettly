/**
 * Onboarding scenes, drawn as blueprint plates: what Vettly is (welcome, studio), a live candidate spec while the
 * user answers (badge), and how the backend works (context, router, polish). The backend scenes follow the real code:
 * ai/context_engine.py, the provider router in ai/utils.py, ai/humanizer.py + ai/answer_validator.py.
 *
 * markup(name) returns a scene's HTML. play(name, stage) starts its timeline with the Web Animations API and returns
 * a stop function. Every scene's resting markup is its finished frame, so Calm mode and reduced motion simply skip play().
 */
const OnboardScenes = (() => {
    const ic = (name, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
    const MARK = `<svg class="sc-mark" viewBox="0 0 32 32" aria-hidden="true"><path class="d" d="M16 2l5 5-5 5-5-5z"/><path class="d" d="M25 11l5 5-5 5-5-5z"/><path class="d" d="M16 20l5 5-5 5-5-5z"/><path class="d" d="M7 11l5 5-5 5-5-5z"/></svg>`;
    const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches || !!window.Motion?.calm?.() || document.documentElement.dataset.motion === 'calm';

    // keyframes from [offset, props] stops, padded out to 0 and 1
    const kf = (...stops) => {
        const out = stops.map(([offset, p]) => ({ ...p, offset }));
        if (out[0].offset > 0) out.unshift({ ...out[0], offset: 0 });
        if (out[out.length - 1].offset < 1) out.push({ ...out[out.length - 1], offset: 1 });
        return out;
    };
    const ease = { out: 'cubic-bezier(0.22, 1, 0.36, 1)', spring: 'cubic-bezier(0.34, 1.5, 0.64, 1)', slam: 'cubic-bezier(0.5, 0, 0.75, 0)' };
    // a looping timeline; its easing goes on every keyframe, since an effect-level easing would warp the whole loop
    function loop(anims, el, frames, dur, { easing, ...opts } = {}) {
        if (!el) return;
        anims.push(el.animate(easing ? frames.map(f => ({ easing, ...f })) : frames, { duration: dur, iterations: Infinity, fill: 'both', ...opts }));
    }
    // points along an SVG path, for packets that ride the wires
    function along(path, n = 14, reverse = false) {
        const len = path.getTotalLength(), pts = [];
        for (let i = 0; i <= n; i++) { const p = path.getPointAtLength((len * i) / n); pts.push([p.x, p.y]); }
        return reverse ? pts.reverse() : pts;
    }
    const stop = (anims, raf) => () => { anims.forEach(a => a.cancel()); if (raf) cancelAnimationFrame(raf.id); };

    /* ── 01 · Four rooms: the four diamonds of the mark unfold into the four parts of the app ── */
    const ROOMS = [['target', 'Prep Studio', 'Questions for your role'], ['bento', 'Brain Bento', 'Five ideas each morning'],
        ['chats', 'Live Copilot', 'Practise out loud'], ['toolbox', 'Agent Toolbelt', 'Everything it knows about you']];
    const ROOM_AT = [[4, 6, -4], [58, 5, 3], [5, 52, 2.5], [58, 53, -3]];   // left %, top %, tilt
    const welcome = () => `
    <div class="sc sc-welcome">
        <svg class="sc-links" viewBox="0 0 480 380" preserveAspectRatio="none" aria-hidden="true">
            ${[[110, 68], [370, 64], [114, 244], [370, 248]].map(([x, y]) => `<path pathLength="1" d="M240 178 Q ${(240 + x) / 2} ${(178 + y) / 2 + (x < 240 ? -26 : 26)} ${x} ${y}"/>`).join('')}
        </svg>
        <div class="sc-core">${MARK}</div>
        ${ROOMS.map(([i, t, s], k) => `<article class="room" style="--x:${ROOM_AT[k][0]}%;--y:${ROOM_AT[k][1]}%;--r:${ROOM_AT[k][2]}deg;--k:${k}">
            <i class="tape"></i><span class="room-ico">${ic(i)}</span><b>${t}</b><span class="room-sub">${s}</span></article>`).join('')}
        <p class="sc-hand"><span>four rooms, one studio</span><svg viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M4 9 C 50 3, 120 13, 196 5"/></svg></p>
    </div>`;
    function playWelcome(stage) {
        const anims = [], root = stage.querySelector('.sc-welcome'), W = root.clientWidth, H = root.clientHeight;
        root.querySelectorAll('.sc-mark .d').forEach((d, k) => {
            const [x, y] = [[0, -18], [18, 0], [0, 18], [-18, 0]][k];
            anims.push(d.animate([{ transform: `translate(${x}px, ${y}px) rotate(90deg) scale(.3)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
                { duration: 820, delay: 120 + k * 90, easing: ease.spring, fill: 'both' }));
        });
        root.querySelectorAll('.room').forEach((r, k) => {
            const dx = W / 2 - (r.offsetLeft + r.offsetWidth / 2), dy = H * 0.47 - (r.offsetTop + r.offsetHeight / 2);
            anims.push(r.animate([{ transform: `translate(${dx}px, ${dy}px) scale(.2) rotate(0deg)`, opacity: 0 },
                { transform: `rotate(${ROOM_AT[k][2]}deg)`, opacity: 1 }], { duration: 900, delay: 900 + k * 110, easing: ease.spring, fill: 'both' }));
        });
        root.querySelectorAll('.sc-links path').forEach((p, k) => anims.push(p.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 700, delay: 1500 + k * 90, easing: ease.out, fill: 'both' })));
        const hand = root.querySelector('.sc-hand span');
        anims.push(hand.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 1100, delay: 2100, easing: 'cubic-bezier(.4,.1,.3,1)', fill: 'both' }));
        anims.push(root.querySelector('.sc-hand path').animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 600, delay: 3000, easing: ease.out, fill: 'both' }));
        // then the rooms idle, each on its own breath
        root.querySelectorAll('.room').forEach((r, k) => anims.push(r.animate([{ translate: '0 0' }, { translate: `0 ${k % 2 ? 4 : -4}px` }, { translate: '0 0' }],
            { duration: 4200 + k * 500, delay: 2200, iterations: Infinity, easing: 'ease-in-out' })));
        anims.push(root.querySelector('.sc-core').animate([{ rotate: '0deg' }, { rotate: '8deg' }, { rotate: '0deg' }, { rotate: '-8deg' }, { rotate: '0deg' }],
            { duration: 9000, delay: 2200, iterations: Infinity, easing: 'ease-in-out' }));
        return stop(anims);
    }

    /* ── 02 · The studio: a little Vettly window, a cursor clicking through three rooms with real content ── */
    const words = (t, cls = 'w') => t.split(' ').map((w, i) => `<span class="${cls}" style="--w:${i}">${w}</span>`).join(' ');
    const studio = () => `
    <div class="sc sc-studio">
        <div class="win">
            <div class="win-bar"><i></i><i></i><i></i><span>vettly · prep studio</span></div>
            <div class="win-body">
                <nav class="win-side">${MARK}${['target', 'bento', 'chats', 'toolbox'].map((i, k) => `<span class="win-nav n${k}">${ic(i)}</span>`).join('')}</nav>
                <div class="win-main">
                    <section class="room-view v0">
                        <p class="v-tag">${ic('target')}Prep Studio</p>
                        <div class="v-chips"><span class="on">Behavioral</span><span>Technical</span><span>System design</span><span>HR</span></div>
                        <div class="v-q"><p class="v-k">Q.12 · Behavioral · Medium</p><p class="v-qt">${words('Tell me about a time you disagreed with your manager.')}</p></div>
                        <div class="v-a"><p class="v-k">Model answer <b>8.9</b></p><span></span><span></span><span></span></div>
                    </section>
                    <section class="room-view v1">
                        <p class="v-tag">${ic('bento')}Brain Bento · today</p>
                        <div class="v-bento">
                            ${[['STAR method', 'Situation, task, action, result'], ['Active listening', ''], ['Big-O, simply', ''], ['Handling conflict', ''], ['Salary talks', '']]
                                .map(([t, s], k) => `<span class="tile t${k}" style="--k:${k}"><small>Idea ${k + 1}</small><b>${t}</b>${s ? `<em>${s}</em>` : ''}</span>`).join('')}
                        </div>
                    </section>
                    <section class="room-view v2">
                        <p class="v-tag">${ic('chats')}Live Copilot <span class="rec">● listening</span></p>
                        <div class="v-chat">
                            <p class="them" style="--k:0">Why do you want this role?</p>
                            <p class="me" style="--k:1">I've spent two years building tools teams actually use…</p>
                            <p class="them" style="--k:2">What was the hardest part?</p>
                        </div>
                        <div class="v-wave">${Array.from({ length: 22 }, (_, k) => `<i style="--k:${k}"></i>`).join('')}</div>
                    </section>
                </div>
            </div>
            <svg class="cursor" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l14 8-6 1.6L10 19z"/></svg>
        </div>
    </div>`;
    function playStudio(stage) {
        const anims = [], D = 10500, root = stage.querySelector('.sc-studio');
        root.classList.add('playing');
        const views = [...root.querySelectorAll('.room-view')], navs = [...root.querySelectorAll('.win-nav')];
        const third = 1 / 3;
        const on = { opacity: 1, transform: 'none' }, below = { opacity: 0, transform: 'translateY(10px)' }, above = { opacity: 0, transform: 'translateY(-8px)' };
        const VIEW = [kf([0, on], [third - 0.02, on], [third, above], [0.98, below], [1, on]),
            kf([0, below], [third, below], [third + 0.02, on], [2 * third - 0.02, on], [2 * third, above], [1, above]),
            kf([0, below], [2 * third, below], [2 * third + 0.02, on], [0.98, on], [1, above])];
        const lit = { background: 'var(--pill)', color: 'var(--on-pill)' }, dim = { background: 'transparent', color: 'var(--muted)' };
        const NAV = [kf([0, lit], [third - 0.005, lit], [third, dim], [0.995, dim], [1, lit]), kf([0, dim], [third, dim], [third + 0.005, lit], [2 * third - 0.005, lit], [2 * third, dim], [1, dim]),
            kf([0, dim], [2 * third, dim], [2 * third + 0.005, lit], [0.995, lit], [1, dim])];
        views.forEach((v, k) => { loop(anims, v, VIEW[k], D); loop(anims, navs[k], NAV[k], D); });
        // the cursor glides to the next room's icon just before each switch, and clicks
        const winEl = root.querySelector('.win'), cur = root.querySelector('.cursor');
        const pos = (el) => { let x = 0, y = 0; for (let n = el; n && n !== winEl; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; } return [x, y]; };
        const at = n => { const [x, y] = pos(navs[n]); return `translate(${x + navs[n].offsetWidth * 0.55}px, ${y + navs[n].offsetHeight * 0.5}px)`; };
        const park = `translate(${winEl.clientWidth * 0.74}px, ${winEl.clientHeight * 0.8}px)`;
        loop(anims, cur, kf([0, { transform: at(0), scale: 1 }], [0.06, { transform: park, scale: 1 }], [0.27, { transform: park, scale: 1 }],
            [third - 0.01, { transform: at(1), scale: 1 }], [third, { transform: at(1), scale: 0.8 }], [third + 0.015, { transform: at(1), scale: 1 }],
            [third + 0.07, { transform: park, scale: 1 }], [2 * third - 0.07, { transform: park, scale: 1 }],
            [2 * third - 0.01, { transform: at(2), scale: 1 }], [2 * third, { transform: at(2), scale: 0.8 }], [2 * third + 0.015, { transform: at(2), scale: 1 }],
            [2 * third + 0.07, { transform: park, scale: 1 }], [0.94, { transform: park, scale: 1 }], [0.99, { transform: at(0), scale: 1 }], [1, { transform: at(0), scale: 0.8 }]), D, { easing: 'cubic-bezier(.45,0,.2,1)' });
        // each room's own motion, inside its third
        root.querySelectorAll('.v0 .w').forEach((w, i) => loop(anims, w, kf([0, { opacity: 0 }], [0.03 + i * 0.012, { opacity: 0 }], [0.045 + i * 0.012, { opacity: 1 }], [third, { opacity: 1 }], [third + 0.01, { opacity: 0 }]), D));
        root.querySelectorAll('.v0 .v-a > span').forEach((s, i) => loop(anims, s, kf([0, { transform: 'scaleX(0)' }], [0.17 + i * 0.03, { transform: 'scaleX(0)' }], [0.22 + i * 0.03, { transform: 'scaleX(1)' }], [third, { transform: 'scaleX(1)' }], [third + 0.01, { transform: 'scaleX(0)' }]), D, { easing: ease.out }));
        root.querySelectorAll('.v1 .tile').forEach((t, i) => loop(anims, t, kf([0, { opacity: 0, transform: 'scale(.6) rotate(-4deg)' }], [third + 0.02 + i * 0.022, { opacity: 0, transform: 'scale(.6) rotate(-4deg)' }],
            [third + 0.06 + i * 0.022, { opacity: 1, transform: 'none' }], [2 * third, { opacity: 1, transform: 'none' }], [2 * third + 0.01, { opacity: 0, transform: 'scale(.6)' }]), D, { easing: ease.spring }));
        root.querySelectorAll('.v2 .v-chat p').forEach((p, i) => loop(anims, p, kf([0, { opacity: 0, transform: 'translateY(10px) scale(.94)' }], [2 * third + 0.03 + i * 0.07, { opacity: 0, transform: 'translateY(10px) scale(.94)' }],
            [2 * third + 0.06 + i * 0.07, { opacity: 1, transform: 'none' }], [0.995, { opacity: 1, transform: 'none' }], [1, { opacity: 0, transform: 'translateY(10px)' }]), D, { easing: ease.out }));
        root.querySelectorAll('.v-wave i').forEach((b, i) => anims.push(b.animate([{ scale: '1 .25' }, { scale: `1 ${0.4 + ((i * 37) % 60) / 100}` }, { scale: '1 .25' }], { duration: 700 + ((i * 53) % 400), iterations: Infinity, easing: 'ease-in-out' })));
        const halt = stop(anims);
        return () => { halt(); root.classList.remove('playing'); };
    }

    /* ── 03–05 · Candidate spec: a taped badge that fills in while the user answers ── */
    const badge = () => `
    <div class="sc sc-badge">
        <article class="badge">
            <i class="tape"></i>
            <header>${MARK}<b>Candidate spec</b><span>No. 0001</span></header>
            <div class="b-who"><span class="b-av" data-v="initials">?</span>
                <div><p class="b-l">Name</p><p class="b-name" data-v="name" data-ph="Your name">Your name</p></div></div>
            <dl>
                <div data-row="field"><dt>Field</dt><dd data-v="field" data-ph="—">—</dd></div>
                <div data-row="role"><dt>Preparing for</dt><dd data-v="role" data-ph="—">—</dd></div>
                <div data-row="level"><dt>Level</dt><dd data-v="level" data-ph="—">—</dd></div>
            </dl>
            <footer><span class="b-code" aria-hidden="true">${Array.from({ length: 34 }, (_, k) => `<i style="--w:${1 + ((k * 7) % 3)}px"></i>`).join('')}</span><span class="b-tag">tuned by Vettly</span></footer>
        </article>
        <p class="sc-hand b-hand"><span>that's you</span></p>
    </div>`;

    /* ── 06 · Context fusion: documents are read, then packed into one context, most important first ── */
    const DOCS = [['file', 'Resume'], ['github', 'GitHub'], ['briefcase', 'Job description'], ['books', 'Your stories']];
    const DY = [40, 116, 192, 268];
    const CHUNKS = [['Job · must-haves', 2, 'var(--accent)', 9000], ['Assignment brief', 2, 'var(--accent)', 6000], ['Resume · experience', 0, 'var(--c-tech)', 18000],
        ['Resume · projects', 0, 'var(--c-tech)', 14000], ['Story · conflict', 3, 'var(--c-beh)', 9000], ['Story · leadership', 3, 'var(--c-beh)', 8000], ['GitHub · READMEs', 1, 'var(--c-dsa)', 16000]];
    const SLOT = k => 52 + k * 38;
    const context = () => `
    <div class="sc sc-svg">
        <svg viewBox="0 0 480 380" class="ctx" aria-hidden="true">
            <defs><linearGradient id="ob-scan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity="0"/><stop offset="1" stop-color="var(--accent)" stop-opacity=".28"/></linearGradient></defs>
            <text class="lbl" x="20" y="28">Your sources</text>
            ${DOCS.map(([i, t], k) => `<g class="doc">
                <path class="paper" d="M20 ${DY[k]} h112 l12 12 v46 h-124 z"/><path class="fold" d="M132 ${DY[k]} v12 h12"/>
                <use href="#i-${i}" x="30" y="${DY[k] + 9}" width="16" height="16"/><text x="52" y="${DY[k] + 22}">${t}</text>
                <rect class="ln" x="30" y="${DY[k] + 34}" width="96" height="4" rx="2"/><rect class="ln" x="30" y="${DY[k] + 43}" width="74" height="4" rx="2"/>
                <g class="tick" transform="translate(132 ${DY[k] + 46})"><g class="ti"><circle r="8"/><path d="M-3.5 0l2.5 2.5 4.5-5"/></g></g></g>`).join('')}
            <g class="scan"><rect x="12" y="-18" width="140" height="18" fill="url(#ob-scan)"/><rect x="12" y="0" width="140" height="2" rx="1"/></g>
            <g class="hand-note"><text x="222" y="60" text-anchor="middle" transform="rotate(-5 222 60)">most important first</text><path d="M252 70 q 30 8 42 22 m -8 -1 l 8 1 l -1 -8"/></g>
            <text class="lbl" x="300" y="28">Context window</text>
            <rect class="cwin" x="300" y="40" width="160" height="286" rx="14"/>
            ${CHUNKS.map(([t, , c], k) => `<g class="chunk" style="--c:${c}"><rect x="310" y="${SLOT(k)}" width="140" height="30" rx="8"/><text x="320" y="${SLOT(k) + 19}">${t}</text><text class="pr" x="440" y="${SLOT(k) + 19}" text-anchor="end">${k < 2 ? 1 : k < 4 ? 2 : k < 6 ? 3 : 4}</text></g>`).join('')}
            <g class="packed"><rect x="398" y="30" width="70" height="20" rx="10"/><text x="433" y="44" text-anchor="middle">PACKED ✓</text></g>
            <text class="count" x="380" y="352" text-anchor="middle">80,000</text><text class="lbl" x="380" y="368" text-anchor="middle">characters</text>
        </svg>
    </div>`;
    function playContext(stage) {
        const anims = [], D = 10000, svg = stage.querySelector('svg');
        loop(anims, svg.querySelector('.scan'), kf([0, { transform: 'translateY(34px)', opacity: 0 }], [0.03, { transform: 'translateY(34px)', opacity: 1 }], [0.2, { transform: 'translateY(330px)', opacity: 1 }], [0.215, { transform: 'translateY(330px)', opacity: 0 }]), D);
        svg.querySelectorAll('.doc').forEach((d, k) => {
            const t = 0.03 + ((DY[k] + 46 - 34) / 296) * 0.17;
            loop(anims, d.querySelector('.ti'), kf([0, { opacity: 0, scale: 0.2 }], [t, { opacity: 0, scale: 0.2 }], [t + 0.02, { opacity: 1, scale: 1 }], [0.93, { opacity: 1, scale: 1 }], [0.97, { opacity: 0, scale: 0.2 }]), D, { easing: ease.spring });
            loop(anims, d.querySelector('.paper'), kf([0, { stroke: 'var(--rule-2, var(--rule))' }], [t - 0.025, { stroke: 'var(--rule-2, var(--rule))' }], [t - 0.01, { stroke: 'var(--accent)' }], [t + 0.02, { stroke: 'var(--rule-2, var(--rule))' }]), D);
        });
        svg.querySelectorAll('.chunk').forEach((c, k) => {
            const [, src] = CHUNKS[k], s = 0.25 + k * 0.065, e = s + 0.075;
            const dx = 40 - 310, dy = DY[src] + 14 - SLOT(k), mid = `translate(${dx / 2}px, ${dy / 2 - 34}px) scale(.85)`;
            loop(anims, c, kf([0, { transform: `translate(${dx}px, ${dy}px) scale(.55)`, opacity: 0 }], [s, { transform: `translate(${dx}px, ${dy}px) scale(.55)`, opacity: 0 }],
                [s + 0.008, { transform: `translate(${dx}px, ${dy}px) scale(.6)`, opacity: 1 }], [(s + e) / 2, { transform: mid, opacity: 1 }],
                [e, { transform: 'translate(0px, 0px) scale(1.06)', opacity: 1 }], [e + 0.02, { transform: 'none', opacity: 1 }], [0.92, { transform: 'none', opacity: 1 }], [0.97, { transform: 'none', opacity: 0 }]), D, { easing: 'cubic-bezier(.45,.05,.35,1)' });
        });
        loop(anims, svg.querySelector('.cwin'), kf([0, { stroke: 'var(--accent)', strokeDasharray: '5 5', strokeDashoffset: 0 }], [0.8, { stroke: 'var(--accent)', strokeDasharray: '5 5', strokeDashoffset: -60 }],
            [0.82, { stroke: 'var(--ok)', strokeDasharray: '1 0', strokeDashoffset: -60 }], [0.93, { stroke: 'var(--ok)', strokeDasharray: '1 0', strokeDashoffset: -60 }], [0.95, { stroke: 'var(--accent)', strokeDasharray: '5 5', strokeDashoffset: -60 }]), D);
        loop(anims, svg.querySelector('.packed'), kf([0, { opacity: 0, transform: 'translateY(6px)' }], [0.81, { opacity: 0, transform: 'translateY(6px)' }], [0.84, { opacity: 1, transform: 'none' }], [0.93, { opacity: 1, transform: 'none' }], [0.96, { opacity: 0, transform: 'none' }]), D, { easing: ease.spring });
        loop(anims, svg.querySelector('.hand-note'), kf([0, { opacity: 0 }], [0.22, { opacity: 0 }], [0.27, { opacity: 1 }], [0.93, { opacity: 1 }], [0.97, { opacity: 0 }]), D);
        // the character count climbs as each chunk lands
        const count = svg.querySelector('.count'), ref = anims[0], raf = {};
        const tick = () => {
            const t = ((ref.currentTime || 0) % D) / D;
            let n = 0;
            CHUNKS.forEach(([, , , size], k) => { const s = 0.25 + k * 0.065, e = s + 0.075; n += size * Math.max(0, Math.min(1, (t - s) / (e - s))); });
            count.textContent = (t > 0.96 ? 0 : Math.round(n / 100) * 100).toLocaleString('en-US');
            raf.id = requestAnimationFrame(tick);
        };
        tick();
        return stop(anims, raf);
    }

    /* ── 07 · Failover router: Claude first; a busy provider bounces the request to the next ── */
    const PROV = [['Claude', 'primary'], ['Gemini', 'fallback 1'], ['OpenAI', 'fallback 2'], ['Groq', 'fallback 3']];
    const PY = [40, 118, 196, 274], HUB = [236, 188];
    const router = () => `
    <div class="sc sc-svg">
        <svg viewBox="0 0 480 380" class="rtr" aria-hidden="true">
            <g class="ask"><path class="paper" d="M16 146 h150 v84 h-150 z"/><rect class="stape" x="62" y="139" width="56" height="14" transform="rotate(-4 90 146)"/>
                <text class="lbl" x="28" y="170">Your question</text><text x="28" y="192">“Walk me through</text><text x="28" y="210">your last project.”</text></g>
            <g class="got"><rect x="22" y="242" width="138" height="26" rx="13"/><text x="91" y="259" text-anchor="middle">✓ answered · 1.2s</text></g>
            <path class="wire" id="ob-wa" d="M166 188 H196"/>
            ${PY.map((y, k) => `<path class="wire lane l${k}" d="M276 188 C 304 188 304 ${y + 26} 330 ${y + 26}"/>`).join('')}
            <g class="hub"><circle class="pulse" cx="${HUB[0]}" cy="${HUB[1]}" r="40"/><circle class="dial" cx="${HUB[0]}" cy="${HUB[1]}" r="40"/>
                ${Array.from({ length: 12 }, (_, k) => `<line class="tk" x1="${HUB[0]}" y1="${HUB[1] - 34}" x2="${HUB[0]}" y2="${HUB[1] - 29}" transform="rotate(${k * 30} ${HUB[0]} ${HUB[1]})"/>`).join('')}
                <line class="needle" x1="${HUB[0]}" y1="${HUB[1]}" x2="${HUB[0] + 26}" y2="${HUB[1]}"/><circle class="cap" cx="${HUB[0]}" cy="${HUB[1]}" r="5"/>
                <text class="lbl" x="${HUB[0]}" y="${HUB[1] + 62}" text-anchor="middle">Router</text></g>
            ${PROV.map(([p, s], k) => `<g class="prov p${k}"><rect x="330" y="${PY[k]}" width="134" height="52" rx="12"/>
                <text x="346" y="${PY[k] + 24}">${p}</text><text class="lbl" x="346" y="${PY[k] + 40}">${s}</text><circle class="dot" cx="448" cy="${PY[k] + 26}" r="5"/></g>`).join('')}
            <g class="stamp" transform="translate(434 56) rotate(-9)"><g class="si"><rect x="-36" y="-13" width="72" height="26" rx="4"/><rect class="in" x="-32" y="-9" width="64" height="18" rx="2"/><text y="4.5" text-anchor="middle">429 BUSY</text></g></g>
            <g class="ok"><text x="448" y="${PY[1] + 12}" text-anchor="end">200 OK</text></g>
            <g class="pkt q"><circle r="11"/><text y="4" text-anchor="middle">Q</text></g>
            <g class="pkt a"><circle r="11"/><text y="4" text-anchor="middle">A</text></g>
        </svg>
    </div>`;
    function playRouter(stage) {
        const anims = [], D = 9000, svg = stage.querySelector('svg');
        const wa = svg.querySelector('#ob-wa'), lane = [...svg.querySelectorAll('.lane')];
        const ang = k => (Math.atan2(PY[k] + 26 - HUB[1], 330 - HUB[0]) * 180) / Math.PI;
        // a packet's path: [path, from, to, reverse] legs, holding still between legs
        const ride = (legs, hide) => {
            const out = [];
            legs.forEach(([p, a, b, rev]) => along(p, 12, rev).forEach(([x, y], i, all) => out.push([a + ((b - a) * i) / (all.length - 1), { transform: `translate(${x}px, ${y}px)`, opacity: 1 }])));
            const first = out[0][1], last = out[out.length - 1][1];
            return kf([0, { ...first, opacity: 0 }], [Math.max(out[0][0] - 0.001, 0), { ...first, opacity: 0 }], ...out, [hide, { ...last, opacity: 1 }], [hide + 0.005, { ...last, opacity: 0 }]);
        };
        loop(anims, svg.querySelector('.pkt.q'), ride([[wa, 0.02, 0.11], [lane[0], 0.16, 0.27], [lane[0], 0.3, 0.37, true], [lane[1], 0.43, 0.54]], 0.55), D);
        loop(anims, svg.querySelector('.pkt.a'), ride([[lane[1], 0.6, 0.7, true], [wa, 0.71, 0.79, true]], 0.8), D);
        const needle = svg.querySelector('.needle');
        needle.style.transformOrigin = `${HUB[0]}px ${HUB[1]}px`;
        loop(anims, needle, kf([0, { rotate: '180deg' }], [0.11, { rotate: '180deg' }], [0.15, { rotate: `${ang(0)}deg` }], [0.38, { rotate: `${ang(0)}deg` }], [0.42, { rotate: `${ang(1)}deg` }],
            [0.6, { rotate: `${ang(1)}deg` }], [0.64, { rotate: '180deg' }]), D, { easing: ease.spring });
        loop(anims, svg.querySelector('.pulse'), kf([0, { opacity: 0, scale: 1 }], [0.11, { opacity: 0.6, scale: 1 }], [0.18, { opacity: 0, scale: 1.5 }], [0.37, { opacity: 0.6, scale: 1 }], [0.44, { opacity: 0, scale: 1.5 }], [0.7, { opacity: 0.6, scale: 1 }], [0.77, { opacity: 0, scale: 1.5 }]), D);
        loop(anims, lane[0], kf([0, { stroke: 'var(--st)' }], [0.155, { stroke: 'var(--st)' }], [0.165, { stroke: 'var(--accent)' }], [0.28, { stroke: 'var(--bad)' }], [0.38, { stroke: 'var(--bad)' }], [0.4, { stroke: 'var(--st)' }]), D);
        loop(anims, lane[1], kf([0, { stroke: 'var(--st)' }], [0.425, { stroke: 'var(--st)' }], [0.435, { stroke: 'var(--accent)' }], [0.55, { stroke: 'var(--ok)' }], [0.72, { stroke: 'var(--ok)' }], [0.75, { stroke: 'var(--st)' }]), D);
        loop(anims, svg.querySelector('.p0 rect'), kf([0, { transform: 'none' }], [0.27, { transform: 'none' }], [0.28, { transform: 'translateX(4px)' }], [0.29, { transform: 'translateX(-4px)' }], [0.3, { transform: 'translateX(2px)' }], [0.31, { transform: 'none' }]), D);
        loop(anims, svg.querySelector('.p0 .dot'), kf([0, { fill: 'var(--st)' }], [0.27, { fill: 'var(--st)' }], [0.28, { fill: 'var(--bad)' }], [0.93, { fill: 'var(--bad)' }], [0.96, { fill: 'var(--st)' }]), D);
        loop(anims, svg.querySelector('.p1 .dot'), kf([0, { fill: 'var(--st)' }], [0.54, { fill: 'var(--st)' }], [0.55, { fill: 'var(--ok)' }], [0.93, { fill: 'var(--ok)' }], [0.96, { fill: 'var(--st)' }]), D);
        loop(anims, svg.querySelector('.p1 rect'), kf([0, { fill: 'var(--paper-2)', stroke: 'var(--rule-2, var(--rule))' }], [0.54, { fill: 'var(--paper-2)', stroke: 'var(--rule-2, var(--rule))' }], [0.56, { fill: 'var(--ok-bg)', stroke: 'var(--ok)' }], [0.93, { fill: 'var(--ok-bg)', stroke: 'var(--ok)' }], [0.96, { fill: 'var(--paper-2)', stroke: 'var(--rule-2, var(--rule))' }]), D);
        loop(anims, svg.querySelector('.stamp .si'), kf([0, { opacity: 0, scale: 2.4 }], [0.28, { opacity: 0, scale: 2.4 }], [0.31, { opacity: 1, scale: 1 }], [0.32, { opacity: 1, scale: 1.06 }], [0.33, { opacity: 1, scale: 1 }], [0.92, { opacity: 1, scale: 1 }], [0.96, { opacity: 0, scale: 1 }]), D, { easing: ease.slam });
        loop(anims, svg.querySelector('.ok'), kf([0, { opacity: 0, transform: 'translateY(4px)' }], [0.55, { opacity: 0, transform: 'translateY(4px)' }], [0.58, { opacity: 1, transform: 'none' }], [0.93, { opacity: 1, transform: 'none' }], [0.96, { opacity: 0, transform: 'none' }]), D);
        loop(anims, svg.querySelector('.got'), kf([0, { opacity: 0, transform: 'translateY(-6px)' }], [0.79, { opacity: 0, transform: 'translateY(-6px)' }], [0.83, { opacity: 1, transform: 'none' }], [0.93, { opacity: 1, transform: 'none' }], [0.96, { opacity: 0, transform: 'none' }]), D, { easing: ease.spring });
        return stop(anims);
    }

    /* ── 08 · Humanizer + 7 checks: a red pen strikes the robotic opener, the plain answer streams in, the checks pass ── */
    const CHECKS = [['Natural', 92], ['Specific', 86], ['No AI tells', 95], ['Flow', 88], ['Length', 84], ['Language', 90], ['Openers', 82]];
    const HUMAN = 'Honestly, the hardest part was getting two teams to agree on one deadline. I set up a ten-minute daily check-in, and two weeks later we shipped on time.';
    const polish = () => `
    <div class="sc sc-polish">
        <article class="sc-sheet">
            <i class="tape"></i>
            <p class="v-k">Q.12 · Draft answer</p>
            <p class="sheet-t"><span class="robot">As an AI language model, to expand on that, I would say that</span> <span class="human">${words(HUMAN)}</span></p>
            <p class="sc-hand pen-note"><span>too robotic!</span></p>
        </article>
        <aside class="score">
            <p class="v-k">${ic('list-checks')}7 checks</p>
            ${CHECKS.map(([t, v]) => `<div class="row"><svg class="ck" viewBox="0 0 12 12" aria-hidden="true"><path pathLength="1" d="M2 6.5l2.6 2.6L10 3.5"/></svg><span>${t}</span><i><b style="--v:${v}%"></b></i></div>`).join('')}
            <div class="total"><b class="num">8.8</b><small>/ 10</small><span class="stamp-pass">PASS</span></div>
        </aside>
        <p class="sc-chip">${ic('target')}sent to Prep Studio</p>
    </div>`;
    function playPolish(stage) {
        const anims = [], D = 12000, root = stage.querySelector('.sc-polish');
        loop(anims, root.querySelector('.robot'), kf([0, { backgroundSize: '0% 100%', color: 'var(--ink-2)' }], [0.06, { backgroundSize: '0% 100%', color: 'var(--ink-2)' }], [0.18, { backgroundSize: '100% 100%', color: 'var(--ink-2)' }], [0.22, { backgroundSize: '100% 100%', color: 'var(--muted)' }], [0.96, { backgroundSize: '100% 100%', color: 'var(--muted)' }], [1, { backgroundSize: '0% 100%', color: 'var(--ink-2)' }]), D, { easing: 'ease-in-out' });
        loop(anims, root.querySelector('.pen-note span'), kf([0, { clipPath: 'inset(0 100% 0 0)' }], [0.18, { clipPath: 'inset(0 100% 0 0)' }], [0.26, { clipPath: 'inset(0 0% 0 0)' }], [0.96, { clipPath: 'inset(0 0% 0 0)' }], [0.99, { clipPath: 'inset(0 100% 0 0)' }]), D);
        root.querySelectorAll('.human .w').forEach((w, i) => loop(anims, w, kf([0, { opacity: 0, transform: 'translateY(4px)' }], [0.27 + i * 0.011, { opacity: 0, transform: 'translateY(4px)' }], [0.285 + i * 0.011, { opacity: 1, transform: 'none' }], [0.96, { opacity: 1, transform: 'none' }], [0.99, { opacity: 0, transform: 'none' }]), D));
        loop(anims, root.querySelector('.score'), kf([0, { opacity: 0, transform: 'translateY(18px) rotate(1.5deg)' }], [0.6, { opacity: 0, transform: 'translateY(18px) rotate(1.5deg)' }], [0.65, { opacity: 1, transform: 'rotate(1.5deg)' }], [0.96, { opacity: 1, transform: 'rotate(1.5deg)' }], [0.99, { opacity: 0, transform: 'rotate(1.5deg)' }]), D, { easing: ease.out });
        root.querySelectorAll('.score .row').forEach((r, k) => {
            const t = 0.66 + k * 0.024;
            loop(anims, r.querySelector('.ck path'), kf([0, { strokeDashoffset: 1 }], [t, { strokeDashoffset: 1 }], [t + 0.02, { strokeDashoffset: 0 }], [0.96, { strokeDashoffset: 0 }], [0.99, { strokeDashoffset: 1 }]), D);
            loop(anims, r.querySelector('b'), kf([0, { transform: 'scaleX(0)' }], [t, { transform: 'scaleX(0)' }], [t + 0.04, { transform: 'scaleX(1)' }], [0.96, { transform: 'scaleX(1)' }], [0.99, { transform: 'scaleX(0)' }]), D, { easing: ease.out });
        });
        loop(anims, root.querySelector('.stamp-pass'), kf([0, { opacity: 0, scale: 2.6 }], [0.85, { opacity: 0, scale: 2.6 }], [0.875, { opacity: 1, scale: 1 }], [0.885, { opacity: 1, scale: 1.08 }], [0.895, { opacity: 1, scale: 1 }], [0.96, { opacity: 1, scale: 1 }], [0.99, { opacity: 0, scale: 1 }]), D, { easing: ease.slam });
        loop(anims, root.querySelector('.sc-chip'), kf([0, { opacity: 0, transform: 'translateX(-10px)' }], [0.89, { opacity: 0, transform: 'translateX(-10px)' }], [0.92, { opacity: 1, transform: 'none' }], [0.96, { opacity: 1, transform: 'none' }], [0.99, { opacity: 0, transform: 'none' }]), D, { easing: ease.spring });
        const num = root.querySelector('.num'), ref = anims[0], raf = {};
        const tick = () => {
            const t = ((ref.currentTime || 0) % D) / D, p = Math.max(0, Math.min(1, (t - 0.66) / 0.19));
            num.textContent = t > 0.97 ? '0.0' : (8.8 * (1 - (1 - p) ** 3)).toFixed(1);
            raf.id = requestAnimationFrame(tick);
        };
        tick();
        return stop(anims, raf);
    }

    const MARKUP = { welcome, studio, badge, context, router, polish };
    const PLAY = { welcome: playWelcome, studio: playStudio, context: playContext, router: playRouter, polish: playPolish };
    return {
        markup: name => (MARKUP[name] ? MARKUP[name]() : ''),
        play: (name, stage) => { if (still() || !PLAY[name] || !stage.animate) return () => {}; try { return PLAY[name](stage); } catch (e) { return () => {}; } },
    };
})();
