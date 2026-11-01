/**
 * Vettly Mentor — a floating Gemini chat on every tab that doubles as the
 * Live Copilot "Doubt Desk".
 *
 *   · "@N" cites Prep Studio question N (typing "@" opens a picker)
 *   · "Ask Doubt" on a Copilot answer pins it; a beam links it to the panel
 *   · Drag the header, resize from any edge, reset to the corner in one click
 *
 * Uses dashboard.js globals: API_BASE, escapeHtml, switchSection,
 * loadPrepQuestions, getCategoryLabel. Styles live in mentor.css.
 */

// ─── State & storage ─────────────────────────────────────────────

const mentor = {
    history: [],      // Mentor conversation [{ role, content }]
    prep: [],         // Prep Studio entries for the @ picker (kept fresh by loadPrepQuestions)
    pinned: null,     // Copilot answer bubble pinned via "Ask Doubt"
    mention: null,    // { start, items, active } while the @ picker is open
    geom: null,       // { left, top, width, height } once moved/resized; null = default corner
    lang: 'english',  // answer language pill: 'english' | 'hinglish'
    busy: false,
    rendered: false,
    flowing: false,
};

const MENTOR_KEYS = {
    history: 'vettly_mentor_history',
    lang: 'vettly_mentor_lang',
    open: 'vettly_mentor_open',
    geom: 'vettly_mentor_geom',
};

const MENTOR_MIN = { w: 340, h: 440 };

// localStorage can throw (private mode, blocked storage): the Mentor still works, it just forgets
const mentorStore = {
    get(key, fallback) {
        let raw = null;
        try { raw = localStorage.getItem(key); } catch (e) { return fallback; }
        if (raw === null) return fallback;
        try { return JSON.parse(raw); } catch (e) { return raw; }  // older plain-string values
    },
    set(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage blocked */ }
    },
};

// ─── Markup ──────────────────────────────────────────────────────

const MENTOR_STAR_48 = 'M24 14C24.7 19.8 28.2 23.3 34 24C28.2 24.7 24.7 28.2 24 34C23.3 28.2 19.8 24.7 14 24C19.8 23.3 23.3 19.8 24 14Z';
const MENTOR_HALO_48 = 'M24 9.5C25.1 18 30 22.9 38.5 24C30 25.1 25.1 30 24 38.5C22.9 30 18 25.1 9.5 24C18 22.9 22.9 18 24 9.5Z';

// One orbit: a faint ring plus a comet (fading tail, bright head) racing along it
const mentorOrbit = (angle, extra = '') => ['m-ring', `m-run ${extra}`, `m-run m-run-head ${extra}`].map(cls =>
    `<ellipse class="${cls.trim()}" cx="24" cy="24" rx="18.5" ry="7" transform="rotate(${angle} 24 24)" pathLength="100"/>`).join('');

// The Mentor emblem: a liquid orb with light running along its orbits and around the sparkle
const MENTOR_EMBLEM = `
    <span class="m-orb-aura"></span>
    <span class="m-orb-sphere"></span>
    <svg class="m-orb-art" viewBox="0 0 48 48" aria-hidden="true">
        <circle class="m-bezel" cx="24" cy="24" r="21"/>
        <g class="m-orbits">${mentorOrbit(-35)}${mentorOrbit(35, 'm-run-2')}</g>
        <g class="m-star-group">
            <path class="m-halo" d="${MENTOR_HALO_48}"/>
            <path class="m-halo-trace" d="${MENTOR_HALO_48}" pathLength="100"/>
            <path class="m-star" d="${MENTOR_STAR_48}"/>
        </g>
    </svg>`;

const MENTOR_STAR = '<svg viewBox="0 0 24 24"><use href="#mentor-mark"/></svg>';

function mentorMd(text) {
    if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') {
        return escapeHtml(text).replace(/\n/g, '<br>');  // CDN unreachable: plain but readable
    }
    return DOMPurify.sanitize(marked.parse(text, { breaks: true, gfm: true }));
}

function mentorUserHtml(text) {
    return escapeHtml(text).replace(/@[Qq]?(\d+)/g, (_, n) =>
        `<button type="button" class="mentor-ref" onclick="mentorJump(${n})" title="Open Q${n} in Prep Studio">Q${n}</button>`);
}

