/**
 * The animated scenes inside onboarding: two showing what Vettly is, three showing how its backend works.
 * Pure markup: every movement is CSS in onboard.css, and each scene restarts when its page is shown
 * (a page goes from display:none to visible, which restarts its animations).
 * The backend scenes follow the real code: context_engine.py, the router in ai/utils.py, humanizer.py + answer_validator.py.
 */
const OnboardScenes = (() => {
    const icon = (name, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
    const MARK = `<svg class="obs-mark" viewBox="0 0 32 32" aria-hidden="true">
        <path class="d d1" d="M16 2l5 5-5 5-5-5z"/><path class="d d2" d="M25 11l5 5-5 5-5-5z"/>
        <path class="d d3" d="M16 20l5 5-5 5-5-5z"/><path class="d d4" d="M7 11l5 5-5 5-5-5z"/></svg>`;

    // 1. Welcome: the mark assembles while the four parts of the app orbit around it
    const hero = () => `
    <div class="obs obs-hero" aria-hidden="true">
        <span class="obs-glow"></span>
        <span class="obs-orbit obs-orbit-2"></span>
        <div class="obs-orbit">
            ${[['target', 'Prep Studio'], ['bento', 'Brain Bento'], ['chats', 'Live Copilot'], ['toolbox', 'Toolbelt']]
                .map(([i, t], k) => `<span class="obs-sat" style="--a:${k * 90}deg"><span class="obs-chip">${icon(i)}<b>${t}</b></span></span>`).join('')}
        </div>
        ${MARK}
        ${Array.from({ length: 7 }, (_, k) => `<i class="obs-spark" style="--k:${k}"></i>`).join('')}
    </div>`;

    // 2. The studio: a little Vettly window cycling through Prep Studio, Brain Bento and Live Copilot
    const studio = () => `
    <div class="obs obs-studio" aria-hidden="true">
        <div class="obs-win">
            <div class="obs-bar"><i></i><i></i><i></i><span>vettly</span></div>
            <div class="obs-body">
                <div class="obs-side">
                    <span class="obs-logo">${MARK}</span>
                    ${[['target', 0], ['bento', 1], ['chats', 2]].map(([i, k]) => `<span class="obs-nav" style="--d:${[0, -6, -3][k]}s">${icon(i)}</span>`).join('')}
                    <span class="obs-nav idle">${icon('toolbox')}</span>
                </div>
                <div class="obs-main">
                    <section class="obs-scene" style="--d:0s">
                        <p class="obs-tag">${icon('target')}Prep Studio</p>
                        <div class="obs-tiles">${['beh', 'tech', 'sys', 'hr'].map((t, k) => `<span data-tone="${t}" style="--k:${k}"></span>`).join('')}</div>
                        <div class="obs-q"><b>Q.</b><span class="obs-type"></span></div>
                        <div class="obs-lines"><span style="--k:0"></span><span style="--k:1"></span><span style="--k:2"></span></div>
                    </section>
                    <section class="obs-scene" style="--d:-6s">
                        <p class="obs-tag">${icon('bento')}Brain Bento</p>
                        <div class="obs-bento">${[0, 1, 2, 3, 4].map(k => `<span style="--k:${k}"></span>`).join('')}</div>
                    </section>
                    <section class="obs-scene" style="--d:-3s">
                        <p class="obs-tag">${icon('chats')}Live Copilot</p>
                        <div class="obs-chat">
                            <span class="them" style="--k:0"></span><span class="me" style="--k:1"></span>
                            <span class="them short" style="--k:2"></span><span class="me" style="--k:3"></span>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    </div>`;

    // 3. Context: four sources flow into one context, re-sorted by priority (context_engine.py)
    const SRC = [['file', 'Resume'], ['github', 'GitHub'], ['briefcase', 'Job description'], ['books', 'Your stories']];
    const LAYERS = ['Job & assignment', 'Resume', 'Projects & stories', 'GitHub'];
    const FLOW = [[2, 0], [0, 1], [3, 2], [1, 3]];   // [source, layer], in the order they land
    const Y = [30, 72, 114, 156];
    const context = () => `
    <div class="obs obs-svg" aria-hidden="true">
        <svg viewBox="0 0 520 200" class="obs-ctx">
            <text class="lbl" x="16" y="20">Your sources</text>
            <text class="lbl" x="356" y="20">One context · 80K chars</text>
            ${FLOW.map(([s, l], k) => `<path class="rail" d="M144 ${Y[s] + 17} C250 ${Y[s] + 17} 250 ${Y[l] + 17} 356 ${Y[l] + 17}"/>
                <path class="comet c${k}" pathLength="100" d="M144 ${Y[s] + 17} C250 ${Y[s] + 17} 250 ${Y[l] + 17} 356 ${Y[l] + 17}"/>`).join('')}
            ${SRC.map(([i, t], k) => `<g class="src s${FLOW.findIndex(f => f[0] === k)}"><rect x="16" y="${Y[k]}" width="128" height="34" rx="10"/>
                <use href="#i-${i}" x="26" y="${Y[k] + 8}" width="18" height="18"/><text x="50" y="${Y[k] + 22}">${t}</text></g>`).join('')}
            <rect class="stack" x="356" y="${Y[0]}" width="148" height="160" rx="12"/>
            ${LAYERS.map((t, k) => `<g class="layer l${k}"><rect class="fill" x="362" y="${Y[k] + 4}" width="136" height="28" rx="8"/>
                <text x="372" y="${Y[k] + 22}"><tspan class="n">${k + 1}</tspan>  ${t}</text></g>`).join('')}
        </svg>
    </div>`;

    // 4. Router: Claude, then Gemini, OpenAI and Groq; a busy provider hands over to the next (ai/utils.py)
    const PROV = ['Claude', 'Gemini', 'OpenAI', 'Groq'];
    const PY = [14, 60, 106, 152];
    const router = () => `
    <div class="obs obs-svg" aria-hidden="true">
        <svg viewBox="0 0 520 200" class="obs-router">
            <g class="ask"><rect x="8" y="83" width="124" height="34" rx="17"/><use href="#i-chats" x="20" y="91" width="18" height="18"/><text x="44" y="105">Your question</text></g>
            <path class="rail" d="M132 100 H190"/><path class="comet r0" pathLength="100" d="M132 100 H190"/>
            ${PY.map((y, k) => `<path class="rail${k > 1 ? ' standby' : ''}" d="M250 100 C310 100 310 ${y + 16} 372 ${y + 16}"/>`).join('')}
            <path class="comet r1" pathLength="100" d="M250 100 C310 100 310 ${PY[0] + 16} 372 ${PY[0] + 16}"/>
            <path class="comet r2" pathLength="100" d="M250 100 C310 100 310 ${PY[1] + 16} 372 ${PY[1] + 16}"/>
            <g class="hub"><circle class="halo" cx="220" cy="100" r="38"/><circle cx="220" cy="100" r="30"/>
                <use href="#i-path" x="208" y="88" width="24" height="24"/><text x="220" y="152" text-anchor="middle" class="lbl">Router</text></g>
            ${PROV.map((p, k) => `<g class="prov p${k}"><rect x="372" y="${PY[k]}" width="140" height="32" rx="10"/>
                <text x="386" y="${PY[k] + 21}">${p}</text>
                ${k === 0 ? `<text class="flag busy" x="500" y="${PY[k] + 21}" text-anchor="end">busy</text>` : ''}
                ${k === 1 ? `<text class="flag ok" x="500" y="${PY[k] + 21}" text-anchor="end">answered</text>` : ''}</g>`).join('')}
        </svg>
    </div>`;

    // 5. Polish: robotic phrasing is struck out, then 7 checks score the answer (humanizer.py, answer_validator.py)
    const CHECKS = [['Natural', 92], ['Specific', 86], ['No AI tells', 95], ['Flow', 88], ['Length', 84], ['Language', 90], ['Openers', 82]];
    const polish = () => `
    <div class="obs obs-polish" aria-hidden="true">
        <div class="obs-draft">
            <p class="obs-tag">${icon('pencil')}Draft answer</p>
            <p class="obs-text"><s>As an AI language model, to expand on that,</s> <span class="obs-new">Honestly, the hardest part was getting everyone to agree.</span>
            <span class="obs-rest">So I set up a short daily check-in, and within two weeks we were back on schedule.</span></p>
        </div>
        <div class="obs-score">
            <p class="obs-tag">${icon('list-checks')}7 checks</p>
            ${CHECKS.map(([t, v], k) => `<div class="obs-check" style="--k:${k}; --v:${v}%"><span>${t}</span><i><b></b></i></div>`).join('')}
            <p class="obs-pass">${icon('check-bold')}8.8 / 10 · sent to Prep Studio</p>
        </div>
    </div>`;

    return { hero, studio, context, router, polish };
})();
