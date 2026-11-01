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
    split: 'vettly_mentor_split_v2',   // v2: the card got wider by default; older saved splits are ignored
};
const MENTOR_SPLIT = { side: 0.5, stack: 0.42 };   // the pinned card's share of the desk, side by side and stacked
const MENTOR_GUTTER = 18;

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
        if (document.getElementById('mentor').classList.contains('split')) { if (mentor.preSplit) mentor.preSplit.moved = true; }
        else mentorStore.set(MENTOR_KEYS.geom, mentor.geom);
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
    if (mentor.preSplit) mentor.preSplit.moved = true;
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
    mentorFillSheet(el);
    const from = el.querySelector('.mentor-doubt-btn, .prep-btn-mentor, [data-mentor-pin]');
    if (from) mentorBurstFrom(from, 10);
    const wasOpen = document.getElementById('mentor').dataset.state === 'open';
    mentorToggle(true);
    mentorDesk(true, el, wasOpen);
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
    mentorDesk(false);
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
    // side by side only: stacked, the gutter's own flow carries it
    const on = Boolean(el) && document.getElementById('mentor').classList.contains('split')
        && document.body.classList.contains('mentor-open') && !mentorDeskStacked();
    svg.classList.toggle('on', on);
    if (!on) {
        mentor.flowing = false;
        return;
    }
    if (mentor.flowPaused !== mentorCalm()) {   // SVG (SMIL) animations ignore CSS, so pause them by hand
        mentor.flowPaused = mentorCalm();
        if (mentor.flowPaused) svg.pauseAnimations(); else svg.unpauseAnimations();
    }
    const sheet = document.getElementById('mentor-sheet').getBoundingClientRect();
    let d = mentorDeskPath(sheet);
    if (document.body.dataset.section === home) {   // the card's own page is open: the beam starts at the card
        const clip = home === 'chat'
            ? document.getElementById('chat-messages').getBoundingClientRect()
            : { top: 0, bottom: innerHeight, left: 0, right: innerWidth };
        d = `${mentorOuterPath(el.getBoundingClientRect(), sheet, clip)} ${d}`;
    }
    svg.querySelectorAll('.flow-line').forEach(path => path.setAttribute('d', d));
    requestAnimationFrame(mentorFlow);
}

// Outside the desk: from the card to the sheet's left edge, never across the desk
function mentorOuterPath(r, sheet, clip) {
    const top = Math.max(r.top, clip.top), bottom = Math.min(r.bottom, clip.bottom);
    if (bottom - top < 8 || r.left > sheet.left - 30) return '';   // off screen, or tucked under the desk
    const x2 = sheet.left - 2, y2 = sheet.top + 34, y1 = (top + bottom) / 2;
    if (r.right < sheet.left - 40) {   // the card sits clear of the desk: an S-curve from its side
        const x1 = r.right + 4, dx = (x2 - x1) / 2;
        return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
    }
    const x1 = Math.max(r.left + 24, sheet.left - 40);   // the card runs under the desk: rise from its visible part
    return `M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2 - 24},${y2} ${x2},${y2}`;
}

// Inside the desk: from the pinned question, along the gutter, into the composer
function mentorDeskPath(s) {
    const q = document.getElementById('sheet-q').getBoundingClientRect();
    const f = document.getElementById('mentor-field').getBoundingClientRect();
    const xm = s.right + MENTOR_GUTTER / 2, x2 = f.left + 4, k = 10;
    const y1 = Math.min(Math.max(q.top + 14, s.top + 48), s.bottom - 24);
    const y2 = f.top + f.height / 2;
    if (y2 - y1 < 2 * k + 4) return `M${s.right},${y1} C${xm},${y1} ${xm},${y2} ${x2},${y2}`;
    return `M${s.right},${y1} H${xm - k} Q${xm},${y1} ${xm},${y1 + k} V${y2 - k} Q${xm},${y2} ${xm + k},${y2} H${x2}`;
}