function mentorEmptyHtml() {
    const onCopilot = document.body.dataset.section === 'chat';
    const n = mentor.prep.length;
    const chips = onCopilot
        ? [['', 'Explain this answer simply'], ['', 'What follow-ups could they ask?'], ['', 'Where does this answer sound weak?']]
        : n ? [[n, 'Explain it step by step'], [n, 'Likely follow-up questions'], [n, 'Give me a simple analogy']] : [];
    return `
        <div class="mentor-empty">
            <span class="m-orb mentor-empty-orb">${MENTOR_EMBLEM}</span>
            <h4>${onCopilot ? 'Ask about any answer in this chat.' : 'Ask about any question you\'ve prepped.'}</h4>
            <p>${onCopilot
                ? 'Pin an answer with Ask Doubt. The chat stays where it is while we dig in.'
                : 'Type <kbd>@</kbd> and a number to cite a Prep Studio question.'}</p>
            <div class="mentor-chips">${chips.map(([q, label], i) => `
                <button type="button" style="--i:${i}" data-prompt="${q ? `@${q} ` : ''}${escapeHtml(label)}" onclick="mentorSend(this.dataset.prompt)">
                    ${q ? `<span class="mentor-chip-q">Q${q}</span>` : ''}
                    <span class="mentor-chip-label">${escapeHtml(label)}</span>
                    <span class="mentor-chip-go"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg></span>
                </button>`).join('')}
            </div>
        </div>`;
}

function mentorAddTurn(userText, botText) {
    const msgs = document.getElementById('mentor-msgs');
    msgs.querySelector('.mentor-empty')?.remove();
    const turn = document.createElement('div');
    turn.className = 'mentor-turn';
    turn.innerHTML = `
        <div class="mentor-msg user">${mentorUserHtml(userText)}</div>
        <div class="mentor-msg bot">
            <div class="mentor-by">${MENTOR_STAR}<span>Mentor</span></div>
            <div class="mentor-md">${botText ? mentorMd(botText) : '<span class="mentor-thinking">Thinking it through</span>'}</div>
        </div>`;
    msgs.appendChild(turn);
    mentorSnap();
    return turn;
}

function mentorRenderAll() {
    mentor.rendered = true;
    const msgs = document.getElementById('mentor-msgs');
    msgs.innerHTML = mentor.history.length ? '' : mentorEmptyHtml();
    for (let i = 0; i + 1 < mentor.history.length; i += 2) {
        mentorAddTurn(mentor.history[i].content, mentor.history[i + 1].content);
    }
    msgs.scrollTop = (msgs.lastElementChild?.offsetTop || 8) - 8;  // open on the latest question, not the tail of its answer
    mentorStampPage();
    mentorSnap();
}

// Notebook skin: the register's header strip shows today's date and the page (one per question asked)
function mentorStampPage() {
    const head = document.querySelector('.mentor-head');
    head.dataset.date = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    head.dataset.page = String(Math.max(1, Math.ceil(mentor.history.length / 2)));
}

// Notebook skin: keep the answers on the ruled lines by rounding every block that is not plain text
// (sticky notes, code cards, tables, the empty page's pieces) up to whole lines. Once per frame at most.
const MENTOR_SNAP = '.mentor-msg.user, .mentor-md > :is(pre, table, blockquote, hr, img), .mentor-empty > *';
let mentorSnapQueued = false;
function mentorSnap() {
    if (mentorSnapQueued) return;
    mentorSnapQueued = true;
    requestAnimationFrame(() => {
        mentorSnapQueued = false;
        const root = document.documentElement;
        const on = root.dataset.mentorSkin === 'paper';
        const lh = parseFloat(getComputedStyle(root).getPropertyValue('--nb-lh')) || 28;
        document.querySelectorAll(`#mentor-msgs :is(${MENTOR_SNAP})`).forEach(el => {
            el.style.marginBottom = '';
            if (!on || !el.offsetHeight) return;
            const extra = Math.ceil(el.offsetHeight / lh) * lh - el.offsetHeight;
            if (extra) el.style.marginBottom = `${(parseFloat(getComputedStyle(el).marginBottom) || 0) + extra}px`;
        });
    });
}

