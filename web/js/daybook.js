/**
 * Daybook (home): your day at a glance. Every number comes from your own data (profile, prep bank, Brain Bento,
 * Copilot history, keys, Toolbelt); every action is a real shortcut from the registry in shortcuts.js.
 * "Up next" picks the single most useful step for right now. Uses API_BASE, prep, prepStatus, switchSection.
 */
const Daybook = (() => {
    const $ = sel => document.querySelector(`#page-home [data-db="${sel}"]`);
    const icon = n => `<svg aria-hidden="true"><use href="#i-${n}"/></svg>`;
    const get = async path => { try { const r = await fetch(`${API_BASE}${path}`); return r.ok ? await r.json() : null; } catch (e) { return null; } };
    const day = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toLocaleDateString('en-CA'); };
    const shown = {};   // numbers already on screen, so a refresh counts up from there

    function countTo(el, to) {
        if (!el) return;
        const from = shown[el.dataset.db] ?? 0;
        shown[el.dataset.db] = to;
        const calm = matchMedia('(prefers-reduced-motion: reduce)').matches || window.Motion?.calm?.();
        if (calm || from === to) { el.textContent = to.toLocaleString(); return; }
        const t0 = performance.now(), dur = 700;
        const step = t => { const k = Math.min(1, (t - t0) / dur); el.textContent = Math.round(from + (to - from) * (1 - (1 - k) ** 3)).toLocaleString(); if (k < 1) requestAnimationFrame(step); };
        requestAnimationFrame(step);
    }

    function greeting() {
        const h = new Date().getHours();
        return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Good night';
    }

    // the one thing worth doing next, in order of what unblocks the most
    function nextStep(d) {
        const hosted = !!window.Auth?.enabled?.();
        const anyKey = Object.values(d.keys?.keys || {}).some(k => k.saved);
        if (!d.profile?.onboarded) return { t: 'Tell Vettly who you are', x: 'Four quick answers, and every question and answer is written for your field and role.', a: [['Start', 'user', () => window.Onboard?.open()]] };
        if (hosted && !anyKey && (d.keys?.free_left ?? 99) <= 5) return { t: 'Add a free AI key', x: `${d.keys?.free_left ?? 0} free answers left today. A free Gemini key takes two minutes and has no daily limit here.`, a: [['Show me how', 'key', () => KeyGuide.open('gemini')], ['Key Ring', 'gear', () => switchSection('settings', { animate: true })]] };
        // the Toolbelt first: whatever it holds makes every later answer yours (optional, so it can be skipped)
        const fed = !!(d.ctx?.resume || Object.keys(d.ctx?.github || {}).length || d.ctx?.custom?.length || d.jd?.description);   // an empty GitHub comes back as {}
        let skipped = false; try { skipped = localStorage.getItem('vettly_toolbelt_skip') === '1'; } catch (e) { /* storage blocked */ }
        if (!fed && !skipped && !d.q) return { t: 'Feed your Agent Toolbelt', x: 'Add your resume, a job post, GitHub or a few stories, so every question and answer is about you. All optional, and it takes a minute.',
            a: [['Open Agent Toolbelt', 'toolbox', () => switchSection('setup', { animate: true })], ['Skip for now', 'caret-right', () => { try { localStorage.setItem('vettly_toolbelt_skip', '1'); } catch (e) { /* */ } refresh(); }]] };
        if (!d.q) return { t: 'Generate your first question', x: `Pick a category in Prep Studio and Vettly writes a question for ${d.profile?.role ? escapeHtml(d.profile.role) : 'your role'}, with a model answer.`, a: [['Open Prep Studio', 'target', () => switchSection('prep', { animate: true })]] };
        if (d.rev) return { t: `Review ${d.rev} ${d.rev === 1 ? 'answer' : 'answers'}`, x: 'Accept the ones that sound like you, or refine them. Reviewed answers teach Vettly your voice.', a: [['Review now', 'list-checks', () => { switchSection('prep', { animate: true }); if (typeof prep !== 'undefined') { prep.f.st = 'review'; window.prepRender?.(); } }]] };
        if (d.bento < 5) return { t: d.bento ? `${5 - d.bento} more ideas in today's box` : "Today's Brain Bento is waiting", x: 'Five bite-sized ideas from your field. About five minutes.', a: [['Open the box', 'bento', () => switchSection('bento', { animate: true })]] };
        return { t: 'Practise out loud', x: 'Ask the Copilot what an interviewer would ask, and answer it yourself first.', a: [['Open Live Copilot', 'chats', () => switchSection('chat', { animate: true })]] };
    }

    function renderNext(d) {
        const n = nextStep(d);
        $('next-title').textContent = n.t;
        $('next-text').innerHTML = n.x;
        const box = $('next-actions');
        box.innerHTML = n.a.map(([label, ic], i) => `<button type="button" class="btn ${i ? 'btn-secondary' : 'btn-primary'}" data-next="${i}">${icon(ic)}${label}</button>`).join('');
        box.querySelectorAll('[data-next]').forEach(b => b.addEventListener('click', () => n.a[Number(b.dataset.next)][2]()));
    }

    function renderWeek(bento) {
        const done = bento.done || {};
        const days = Array.from({ length: 7 }, (_, i) => day(i - 6));
        $('week').innerHTML = days.map((d, i) => {
            const n = (done[d] || []).length, label = new Date(d + 'T12:00').toLocaleDateString(undefined, { weekday: 'narrow' });
            return `<li class="${n ? 'on' : ''}${i === 6 ? ' today' : ''}" style="--i:${i}" title="${d}: ${n} ideas"><i></i><span>${label}</span></li>`;
        }).join('');
        const streak = bento.last === day() || bento.last === day(-1) ? bento.streak || 0 : 0;
        countTo($('streak'), streak);
        $('streak-note').textContent = streak ? (bento.last === day() ? 'Kept alive today. See you tomorrow.' : 'Open today’s box to keep it going.') : 'Finish a Brain Bento idea to start one.';
        document.querySelector('#page-home .db-flame')?.classList.toggle('lit', streak > 0);
    }

    function renderActions() {
        const want = ['go-setup', 'go-prep', 'go-bento', 'new-chapter', 'go-chat', 'prep-search', 'palette', 'theme'];
        const reg = window.Shortcuts ? Shortcuts.list() : [];
        const pick = want.map(id => reg.find(x => x.id === id)).filter(Boolean).filter((x, i, all) => !(x.id === 'go-chat' && all.some(y => y.id === 'new-chapter'))).slice(0, 6);
        const LABEL = { 'go-setup': 'Feed your Toolbelt', 'go-chat': 'Practise in Copilot', 'go-prep': 'Generate a question', 'go-bento': "Today's Bento", 'prep-search': 'Search my questions', palette: 'Search & commands', theme: 'Light / dark', 'new-chapter': 'New Copilot chapter' };
        const box = $('actions');
        box.innerHTML = pick.map((x, i) => `<button type="button" class="db-action" data-act="${x.id}" style="--i:${i}"><span class="db-action-ico">${icon(x.icon || 'sparkle')}</span><b>${LABEL[x.id] || x.label}</b><span class="db-kbd">${Shortcuts.kbd(x)}</span></button>`).join('');
        box.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => reg.find(x => x.id === b.dataset.act)?.run()));
    }

    function renderSetup(d) {
        const hosted = !!window.Auth?.enabled?.();
        const anyKey = Object.values(d.keys?.keys || {}).some(k => k.saved);
        const items = [
            ['Your profile', d.profile?.onboarded, d.profile?.role ? `Preparing for ${escapeHtml(d.profile.role)}` : 'Name, field and role', () => window.Onboard?.open()],
            ['Your resume', !!d.ctx?.resume, 'Agent Toolbelt · optional: answers cite your real experience', () => switchSection('setup', { animate: true })],
            ['A job post', !!d.jd?.description, 'Agent Toolbelt · optional: questions follow its requirements', () => switchSection('setup', { animate: true })],
            ...(hosted ? [['A free AI key', anyKey, anyKey ? 'Connected' : 'Gemini or Groq, two minutes', () => KeyGuide.open('gemini')]] : []),
            ['The guided tour', !!window.Tour?.seen?.(), 'One minute, every page', () => window.Tour?.start()],
        ];
        const done = items.filter(i => i[1]).length;
        $('setup-count').textContent = `${done} / ${items.length}`;
        const box = $('setup');
        box.innerHTML = items.map(([t, ok, sub], i) => `<li class="${ok ? 'ok' : ''}" style="--i:${i}"><button type="button" data-setup="${i}"><span class="db-tick">${ok ? icon('check-bold') : ''}</span><span><b>${t}</b><small>${sub}</small></span>${ok ? '' : icon('caret-right')}</button></li>`).join('');
        box.querySelectorAll('[data-setup]').forEach(b => b.addEventListener('click', () => items[Number(b.dataset.setup)][3]()));
    }

    function renderKeys(d) {
        const keys = d.keys?.keys || {};
        const list = typeof KEY_PROVIDERS !== 'undefined' ? KEY_PROVIDERS : [];
        $('chain').innerHTML = list.map((p, i) => `<li class="${keys[p.id]?.saved ? 'on' : ''}" data-p="${p.id}" style="--i:${i}"><span class="db-dot">${p.mark}</span><small>${p.name}</small></li>`).join('');
        const saved = list.filter(p => keys[p.id]?.saved).map(p => p.name);
        $('keys-note').innerHTML = !window.Auth?.enabled?.() ? 'Running on your computer: keys come from <code>backend/.env</code>.'
            : saved.length > 1 ? `${saved.join(' → ')}. If one is busy, the next one answers.`
            : saved.length ? `${saved[0]} only. Add Groq too for a free backup.`
            : `${d.keys?.free_left ?? 0} of ${d.keys?.free_limit ?? 0} free answers left today.`;
    }

    async function refresh() {
        if (!document.getElementById('page-home')) return;
        await window.Auth?.ready;
        const [profile, keys, ctx, jd, chat, qs] = await Promise.all([get('/api/profile'), get('/api/ai-key'), get('/context'), get('/context/job-description'), get('/api/chat/history'), get('/prepare/questions')]);
        let bento = {};
        try { bento = JSON.parse(localStorage.getItem('vettly_bento') || '{}'); } catch (e) { /* storage blocked */ }
        const entries = qs?.entries || (typeof prep !== 'undefined' ? prep.entries : []);
        const st = e => (typeof prepStatus === 'function' ? prepStatus(e) : 'review');
        const d = { profile: profile || {}, keys, ctx, jd, bento: (bento.done?.[day()] || []).length,
            q: entries.length, acc: entries.filter(e => st(e) === 'accept').length, rev: entries.filter(e => st(e) === 'review').length,
            chat: (chat?.history || []).filter(m => m.role === 'user').length };

        const first = (d.profile.name || '').split(/\s+/)[0];
        $('date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
        $('greet').textContent = greeting();
        $('name').textContent = first || 'there';
        $('sub').innerHTML = d.profile.role ? `Preparing for <b>${escapeHtml(d.profile.role)}</b>${d.profile.field ? ` · ${escapeHtml(d.profile.field)}` : ''}` : 'Your interview prep, one page at a time.';
        renderNext(d);
        renderWeek(bento);
        $('bento').textContent = `${Math.min(d.bento, 5)} of 5`;
        $('ring').style.strokeDashoffset = String(1 - Math.min(d.bento, 5) / 5);
        countTo($('q'), d.q); countTo($('acc'), d.acc); countTo($('rev'), d.rev); countTo($('chat'), window.Register?.stats?.().messages ?? d.chat);
        renderActions();
        renderSetup(d);
        renderKeys(d);
    }

    // [data-go] tiles anywhere on the Daybook
    document.addEventListener('click', e => {
        const g = e.target.closest('#page-home [data-go]'); if (!g) return;
        const to = g.dataset.go;
        if (to === 'atelier-keys') { switchSection('atelier', { animate: true }); setTimeout(() => document.getElementById('atelier-keys-card')?.scrollIntoView({ behavior: 'smooth' }), 420); }
        else switchSection(to, { animate: true });
    });
    refresh();
    return { refresh };
})();

// modules talk to each other through window: a top-level const is not a window property
window.Daybook = Daybook;