// ─── Split Desk: the pinned card floats beside the chat (or above it), joined by the pipeline ───

const mentorDeskStacked = () => getComputedStyle(document.getElementById('mentor-desk')).getPropertyValue('--stacked').trim() === '1';

// The panel's layout box, ignoring the scale it opens and closes with
function mentorPanelRect() {
    const panel = document.querySelector('.mentor-panel');
    const cs = getComputedStyle(panel);
    const left = parseFloat(cs.left), top = parseFloat(cs.top);
    return { left, top, width: panel.offsetWidth, height: panel.offsetHeight };
}

// The sheet: the pinned question and its whole answer
function mentorFillSheet(el) {
    const sheet = document.getElementById('mentor-sheet');
    const fromPrep = Boolean(el.closest('#page-prep'));
    if (fromPrep && el.dataset.tone) sheet.dataset.tone = el.dataset.tone; else delete sheet.dataset.tone;
    const n = fromPrep ? Number(el.id.replace('prep-card-', '')) + 1 : 0;
    document.getElementById('sheet-tag').innerHTML = fromPrep
        ? `<b>Q${n}</b>${escapeHtml(el.querySelector('.tone-pill')?.textContent.trim() || '')}`
        : '<b>Copilot</b>answer';
    document.getElementById('sheet-from').textContent = fromPrep ? 'Pinned from Prep Studio' : 'Pinned from Live Copilot';
    document.getElementById('sheet-q').textContent = el._question || 'Copilot answer';
    const answer = el._answer ?? (el.querySelector('.chat-bubble-content')?.innerText || '');
    document.getElementById('sheet-a').innerHTML = answer.split(/\n{2,}/).map(p => p.trim()).filter(Boolean).map(p => `<p>${escapeHtml(p)}</p>`).join('');
    document.getElementById('sheet-label').textContent = fromPrep ? 'Model answer' : 'Copilot said'; 
    sheet.querySelector('.sheet-body').scrollTop = 0;
}