// ─── Open, close, follow the page ────────────────────────────────

function mentorToggle(open = document.getElementById('mentor').dataset.state !== 'open', focus = true) {
    const root = document.getElementById('mentor');
    const opening = open && root.dataset.state !== 'open';
    root.dataset.state = open ? 'open' : 'closed';
    document.getElementById('mentor-orb').setAttribute('aria-expanded', open);
    document.body.classList.toggle('mentor-open', open);
    mentorStore.set(MENTOR_KEYS.open, open);
    if (open) {
        if (!mentor.rendered) mentorRenderAll();
        if (focus) setTimeout(() => document.getElementById('mentor-input').focus(), 200);
        if (opening && focus) mentorBurstFrom(document.getElementById('mentor-orb'), 12);
    } else {
        mentorCloseMention();
    }
    mentorFlowKick();
}

// Called by switchSection: the subtitle and empty-state hints follow the page
function mentorSyncMode() {
    document.getElementById('mentor-sub').textContent = document.body.dataset.section === 'chat'
        ? 'Gemini Pro, reading this chat'
        : 'Gemini Pro, reading your prep bank';
    if (mentor.rendered && !mentor.history.length) mentorRenderAll();
    mentorFlowKick();
}

function mentorReset() {
    if (mentor.busy) return;
    mentor.history = [];
    mentorStore.set(MENTOR_KEYS.history, []);
    mentorRenderAll();
}

function mentorAsk(n) {
    mentorToggle(true);
    document.getElementById('mentor-input').value = `@${n} `;
    mentorAutosize();
}

// ─── Conversation ────────────────────────────────────────────────

async function mentorSend(preset) {
    const input = document.getElementById('mentor-input');
    const text = (typeof preset === 'string' ? preset : input.value).trim();
    if (!text || mentor.busy) return;
    if (typeof preset !== 'string') input.value = '';
    mentorAutosize();
    mentorCloseMention();
    mentorBurstFrom(document.getElementById('mentor-send'), 8);
    mentorSetBusy(true);

    const turn = mentorAddTurn(text);
    const bot = turn.querySelector('.mentor-msg.bot');
    const out = turn.querySelector('.mentor-md');
    bot.classList.add('streaming');
    mentorAnchorTurn(turn);

    const render = mentorStreamRenderer(bot, out);
    const payload = { message: text, history: mentor.history.slice(-40), focus: mentorFocusPayload(), language: mentor.lang };
    let reply = '';
    let failed = false;
    try {
        reply = await mentorStream(payload, partial => { reply = partial; render(partial); });
    } catch (e) {
        failed = true;
        reply += `\n\n*Couldn't reach Mentor (${e.message}). Check that the Vettly server is running, then send again.*`;
    }

    bot.classList.remove('streaming');
    out.innerHTML = mentorMd(reply.trim() ? reply : '*No answer came back. Send it again.*');
    mentorSnap();
    if (!failed && reply.trim()) {
        bot.classList.add('done');
        mentorRemember(text, reply);
        mentorStampPage();
    }
    mentorSetBusy(false);
}

async function mentorStream(payload, onText) {
    const res = await fetch(`${API_BASE}/api/mentor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!res.ok || !res.body) throw new Error(`Server returned ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    for (;;) {
        const { value, done } = await reader.read();
        if (done) return text;
        text += decoder.decode(value, { stream: true });
        onText(text);
    }
}

// One markdown render per frame while streaming, with a caret riding the end of the text
function mentorStreamRenderer(bot, out) {
    let queued = false;
    let latest = '';
    return text => {
        latest = text;
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
            queued = false;
            if (!bot.classList.contains('streaming')) return;  // the final render already landed
            const insideCodeFence = latest.split('```').length % 2 === 0;
            out.innerHTML = mentorMd(latest + (insideCodeFence ? '' : '<span class="mentor-caret"></span>'));
            mentorSnap();
        });
    };
}

function mentorSetBusy(isBusy) {
    mentor.busy = isBusy;
    document.getElementById('mentor-send').disabled = isBusy;
    document.getElementById('mentor').classList.toggle('busy', isBusy);
}

