/**
 * Prep kit: what Prep Studio practises and how.
 *   · Questions | MCQs tabs (Questions stay the main one)
 *   · Toughness (Easy / Medium / Hard, always Medium to begin with) and a Subject to aim at
 *   · Subjects: kept in the Agent Toolbelt (an MBA student adds Python, SQL…), saved on the profile; Brain Bento follows them
 *   · The forge: a card that is visibly being written while the AI works
 *   · The MCQ deck: exam cards, pencil-filled answer bubbles, a rubber stamp for the verdict, tally marks for the streak
 * Uses dashboard.js globals (API_BASE, escapeHtml, prepCat, prepDiff, currentPrepCategory, prep) and Motion.
 * Only transform, opacity and clip-path move; Calm mode and reduced motion keep every state change, without the travel.
 */
const PrepKit = (() => {
    const $ = id => document.getElementById(id);
    const esc = s => escapeHtml(String(s ?? ''));
    const calm = () => Motion.calm();
    const ico = n => `<svg aria-hidden="true"><use href="#i-${n}"/></svg>`;
    const api = async (method, path, body) => {
        const res = await fetch(`${API_BASE}${path}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body && JSON.stringify(body) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || data.detail || `HTTP ${res.status}`);
        return data;
    };

    let subjects = [], subject = '', level = 'medium', tab = 'qa';
    let suggested = [], kitRole = '';   // the role kit: subjects the AI suggests for this field and role

    /* ── Subjects: the Toolbelt keeps them, the lab aims at one ── */
    const IDEAS = ['Python', 'SQL', 'Excel', 'Statistics', 'Power BI', 'Aptitude', 'Finance', 'Marketing', 'Communication', 'Data structures'];
    const MAX = 12;
    function paintSubjects() {
        if (subject && !subjects.includes(subject)) subject = '';
        const lab = $('lab-subjects');
        if (lab) lab.innerHTML = `<button type="button" class="sub-chip" data-sub="" aria-pressed="${!subject}" style="--i:0">${ico('sparkle')}Any</button>`
            + subjects.map((s, i) => `<button type="button" class="sub-chip" data-sub="${esc(s)}" aria-pressed="${s === subject}" style="--i:${i + 1}">${esc(s)}</button>`).join('')
            + (subjects.length < MAX ? `<button type="button" class="sub-chip sub-add" data-sub-add style="--i:${subjects.length + 1}">${ico('plus')}Add</button>` : '')
            + (subjects.length < MAX ? ideasLeft().slice(0, 3).map(s => `<button type="button" class="sub-idea" data-sub-idea="${esc(s.name)}" title="${esc(s.why)}">${ico('plus')}${esc(s.name)}</button>`).join('') : '');
        const belt = $('toolbelt-subjects');
        if (belt) belt.innerHTML = subjects.length
            ? subjects.map((s, i) => `<span class="sub-chip sub-own" style="--i:${i}">${esc(s)}<button type="button" data-sub-remove="${esc(s)}" aria-label="Remove ${esc(s)}">${ico('x-bold')}</button></span>`).join('')
            : '<span class="sub-none">None yet. Add the subjects your interviews touch.</span>';
        const ideas = $('subject-ideas');
        if (ideas) ideas.innerHTML = subjects.length >= MAX ? '' : (suggested.length ? `<span class="sub-ideas-label">${ico('sparkle')}Asked in ${esc(kitRole)} interviews</span>` : '')
            + ideasLeft().slice(0, 8).map((s, i) => `<button type="button" class="sub-idea" style="--i:${i}" data-sub-idea="${esc(s.name)}" title="${esc(s.why)}">${ico('plus')}${esc(s.name)}</button>`).join('');
        const n = $('subjects-count'); if (n) n.textContent = subjects.length;
    }
    // what is left to suggest: the role kit when the AI has written one, the plain list otherwise
    function ideasLeft() {
        const have = new Set(subjects.map(s => s.toLowerCase()));
        return (suggested.length ? suggested : IDEAS.map(name => ({ name, why: '' }))).filter(s => !have.has(s.name.toLowerCase()));
    }
    // Field and role decide the kit. A new account (no subjects yet) gets the first five added for it, once per role.
    async function refresh() {
        await window.Auth?.ready;
        try { const r = await fetch(`${API_BASE}/api/profile`); if (r.ok) { subjects = (await r.json()).subjects || []; paintSubjects(); } } catch (e) { return; }
        try {
            const kit = await api('GET', '/api/subjects/suggest');
            suggested = kit.suggested || []; kitRole = kit.role || '';
            if (kit.seeded) {
                subjects = kit.subjects || [];
                window.Bento?.useField?.();
                Motion.toast(`Vettly picked ${subjects.length} subjects that ${kitRole} interviews ask about. Change them any time in the Toolbelt.`, 'ok');
            }
            paintSubjects();
        } catch (e) { /* no kit: the plain suggestions stay */ }
    }
    async function saveSubjects(next) {
        const before = subjects;
        subjects = next; paintSubjects();   // the chip lands at once; the server catches up
        try {
            subjects = (await api('POST', '/api/subjects', { subjects: next })).subjects;
            paintSubjects();
            window.Bento?.useField?.();   // Brain Bento's fresh ideas follow the subjects
        } catch (e) { subjects = before; paintSubjects(); Motion.toast(`Could not save your subjects: ${e.message}`, 'error'); }
    }
    function addSubject(name) {
        name = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
        if (!name) return false;
        if (subjects.some(s => s.toLowerCase() === name.toLowerCase())) { Motion.toast(`${name} is already on your list.`); return false; }
        if (subjects.length >= MAX) { Motion.toast(`Twelve subjects is the limit. Remove one to add ${name}.`); return false; }
        saveSubjects([...subjects, name]);
        return true;
    }
    // the lab's own "+ Add": the chip turns into a small field, so a subject can be added without leaving Prep Studio
    function labAdd(btn) {
        const input = Object.assign(document.createElement('input'), { className: 'sub-chip sub-input', maxLength: 40, placeholder: 'e.g. SQL', enterKeyHint: 'done' });
        input.setAttribute('aria-label', 'New subject');
        btn.replaceWith(input); input.focus();
        let done = false;
        const finish = save => {   // a subject added here is the one the next question aims at
            if (done) return; done = true;
            const name = input.value.replace(/\s+/g, ' ').trim().slice(0, 40);
            if (save && addSubject(name)) subject = name;
            paintSubjects();
        };
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } if (e.key === 'Escape') { e.stopPropagation(); finish(false); } });
        input.addEventListener('blur', () => finish(true));
    }

    /* ── The forge: a card being written, shown while the AI works ── */
    function forge(container, { what = 'question', category = '', difficulty = 'medium', subject: about = '' } = {}) {
        if (!container) return null;
        const el = document.createElement('div');
        el.className = 'forge'; el.setAttribute('role', 'status');
        const title = what === 'mcq' ? `Five ${difficulty} MCQs` : `A ${difficulty} question`;
        const steps = what === 'mcq'
            ? ['Reading your Toolbelt', `Picking ${about || category} ideas worth testing`, 'Writing four choices for each', 'Hiding the right answers', 'Shuffling the deck']
            : ['Reading your Toolbelt', `Choosing what a ${about || category} interviewer would ask`, 'Writing the answer in your voice', 'Checking it sounds like a person', 'Inking the card'];
        el.innerHTML = `
            <div class="forge-sheet" aria-hidden="true">
                <span class="forge-tape"></span>
                <i class="forge-line" style="--w:92%;--k:0"></i><i class="forge-line" style="--w:78%;--k:1"></i><i class="forge-line" style="--w:86%;--k:2"></i><i class="forge-line" style="--w:52%;--k:3"></i>
                <span class="forge-nib">${ico('pen')}</span>
            </div>
            <div class="forge-side">
                <b class="forge-title">${esc(title)}${about ? ` on <em>${esc(about)}</em>` : category ? ` · <em>${esc(category)}</em>` : ''}</b>
                <span class="forge-status" data-status>${esc(steps[0])}…</span>
                <span class="forge-bar"><i></i></span>
                <span class="forge-pips">${steps.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</span>
            </div>`;
        container.prepend(el);
        if (!calm()) el.animate([{ opacity: 0, transform: 'translateY(-14px) scale(0.97)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
        requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest', behavior: calm() ? 'auto' : 'smooth' }));
        const status = el.querySelector('[data-status]'), pips = el.querySelectorAll('.forge-pips i');
        let k = 0;
        const timer = setInterval(() => {
            if (k >= steps.length - 1) return;   // the last line stays until the answer arrives
            k++;
            status.textContent = `${steps[k]}…`;
            pips.forEach((p, i) => p.classList.toggle('on', i <= k));
            if (!calm()) status.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'ease-out' });
        }, 2300);
        const stop = () => { clearInterval(timer); el.remove(); };
        return {
            stop,
            async done() {   // the bar fills, the card folds away
                clearInterval(timer);
                if (!el.isConnected) return;
                el.classList.add('is-done'); status.textContent = 'Done';
                pips.forEach(p => p.classList.add('on'));
                if (!calm()) await el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(8px) scale(0.98)' }], { duration: 300, delay: 260, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
                el.remove();
            },
        };
    }

    /* ── Tabs ── */
    let labelQa = '';
    function setTab(next, { quiet = false } = {}) {
        tab = next === 'mcq' ? 'mcq' : 'qa';
        const page = $('page-prep'), tabs = $('prep-tabs');
        page.dataset.prepTab = tab; tabs.dataset.on = tab;
        tabs.querySelectorAll('[role="tab"]').forEach(b => { const on = b.dataset.prepTab === tab; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
        const qa = $('prep-qa-panel'), mcq = $('mcq-panel');
        qa.hidden = tab !== 'qa'; mcq.hidden = tab !== 'mcq';
        const btn = $('prep-generate-btn');
        if (btn) { labelQa ||= btn.innerHTML; btn.innerHTML = tab === 'mcq' ? `${ico('wand')}<span>Deal 5 MCQs</span>` : labelQa; }
        if (tab === 'mcq') ensureMcqs().then(() => paintDeck({ enter: !quiet }));
        const shown = tab === 'mcq' ? mcq : qa;
        if (!quiet && !calm()) shown.animate([{ opacity: 0, transform: `translateX(${tab === 'mcq' ? 26 : -26}px)` }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
        counts();
    }
    function counts() {
        const qa = document.querySelector('[data-tab-count="qa"]'), mc = document.querySelector('[data-tab-count="mcq"]');
        if (qa) qa.textContent = window.prep?.entries?.length ?? prep.entries.length;
        if (mc) { const todo = mcqs.filter(m => m.pick == null).length; mc.textContent = todo; mc.classList.toggle('has', todo > 0); }
    }

    /* ── The MCQ deck ── */
    let mcqs = [], loaded = null, view = 'todo', cur = null, dealing = false, streak = 0;
    const BEST = 'vettly_mcq_best';
    const best = () => { try { return Number(localStorage.getItem(BEST)) || 0; } catch (e) { return 0; } };
    const isRight = m => m.pick != null && m.pick === m.answer, isWrong = m => m.pick != null && m.pick !== m.answer;
    function ensureMcqs() {
        loaded ||= (async () => { await window.Auth?.ready; try { mcqs = (await api('GET', '/prepare/mcq')).items || []; } catch (e) { loaded = null; } counts(); })();
        return loaded;
    }
    const queue = () => (view === 'todo' ? mcqs.filter(m => m.pick == null) : view === 'missed' ? mcqs.filter(isWrong) : mcqs);
    const byId = id => mcqs.find(m => m.id === id);

    // tally marks: four strokes and a slash for every five in a row
    function tally(n) {
        const shown = Math.min(n, 15); let out = '';
        for (let g = 0; g * 5 < shown; g++) {
            const inGroup = Math.min(5, shown - g * 5), x = g * 44;
            for (let i = 0; i < Math.min(inGroup, 4); i++) out += `<path d="M${x + 6 + i * 8} ${5 + (i % 2)} L${x + 4 + i * 8} ${27 - (i % 2)}" pathLength="1"/>`;
            if (inGroup === 5) out += `<path class="slash" d="M${x} 24 L${x + 36} 7" pathLength="1"/>`;
        }
        return `<svg class="tally" viewBox="0 0 ${Math.max(1, Math.ceil(shown / 5)) * 44} 32" width="${Math.max(1, Math.ceil(shown / 5)) * 44}" height="32" aria-hidden="true">${out}</svg>${n > 15 ? `<small>+${n - 15}</small>` : ''}`;
    }
    const SCRIBBLE = '<svg class="omr-fill" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13 L8 6 L9.5 17 L12.5 6 L14.5 18 L17.5 7 L20 15" pathLength="1"/></svg>';
    const RING = '<svg class="opt-ring" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><path d="M7 21 C5 7, 93 1, 95 19 C97 37, 9 41, 5 23 C3 13, 34 4, 62 5" pathLength="1"/></svg>';
    const STRIKE = '<svg class="opt-strike" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><path d="M3 23 C28 16, 70 27, 97 18" pathLength="1"/></svg>';

    function cardHtml(m) {
        const n = mcqs.indexOf(m) + 1, [, catLabel, tone, icon] = prepCat(m.category), [, diffLabel, dots] = prepDiff(m.difficulty);
        const answered = m.pick != null, state = !answered ? 'open' : isRight(m) ? 'right' : 'wrong';
        return `<article class="mcq-card" data-id="${m.id}" data-state="${state}" aria-labelledby="mcq-q-${m.id}">
            <header class="mcq-head">
                <span class="mcq-no">No. ${String(n).padStart(2, '0')}</span>
                <span class="tone-pill" data-tone="${tone}">${ico(icon)}${esc(catLabel)}</span>
                <span class="q-diff" title="Toughness: ${diffLabel}">${[1, 2, 3].map(d => `<i class="${d <= dots ? 'on' : ''}"></i>`).join('')}<span>${diffLabel}</span></span>
                ${m.subject ? `<span class="q-subject">${ico('books')}${esc(m.subject)}</span>` : ''}
            </header>
            <h3 class="mcq-q" id="mcq-q-${m.id}">${esc(m.question)}</h3>
            <ol class="mcq-opts">${m.options.map((o, i) => `<li style="--i:${i}"><button type="button" class="mcq-opt${m.pick === i ? ' is-pick' : ''}${answered && m.answer === i ? ' is-right' : ''}" data-pick="${i}"${answered ? ' disabled' : ''}>
                <span class="omr">${SCRIBBLE}<b>${'ABCD'[i]}</b></span><span class="opt-text">${esc(o)}</span>${RING}${STRIKE}</button></li>`).join('')}</ol>
            <div class="mcq-why"${answered ? '' : ' hidden'}><b>Why</b><p>${esc(m.why || `The answer is ${'ABCD'[m.answer]}.`)}</p></div>
            <span class="mcq-stamp" aria-hidden="true">${state === 'wrong' ? 'Not quite' : 'Correct'}</span>
        </article>`;
    }
    function slipHtml() {
        const right = mcqs.filter(isRight).length, wrong = mcqs.filter(isWrong).length, todo = mcqs.length - right - wrong, done = right + wrong;
        return `<header class="mcq-slip">
            <div class="mcq-streak" title="Right answers in a row"><span class="dock-label">Streak</span><span class="mcq-tally" data-tally>${tally(streak)}</span><small class="mcq-best">best ${Math.max(best(), streak)}</small></div>
            <div class="mcq-nums"><span><b class="num" data-n="right">${right}</b> right</span><span><b class="num" data-n="wrong">${wrong}</b> missed</span><span><b class="num" data-n="pct">${done ? Math.round(right / done * 100) : 0}%</b> score</span></div>
            <div class="seg seg-fill mcq-view" data-mcq-view role="group" aria-label="Which cards">
                <button type="button" data-v="todo" aria-pressed="${view === 'todo'}">To do<span class="n">${todo}</span></button>
                <button type="button" data-v="missed" aria-pressed="${view === 'missed'}">Missed<span class="n">${wrong}</span></button>
                <button type="button" data-v="all" aria-pressed="${view === 'all'}">All<span class="n">${mcqs.length}</span></button>
            </div>
        </header>`;
    }
    function emptyHtml() {
        return `<div class="mcq-empty">
            <div class="mcq-fan" aria-hidden="true"><i>A</i><i>B</i><i>C</i><i>D</i></div>
            <h3>Deal yourself a round</h3>
            <p>Five quick questions, four choices each, at the toughness and subject you pick above. Fill the bubble, get the stamp, keep the streak.</p>
            <button type="button" class="btn btn-primary" data-mcq="deal">${ico('wand')}Deal my first 5</button>
        </div>`;
    }
    function endHtml() {
        const right = mcqs.filter(isRight).length, wrong = mcqs.filter(isWrong).length, done = right + wrong, pct = done ? Math.round(right / done * 100) : 0;
        if (view === 'missed' && !wrong) return `<div class="mcq-report"><span class="mcq-grade" data-g="a">Clean</span><h3>Nothing missed</h3><p>Every card you have answered is right.</p><div class="mcq-report-go"><button type="button" class="btn btn-primary" data-mcq="deal">${ico('wand')}Deal 5 more</button></div></div>`;
        const grade = pct >= 90 ? ['A+', 'a', 'Sharp. Raise the toughness.'] : pct >= 75 ? ['A', 'a', 'Strong round.'] : pct >= 50 ? ['B', 'b', 'Getting there. Clear the missed pile.'] : ['C', 'c', 'Worth another pass: retry the missed ones.'];
        return `<div class="mcq-report">
            <span class="mcq-grade" data-g="${grade[1]}">${grade[0]}</span>
            <h3>${right} of ${done} right</h3><p>${grade[2]}</p>
            <div class="mcq-report-go">
                ${wrong ? `<button type="button" class="btn btn-secondary" data-mcq="retry">${ico('refresh')}Retry the ${wrong} missed</button>` : ''}
                <button type="button" class="btn btn-primary" data-mcq="deal">${ico('wand')}Deal 5 more</button>
            </div>
            <button type="button" class="mcq-clear" data-mcq="clear">Clear the whole deck</button>
        </div>`;
    }
    function paintDeck({ enter = false, deal = false } = {}) {
        const panel = $('mcq-panel'); if (!panel) return;
        counts();
        if (!mcqs.length) { panel.innerHTML = `<div class="mcq-forge-slot" id="mcq-forge"></div>${emptyHtml()}`; return; }
        const q = queue();
        let m = byId(cur);
        if (!m || (!q.includes(m) && !(view === 'todo' && m.pick != null))) m = q[0];
        cur = m?.id || null;
        const left = m ? q.filter(x => x !== m).length : 0;
        const right = mcqs.filter(isRight).length, wrong = mcqs.filter(isWrong).length;
        panel.innerHTML = `${slipHtml()}<div class="mcq-forge-slot" id="mcq-forge"></div>
            <div class="mcq-deck" data-left="${Math.min(left, 2)}">${m ? `<i class="mcq-ghost g2"></i><i class="mcq-ghost g1"></i>${cardHtml(m)}` : endHtml()}</div>
            ${m ? `<footer class="mcq-foot">
                <span class="mcq-pile" data-pile="wrong">${ico('refresh')}<b class="num">${wrong}</b><small>Review</small></span>
                <button type="button" class="btn btn-primary mcq-next" data-mcq="next"${m.pick == null ? ' disabled' : ''}>${m.pick != null && m.pick !== m.answer && view !== 'todo' ? 'Next card' : 'Next card'}${ico('caret-right')}</button>
                <span class="mcq-pile" data-pile="right">${ico('check-bold')}<b class="num">${right}</b><small>Got it</small></span>
            </footer>
            <p class="mcq-keys">${m.pick != null ? `<button type="button" class="mcq-again" data-mcq="again">${ico('refresh')}Try this card again</button>` : 'Tap a bubble, or press <kbd>A</kbd>–<kbd>D</kbd>'}</p>` : ''}
            <span class="sr-only" aria-live="polite" id="mcq-say"></span>`;
        panel.querySelectorAll('.seg').forEach(Motion.watchSeg);
        const card = panel.querySelector('.mcq-card');
        if (card && !calm() && (enter || deal)) {
            card.animate([{ opacity: 0, transform: `translateY(${deal ? -60 : 26}px) rotate(${deal ? -7 : 2}deg) scale(0.94)` }, { opacity: 1, transform: 'none' }], { duration: deal ? 620 : 460, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)' });
            card.querySelectorAll('.mcq-opts li').forEach((li, i) => li.animate([{ opacity: 0, transform: 'translateX(-14px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: 140 + i * 70, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' }));
        }
    }
    function refreshSlip() {
        const panel = $('mcq-panel'), right = mcqs.filter(isRight).length, wrong = mcqs.filter(isWrong).length, done = right + wrong;
        const set = (k, v) => { const el = panel.querySelector(`[data-n="${k}"]`); if (el) el.textContent = v; };
        set('right', right); set('wrong', wrong); set('pct', `${done ? Math.round(right / done * 100) : 0}%`);
        const t = panel.querySelector('[data-tally]'); if (t) t.innerHTML = tally(streak);
        const b = panel.querySelector('.mcq-best'); if (b) b.textContent = `best ${Math.max(best(), streak)}`;
        panel.querySelectorAll('[data-mcq-view] button').forEach(btn => { const n = btn.querySelector('.n'); if (n) n.textContent = { todo: mcqs.length - done, missed: wrong, all: mcqs.length }[btn.dataset.v]; });
        const pr = panel.querySelector('[data-pile="right"] b'), pw = panel.querySelector('[data-pile="wrong"] b');
        if (pr) pr.textContent = right; if (pw) pw.textContent = wrong;
        counts();
    }
    function pick(i) {
        const m = byId(cur), panel = $('mcq-panel'), card = panel.querySelector('.mcq-card');
        if (!m || m.pick != null || !card || !(i >= 0 && i < 4)) return;
        m.pick = i;
        const ok = i === m.answer;
        streak = ok ? streak + 1 : 0;
        if (streak > best()) try { localStorage.setItem(BEST, String(streak)); } catch (e) { /* storage blocked */ }
        api('POST', '/prepare/mcq/answer', { id: m.id, pick: i }).catch(() => Motion.toast('Could not save that answer. It counts here, but check the connection.', 'error'));
        card.dataset.state = ok ? 'right' : 'wrong';
        card.querySelectorAll('.mcq-opt').forEach((b, k) => { b.disabled = true; b.classList.toggle('is-pick', k === i); b.classList.toggle('is-right', k === m.answer); });
        const why = card.querySelector('.mcq-why'); why.hidden = false;
        const stamp = card.querySelector('.mcq-stamp'); stamp.textContent = ok ? 'Correct' : 'Not quite';
        $('mcq-say').textContent = ok ? 'Correct.' : `Not quite. The answer is ${'ABCD'[m.answer]}.`;
        if (!calm()) {
            // the verdict is stamped: it drops in big, lands with a jolt of the card, and stays inked
            stamp.animate([{ opacity: 0, transform: 'rotate(-20deg) scale(2.6)' }, { opacity: 1, transform: 'rotate(-6deg) scale(0.92)', offset: 0.55 }, { opacity: 1, transform: 'rotate(-10deg) scale(1.05)', offset: 0.78 }, { opacity: 1, transform: 'rotate(-9deg) scale(1)' }],
                { duration: 460, delay: 380, easing: 'cubic-bezier(0.3, 0, 0.2, 1)', fill: 'backwards' });
            card.animate(ok ? [{ transform: 'none' }, { transform: 'translateY(3px) scale(0.995)' }, { transform: 'none' }]
                : [{ transform: 'none' }, { transform: 'translateX(-8px) rotate(-0.6deg)' }, { transform: 'translateX(7px) rotate(0.5deg)' }, { transform: 'translateX(-4px)' }, { transform: 'none' }],
                { duration: ok ? 240 : 420, delay: ok ? 620 : 0, easing: 'ease-out' });
            why.animate([{ opacity: 0, transform: 'translateY(14px) rotate(-2deg)' }, { opacity: 1, transform: 'none' }], { duration: 440, delay: 520, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)', fill: 'backwards' });
            if (ok) setTimeout(() => Motion.burst(stamp, streak && streak % 5 === 0 ? 26 : 14, ['var(--ok)', 'var(--accent-2)', 'var(--c-sys)', 'var(--c-beh)']), 640);
        }
        const next = panel.querySelector('.mcq-next'); next.disabled = false;
        const keys = panel.querySelector('.mcq-keys'); if (keys) keys.innerHTML = `<button type="button" class="mcq-again" data-mcq="again">${ico('refresh')}Try this card again</button>`;
        refreshSlip();
        if (!calm()) panel.querySelector(`[data-pile="${ok ? 'right' : 'wrong'}"]`)?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.22)' }, { transform: 'scale(1)' }], { duration: 420, delay: 700, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
        if (!Motion.focusField(next)) next.focus({ preventScroll: true });
    }
    let moving = false;
    async function next() {
        const m = byId(cur), panel = $('mcq-panel'), card = panel.querySelector('.mcq-card');
        if (!m || m.pick == null || moving) return;
        const q = queue(), idx = q.indexOf(m), after = idx >= 0 ? q[idx + 1] : q[0];
        moving = true;
        if (card && !calm()) {   // the card flies to its pile: right for a correct one, left for one to review
            const dir = isRight(m) ? 1 : -1;
            await card.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dir * 70}vw, 34px) rotate(${dir * 16}deg) scale(0.82)`, opacity: 0 }], { duration: 380, easing: 'cubic-bezier(0.5, 0, 0.75, 0)', fill: 'forwards' }).finished.catch(() => {});
        }
        moving = false;
        cur = after?.id || '__end__';   // nothing after it: the report (or the end of this pile)
        if (!after && view !== 'todo') { view = 'todo'; cur = null; }
        paintDeck({ enter: true });
        $('mcq-panel').querySelector('.mcq-opt:not(:disabled), [data-mcq="deal"]')?.focus({ preventScroll: true });
    }
    async function again() {   // wipe this card's answer and take it once more
        const m = byId(cur); if (!m || m.pick == null) return;
        m.pick = null; api('POST', '/prepare/mcq/answer', { id: m.id, pick: null }).catch(() => {});
        paintDeck({ enter: true });
    }
    async function retryMissed() {
        const wrong = mcqs.filter(isWrong);
        wrong.forEach(m => { m.pick = null; });
        Promise.all(wrong.map(m => api('POST', '/prepare/mcq/answer', { id: m.id, pick: null }))).catch(() => Motion.toast('Could not reset every card. Check the connection.', 'error'));
        view = 'todo'; cur = wrong[0]?.id || null;
        paintDeck({ deal: true });
    }
    let armed = 0;
    async function clearDeck(btn) {
        if (!armed) { armed = setTimeout(() => { armed = 0; btn.textContent = 'Clear the whole deck'; }, 3500); btn.textContent = 'Tap again to clear every card'; return; }
        clearTimeout(armed); armed = 0;
        try { await api('DELETE', '/prepare/mcq'); mcqs = []; cur = null; streak = 0; paintDeck(); } catch (e) { Motion.toast(e.message, 'error'); }
    }
    async function dealMcqs() {
        if (dealing) return;
        if (tab !== 'mcq') setTab('mcq', { quiet: true });
        await ensureMcqs();
        dealing = true;
        const btn = $('prep-generate-btn'), tiles = document.querySelectorAll('.prep-category-buttons button');
        if (btn) btn.disabled = true; tiles.forEach(b => { b.disabled = true; });
        $('mcq-panel').querySelectorAll('[data-mcq="deal"]').forEach(b => { b.disabled = true; });
        const f = forge($('mcq-forge'), { what: 'mcq', category: prepCat(currentPrepCategory)[1], difficulty: level, subject });
        try {
            const r = await api('POST', '/prepare/mcq', { category: currentPrepCategory, difficulty: level, subject, count: 5 });
            await f?.done();
            mcqs = r.items; view = 'todo'; cur = r.added[0];
            paintDeck({ deal: true });
            Motion.toast(`${r.added.length} fresh cards on the deck.`, 'ok');
        } catch (e) {
            f?.stop();
            if (!/limit|free AI/i.test(e.message)) Motion.toast(e.message, 'error');   // the daily-limit notice is already shown by auth.js
            $('mcq-panel').querySelectorAll('[data-mcq="deal"]').forEach(b => { b.disabled = false; });
        } finally {
            dealing = false;
            if (btn) btn.disabled = false; tiles.forEach(b => { b.disabled = false; });
        }
    }

    /* ── wiring ── */
    function wire() {
        const page = $('page-prep'); if (!page) return;
        $('prep-tabs').addEventListener('click', e => { const b = e.target.closest('[data-prep-tab]'); if (b && b.dataset.prepTab !== tab) setTab(b.dataset.prepTab); });
        $('prep-tabs').addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); setTab(tab === 'qa' ? 'mcq' : 'qa'); $(`prep-tab-${tab}`).focus(); } });
        $('lab-level').addEventListener('click', e => {
            const b = e.target.closest('button[data-v]'); if (!b) return;
            level = b.dataset.v;
            $('lab-level').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
            Motion.thumb($('lab-level'));
        });
        Motion.watchSeg($('lab-level'));
        $('lab-subjects').addEventListener('click', e => {
            const add = e.target.closest('[data-sub-add]'); if (add) return labAdd(add);
            const idea = e.target.closest('[data-sub-idea]'); if (idea) { if (addSubject(idea.dataset.subIdea)) { subject = idea.dataset.subIdea; paintSubjects(); } return; }
            const b = e.target.closest('[data-sub]'); if (!b) return;
            subject = b.dataset.sub; paintSubjects();
            const on = $('lab-subjects').querySelector('[aria-pressed="true"]');
            if (on && !calm()) on.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }], { duration: 380, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
        });
        $('subject-add')?.addEventListener('submit', e => { e.preventDefault(); const i = $('subject-input'); if (addSubject(i.value)) i.value = ''; });
        $('subjects-card')?.addEventListener('click', e => {
            const rm = e.target.closest('[data-sub-remove]'), idea = e.target.closest('[data-sub-idea]');
            if (rm) saveSubjects(subjects.filter(s => s !== rm.dataset.subRemove));
            if (idea) addSubject(idea.dataset.subIdea);
        });
        const panel = $('mcq-panel');
        panel.addEventListener('click', e => {
            const o = e.target.closest('[data-pick]'); if (o) return pick(Number(o.dataset.pick));
            const v = e.target.closest('[data-mcq-view] button'); if (v) { view = v.dataset.v; cur = null; return paintDeck({ enter: true }); }
            const b = e.target.closest('[data-mcq]'); if (!b) return;
            ({ next, again, deal: dealMcqs, retry: retryMissed, clear: () => clearDeck(b) })[b.dataset.mcq]?.();
        });
        // A–D or 1–4 fills a bubble, Enter or → takes the next card
        document.addEventListener('keydown', e => {
            if (tab !== 'mcq' || document.body.dataset.section !== 'prep' || e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input, textarea, select, [contenteditable], dialog')) return;
            const k = e.key.toLowerCase(), i = 'abcd'.indexOf(k) >= 0 && k.length === 1 ? 'abcd'.indexOf(k) : '1234'.indexOf(k);
            if (k.length === 1 && i >= 0 && byId(cur)?.pick == null) { e.preventDefault(); pick(i); }
            else if ((e.key === 'ArrowRight' || (e.key === 'Enter' && !e.target.closest('button'))) && byId(cur)?.pick != null) { e.preventDefault(); next(); }
        });
        // the Questions count follows the bank
        const load = window.loadPrepQuestions;
        if (typeof load === 'function') window.loadPrepQuestions = async (...a) => { const r = await load(...a); counts(); return r; };
        setTab('qa', { quiet: true });
        paintSubjects();
        refresh();
        // the MCQ count on the tab appears once Prep Studio has been opened
        new MutationObserver(() => { if (document.body.dataset.section === 'prep') ensureMcqs(); }).observe(document.body, { attributes: true, attributeFilter: ['data-section'] });
        if (document.body.dataset.section === 'prep') ensureMcqs();
    }
    wire();

    return { tab: () => tab, tune: () => ({ difficulty: level, subject }), forge, dealMcqs, setTab, refresh };
})();
window.PrepKit = PrepKit;