// Open or close the desk. Opening keeps the chat exactly where and as wide as it was: the desk grows to its left.
function mentorDesk(on, from, wasOpen = true) {
    const root = document.getElementById('mentor');
    const panel = document.querySelector('.mentor-panel');
    const sheet = document.getElementById('mentor-sheet');
    const motion = !mentorCalm() && root.dataset.state === 'open';
    const round = `round ${getComputedStyle(panel).borderRadius}`;
    if (on) {
        const already = root.classList.contains('split');
        const before = mentorPanelRect();
        if (!already) {
            root.classList.add('split');
            mentorDeskGeom(true, before);
        }
        mentorApplySplit();
        sheet.classList.remove('fresh');
        void sheet.offsetWidth;   // replay the sheet's entrance for every new card
        sheet.classList.add('fresh');
        if (motion && wasOpen && !already && !mentorDeskStacked()) {
            const cut = before.left - mentorPanelRect().left;
            if (cut > 4) panel.animate([{ clipPath: `inset(0 0 0 ${cut}px ${round})` }, { clipPath: `inset(0 0 0 0 ${round})` }],
                { duration: 680, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' });
        }
        if (motion && from) mentorLiftOff(from);
    } else if (root.classList.contains('split')) {
        const done = () => { root.classList.remove('split'); mentorDeskGeom(false); mentorFlowKick(); };
        if (!motion || mentorDeskStacked()) done();
        else {
            const cut = sheet.getBoundingClientRect().right - panel.getBoundingClientRect().left + MENTOR_GUTTER;
            const fold = panel.animate([{ clipPath: `inset(0 0 0 0 ${round})` }, { clipPath: `inset(0 0 0 ${cut}px ${round})` }],
                { duration: 380, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' });
            fold.finished.then(() => { done(); fold.cancel(); }, done);
        }
    }
    mentorFlowKick();
}

// Desk geometry on desktop (phones keep their fixed sheet and the desk stacks inside it)
function mentorDeskGeom(on, before) {
    if (mentorSheetMode.matches) return;
    if (on) {
        const r = before;
        mentor.preSplit = { geom: mentor.geom, moved: false };
        const chat = r.width - 12;   // the panel's padding, left and right
        const ratio = mentor.split.side;
        const want = Math.min(Math.max(Math.round(chat * ratio / (1 - ratio)), 340), 560);
        const extra = Math.min(want, r.left - 8 - MENTOR_GUTTER);
        // a taller desk too, growing upward so the composer stays where it was
        const height = Math.min(Math.max(r.height, 680), innerHeight - 16);
        const top = Math.max(8, r.top + r.height - height);
        if (extra < 280) {   // no room beside it: keep the panel and let the desk stack inside
            mentor.preSplit.stackOnly = true;
            mentorSetGeom({ left: r.left, top, width: r.width, height });
            return;
        }
        mentorSetGeom({ left: r.left - extra - MENTOR_GUTTER, top, width: r.width + extra + MENTOR_GUTTER, height });
        mentor.split.side = extra / (extra + chat);
    } else {
        const pre = mentor.preSplit;
        mentor.preSplit = null;
        if (!pre) return;
        if (!pre.moved) { mentorSetGeom(pre.geom); return; }
        const r = mentorPanelRect();
        const cut = pre.stackOnly ? 0 : document.getElementById('mentor-sheet').offsetWidth + MENTOR_GUTTER;
        // (a moved or resized desk keeps its new height when it closes)
        mentorSetGeom({ left: r.left + cut, top: r.top, width: Math.max(MENTOR_MIN.w, r.width - cut), height: r.height });
        mentorStore.set(MENTOR_KEYS.geom, mentor.geom);
    }
}

function mentorApplySplit() {
    const desk = document.getElementById('mentor-desk');
    desk.style.setProperty('--r', mentor.split.side.toFixed(4));
    desk.style.setProperty('--rv', mentor.split.stack.toFixed(4));
    const stacked = mentorDeskStacked();
    const sep = document.getElementById('mentor-split');
    sep.setAttribute('aria-orientation', stacked ? 'horizontal' : 'vertical');
    sep.setAttribute('aria-valuenow', String(Math.round((stacked ? mentor.split.stack : mentor.split.side) * 100)));
}

// The card flies from the page into the desk: lift, arc, land, fade into the sheet
function mentorLiftOff(from) {
    const a = from.getBoundingClientRect();
    if (!a.width || a.bottom < 0 || a.top > innerHeight) return;
    requestAnimationFrame(() => {
        const b = document.getElementById('mentor-sheet').getBoundingClientRect();
        const ghost = from.cloneNode(true);
        ghost.removeAttribute('id');
        ghost.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
        ghost.classList.remove('mentor-focused', 'newly-generated');
        ghost.classList.add('desk-ghost');
        ghost.setAttribute('aria-hidden', 'true');
        Object.assign(ghost.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
        document.body.appendChild(ghost);
        const sx = b.width / a.width, sy = Math.min(b.height / a.height, 1.6);
        const dx = b.left - a.left, dy = b.top - a.top;
        ghost.animate([
            { transform: 'none', opacity: 1 },
            { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 70}px) rotate(-5deg) scale(${(1 + sx) / 2})`, opacity: 1, offset: 0.5 },
            { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0 },
        ], { duration: 840, easing: 'cubic-bezier(0.5, 0, 0.2, 1)' }).finished.finally(() => ghost.remove());
    });
}

// Divider limits: the card keeps its header (stacked) or 240px (side by side); the chat keeps 220px or 300px
function mentorSplitLimits(stacked) {
    const box = document.getElementById('mentor-desk').getBoundingClientRect();
    const span = (stacked ? box.height : box.width) - MENTOR_GUTTER;
    const min = (stacked ? 56 : 280) / span, max = 1 - (stacked ? 220 : 300) / span;
    return { box, span, min: Math.min(min, max), max: Math.max(min, max) };
}

function mentorSetSplit(stacked, ratio, save) {
    const { min, max } = mentorSplitLimits(stacked);
    mentor.split[stacked ? 'stack' : 'side'] = Math.min(Math.max(ratio, min), max);
    mentorApplySplit();
    if (save) mentorStore.set(MENTOR_KEYS.split, mentor.split);
}

// Drag the divider; it snaps to thirds and the middle, with a little bounce on the grip
function mentorSplitStart(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const sep = e.currentTarget;
    const stacked = mentorDeskStacked();
    const { box, span, min, max } = mentorSplitLimits(stacked);
    const panel = document.querySelector('.mentor-panel');
    sep.classList.add('active');
    panel.classList.add('resizing');
    document.documentElement.style.cursor = stacked ? 'row-resize' : 'col-resize';
    let snapped = null;
    const move = ev => {
        let ratio = ((stacked ? ev.clientY - box.top : ev.clientX - box.left) - MENTOR_GUTTER / 2) / span;
        ratio = Math.min(Math.max(ratio, min), max);
        const snap = [1 / 3, 1 / 2, 2 / 3].find(p => Math.abs(p - ratio) < 0.025 && p >= min && p <= max);
        if (snap !== undefined) ratio = snap;
        if (snap !== undefined && snap !== snapped && !mentorCalm()) { sep.classList.remove('snap'); void sep.offsetWidth; sep.classList.add('snap'); }
        snapped = snap ?? null;
        mentorSetSplit(stacked, ratio, false);
    };
    const up = () => {
        sep.classList.remove('active');
        panel.classList.remove('resizing');
        document.documentElement.style.cursor = '';
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
        mentorStore.set(MENTOR_KEYS.split, mentor.split);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
}

// Keyboard: arrows nudge (Shift for bigger steps), Home and End go to the limits, Enter resets
function mentorSplitKey(e) {
    const stacked = mentorDeskStacked();
    const now = mentor.split[stacked ? 'stack' : 'side'];
    const step = e.shiftKey ? 0.1 : 0.04;
    const less = stacked ? 'ArrowUp' : 'ArrowLeft', more = stacked ? 'ArrowDown' : 'ArrowRight';
    let ratio;
    if (e.key === less) ratio = now - step;
    else if (e.key === more) ratio = now + step;
    else if (e.key === 'Home') ratio = 0;
    else if (e.key === 'End') ratio = 1;
    else if (e.key === 'Enter') ratio = stacked ? MENTOR_SPLIT.stack : MENTOR_SPLIT.side;
    else return;
    e.preventDefault();
    mentorEaseSplit(() => mentorSetSplit(stacked, ratio, true));
}

function mentorSplitReset() {
    const stacked = mentorDeskStacked();
    mentorEaseSplit(() => mentorSetSplit(stacked, stacked ? MENTOR_SPLIT.stack : MENTOR_SPLIT.side, true));
}

// Keyboard steps and resets glide (grid tracks interpolate); dragging follows the pointer directly
function mentorEaseSplit(change) {
    const desk = document.getElementById('mentor-desk');
    if (!mentorCalm()) desk.classList.add('easing');
    change();
    clearTimeout(mentor.easeTimer);
    mentor.easeTimer = setTimeout(() => desk.classList.remove('easing'), 600);
}

async function mentorCopyPinned() {
    const btn = document.getElementById('sheet-copy');
    try {
        await navigator.clipboard.writeText(document.getElementById('sheet-a').innerText);
        btn.classList.add('done');
        btn.querySelector('use').setAttribute('href', '#i-check-bold');
        setTimeout(() => { btn.classList.remove('done'); btn.querySelector('use').setAttribute('href', '#i-copy'); }, 1800);
    } catch (err) {
        Motion.toast('Copying is blocked here. Select the text to copy it.', 'error');
    }
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
    mentor.split = { ...MENTOR_SPLIT, ...mentorStore.get(MENTOR_KEYS.split, {}) };
    mentorApplySplit();
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