// Park the new question at the top: the answer grows downward and reads from its first line
function mentorAnchorTurn(turn) {
    const msgs = document.getElementById('mentor-msgs');
    msgs.querySelectorAll('.mentor-turn').forEach(t => { t.style.minHeight = ''; });
    turn.style.minHeight = `${msgs.clientHeight - 24}px`;
    msgs.scrollTo({ top: turn.offsetTop - 8, behavior: 'smooth' });
}

// The pinned Copilot answer rides along with every message while it is pinned
function mentorFocusPayload() {
    if (mentor.pinned && !mentor.pinned.isConnected) mentorUnpin();  // chat was re-rendered underneath
    const el = mentor.pinned;
    if (!el) return null;
    return {
        question: el._question || '',
        answer: el._answer ?? (el.querySelector('.chat-bubble-content')?.innerText || ''),
        detail: el.querySelector('.chat-detailed-body')?.innerText || '',
    };
}

function mentorRemember(question, answer) {
    mentor.history.push({ role: 'user', content: question }, { role: 'assistant', content: answer });
    mentorStore.set(MENTOR_KEYS.history, mentor.history.slice(-60));
}

// ─── Composer: autosize, language pill, Example pill ─────────────

function mentorAutosize() {
    const input = document.getElementById('mentor-input');
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
    document.getElementById('mentor-field').classList.toggle('has-text', Boolean(input.value.trim()));
}

function mentorSetLang(lang) {
    mentor.lang = lang;
    document.querySelector('.mentor-lang').dataset.lang = lang;  // slides the thumb
    document.querySelectorAll('.mentor-lang button').forEach(b => {
        b.classList.toggle('active', b.dataset.lang === lang);
        b.setAttribute('aria-pressed', b.dataset.lang === lang);
    });
    mentorStore.set(MENTOR_KEYS.lang, lang);
}

// A real-life example of the question in focus:
// whatever is typed (e.g. "@3"), else the pinned Copilot answer, else the last @Q discussed
function mentorExample() {
    if (mentor.busy) return;
    const input = document.getElementById('mentor-input');
    const draft = input.value.trim();
    const lastRef = mentor.pinned ? null : [...mentor.history].reverse()
        .map(m => m.role === 'user' && m.content.match(/@[Qq]?\d+/)).find(Boolean);
    const about = draft || lastRef?.[0] || '';
    mentorBurstFrom(document.querySelector('.mentor-example-ico'), 10);
    if (!about && !mentor.pinned && !mentor.history.length) {
        input.value = '@';  // nothing in focus yet: open the question picker instead
        input.focus();
        return mentorOnInput();
    }
    input.value = '';
    mentorSend(`${about ? `${about} · ` : ''}Show me a real-life example of this`);
}

// ─── Composer: the @ picker ──────────────────────────────────────

function mentorOnInput() {
    mentorAutosize();
    const query = mentorMentionQuery();
    if (!query) return mentorCloseMention();
    mentorRenderMention(query, mentorMentionItems(query.text));
}

// The "@token" right before the caret, if any
function mentorMentionQuery() {
    const input = document.getElementById('mentor-input');
    const before = input.value.slice(0, input.selectionStart);
    const match = before.match(/@(\w*)$/);
    return match && { start: before.length - match[0].length, text: match[1].toLowerCase().replace(/^q(?=\d)/, '') };
}

// Newest first, matched by number, question text or category
function mentorMentionItems(q) {
    return mentor.prep
        .map((e, i) => ({ n: i + 1, e }))
        .reverse()
        .filter(({ n, e }) => !q || String(n).startsWith(q)
            || e.question.toLowerCase().includes(q) || (e.category || '').toLowerCase().includes(q))
        .slice(0, 40);
}

function mentorRenderMention(query, items) {
    const box = document.getElementById('mentor-mention');
    box.classList.remove('hidden');
    if (!items.length) {
        mentor.mention = null;
        box.innerHTML = `<div class="mentor-mention-empty">${mentor.prep.length ? 'No matching question' : 'No Prep Studio questions yet. Synthesize one first.'}</div>`;
        return;
    }
    mentor.mention = { start: query.start, items, active: 0 };
    box.innerHTML = '<div class="mentor-mention-head"><span>Cite a Prep Studio question</span><span><kbd>↑↓</kbd><kbd>↵</kbd></span></div>'
        + items.map(({ n, e }, i) => `
        <button type="button" style="--i:${i}" class="mentor-mention-item${i ? '' : ' active'}" onmousedown="event.preventDefault(); mentorPickMention(${i})">
            <span class="mentor-mention-q">Q${n}</span>
            <span class="mentor-mention-text">${escapeHtml(e.question)}</span>
            <span class="mentor-mention-cat">${getCategoryLabel(e.category)}</span>
        </button>`).join('');
}

function mentorOnKeydown(e) {
    const picking = Boolean(mentor.mention);
    if (picking && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        mentorMoveMention(e.key === 'ArrowDown' ? 1 : -1);
    } else if (picking && (e.key === 'Enter' || e.key === 'Tab')) {
        e.preventDefault();
        mentorPickMention(mentor.mention.active);
    } else if (e.key === 'Escape') {
        mentorCloseMention();
    } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        mentorSend();
    }
}

function mentorMoveMention(step) {
    const m = mentor.mention;
    m.active = (m.active + step + m.items.length) % m.items.length;
    document.querySelectorAll('.mentor-mention-item').forEach((el, i) => {
        el.classList.toggle('active', i === m.active);
        if (i === m.active) el.scrollIntoView({ block: 'nearest' });
    });
}

function mentorPickMention(i) {
    const m = mentor.mention;
    const input = document.getElementById('mentor-input');
    const token = `@${m.items[i].n} `;
    input.value = input.value.slice(0, m.start) + token + input.value.slice(input.selectionStart);
    input.selectionStart = input.selectionEnd = m.start + token.length;
    mentorCloseMention();
    mentorAutosize();
    input.focus();
}

function mentorCloseMention() {
    mentor.mention = null;
    document.getElementById('mentor-mention').classList.add('hidden');
}

async function mentorJump(n) {
    switchSection('prep');
    await loadPrepQuestions();
    const card = document.getElementById(`prep-card-${n - 1}`);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.remove('mentor-flash');
    void card.offsetWidth;  // restart the flash animation
    card.classList.add('mentor-flash');
}

// ─── Floating window: drag, resize, reset ────────────────────────

function mentorViewport() {
    return { w: document.documentElement.clientWidth, h: document.documentElement.clientHeight };
}

// null = default corner (the stylesheet decides); otherwise pin the panel to an explicit rect
function mentorSetGeom(g) {
    mentor.geom = g;
    const s = document.querySelector('.mentor-panel').style;
    if (g) {
        Object.assign(s, { left: `${g.left}px`, top: `${g.top}px`, width: `${g.width}px`, height: `${g.height}px`, right: 'auto', bottom: 'auto' });
    } else {
        s.left = s.top = s.width = s.height = s.right = s.bottom = '';
    }
    document.getElementById('mentor').classList.toggle('custom', Boolean(g));
}

// Keep a moved/resized panel fully on screen (window resize, or a smaller screen than last time)
function mentorFitGeom() {
    const g = mentor.geom;
    if (!g) return;
    const vp = mentorViewport();
    const width = Math.min(Math.max(g.width, MENTOR_MIN.w), vp.w - 16);
    const height = Math.min(Math.max(g.height, MENTOR_MIN.h), vp.h - 16);
    mentorSetGeom({
        width, height,
        left: Math.min(Math.max(g.left, 8), vp.w - width - 8),
        top: Math.min(Math.max(g.top, 8), vp.h - height - 8),
    });
}

// Shared pointer lifecycle for drag and resize
function mentorPointerSession(cls, cursor, onMove, handle) {
    const panel = document.querySelector('.mentor-panel');
    panel.classList.add(cls);
    handle?.classList.add('active');  // keep the grabbed edge lit while resizing
    document.documentElement.style.cursor = cursor;
    const up = () => {
        panel.classList.remove(cls);
        handle?.classList.remove('active');
        document.documentElement.style.cursor = '';
        removeEventListener('pointermove', onMove);
        removeEventListener('pointerup', up);
        mentorStore.set(MENTOR_KEYS.geom, mentor.geom);
    };
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', up);
}

// Phones show the panel as a fixed sheet (mentor.css § 13), so it neither drags nor resizes there
const mentorSheetMode = matchMedia('(max-width: 47.99rem)');

function mentorDragStart(e) {
    if (e.button !== 0 || e.target.closest('button') || mentorSheetMode.matches) return;
    e.preventDefault();
    const start = document.querySelector('.mentor-panel').getBoundingClientRect();
    mentorPointerSession('dragging', 'grabbing', ev => {
        const vp = mentorViewport();
        mentorSetGeom({
            width: start.width, height: start.height,
            left: Math.min(Math.max(start.left + ev.clientX - e.clientX, 8), vp.w - start.width - 8),
            top: Math.min(Math.max(start.top + ev.clientY - e.clientY, 8), vp.h - start.height - 8),
        });
    });
}

function mentorResizeStart(e) {
    if (e.button !== 0 || mentorSheetMode.matches) return;
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    const dir = handle.dataset.dir;
    const start = document.querySelector('.mentor-panel').getBoundingClientRect();
    mentorPointerSession('resizing', getComputedStyle(handle).cursor, ev => {
        const vp = mentorViewport();
        const dx = ev.clientX - e.clientX;
        const dy = ev.clientY - e.clientY;
        let { left, top, right, bottom } = start;
        if (dir.includes('w')) left = Math.min(Math.max(start.left + dx, 8), right - MENTOR_MIN.w);
        if (dir.includes('e')) right = Math.max(Math.min(start.right + dx, vp.w - 8), left + MENTOR_MIN.w);
        if (dir.includes('n')) top = Math.min(Math.max(start.top + dy, 8), bottom - MENTOR_MIN.h);
        if (dir.includes('s')) bottom = Math.max(Math.min(start.bottom + dy, vp.h - 8), top + MENTOR_MIN.h);
        mentorSetGeom({ left, top, width: right - left, height: bottom - top });
    }, handle);
}

// Back to the default size & corner. FLIP: jump to the final rect, then glide there from the old one (transform only)
function mentorResetLayout() {
    if (!mentor.geom) return;
    const panel = document.querySelector('.mentor-panel');
    const first = panel.getBoundingClientRect();
    mentorSetGeom(null);
    mentorStore.set(MENTOR_KEYS.geom, null);
    const last = panel.getBoundingClientRect();
    panel.animate([
        { transformOrigin: '0 0', transform: `translate(${first.left - last.left}px, ${first.top - last.top}px) scale(${first.width / last.width}, ${first.height / last.height})` },
        { transformOrigin: '0 0', transform: 'none' },
    ], { duration: 620, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' });
}

// ─── Doubt Desk: pin a Copilot answer, ask about it while the chat stays put ───

// Pin a Copilot answer (or a Prep Studio card, via mentorPinPrep) to the Doubt Desk; the pipeline beam joins the two
function mentorPin(el) {
    mentor.pinned?.classList.remove('mentor-focused');
    mentor.pinned = el;
    el.classList.add('mentor-focused');
    const fromPrep = Boolean(el.closest('#page-prep'));
    const pin = document.getElementById('mentor-pin');
    pin.querySelector('.mentor-pin-label').textContent = fromPrep ? 'Pinned from Prep Studio' : 'Pinned from Copilot';
    pin.querySelector('.mentor-pin-btn').textContent = fromPrep ? 'Show card' : 'Show in chat';
    pin.querySelector('.mentor-pin-q').textContent = el._question || 'Copilot answer';
    pin.querySelector('.mentor-pin-a').textContent = el._answer ?? (el.querySelector('.chat-bubble-content')?.innerText || '');
    pin.classList.remove('hidden', 'pop');
    void pin.offsetWidth;  // restart the pop-in animation
    pin.classList.add('pop');
    const from = el.querySelector('.mentor-doubt-btn, .prep-btn-mentor, [data-mentor-pin]');
    if (from) mentorBurstFrom(from, 10);
    mentorToggle(true);
}

// Prep Studio: pin question n's card, cite it in the composer, and draw the pipeline from it
function mentorPinPrep(n) {
    const card = document.getElementById(`prep-card-${n - 1}`);
    const entry = mentor.prep[n - 1];
    if (!card || !entry) { mentorAsk(n); return; }
    card._question = entry.question;
    card._answer = entry.answer || '';
    mentorPin(card);
    const input = document.getElementById('mentor-input');
    if (!input.value.includes(`@${n}`)) input.value = `@${n} `;
    mentorAutosize();
}

// After Prep Studio re-renders its cards, keep the pin on the fresh card for the same question
function mentorRepin() {
    const el = mentor.pinned;
    if (!el || el.isConnected || !el.id?.startsWith('prep-card-')) return;
    const fresh = document.getElementById(el.id);
    if (!fresh) return mentorUnpin();
    fresh._question = el._question;
    fresh._answer = el._answer;
    fresh.classList.add('mentor-focused');
    mentor.pinned = fresh;
    mentorFlowKick();
}

function mentorUnpin() {
    mentor.pinned?.classList.remove('mentor-focused');
    mentor.pinned = null;
    document.getElementById('mentor-pin').classList.add('hidden');
    mentorFlowKick();
}

function mentorJumpToPinned() {
    if (!mentor.pinned?.isConnected) return mentorUnpin();
    const show = () => mentor.pinned?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const home = mentor.pinned.closest('#page-prep') ? 'prep' : 'chat';
    if (document.body.dataset.section === home) return show();
    switchSection(home);
    setTimeout(show, 250);  // after switchSection's own scroll-to-bottom
}

function mentorFlowKick() {
    if (!mentor.flowing) {
        mentor.flowing = true;
        requestAnimationFrame(mentorFlow);
    }
}

// Redraws the beam every frame while it is visible, then stops itself.
// A Copilot pin clips to the chat list; a Prep Studio pin clips to the window.
function mentorFlow() {
    if (mentor.pinned && !mentor.pinned.isConnected) mentorUnpin();
    const svg = document.getElementById('mentor-flow');
    const el = mentor.pinned;
    const home = el?.closest('#page-prep') ? 'prep' : 'chat';
    const on = Boolean(el) && document.body.dataset.section === home && document.body.classList.contains('mentor-open');
    svg.classList.toggle('on', on);
    if (!on) {
        mentor.flowing = false;
        return;
    }
    if (mentor.flowPaused !== mentorCalm()) {   // SVG (SMIL) animations ignore CSS, so pause them by hand
        mentor.flowPaused = mentorCalm();
        if (mentor.flowPaused) svg.pauseAnimations(); else svg.unpauseAnimations();
    }
    const clip = home === 'chat'
        ? document.getElementById('chat-messages').getBoundingClientRect()
        : { top: 0, bottom: innerHeight, left: 0, right: innerWidth };
    const r = el.getBoundingClientRect();
    const d = mentorBeamPath(r, document.getElementById('mentor-pin').getBoundingClientRect(), clip);
    svg.querySelectorAll('.flow-line').forEach(path => path.setAttribute('d', d));
    svg.classList.toggle('dim', r.bottom <= clip.top || r.top >= clip.bottom);
    requestAnimationFrame(mentorFlow);
}

// Curve from the pinned bubble (r) to the pin card (p), leaving the bubble on the side facing the panel
function mentorBeamPath(r, p, chat) {
    const top = Math.min(Math.max(r.top, chat.top), chat.bottom);  // visible slice of the bubble
    const bottom = Math.max(Math.min(r.bottom, chat.bottom), chat.top);
    const right = p.left + p.width / 2 >= r.left + r.width / 2;
    const edge = right ? p.left : p.right;
    const s = right ? 1 : -1;
    const x2 = edge - 4 * s;
    const y2 = p.top + Math.min(p.height / 2, 30);
    if ((edge - (right ? r.right : r.left)) * s >= 56) {
        // Room beside the bubble: an S-curve from its side
        const x1 = (right ? r.right : r.left) + 4 * s;
        const y1 = (top + bottom) / 2;
        const dx = (x2 - x1) / 2;
        return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
    }
    if (y2 < top - 12 || y2 > bottom + 12) {
        // The panel overlaps the bubble: rise (or drop) from its border next to the panel, then bend in
        const x1 = right ? Math.max(r.left + 24, edge - 56) : Math.min(r.right - 24, edge + 56);
        const y1 = y2 < top ? top - 2 : bottom + 2;
        return `M${x1},${y1} C${x1},${y1 + (y2 - y1) * 0.7} ${x1 + (x2 - x1) * 0.3},${y2} ${x2},${y2}`;
    }
    return '';  // the pin card sits level with the bubble it covers
}

// ─── Delight: spark bursts, magnetic orb, spotlight frame ────────

const mentorCalm = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'calm';

function mentorBurst(x, y, count) {
    if (mentorCalm()) return;
    for (let i = 0; i < count; i++) {
        const spark = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        spark.setAttribute('viewBox', '0 0 24 24');
        spark.setAttribute('class', 'mentor-spark');
        spark.innerHTML = '<use href="#mentor-mark"/>';
        spark.style.left = `${x - 5.5}px`;
        spark.style.top = `${y - 5.5}px`;
        document.body.appendChild(spark);
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.6;
        const distance = 30 + Math.random() * 34;
        spark.animate([
            { transform: 'translate(0, 0) scale(0.2) rotate(0deg)', opacity: 1 },
            { transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px) scale(${0.5 + Math.random() * 0.8}) rotate(${120 + Math.random() * 120}deg)`, opacity: 0 },
        ], { duration: 650 + Math.random() * 350, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }).onfinish = () => spark.remove();
    }
}

function mentorBurstFrom(el, count) {
    const r = el.getBoundingClientRect();
    mentorBurst(r.left + r.width / 2, r.top + r.height / 2, count);
}

// The launcher leans toward a nearby cursor
let mentorPointer = null;
function mentorMagnet(e) {
    if (mentorPointer) {
        mentorPointer = { x: e.clientX, y: e.clientY };
        return;
    }
    mentorPointer = { x: e.clientX, y: e.clientY };
    requestAnimationFrame(() => {
        const orb = document.getElementById('mentor-orb');
        const r = orb.getBoundingClientRect();
        const dx = mentorPointer.x - (r.left + r.width / 2);
        const dy = mentorPointer.y - (r.top + r.height / 2);
        const pull = Math.hypot(dx, dy) < 120 && !mentorCalm() ? 0.12 : 0;
        orb.style.setProperty('--pull-x', `${dx * pull}px`);
        orb.style.setProperty('--pull-y', `${dy * pull}px`);
        mentorPointer = null;
    });
}

// The frame lights up under the cursor
function mentorSpotlight(e) {
    const panel = e.currentTarget;
    const r = panel.getBoundingClientRect();
    panel.style.setProperty('--mx', `${e.clientX - r.left}px`);
    panel.style.setProperty('--my', `${e.clientY - r.top}px`);
}

// ─── Boot ────────────────────────────────────────────────────────

(function mentorBoot() {
    document.querySelectorAll('.m-orb[data-emblem]').forEach(el => { el.innerHTML = MENTOR_EMBLEM; });
    mentor.history = mentorStore.get(MENTOR_KEYS.history, []);
    mentorSetLang(mentorStore.get(MENTOR_KEYS.lang, 'english'));
    mentorSetGeom(mentorStore.get(MENTOR_KEYS.geom, null));
    mentorFitGeom();
    addEventListener('resize', mentorFitGeom);
    addEventListener('pointermove', mentorMagnet, { passive: true });
    document.querySelector('.mentor-panel').addEventListener('pointermove', mentorSpotlight, { passive: true });
    // the notebook's lines follow the panel's size and the chosen skin
    if ('ResizeObserver' in window) new ResizeObserver(mentorSnap).observe(document.getElementById('mentor-msgs'));
    new MutationObserver(mentorSnap).observe(document.documentElement, { attributes: true, attributeFilter: ['data-mentor-skin'] });
    mentorStampPage();
    if (mentorStore.get(MENTOR_KEYS.open, false)) mentorToggle(true, false);
})();
