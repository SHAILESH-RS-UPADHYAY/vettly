/**
 * Vettly — Dashboard & Prep Studio Logic
 * Handles all sections: Setup, Chat, Prep Studio, About Me, Settings
 */

// The backend serves this page, so the API is the same origin; a page opened as a file talks to the local server
const API_BASE = window.location.protocol === 'file:' ? 'http://127.0.0.1:8766' : (localStorage.getItem('vettly_api_base') || window.location.origin);

// ─── Section Navigation ──────────────────────────────────────

// Sections reached through the More sheet on phones
const MORE_SECTIONS = ['setup', 'attic', 'atelier', 'settings', 'aboutme'];
const sideNav = document.querySelector('.sidebar-nav');

// User-driven switches animate in a view transition; programmatic ones (Mentor jumps) apply at once
function switchSection(name, { animate = false } = {}) {
    const page = document.getElementById(`page-${name}`);
    if (!page) return;
    const changing = document.body.dataset.section !== name;
    const apply = () => {
        document.body.dataset.section = name;
        mentorSyncMode();
        document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p === page));
        document.querySelectorAll('.nav-item[data-section]').forEach(n => {
            const on = n.dataset.section === name;
            n.classList.toggle('active', on);
            if (on) n.setAttribute('aria-current', 'page'); else n.removeAttribute('aria-current');
        });
        const inMore = MORE_SECTIONS.includes(name);
        const more = document.getElementById('nav-more');
        more?.classList.toggle('active', inMore);
        more?.setAttribute('aria-current', String(inMore));
        document.querySelectorAll('.more-item[data-section]').forEach(m => m.setAttribute('aria-current', m.dataset.section === name ? 'page' : 'false'));
        if (changing) window.scrollTo(0, 0);
        Motion.pill(sideNav);
        Motion.thumbs(page);
    };
    if (animate && changing) Motion.page(apply); else apply();
    if (location.hash.split('?')[0] !== `#${name}`) history.replaceState(null, '', `#${name}`);

    // Load data for specific sections
    if (name === 'aboutme') loadAboutMe();
    if (name === 'prep') loadPrepQuestions();
    if (name === 'bento' && typeof Bento !== 'undefined') Bento.render();
    if (name === 'home') renderToday();
    if (name === 'atelier') { Appearance.renderSettings(); window.Register?.renderAtelier?.(); }
    if (name === 'settings' && typeof KeyRing !== 'undefined') { KeyRing.load(); Passport.load(); }
    if (name === 'attic') loadRecycleBin();
    
    // Auto-scroll chat to bottom when switching to chat section
    if (name === 'chat') {
        setTimeout(() => {
            requestAnimationFrame(() => {
                const messagesDiv = document.getElementById('chat-messages');
                if (messagesDiv) {
                    messagesDiv.scrollTop = messagesDiv.scrollHeight;
                }
            });
        }, 150);
    }
}

document.querySelectorAll('.nav-item[data-section], .more-item[data-section]').forEach(btn => {
    btn.addEventListener('click', () => { closeMoreSheet(); switchSection(btn.dataset.section, { animate: true }); });
});

// Phones: the More tab opens a sheet with the rest of the app
const moreSheet = document.getElementById('more-sheet');
function closeMoreSheet() { if (moreSheet?.open) moreSheet.close(); }
document.getElementById('nav-more')?.addEventListener('click', () => moreSheet?.showModal());
moreSheet?.addEventListener('click', e => {   // a tap on the dimmed backdrop closes it
    const r = moreSheet.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeMoreSheet();
});
matchMedia('(max-width: 47.99rem)').addEventListener('change', e => { if (!e.matches) closeMoreSheet(); });

// The nav pill follows the active item through resizes and late font loads
addEventListener('resize', () => Motion.pill(sideNav), { passive: true });
document.fonts?.ready.then(() => Motion.pill(sideNav));

// Load persistent state on boot; a #section in the address opens that tab
window.addEventListener('DOMContentLoaded', async () => {
    const start = location.hash.slice(1).split('?')[0];
    switchSection(document.getElementById(`page-${start}`) ? start : 'home');
    await restoreChatMessages();
    await restoreSetupState();
});
// a #section typed into the address, or a link to one, opens that tab too
addEventListener('hashchange', () => {
    const name = location.hash.slice(1).split('?')[0];
    if (document.getElementById(`page-${name}`)) switchSection(name, { animate: true });
});

// ─── Hero Mock Typing ────────────────────────────────────────

const mockConversations = [
    { question: "Tell me about a time you handled a difficult situation at work or college.", filler: "Sure, one that comes to mind is from my final-year project...", answer: "Two weeks before our deadline, a teammate dropped out. I re-split the work by strengths, set a 10-minute daily check-in, and we submitted on time with a result our guide called the best in the batch." },
    { question: "How do you handle tight deadlines?", filler: "Hmm, good question... I had exactly this last semester...", answer: "I break the work into daily checkpoints and protect the first hour of each day for the hardest task. When something slips, I say so early and agree on what can move." },
];
let mockIdx = 0;

// ─── Chat Functionality ──────────────────────────────────────

let chatHistory = [];

// Format AI chat messages into clean HTML, eliminating raw asterisks and styling markdown
function formatChatMessage(text) {
    if (!text) return '';

    let formatted = escapeHtml(text);

    // 1. Code blocks: ```lang ... ``` -> <pre class="code-block"><code>...</code></pre>
    formatted = formatted.replace(/```(?:[a-zA-Z0-9_]+)?\s*\n?([\s\S]*?)```/g, (match, code) => {
        return `<pre class="code-block"><code>${code.trim()}</code></pre>`;
    });

    // 2. Inline code: `code` -> <code class="inline-code">code</code>
    formatted = formatted.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    // 3. Bold: **text** or ***text*** -> <strong>$1</strong>
    formatted = formatted.replace(/\*{2,3}(.+?)\*{2,3}/g, '<strong>$1</strong>');

    // 4. Bullet points with asterisks: "* Text" or " * Text" or inline "* **Bold**"
    // Convert bullet asterisks to clean bullet symbol
    formatted = formatted.replace(/(?:^|\n)\s*[\*•\-]\s+/g, '\n• ');
    formatted = formatted.replace(/([^\n])\s*\*\s+(?=<strong>|[A-Z0-9•])/g, '$1\n• ');

    // 5. Italic: *text* (only when surrounded by letters/words, not isolated symbols)
    formatted = formatted.replace(/\b\*([a-zA-Z0-9_\s]{1,40})\*\b/g, '<em>$1</em>');

    // 6. Completely strip any remaining asterisks (*) anywhere in the text
    formatted = formatted.replace(/\*/g, '');

    // 7. Clean up whitespace
    formatted = formatted.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');

    return formatted.trim();
}

function createAssistantBubble(text, question) {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble assistant';
    bubble._question = question;  // read by the Mentor when this answer is pinned

    const contentDiv = document.createElement('div');
    contentDiv.className = 'chat-bubble-content';
    contentDiv.innerHTML = formatChatMessage(text);
    bubble.appendChild(contentDiv);

    // Attach expand feature if there is an associated question
    const isRuleAck = text.toLowerCase().includes('saved') && (text.toLowerCase().includes('rule') || text.toLowerCase().includes('preference') || text.toLowerCase().includes('behavior'));
    if (question && !isRuleAck) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'chat-bubble-actions';

        const expandBtn = document.createElement('button');
        expandBtn.className = 'chat-expand-btn';
        expandBtn.innerHTML = '<svg class="i em-i" aria-hidden="true"><use href="#i-books"/></svg><span>Expand Detailed Answer</span>';
        
        const expandedPanel = document.createElement('div');
        expandedPanel.className = 'chat-expanded-panel hidden';

        expandBtn.onclick = async () => {
            if (!expandedPanel.classList.contains('hidden')) {
                expandedPanel.classList.add('hidden');
                expandBtn.innerHTML = '<svg class="i em-i" aria-hidden="true"><use href="#i-books"/></svg><span>Expand Detailed Answer</span>';
                return;
            }

            if (expandedPanel.dataset.loaded === 'true') {
                expandedPanel.classList.remove('hidden');
                expandBtn.innerHTML = '<svg class="i em-i" aria-hidden="true"><use href="#i-x"/></svg><span>Collapse Details</span>';
                expandedPanel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                return;
            }

            expandBtn.disabled = true;
            expandBtn.innerHTML = '<span>⏳</span><span>Expanding In-Depth Answer...</span>';
            
            try {
                const res = await fetch(`${API_BASE}/api/chat/expand`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ question: question, short_answer: text })
                });
                const data = await res.json();
                if (data.detailed_answer) {
                    expandedPanel.innerHTML = `
                        <div class="chat-detailed-header">
                            <span class="chat-detailed-badge"><svg class="i em-i" aria-hidden="true"><use href="#i-books"/></svg>IN-DEPTH TECHNICAL BREAKDOWN</span>
                        </div>
                        <div class="chat-detailed-body">${formatChatMessage(data.detailed_answer)}</div>
                    `;
                    expandedPanel.dataset.loaded = 'true';
                    expandedPanel.classList.remove('hidden');
                    expandBtn.innerHTML = '<svg class="i em-i" aria-hidden="true"><use href="#i-x"/></svg><span>Collapse Details</span>';
                } else {
                    alert('Could not expand answer: ' + (data.error || 'Unknown error'));
                    expandBtn.innerHTML = '<svg class="i em-i" aria-hidden="true"><use href="#i-books"/></svg><span>Expand Detailed Answer</span>';
                }
            } catch (err) {
                alert('Expand request failed: ' + err.message);
                expandBtn.innerHTML = '<svg class="i em-i" aria-hidden="true"><use href="#i-books"/></svg><span>Expand Detailed Answer</span>';
            } finally {
                expandBtn.disabled = false;
                // Keep the view on the answer being expanded instead of jumping to the chat bottom
                expandedPanel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        };

        const doubtBtn = document.createElement('button');
        doubtBtn.className = 'chat-expand-btn mentor-doubt-btn';
        doubtBtn.innerHTML = '<svg viewBox="0 0 24 24"><use href="#mentor-mark"/></svg><span>Ask Doubt</span>';
        doubtBtn.title = 'Pin this answer to the Doubt Desk and ask about it — the chat stays put';
        doubtBtn.onclick = () => mentorPin(bubble);

        actionsDiv.appendChild(expandBtn);
        actionsDiv.appendChild(doubtBtn);
        bubble.appendChild(actionsDiv);
        bubble.appendChild(expandedPanel);
    }

    return bubble;
}

// Restore chat messages from backend on load
async function restoreChatMessages() {
    if (window.Register) return Register.load();   // the register (register.js) owns Live Copilot now
    try {
        const res = await fetch(`${API_BASE}/api/chat/history`);
        const data = await res.json();
        chatHistory = data.history || [];
        
        const messagesDiv = document.getElementById('chat-messages');
        if (!messagesDiv || chatHistory.length === 0) return;

        // Remove welcome screen
        const welcome = messagesDiv.querySelector('.chat-welcome');
        if (welcome) welcome.remove();

        messagesDiv.innerHTML = ''; // Clear current display
        
        let lastUserMsg = '';
        chatHistory.forEach(msg => {
            if (msg.role === 'user') {
                lastUserMsg = msg.content;
                const bubble = document.createElement('div');
                bubble.className = 'chat-bubble user';
                bubble.textContent = msg.content;
                messagesDiv.appendChild(bubble);
            } else {
                const bubble = createAssistantBubble(msg.content, lastUserMsg);
                messagesDiv.appendChild(bubble);
            }
        });
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    } catch (e) {
        console.error("Failed to load chat history:", e);
    }
}

function saveChatHistory() {
    // Backend automatically saves incoming chats, so we only sync if needed
    // localStorage.setItem('acemate_chat_history', JSON.stringify(chatHistory));
}

async function clearChatHistory() {
    if (chatHistory.length > 2) {
        // Run background analysis to extract preferences before clearing
        fetch(`${API_BASE}/api/chat/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ history: chatHistory }),
        }).catch(e => console.error("Chat analysis failed:", e));
    }

    try {
        await fetch(`${API_BASE}/api/chat/history`, { method: 'DELETE' });
        loadRecycleBin();
    } catch (e) {
        console.error("Failed to clear backend chat history:", e);
    }

    chatHistory = [];
    localStorage.removeItem('acemate_chat_history'); // clear local just in case
    const messagesDiv = document.getElementById('chat-messages');
    messagesDiv.innerHTML = '<div class="chat-welcome"><span class="chat-welcome-badge"><i></i>Copilot ready</span><h3>Ask what an interviewer would ask</h3><p>Answers stream from your resume, GitHub and prep bank in real time.</p></div>';
}

function sendChatSuggestion(text) {
    document.getElementById('chat-input').value = text;
    sendChatMessage();
}

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;

    const messagesDiv = document.getElementById('chat-messages');
    // Remove welcome if present
    const welcome = messagesDiv.querySelector('.chat-welcome');
    if (welcome) welcome.remove();

    // Add user bubble (with the practice stopwatch's time, if it was running)
    const thinkMs = window.Register?.takeLap?.() || null;
    const userBubble = document.createElement('div');
    userBubble.className = 'chat-bubble user';
    userBubble.textContent = msg;
    window.Register?.decorateUser?.(userBubble, { think_ms: thinkMs, ts: new Date().toISOString() });
    messagesDiv.appendChild(userBubble);

    input.value = '';
    input.style.height = 'auto';
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    // Add typing indicator
    const typingBubble = document.createElement('div');
    typingBubble.className = 'chat-bubble assistant typing';
    typingBubble.setAttribute('role', 'status');
    typingBubble.innerHTML = '<span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="sr-only">Thinking</span>';
    messagesDiv.appendChild(typingBubble);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    chatHistory.push({ role: 'user', content: msg });

    try {
        const res = await fetch(`${API_BASE}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg, history: chatHistory.slice(-20), chat_id: window.Register?.openId?.() || null, think_ms: thinkMs }),
        });
        const data = await res.json();
        typingBubble.remove();

        const reply = data.response || data.error || 'No response';
        const aiBubble = createAssistantBubble(reply, msg);
        aiBubble.dataset.time = new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        messagesDiv.appendChild(aiBubble);
        window.Register?.write?.(aiBubble);   // the answer is written in ink, word by word
        window.Register?.touch?.();

        chatHistory.push({ role: 'assistant', content: reply });
        // Server handles persistence now
    } catch (e) {
        typingBubble.textContent = `Error: ${e.message}. Is the server running?`;
        typingBubble.classList.remove('typing');
    }
    // Anchor the question at the top so a long answer reads from its first line (short ones just land at the bottom)
    messagesDiv.scrollBy({ top: userBubble.getBoundingClientRect().top - messagesDiv.getBoundingClientRect().top - 12, behavior: 'smooth' });
}

// ─── Setup State Recovery ────────────────────────────────────

async function restoreSetupState() {
    try {
        // Fetch assignment/JD
        const jdRes = await fetch(`${API_BASE}/context/assignment`);
        if (jdRes.ok) {
            const jdData = await jdRes.json();
            if (jdData && jdData.details) {
                const titleInput = document.getElementById('setup-job-title');
                const companyInput = document.getElementById('setup-company');
                const detailsInput = document.getElementById('setup-jd');
                
                if (titleInput) titleInput.value = jdData.title || '';
                if (companyInput) companyInput.value = jdData.company || '';
                if (detailsInput) detailsInput.value = jdData.details || '';
                
                // Mark checklist if details exist
                updateChecklist('check-resume', true);
            }
        }

        // We could also fetch status to mark other items
        const statusRes = await fetch(`${API_BASE}/status`);
        if (statusRes.ok) {
            const status = await statusRes.json();
            if (status.resume_loaded) {
                updateChecklist('check-resume', true);
            }
            if (status.github_loaded) {
                updateChecklist('check-github', true);
            }
        }
    } catch (e) {
        console.error("Failed to restore setup state:", e);
    }
}

// ─── Prep Studio ─────────────────────────────────────────────

// The bank (prep.entries) renders through one filter state (prep.f) that also lives in the address:
// #prep?q=redis&st=review&cat=TECHNICAL,GENERAL&diff=HARD&sort=shuffle&view=cards

const PREP_CATS = {
    GENERAL: ['General', 'gen', 'sparkle'],
    BEHAVIORAL: ['Behavioral', 'beh', 'brain'],
    TECHNICAL: ['Technical', 'tech', 'code'],
    DSA_CODING: ['DSA / Coding', 'dsa', 'path'],
    PROJECT_DEEP_DIVE: ['Projects', 'proj', 'toolbox'],
    SYSTEM_DESIGN: ['System design', 'sys', 'layout'],
    SITUATIONAL: ['Situational', 'sit', 'bulb'],
    HR_CULTURE_FIT: ['HR / Culture', 'hr', 'chats'],
    ASSIGNMENT: ['Assignment', 'asg', 'target'],
    ABOUT_ME: ['About me', 'me', 'user'],
};
const PREP_DIFFS = { EASY: ['Easy', 1], MEDIUM: ['Medium', 2], HARD: ['Hard', 3], COMMON: ['Common', 1] };
const PREP_STATUS = [['all', 'All'], ['review', 'To review'], ['accept', 'Accepted'], ['reject', 'Rejected']];
const PREP_STATE_LABEL = { accept: 'Accepted', reject: 'Rejected', review: 'To review' };

// [key, label, tone, icon] for any category the backend returns, known or not
function prepCat(category) {
    const key = String(category || 'GENERAL').toUpperCase();
    const known = PREP_CATS[key];
    return known ? [key, ...known] : [key, key.toLowerCase().replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()), 'gen', 'sparkle'];
}
function prepDiff(difficulty) {
    const key = String(difficulty || 'MEDIUM').toUpperCase();
    return [key, ...(PREP_DIFFS[key] || [key.charAt(0) + key.slice(1).toLowerCase(), 2])];
}
const prepStatus = e => (e.user_rating === 'accept' ? 'accept' : e.user_rating === 'reject' ? 'reject' : 'review');

// The Mentor's @ picker labels questions with this
function getCategoryLabel(category) { return prepCat(category)[1]; }

let currentPrepCategory = 'GENERAL';
let recentlyGenerated = false;

const prep = {
    entries: [],
    f: { q: '', st: 'all', cats: new Set(), diffs: new Set(), sort: 'new', view: 'answers' },
    seed: 1,          // shuffle order, stable until Shuffle is pressed again
    open: new Set(),  // flashcards turned over
    loaded: false,
};

// Filters in the address are read once, before the boot switch rewrites the hash
(function prepReadHash() {
    if (!location.hash.startsWith('#prep?')) return;
    const p = new URLSearchParams(location.hash.split('?')[1]);
    prep.f.q = p.get('q') || '';
    if (PREP_STATUS.some(s => s[0] === p.get('st'))) prep.f.st = p.get('st');
    (p.get('cat') || '').split(',').filter(Boolean).forEach(c => prep.f.cats.add(c));
    (p.get('diff') || '').split(',').filter(Boolean).forEach(d => prep.f.diffs.add(d));
    if (['new', 'old', 'shuffle'].includes(p.get('sort'))) prep.f.sort = p.get('sort');
    if (p.get('view') === 'cards') prep.f.view = 'cards';
})();

function prepWriteHash() {
    if (document.body.dataset.section !== 'prep') return;
    const f = prep.f, p = new URLSearchParams();
    if (f.q) p.set('q', f.q);
    if (f.st !== 'all') p.set('st', f.st);
    if (f.cats.size) p.set('cat', [...f.cats].join(','));
    if (f.diffs.size) p.set('diff', [...f.diffs].join(','));
    if (f.sort !== 'new') p.set('sort', f.sort);
    if (f.view !== 'answers') p.set('view', f.view);
    const next = p.toString() ? `#prep?${p}` : '#prep';
    if (location.hash !== next) history.replaceState(null, '', next);
}

const prepActiveCount = () => (prep.f.st !== 'all') + prep.f.cats.size + prep.f.diffs.size + (prep.f.q ? 1 : 0);
const prepHay = e => `${e.question || ''} ${e.answer || ''} ${(e.keywords || []).join(' ')}`.toLowerCase();

// Entries matching every filter except `skip`, so each facet's counts stay honest
function prepPool(skip) {
    const f = prep.f, q = f.q.trim().toLowerCase();
    return prep.entries.map((e, i) => ({ e, i })).filter(({ e }) =>
        (skip === 'st' || f.st === 'all' || prepStatus(e) === f.st)
        && (skip === 'cat' || !f.cats.size || f.cats.has(prepCat(e.category)[0]))
        && (skip === 'diff' || !f.diffs.size || f.diffs.has(prepDiff(e.difficulty)[0]))
        && (!q || prepHay(e).includes(q)));
}

function prepVisible() {
    let rows = prepPool(null);
    if (prep.f.sort === 'new') rows.reverse();
    if (prep.f.sort === 'shuffle') {   // seeded, so a re-render keeps the same order
        const rank = i => { let x = (i + 1) * 2654435761 ^ prep.seed * 1013904223; x = Math.imul(x ^ (x >>> 15), 2246822507); return (x ^ (x >>> 13)) >>> 0; };
        rows = rows.sort((a, b) => rank(a.i) - rank(b.i));
    }
    return rows;
}

function prepCardHtml(e, i, k) {
    const n = i + 1;
    const [, catLabel, tone, icon] = prepCat(e.category);
    const [, diffLabel, dots] = prepDiff(e.difficulty);
    const st = prepStatus(e);
    const fresh = recentlyGenerated && i === prep.entries.length - 1;
    const hidden = prep.f.view === 'cards' && !prep.open.has(i) && !fresh;
    const score = Number(e.score) > 0 ? `<span class="q-score" title="Answer score"><svg aria-hidden="true"><use href="#i-star"/></svg>${e.score}/10</span>` : '';
    const stateClass = { accept: 'badge-pill-emerald', reject: 'badge-pill-rose', review: 'badge-pill-slate' }[st];
    return `
    <article class="prep-card q-card${fresh ? ' newly-generated' : ''}${st === 'accept' ? ' is-accepted' : st === 'reject' ? ' is-rejected' : ''}" id="prep-card-${i}" data-key="${i}" data-tone="${tone}" style="--i:${Math.min(k, 10)}">
        <header class="q-head">
            <span class="badge-pill q-no">Q${n}</span>
            <span class="tone-pill" data-tone="${tone}"><svg aria-hidden="true"><use href="#i-${icon}"/></svg>${escapeHtml(catLabel)}</span>
            <span class="q-diff" title="Difficulty: ${diffLabel}">${[1, 2, 3].map(d => `<i class="${d <= dots ? 'on' : ''}"></i>`).join('')}<span>${diffLabel}</span></span>
            ${fresh ? '<span class="badge-pill badge-pill-orange q-fresh">New</span>' : ''}
            ${score}
            <span class="badge-pill q-state ${stateClass}">${PREP_STATE_LABEL[st]}</span>
        </header>
        <p class="q-text" id="prep-q-${i}">${escapeHtml(e.question)}</p>
        <div class="q-answer${hidden ? ' is-hidden' : ''}">
            ${hidden ? `<button type="button" class="q-reveal" data-reveal="${i}"><svg aria-hidden="true"><use href="#i-sparkle"/></svg>Reveal the answer</button>` : ''}
            <div class="q-ans-body">
                <span class="q-ans-label"><span class="v-classic">Model spoken delivery</span><span class="v-alt">Model answer</span></span>
                <p class="q-ans" id="prep-a-${i}">${escapeHtml(e.answer || '')}</p>
            </div>
        </div>
        <footer class="q-actions">
            <button type="button" class="q-btn q-accept${st === 'accept' ? ' is-on' : ''}" data-rate="accept" data-i="${i}" aria-pressed="${st === 'accept'}"><svg aria-hidden="true"><use href="#i-check"/></svg><span>Accept</span></button>
            <button type="button" class="q-btn q-reject${st === 'reject' ? ' is-on' : ''}" data-rate="reject" data-i="${i}" aria-pressed="${st === 'reject'}"><svg aria-hidden="true"><use href="#i-x"/></svg><span>Reject</span></button>
            <button type="button" class="q-btn q-refine" data-refine="${i}"><svg aria-hidden="true"><use href="#i-pencil"/></svg><span>Refine</span></button>
            <button type="button" class="q-btn prep-btn prep-btn-mentor" data-mentor="${n}" title="Pin Q${n} to the Mentor and ask about it"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#mentor-mark"/></svg><span>Ask Mentor</span></button>
            <button type="button" class="q-btn q-copy" data-copy="${i}" aria-label="Copy the answer"><svg aria-hidden="true"><use href="#i-copy"/></svg><span class="q-copy-text">Copy</span></button>
        </footer>
    </article>`;
}

function prepEmptyHtml() {
    if (!prep.entries.length) {
        return `<div class="prep-empty"><span class="m-orb">${typeof MENTOR_EMBLEM === 'string' ? MENTOR_EMBLEM : ''}</span>
            <h3>No questions yet</h3><p>Pick a category in the Synthesis Lab and generate your first question, grounded in your resume, GitHub and job description.</p></div>`;
    }
    return `<div class="prep-empty"><svg class="i" style="width:34px;height:34px;color:var(--accent-ink)" aria-hidden="true"><use href="#i-search"/></svg>
        <h3>No questions match</h3><p>Try fewer filters or a different word.</p>
        <button type="button" class="btn btn-secondary" data-f-clear><svg class="i" aria-hidden="true"><use href="#i-refresh"/></svg>Clear all filters</button></div>`;
}

// ── The dock: built once per load, then updated in place so counts can tick ──
function prepBuildDock() {
    const dock = document.getElementById('prep-dock');
    if (!dock) return;
    dock.querySelector('[data-f-status]').innerHTML = PREP_STATUS.map(([v, label]) =>
        `<button type="button" class="st-tile" data-v="${v}" aria-pressed="false"><b data-count>0</b><span>${label}</span></button>`).join('');
    const seen = [...new Set(prep.entries.map(e => prepCat(e.category)[0]))];
    const order = [...Object.keys(PREP_CATS).filter(k => seen.includes(k)), ...seen.filter(k => !PREP_CATS[k])];
    dock.querySelector('[data-f-cats]').innerHTML = order.map(key => {
        const [, label, tone, icon] = prepCat(key);
        return `<button type="button" class="f-pill" data-cat="${key}" data-tone="${tone}" aria-pressed="false"><svg aria-hidden="true"><use href="#i-${icon}"/></svg><span class="lbl">${escapeHtml(label)}</span><span class="n" data-count>0</span></button>`;
    }).join('');
    const diffs = [...new Set(prep.entries.map(e => prepDiff(e.difficulty)[0]))].sort((a, b) => (prepDiff(a)[2] - prepDiff(b)[2]) || a.localeCompare(b));
    dock.querySelector('[data-f-diffs]').innerHTML = diffs.map(key => {
        const [, label, dots] = prepDiff(key);
        return `<button type="button" class="f-pill" data-diff="${key}" aria-pressed="false"><span class="diff-dots" aria-hidden="true">${[1, 2, 3].map(d => `<i class="${d <= dots ? 'on' : ''}"></i>`).join('')}</span><span class="lbl">${label}</span><span class="n" data-count>0</span></button>`;
    }).join('');
}

function prepUpdateDock(shown) {
    const dock = document.getElementById('prep-dock');
    if (!dock) return;
    const f = prep.f;
    const stPool = prepPool('st'), catPool = prepPool('cat'), diffPool = prepPool('diff');
    dock.querySelectorAll('[data-f-status] .st-tile').forEach(b => {
        const v = b.dataset.v;
        Motion.count(b.querySelector('[data-count]'), v === 'all' ? stPool.length : stPool.filter(({ e }) => prepStatus(e) === v).length);
        b.setAttribute('aria-pressed', String(f.st === v));
    });
    // each pill shows its count and a bar for its share of what the other filters leave
    const tally = (rows, keyOf) => rows.reduce((m, { e }) => { const k = keyOf(e); m[k] = (m[k] || 0) + 1; return m; }, {});
    const facet = (pills, counts, picked, key) => {
        const max = Math.max(1, ...Object.values(counts));
        pills.forEach(b => {
            const n = counts[b.dataset[key]] || 0, on = picked.has(b.dataset[key]);
            b.style.setProperty('--share', (n / max).toFixed(3));
            Motion.count(b.querySelector('[data-count]'), n);
            b.setAttribute('aria-pressed', String(on));
            b.disabled = !n && !on;
        });
    };
    facet(dock.querySelectorAll('[data-f-cats] .f-pill'), tally(catPool, e => prepCat(e.category)[0]), f.cats, 'cat');
    facet(dock.querySelectorAll('[data-f-diffs] .f-pill'), tally(diffPool, e => prepDiff(e.difficulty)[0]), f.diffs, 'diff');
    dock.querySelectorAll('[data-f-sort] > button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === f.sort)));
    dock.querySelectorAll('[data-f-view] > button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === f.view)));
    const active = prepActiveCount();
    dock.querySelector('[data-f-clear]').hidden = !active;
    // the stream bar: meter, filters badge, ribbon
    const page = document.getElementById('page-prep');
    Motion.count(page.querySelector('[data-shown]'), shown);
    page.querySelector('[data-of]').textContent = `of ${prep.entries.length} ${prep.entries.length === 1 ? 'question' : 'questions'}`;
    page.querySelector('[data-fill]').style.setProperty('--fill', prep.entries.length ? (shown / prep.entries.length).toFixed(3) : 0);
    const badge = page.querySelector('[data-f-badge]');
    badge.hidden = !active;
    badge.textContent = active;
    const ribbon = page.querySelector('[data-f-ribbon]');
    const tags = [];
    if (f.q) tags.push(['q', '', `“${escapeHtml(f.q)}”`]);
    if (f.st !== 'all') tags.push(['st', f.st, PREP_STATUS.find(s => s[0] === f.st)[1]]);
    f.cats.forEach(c => tags.push(['cat', c, escapeHtml(prepCat(c)[1]), prepCat(c)[2]]));
    f.diffs.forEach(d => tags.push(['diff', d, prepDiff(d)[1]]));
    ribbon.hidden = !tags.length;
    ribbon.innerHTML = tags.map(([kind, v, label, tone]) =>
        `<span class="f-tag"${tone ? ` data-tone="${tone}"` : ''}>${label}<button type="button" data-f-remove="${kind}" data-v="${escapeHtml(v)}" aria-label="Remove filter ${label}"><svg aria-hidden="true"><use href="#i-x-bold"/></svg></button></span>`).join('')
        + (tags.length > 1 ? '<button type="button" class="dock-clear" data-f-clear>Clear all</button>' : '');
    dock.querySelectorAll('.seg').forEach(Motion.watchSeg);
}

function prepRender({ animate = true } = {}) {
    const list = document.getElementById('prep-list');
    if (!list) return;
    const rows = prepVisible();
    const html = rows.length ? rows.map(({ e, i }, k) => prepCardHtml(e, i, k)).join('') : prepEmptyHtml();
    if (animate) Motion.glide(list, () => { list.innerHTML = html; }); else list.innerHTML = html;
    mentorRepin();   // keep a Mentor pin on the fresh card
    prepUpdateDock(rows.length);
    prepWriteHash();
}

function selectCategory(category, btnEl) {
    currentPrepCategory = category;
    document.querySelectorAll('.category-btn').forEach(btn => {
        const on = btn === btnEl;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', on);
    });
}

async function generateSinglePrep(categoryOverride) {
    const category = categoryOverride || currentPrepCategory;
    const role = contextData.assignment?.title || (typeof Onboard !== 'undefined' && Onboard.role()) || '';
    const company = contextData.assignment?.company || '';
    const generateBtn = document.getElementById('prep-generate-btn');
    const langToggle = document.getElementById('prep-lang-toggle');
    const language = langToggle && langToggle.checked ? 'HINGLISH' : 'ENGLISH';
    const progressEl = document.getElementById('prep-progress');
    const textEl = document.getElementById('prep-progress-text');

    document.querySelectorAll('.prep-category-buttons button').forEach(b => b.disabled = true);
    if (generateBtn) generateBtn.disabled = true;
    progressEl.classList.remove('hidden');
    textEl.textContent = `Synthesizing a ${prepCat(category)[1]} question…`;

    try {
        const res = await fetch(`${API_BASE}/prepare/single`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category, job_role: role, company: company, language: language }),
        });
        let data;
        try { data = await res.json(); } catch (e) {
            alert('Server error: The backend returned an invalid response. Please ensure Groq API key is valid and context is set.');
            return;
        }
        if (!res.ok) { alert(data.error || 'Failed to generate question'); return; }
        // the new question streams in at the top, so nothing may hide it
        prep.f = { ...prep.f, q: '', st: 'all', cats: new Set(), diffs: new Set(), sort: 'new' };
        const search = document.getElementById('prep-search');
        if (search) search.value = '';
        recentlyGenerated = true;
        await loadPrepQuestions();
    } catch (e) {
        alert('Connection failed: ' + e.message);
    } finally {
        progressEl.classList.add('hidden');
        document.querySelectorAll('.prep-category-buttons button').forEach(b => b.disabled = false);
        if (generateBtn) generateBtn.disabled = false;
    }
}

async function loadPrepQuestions() {
    try {
        const res = await fetch(`${API_BASE}/prepare/questions`);
        const data = await res.json();
        const entries = data.entries || [];
        const grew = entries.length !== prep.entries.length || !prep.loaded;
        prep.entries = entries;
        prep.loaded = true;
        mentor.prep = entries;  // keeps the Mentor's @ picker in sync with Prep Studio
        if (grew) prepBuildDock();
        prepRender();
        renderToday();
        const search = document.getElementById('prep-search');
        if (search && search.value !== prep.f.q) search.value = prep.f.q;

        if (recentlyGenerated && entries.length > 0) {
            recentlyGenerated = false;
            const lastIndex = entries.length - 1;
            const cardEl = document.getElementById(`prep-card-${lastIndex}`);
            const qEl = document.getElementById(`prep-q-${lastIndex}`);
            const aEl = document.getElementById(`prep-a-${lastIndex}`);
            if (cardEl) requestAnimationFrame(() => cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
            if (qEl) typewriteText(qEl, entries[lastIndex].question);
            if (aEl) typewriteText(aEl, entries[lastIndex].answer);
            Motion.burst(cardEl?.querySelector('.q-fresh'), 14);
        }
    } catch (e) { /* offline: the skeleton stays until the next load */ }
}

function typewriteText(element, text) {
    if (Motion.calm()) { element.textContent = text; return; }
    element.innerHTML = '';
    let i = 0;
    const speed = 10; // 10ms per character
    (function typeChar() {
        if (i < text.length) {
            element.innerHTML = escapeHtml(text.substring(0, i + 1)) + '<span class="typewriter-cursor"></span>';
            i++;
            setTimeout(typeChar, speed);
        } else {
            element.innerHTML = escapeHtml(text);
        }
    })();
}

// Optimistic: the card changes at once, the request runs behind it, a failure rolls it back
async function ratePrepAnswer(index, rating) {
    const e = prep.entries[index];
    if (!e || e.user_rating === rating) return;
    const before = e.user_rating;
    const card = document.getElementById(`prep-card-${index}`);
    if (rating === 'accept') Motion.burst(card?.querySelector('.q-accept'), 16, ['var(--ok)', 'var(--accent-2)', 'var(--c-sys)', 'var(--c-beh)']);
    else if (card && !Motion.calm()) card.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }], { duration: 380, easing: 'ease-out' });
    e.user_rating = rating;
    const leaves = prep.f.st !== 'all' && prep.f.st !== rating;
    setTimeout(() => prepRender(), leaves ? 420 : 0);   // let the change show before it leaves the filtered list
    try {
        const res = await fetch(`${API_BASE}/prepare/feedback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ index, rating }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
        e.user_rating = before;
        prepRender();
        Motion.toast('Could not save that rating. Check the connection and try again.', 'error');
    }
}

async function refinePrepAnswer(index) {
    const instruction = await showPromptModal({
        badge: 'REFINE ANSWER',
        title: `Refine Question #${index + 1} Answer`,
        description: 'Specify how you want the AI copilot to adjust the tone, depth, or metrics of this spoken response.',
        inputLabel: 'REFINEMENT INSTRUCTION',
        placeholder: 'e.g., Make it more concise and highlight p95 latency metrics...',
        confirmText: 'Synthesize Refinement',
        cancelText: 'Cancel',
    });
    if (!instruction) return;
    try {
        await fetch(`${API_BASE}/prepare/refine`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ index, instruction }),
        });
        await loadPrepQuestions();
        const a = document.getElementById(`prep-a-${index}`);
        if (a && prep.entries[index]) typewriteText(a, prep.entries[index].answer);
    } catch (e) { alert('Refine failed: ' + e.message); }
}

async function prepCopy(index, btn) {
    const text = prep.entries[index]?.answer || '';
    try {
        await navigator.clipboard.writeText(text);
        btn.dataset.state = 'copied';
        btn.querySelector('use').setAttribute('href', '#i-check-bold');
        btn.querySelector('.q-copy-text').textContent = 'Copied';
        setTimeout(() => {
            delete btn.dataset.state;
            btn.querySelector('use')?.setAttribute('href', '#i-copy');
            const t = btn.querySelector('.q-copy-text');
            if (t) t.textContent = 'Copy';
        }, 2500);
    } catch (e) {
        Motion.toast('Copying is blocked here. Select the answer text to copy it.', 'error');
    }
}

// ── Wiring: one listener per region ──
(function prepWire() {
    const page = document.getElementById('page-prep');
    if (!page) return;
    const list = document.getElementById('prep-list');
    const dock = document.getElementById('prep-dock');
    const slot = document.getElementById('prep-dock-slot');
    const sheet = document.getElementById('prep-filter-sheet');
    const search = document.getElementById('prep-search');

    function clearFilters() {
        prep.f = { ...prep.f, q: '', st: 'all', cats: new Set(), diffs: new Set() };
        search.value = '';
        prepRender();
    }

    list.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.rate) ratePrepAnswer(Number(b.dataset.i), b.dataset.rate);
        else if (b.dataset.refine) refinePrepAnswer(Number(b.dataset.refine));
        else if (b.dataset.mentor) mentorPinPrep(Number(b.dataset.mentor));
        else if (b.dataset.copy) prepCopy(Number(b.dataset.copy), b);
        else if (b.dataset.reveal) {
            const i = Number(b.dataset.reveal);
            prep.open.add(i);
            const answer = b.closest('.q-answer');
            answer.classList.remove('is-hidden');
            b.remove();
            if (!Motion.calm()) answer.querySelector('.q-ans-body').animate([{ opacity: 0, transform: 'translateY(8px)', filter: 'blur(4px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
        }
        else if ('fClear' in b.dataset) clearFilters();
    });

    dock.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        const f = prep.f;
        if (b.classList.contains('st-tile')) { f.st = f.st === b.dataset.v && b.dataset.v !== 'all' ? 'all' : b.dataset.v; prepRender(); }
        else if (b.dataset.cat) {
            const on = !f.cats.has(b.dataset.cat);
            if (on) f.cats.add(b.dataset.cat); else f.cats.delete(b.dataset.cat);
            if (on && !Motion.calm()) {
                b.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
                Motion.burst(b, 10, [getComputedStyle(b).getPropertyValue('--cfg').trim(), 'var(--accent-2)']);   // sparks live on <body>, so pass the resolved colour
            }
            prepRender();
        }
        else if (b.dataset.diff) { if (f.diffs.has(b.dataset.diff)) f.diffs.delete(b.dataset.diff); else f.diffs.add(b.dataset.diff); prepRender(); }
        else if (b.parentElement.matches('[data-f-sort]')) {
            if (b.dataset.v === 'shuffle') prep.seed = (prep.seed * 48271 + 7) % 2147483647 || 1;
            f.sort = b.dataset.v;
            prepRender();
        }
        else if (b.parentElement.matches('[data-f-view]')) { f.view = b.dataset.v; prep.open.clear(); prepRender({ animate: false }); }
        else if ('fClear' in b.dataset) clearFilters();
    });

    page.querySelector('[data-f-ribbon]').addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        const kind = b.dataset.fRemove;
        if (kind === 'q') { prep.f.q = ''; search.value = ''; }
        else if (kind === 'st') prep.f.st = 'all';
        else if (kind === 'cat') prep.f.cats.delete(b.dataset.v);
        else if (kind === 'diff') prep.f.diffs.delete(b.dataset.v);
        else if ('fClear' in b.dataset) return clearFilters();
        prepRender();
    });

    let timer;
    search.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => { prep.f.q = search.value.trim(); prepRender(); }, 220);
    });


    // phones and tablets: the dock moves into the Filters sheet while it is open
    const sheetSlot = sheet.querySelector('[data-sheet-slot]');
    function openSheet() { sheetSlot.appendChild(dock); sheet.showModal(); dock.querySelectorAll('.seg').forEach(Motion.thumb); }
    function closeSheet() { if (sheet.open) sheet.close(); }
    sheet.addEventListener('close', () => { slot.appendChild(dock); });
    page.querySelector('[data-f-open]').addEventListener('click', openSheet);
    sheet.querySelector('[data-f-done]').addEventListener('click', closeSheet);
    sheet.addEventListener('click', e => {
        const r = sheet.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeSheet();
    });
    matchMedia('(min-width: 80rem)').addEventListener('change', ev => { if (ev.matches) closeSheet(); });
    const sheetObserver = new MutationObserver(() => {
        const n = document.querySelector('[data-shown]')?.dataset.count || 0;
        sheet.querySelector('[data-f-done]').textContent = `Show ${n} ${Number(n) === 1 ? 'question' : 'questions'}`;
    });
    sheetObserver.observe(page.querySelector('[data-shown]'), { attributes: true, attributeFilter: ['data-count'] });

    // the search hint types out real keywords from the bank
    let hintIdx = 0, hintTimer = 0;
    function cycleHint() {
        clearTimeout(hintTimer);
        if (document.body.dataset.section !== 'prep' || search.value || document.activeElement === search || Motion.calm() || !prep.entries.length) {
            search.placeholder = 'Search questions and answers';
            hintTimer = setTimeout(cycleHint, 4000);
            return;
        }
        const words = [...new Set(prep.entries.flatMap(e => e.keywords || []))].filter(w => w.length > 2 && w.length < 22);
        if (!words.length) return;
        const word = words[hintIdx++ % words.length];
        const full = `Try “${word}”`;
        let n = 0;
        (function type() {
            search.placeholder = full.slice(0, ++n);
            if (n < full.length) hintTimer = setTimeout(type, 45);
            else hintTimer = setTimeout(cycleHint, 2600);
        })();
    }
    hintTimer = setTimeout(cycleHint, 2500);
})();

// ─── Clean Text Formatting for History & Vision ──────────────

function formatQuestionText(text) {
    if (!text) return '';
    let q = text.trim();

    // Check if this is an OCR / vision screenshot question dump
    if (q.includes('**Type**:') || q.includes('**Problem Statement**:') || q.includes('Problem Statement**:') || q.includes('**Platform**:')) {
        let platform = '';
        const platMatch = q.match(/\*\*Platform\*\*:\s*([^\n*`]+)/i);
        if (platMatch && platMatch[1].trim() && !platMatch[1].includes('[')) {
            platform = `[${platMatch[1].trim()}] `;
        }
        
        let problem = '';
        const probMatch = q.match(/\*\*Problem Statement\*\*:\s*```(?:text)?\s*([\s\S]*?)```/i) ||
                          q.match(/Problem Statement\*\*:\s*```(?:text)?\s*([\s\S]*?)```/i);
        if (probMatch && probMatch[1].trim()) {
            problem = probMatch[1].trim();
        } else {
            const parts = q.split(/Problem Statement\*\*:\s*/i);
            if (parts.length > 1) {
                problem = parts[1].replace(/```text/gi, '').replace(/```/g, '').split(/\*\*Examples\*\*|\*\*Constraints\*\*/i)[0].trim();
            }
        }
        
        if (problem) {
            // Get first 2-3 clean lines for readable question title
            const lines = problem.split('\n').map(l => l.trim()).filter(Boolean);
            const titleLine = lines.slice(0, 2).join(' ');
            q = `${platform}${titleLine}`;
        }
    }
    
    // Clean all markdown artifacts and math symbols from questions
    q = q.replace(/```[a-zA-Z0-9_-]*\s*/gi, '')
         .replace(/```/g, '')
         .replace(/\*\*([^*]+)\*\*/g, '$1')
         .replace(/\*([^*]+)\*/g, '$1')
         .replace(/`([^`]+)`/g, '$1')
         .replace(/\\times/g, '×')
         .replace(/\\le/g, '≤')
         .replace(/\\ge/g, '≥')
         .replace(/\\approx/g, '≈')
         .replace(/\$([^\$\n]+)\$/g, '$1')
         .replace(/\$/g, '');
         
    return escapeHtml(q.trim());
}

function formatAnswerText(text) {
    if (!text) return '';
    let t = text.trim();

    // Strip accidental meta openers from start of text
    t = t.replace(/^(?:To expand on that,?\s*|To elaborate on that,?\s*|To expand further,?\s*)/i, '');
    t = t.replace(/^(?:As I (?:previously |already )?explained(?: earlier| before)?,?\s*|I (?:previously |already )?explained (?:earlier |that |how |about )?,?\s*)/i, '');
    t = t.replace(/^(?:As (?:previously |already )?mentioned(?: earlier| before)?,?\s*|Like I (?:said|mentioned)(?: earlier| before)?,?\s*)/i, '');
    t = t.replace(/^(?:Maine pehle bhi bataya tha,?\s*|Jaise maine bataya(?: tha)?,?\s*|Jaise maine kaha(?: tha)?,?\s*)/i, '');

    // 1. Math / LaTeX symbol conversion
    t = t.replace(/\\times/g, '×');
    t = t.replace(/\\le/g, '≤');
    t = t.replace(/\\ge/g, '≥');
    t = t.replace(/\\approx/g, '≈');
    t = t.replace(/\\cdot/g, '·');
    t = t.replace(/\\pm/g, '±');
    t = t.replace(/\\neq/g, '≠');
    t = t.replace(/\\in/g, '∈');
    t = t.replace(/\\infty/g, '∞');
    t = t.replace(/\\\$/g, '$');
    
    // Strip LaTeX math dollar signs ($x=2.0$ -> x = 2.0)
    t = t.replace(/\$([^$\n]+)\$/g, '$1');

    // 2. Remove indent/tab markers like [T0], [T1], [T2], [T3]
    t = t.replace(/\s*\[T\d+\]/g, '');

    // 3. Clean humanizer markers
    t = t.replace(/\[pause\]/g, '⏸');
    t = t.replace(/\[hmm\]/g, '…');
    t = t.replace(/\[pause (\d+)s?\]/g, '⏸ $1s');

    // 4. Extract code blocks so they don't get messed up by paragraph parsing
    const codeBlocks = [];
    t = t.replace(/```(?:([a-zA-Z0-9_-]+)\s*)?\n([\s\S]*?)```/g, (match, lang, code) => {
        const placeholder = `___CB_${codeBlocks.length}___`;
        const escapedCode = escapeHtml(code.trim());
        codeBlocks.push(`<pre class="history-code-block"><code class="language-${lang || 'text'}">${escapedCode}</code></pre>`);
        return `\n\n${placeholder}\n\n`;
    });

    // 5. Escape HTML in regular text (excluding placeholders)
    t = escapeHtml(t);

    // 6. Markdown bold, italics, inline code
    t = t.replace(/`([^`]+)`/g, '<code class="history-inline-code">$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong class="history-bold">$1</strong>');
    t = t.replace(/\*([^*]+)\*/g, '<em class="history-italic">$1</em>');

    // 7. Format clean paragraphs
    const paragraphs = t.split(/\n\s*\n+/);
    let html = paragraphs.map(p => {
        const trimmed = p.trim();
        if (!trimmed) return '';
        if (trimmed.startsWith('___CB_') && trimmed.endsWith('___')) {
            const idx = parseInt(trimmed.replace('___CB_', '').replace('___', ''), 10);
            return codeBlocks[idx] || '';
        }
        const withBreaks = trimmed.split('\n').join('<br/>');
        return `<div class="history-para">${withBreaks}</div>`;
    }).filter(Boolean).join('');

    // Restore any remaining placeholders
    codeBlocks.forEach((cb, idx) => {
        html = html.replace(`___CB_${idx}___`, cb);
    });

    return html;
}

// ─── History ─────────────────────────────────────────────────

let lastHistoryDataHash = '';
let currentHistorySessions = [];

function toggleHistorySession(headerEl, event) {
    if (event) {
        event.stopPropagation();
    }
    const sessionCard = headerEl.closest('.history-session');
    if (!sessionCard) return;
    sessionCard.classList.toggle('expanded');

    const toggleAllBtn = document.getElementById('btn-toggle-all-history');
    if (toggleAllBtn) {
        const renderedSessions = document.querySelectorAll('.history-session');
        const allExpanded = renderedSessions.length > 0 && Array.from(renderedSessions).every(s => s.classList.contains('expanded'));
        toggleAllBtn.textContent = allExpanded ? 'Collapse all' : 'Expand all';
    }
}

async function loadHistory(force = false) {
    const listEl = document.getElementById('history-list');
    if (!listEl) return;

    try {
        let rawSessions = [];
        try {
            const res = await fetch(`${API_BASE}/api/history`);
            if (res.ok) {
                const data = await res.json();
                rawSessions = data.sessions || [];
            }
        } catch (e) {
            console.warn('Primary history fetch failed:', e);
        }


        // Check if data actually changed to eliminate all unnecessary DOM re-renders and blinking
        const currentDataHash = JSON.stringify(rawSessions);
        if (!force && currentDataHash === lastHistoryDataHash) {
            return;
        }
        lastHistoryDataHash = currentDataHash;

        if (rawSessions.length === 0) {
            listEl.innerHTML = `
                <div style="text-align:center; padding:40px; border:2px dashed var(--border-main); border-radius:var(--radius);">
                    <div style="font-size:36px; margin-bottom:10px;"><svg class="i" aria-hidden="true"><use href="#i-books"/></svg></div>
                    <h3 style="font-family:var(--font-poster); font-size:20px; color:var(--ink-primary);">No Archived Sessions</h3>
                    <p style="font-size:14px; color:var(--ink-secondary); margin-top:4px;">Sessions automatically save in real-time during your interview or practice.</p>
                </div>
            `;
            return;
        }

        // Preserve which sessions are currently expanded so UI state is never lost
        const expandedSessionIds = new Set();
        document.querySelectorAll('.history-session.expanded').forEach(el => {
            if (el.dataset.sessionId) expandedSessionIds.add(el.dataset.sessionId);
        });

        // Track current sessions globally for copy and inspection
        currentHistorySessions = rawSessions;

        // Show newest sessions first
        const sessions = rawSessions.slice().reverse();

        listEl.innerHTML = sessions.map((s, i) => {
            const timeStr = s.timestamp ? new Date(s.timestamp).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }) : 'Recorded Session';
            const entries = s.entries || [];
            const entriesHtml = entries.map((e, j) => `
                <div class="history-entry">
                    <div class="history-entry-q">Q${j+1}: ${formatQuestionText(e.question || '')}</div>
                    <div class="history-entry-a">${formatAnswerText(e.answer || '')}</div>
                </div>
            `).join('');

            const sessionNum = rawSessions.length - i;
            const isExpanded = expandedSessionIds.has(String(s.id));

            return `
                <div class="history-session glass ${isExpanded ? 'expanded' : ''}" id="hist-${i}" data-session-id="${s.id}">
                    <div class="history-session-header" onclick="toggleHistorySession(this, event)">
                        <div class="history-session-info">
                            <span class="history-toggle-circle">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </span>
                            <span class="history-session-title">Session #${sessionNum}</span>
                            <span class="history-badge">${entries.length} Q&A</span>
                        </div>
                        <div class="history-session-meta">
                            <span class="history-time">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                ${timeStr}
                            </span>
                            <button class="history-copy" onclick="event.stopPropagation();copyHistorySession('${s.id}', this)" title="Copy entire session Q&A">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                <span>Copy</span>
                            </button>
                            <button class="history-delete" onclick="event.stopPropagation();deleteHistorySession('${s.id}', ${sessionNum})">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                <span>Delete</span>
                            </button>
                        </div>
                    </div>
                    <div class="history-session-body">${entriesHtml}</div>
                </div>
            `;
        }).join('');

        // Update expand/collapse all button text
        const toggleAllBtn = document.getElementById('btn-toggle-all-history');
        if (toggleAllBtn) {
            const renderedSessions = document.querySelectorAll('.history-session');
            const allExpanded = renderedSessions.length > 0 && Array.from(renderedSessions).every(s => s.classList.contains('expanded'));
            toggleAllBtn.textContent = allExpanded ? 'Collapse all' : 'Expand all';
        }
    } catch (e) {
        listEl.innerHTML = '<div class="history-empty" style="text-align:center; padding:30px;"><p style="color:var(--poster-red);">Could not load history. Is the backend server running?</p></div>';
    }
}

function toggleAllHistorySessions() {
    const sessions = document.querySelectorAll('.history-session');
    if (!sessions.length) return;
    const btn = document.getElementById('btn-toggle-all-history');
    const allExpanded = Array.from(sessions).every(s => s.classList.contains('expanded'));

    sessions.forEach(s => {
        if (allExpanded) {
            s.classList.remove('expanded');
        } else {
            s.classList.add('expanded');
        }
    });

    if (btn) {
        btn.textContent = allExpanded ? 'Expand all' : 'Collapse all';
    }
}

async function copyHistorySession(id, btn) {
    try {
        const session = currentHistorySessions.find(s => String(s.id) === String(id));
        if (!session || !session.entries || session.entries.length === 0) {
            alert('No Q&A entries to copy in this session.');
            return;
        }

        const timeStr = session.timestamp ? new Date(session.timestamp).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }) : 'Recorded Session';

        let copyText = `Vettly Interview Session #${id} (${timeStr})\n`;
        copyText += `Total Questions: ${session.entries.length}\n`;
        copyText += `==================================================\n\n`;

        session.entries.forEach((e, j) => {
            const q = (e.question || '').trim();
            const a = (e.answer || '').trim();
            copyText += `Q${j + 1}: ${q}\n\n`;
            copyText += `A${j + 1}:\n${a}\n\n`;
            copyText += `--------------------------------------------------\n\n`;
        });

        await navigator.clipboard.writeText(copyText.trim());

        if (btn) {
            const originalText = btn.innerHTML;
            btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Copied!</span>';
            btn.classList.add('copied');
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.classList.remove('copied');
            }, 2000);
        }
    } catch (err) {
        console.error('Failed to copy session:', err);
        alert('Failed to copy session: ' + err.message);
    }
}

async function deleteHistorySession(id, sessionNumOverride) {
    const idx = currentHistorySessions.findIndex(s => String(s.id) === String(id));
    const sessionObj = idx >= 0 ? currentHistorySessions[idx] : null;
    const displayNum = sessionNumOverride || (idx >= 0 ? idx + 1 : id);
    const qCount = sessionObj && Array.isArray(sessionObj.entries) ? sessionObj.entries.length : 1;

    const confirmed = await showConfirmModal({
        badge: 'CONFIRM DELETION',
        variant: 'danger',
        title: `Do you really want to delete Session #${displayNum}?`,
        description: 'This interview session will be moved to your Persistent Recycle Bin. You can restore it anytime from Settings Matrix.',
        metaText: `Session #${displayNum} • ${qCount} Q&A • Safe Soft-Delete`,
        confirmText: 'Yes, Delete Session',
        cancelText: 'No, Keep It',
    });
    if (!confirmed) return;

    try {
        const res = await fetch(`${API_BASE}/api/history/${id}`, { method: 'DELETE' });
        if (res.ok) {
            loadHistory(true);
            loadRecycleBin();
        } else {
            alert('Delete failed');
        }
    } catch (e) { alert('Delete failed: ' + e.message); }
}

async function clearAllHistory() {
    const totalCount = currentHistorySessions.length;
    const confirmed = await showConfirmModal({
        badge: 'ARCHIVE ACTION',
        variant: 'danger',
        title: 'Do you really want to clear all sessions?',
        description: 'All recorded interview sessions in your archive will be moved to the Persistent Recycle Bin. Nothing is permanently lost.',
        metaText: `${totalCount || 'All'} Archived Sessions • Moves to Recycle Bin`,
        confirmText: 'Yes, Clear All',
        cancelText: 'Cancel',
    });
    if (!confirmed) return;

    try {
        const res = await fetch(`${API_BASE}/api/history`, { method: 'DELETE' });
        if (res.ok) {
            loadHistory(true);
            loadRecycleBin();
        }
    } catch (e) { alert('Clear failed: ' + e.message); }
}

// ─── About Me ────────────────────────────────────────────────

async function loadAboutMe() {
    try {
        const res = await fetch(`${API_BASE}/api/about-me`);
        const data = await res.json();
        const d = data.data || {};
        if (d.tell_me_about_yourself) document.getElementById('aboutme-intro').value = d.tell_me_about_yourself;
        if (d.strengths) document.getElementById('aboutme-strengths').value = d.strengths;
        if (d.weaknesses) document.getElementById('aboutme-weaknesses').value = d.weaknesses;
        if (d.hobbies) document.getElementById('aboutme-hobbies').value = d.hobbies;
        if (d.facts) document.getElementById('aboutme-facts').value = Array.isArray(d.facts) ? d.facts.join('\n') : d.facts;
    } catch (e) { /* silent */ }
}

async function saveAboutMe() {
    const statusEl = document.getElementById('aboutme-save-status');
    const data = {
        tell_me_about_yourself: document.getElementById('aboutme-intro').value.trim(),
        strengths: document.getElementById('aboutme-strengths').value.trim(),
        weaknesses: document.getElementById('aboutme-weaknesses').value.trim(),
        hobbies: document.getElementById('aboutme-hobbies').value.trim(),
        facts: document.getElementById('aboutme-facts').value.trim().split('\n').filter(l => l.trim()),
    };

    try {
        const res = await fetch(`${API_BASE}/api/about-me`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        const result = await res.json();
        statusEl.classList.remove('hidden');
        statusEl.textContent = 'Saved!';
        statusEl.style.background = 'rgba(80,208,128,0.1)';
        statusEl.style.color = '#50d080';
        setTimeout(() => statusEl.classList.add('hidden'), 3000);
    } catch (e) {
        statusEl.classList.remove('hidden');
        statusEl.textContent = `Error: ${e.message}`;
        statusEl.style.background = 'rgba(239,68,68,0.1)';
        statusEl.style.color = '#ef4444';
    }
}

// ─── Setup: Resume Upload ────────────────────────────────────

const uploadZone = document.getElementById('upload-zone');
const resumeInput = document.getElementById('resume-input');

if (uploadZone) {
    uploadZone.addEventListener('click', () => resumeInput.click());
    uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.style.borderColor = 'var(--accent)'; });
    uploadZone.addEventListener('dragleave', () => { uploadZone.style.borderColor = ''; });
    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault(); uploadZone.style.borderColor = '';
        if (e.dataTransfer.files.length) { resumeInput.files = e.dataTransfer.files; uploadResume(e.dataTransfer.files[0]); }
    });
    resumeInput.addEventListener('change', () => { if (resumeInput.files.length) uploadResume(resumeInput.files[0]); });

    const reuploadBtn = document.getElementById('reupload-btn');
    if (reuploadBtn) {
        reuploadBtn.addEventListener('click', () => {
            document.getElementById('upload-zone').classList.remove('hidden');
            document.getElementById('resume-status').classList.add('hidden');
        });
    }
}

async function uploadResume(file) {
    const formData = new FormData();
    formData.append('file', file);
    try {
        uploadZone.querySelector('p').textContent = 'Uploading...';
        const res = await fetch(`${API_BASE}/upload/resume`, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.status === 'success') {
            document.getElementById('resume-status').classList.remove('hidden');
            document.getElementById('resume-filename').textContent = file.name;
            renderResumeTags(data.parsed_sections);
            uploadZone.classList.add('hidden');
            updateChecklist('check-resume', true);
            document.getElementById('autofill-bar').style.display = '';
        } else { uploadZone.querySelector('p').textContent = 'Upload failed: ' + (data.error || 'Unknown'); }
    } catch (e) { uploadZone.querySelector('p').textContent = 'Upload error: ' + e.message; }
}

// ─── Setup: GitHub Import ────────────────────────────────────

document.getElementById('github-fetch-btn')?.addEventListener('click', async () => {
    const username = document.getElementById('github-username').value.trim();
    if (!username) return alert('Enter your GitHub username');
    
    const fetchBtn = document.getElementById('github-fetch-btn');
    const container = document.getElementById('github-repo-list-container');
    const checkboxesDiv = document.getElementById('github-repo-checkboxes');
    const importBtn = document.getElementById('github-import-btn');
    const statusEl = document.getElementById('github-status');

    fetchBtn.disabled = true;
    fetchBtn.textContent = '...';
    statusEl.classList.add('hidden');

    try {
        const res = await fetch(`${API_BASE}/github/repos/${username}`);
        const data = await res.json();
        
        if (data.status !== 'success') {
            throw new Error(data.error || 'Failed to fetch repos');
        }

        const repos = data.repos;
        if (repos.length === 0) {
            alert('No public repositories found for this user.');
            fetchBtn.disabled = false;
            fetchBtn.textContent = 'Fetch';
            return;
        }

        checkboxesDiv.innerHTML = repos.map((repo, i) => `
            <label class="repo-item">
                <input type="checkbox" class="github-repo-check" value="${escapeHtml(repo.name)}">
                <div class="repo-item-content">
                    <span class="repo-item-name"><svg class="i em-i" aria-hidden="true"><use href="#i-github"/></svg>${escapeHtml(repo.name)}</span>
                    <span class="repo-item-desc">${escapeHtml(repo.description || 'No description provided')}</span>
                </div>
            </label>
        `).join('');

        const updateSelectedCount = () => {
            const count = checkboxesDiv.querySelectorAll('.github-repo-check:checked').length;
            importBtn.innerHTML = `<span>Import Selected Repos ${count > 0 ? `(${count})` : ''}</span>`;
            importBtn.disabled = count === 0;
            const selectAllBtn = document.getElementById('github-select-all-btn');
            if (selectAllBtn) {
                const total = checkboxesDiv.querySelectorAll('.github-repo-check').length;
                selectAllBtn.textContent = count === total && total > 0 ? 'Deselect All' : 'Select All';
            }
        };

        checkboxesDiv.querySelectorAll('.github-repo-check').forEach(cb => {
            cb.addEventListener('change', () => {
                const parent = cb.closest('.repo-item');
                if (parent) parent.classList.toggle('selected', cb.checked);
                updateSelectedCount();
            });
        });

        const selectAllBtn = document.getElementById('github-select-all-btn');
        if (selectAllBtn) {
            selectAllBtn.onclick = () => {
                const allChecks = Array.from(checkboxesDiv.querySelectorAll('.github-repo-check'));
                const anyUnchecked = allChecks.some(c => !c.checked);
                allChecks.forEach(c => {
                    c.checked = anyUnchecked;
                    const parent = c.closest('.repo-item');
                    if (parent) parent.classList.toggle('selected', anyUnchecked);
                });
                selectAllBtn.textContent = anyUnchecked ? 'Deselect All' : 'Select All';
                updateSelectedCount();
            };
        }

        container.classList.remove('hidden');
        updateSelectedCount();

    } catch (e) {
        alert(e.message);
    } finally {
        fetchBtn.disabled = false;
        fetchBtn.textContent = 'Fetch';
    }
});

document.getElementById('github-import-btn')?.addEventListener('click', async () => {
    const username = document.getElementById('github-username').value.trim();
    if (!username) return alert('Enter your GitHub username');
    
    // Gather selected repos
    const checkboxes = document.querySelectorAll('.github-repo-check:checked');
    if (checkboxes.length === 0) return alert('Please select at least one repository to import.');
    if (checkboxes.length > 10) return alert('Please select a maximum of 10 repositories.');
    
    const selectedRepos = Array.from(checkboxes).map(cb => cb.value).join(',');
    
    const statusEl = document.getElementById('github-status');
    const importBtn = document.getElementById('github-import-btn');

    const formData = new FormData();
    formData.append('username', username);
    formData.append('repos', selectedRepos);

    statusEl.classList.remove('hidden');
    statusEl.textContent = '⏳ Fetching code & structure...';
    statusEl.style.background = 'rgba(108,92,231,0.1)';
    statusEl.style.color = 'var(--accent)';
    importBtn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/github/import`, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.status === 'success') {
            statusEl.textContent = `Imported ${data.repos_imported} repos from @${username}`;
            statusEl.style.background = 'rgba(80,208,128,0.1)'; statusEl.style.color = '#50d080';
            updateChecklist('check-github', true);
        } else { statusEl.textContent = '' + (data.error || 'Failed'); statusEl.style.color = '#ef4444'; }
    } catch (e) { statusEl.textContent = '' + e.message; statusEl.style.color = '#ef4444'; }
    finally { importBtn.disabled = false; }
});


// ─── Toolbelt helpers: resume sections and the skills a job post asks for ───

const RESUME_SECTION_LABELS = { summary: 'Summary', experience: 'Experience', projects: 'Projects', skills: 'Skills', education: 'Education', achievements: 'Achievements', certifications: 'Certifications' };
function renderResumeTags(sections) {
    const box = document.getElementById('resume-meta-tags');
    if (!box) return;
    const found = (sections || []).filter(k => RESUME_SECTION_LABELS[k]);
    box.innerHTML = found.map(k => `<span class="resume-meta-pill"><svg class="i em-i" aria-hidden="true"><use href="#i-check"/></svg>${RESUME_SECTION_LABELS[k]}</span>`).join('');
}

// Skills recruiters write into job posts, across fields; the first matches become chips
const JD_SKILLS = ['Python', 'Java', 'JavaScript', 'TypeScript', 'SQL', 'Excel', 'Power BI', 'Tableau', 'React', 'Node.js', 'AWS', 'Azure', 'Docker', 'Kubernetes',
    'Machine Learning', 'LLMs', 'RAG', 'Data Analysis', 'Statistics', 'APIs', 'Git', 'Figma', 'Photoshop', 'Canva', 'UI/UX', 'User Research', 'Prototyping',
    'SEO', 'SEM', 'Google Analytics', 'Google Ads', 'Content Marketing', 'Social Media', 'Copywriting', 'Email Marketing', 'Brand Strategy', 'Market Research',
    'CRM', 'Salesforce', 'HubSpot', 'Lead Generation', 'Negotiation', 'B2B Sales', 'Account Management', 'Customer Success', 'Cold Calling',
    'Financial Modelling', 'Valuation', 'Accounting', 'Tally', 'GST', 'Audit', 'Budgeting', 'Forecasting', 'Risk Management', 'Compliance', 'Investment Banking',
    'Project Management', 'Agile', 'Scrum', 'Stakeholder Management', 'Supply Chain', 'Logistics', 'Inventory', 'Procurement', 'Six Sigma', 'Operations',
    'Patient Care', 'Nursing', 'Triage', 'BLS', 'ACLS', 'EHR', 'Medication Administration', 'Infection Control', 'Clinical Documentation', 'ICU', 'OPD', 'Pharmacology',
    'Teaching', 'Curriculum', 'Lesson Planning', 'Classroom Management', 'Legal Research', 'Drafting', 'Contracts', 'Litigation', 'Due Diligence',
    'Hospitality', 'Front Office', 'Guest Relations', 'Food & Beverage', 'Communication', 'Leadership', 'Teamwork', 'Problem Solving', 'Presentation', 'Hindi', 'English'];
function detectJdSkills(text) {
    const t = ` ${String(text || '').toLowerCase()} `;
    const esc = w => w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return JD_SKILLS.filter(w => new RegExp(`[^a-z0-9]${esc(w)}[^a-z0-9]`).test(t)).slice(0, 14);
}
const JD_TONES = ['emerald', 'blue', 'purple', 'orange', 'slate'];
function renderJdChips(text) {
    const list = document.getElementById('jd-chips-list');
    if (!list) return;
    const found = detectJdSkills(text);
    list.innerHTML = found.length
        ? found.map((w, i) => `<span class="badge-pill badge-pill-${JD_TONES[i % JD_TONES.length]}">${escapeHtml(w)}</span>`).join('')
        : `<span class="jd-chips-empty">${text && text.trim() ? 'No common skills spotted, and that is fine' : 'They appear as you paste'}</span>`;
}
// not added yet / unsaved changes / saved
function setJdState(state) {
    const badge = document.getElementById('jd-status-badge'), sync = document.getElementById('jd-sync-badge');
    const look = { empty: ['slate', 'NOT ADDED YET'], dirty: ['orange', 'UNSAVED CHANGES'], saved: ['emerald', 'SAVED'] }[state];
    if (badge) { badge.className = `badge-pill badge-pill-${look[0]}`; badge.innerHTML = `<span class="badge-dot"></span>${look[1]}`; }
    if (sync) sync.style.display = state === 'saved' ? 'inline-flex' : 'none';
}

// ─── Setup: Job Description ──────────────────────────────────

document.getElementById('jd-save-btn')?.addEventListener('click', async () => {
    const title = document.getElementById('jd-title').value.trim();
    const company = document.getElementById('jd-company').value.trim();
    const desc = document.getElementById('jd-content').value.trim();
    if (!desc) { document.getElementById('jd-content').focus(); setJdState('empty'); return; }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('company', company);
    formData.append('description', desc);

    const statusEl = document.getElementById('jd-status');
    const syncBadge = document.getElementById('jd-sync-badge');
    try {
        const res = await fetch(`${API_BASE}/context/job-description`, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.status === 'success') {
            setJdState('saved');
            if (statusEl) {
                statusEl.classList.remove('hidden');
                statusEl.innerHTML = `<span class="badge-pill badge-pill-emerald"><span class="badge-dot"></span>${data.message || 'Saved. Questions and answers now follow this job post.'}</span>`;
                statusEl.style.background = 'transparent';
                statusEl.style.border = 'none';
                statusEl.style.padding = '6px 0';
            }
        } else {
            if (statusEl) {
                statusEl.classList.remove('hidden');
                statusEl.innerHTML = `<span class="badge-pill badge-pill-rose"><span class="badge-dot"></span>${data.error || 'Failed to save spec'}</span>`;
                statusEl.style.background = 'transparent';
                statusEl.style.border = 'none';
                statusEl.style.padding = '6px 0';
            }
        }
    } catch (e) {
        if (statusEl) {
            statusEl.classList.remove('hidden');
            statusEl.innerHTML = `<span class="badge-pill badge-pill-rose"><span class="badge-dot"></span>${e.message}</span>`;
            statusEl.style.background = 'transparent';
            statusEl.style.border = 'none';
            statusEl.style.padding = '6px 0';
        }
    }
});

// JD Editor Character Counter & Clear
const jdTextarea = document.getElementById('jd-content');
const jdCharCount = document.getElementById('jd-char-count');
if (jdTextarea && jdCharCount) {
    let chipTimer = 0;
    const updateJdCharCount = () => {
        jdCharCount.textContent = `${jdTextarea.value.length.toLocaleString()} characters`;
        clearTimeout(chipTimer);
        chipTimer = setTimeout(() => renderJdChips(jdTextarea.value), 200);
    };
    jdTextarea.addEventListener('input', () => { updateJdCharCount(); setJdState(jdTextarea.value.trim() ? 'dirty' : 'empty'); });
    updateJdCharCount();
}

document.getElementById('jd-clear-btn')?.addEventListener('click', async () => {
    const confirmed = await showConfirmModal({
        badge: 'JOB DESCRIPTION',
        variant: 'warning',
        title: 'Clear the job description?',
        description: 'This empties the editor. What you saved earlier stays until you save again.',
        metaText: 'job-post.txt',
        confirmText: 'Clear it',
        cancelText: 'Cancel',
    });
    if (confirmed && jdTextarea) {
        jdTextarea.value = '';
        if (jdCharCount) jdCharCount.textContent = '0 characters';
        renderJdChips('');
        setJdState('dirty');
    }
});

// ─── Setup UI Logic ──────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const panel = document.getElementById(`panel-${btn.dataset.tab}`);
        if (panel) panel.classList.add('active');
    });
});

// ─── Setup: Custom Context (Projects, Experience, etc.) ──────

const contextData = { projects: [], experience: [], skills: { tags: [], strongest: '', learning: '' }, stories: [], qa_bank: [] };

document.getElementById('project-add-btn')?.addEventListener('click', () => {
    const name = document.getElementById('project-name').value.trim();
    if (!name) return;
    contextData.projects.push({
        name, tech_stack: document.getElementById('project-tech').value.trim(),
        role: document.getElementById('project-role').value.trim(),
        description: document.getElementById('project-desc').value.trim(),
        challenges: document.getElementById('project-challenges').value.trim(),
    });
    ['project-name','project-tech','project-role','project-desc','project-challenges'].forEach(id => document.getElementById(id).value = '');
    renderContextList('projects');
});

document.getElementById('exp-add-btn')?.addEventListener('click', () => {
    const company = document.getElementById('exp-company').value.trim();
    if (!company) return;
    contextData.experience.push({
        company, role: document.getElementById('exp-role').value.trim(),
        duration: document.getElementById('exp-duration').value.trim(),
        type: document.getElementById('exp-type').value.trim(),
        details: document.getElementById('exp-desc').value.trim(),
    });
    ['exp-company','exp-role','exp-duration','exp-type','exp-desc'].forEach(id => document.getElementById(id).value = '');
    renderContextList('experience');
});

document.getElementById('story-add-btn')?.addEventListener('click', () => {
    const title = document.getElementById('story-title').value.trim();
    if (!title) return;
    contextData.stories.push({
        type: document.getElementById('story-type').value, title,
        content: document.getElementById('story-content').value.trim(),
    });
    ['story-type','story-title','story-content'].forEach(id => { const el = document.getElementById(id); el.value = ''; });
    renderContextList('stories');
});

document.getElementById('qa-add-btn')?.addEventListener('click', () => {
    const q = document.getElementById('qa-question').value.trim();
    if (!q) return;
    contextData.qa_bank.push({ question: q, answer: document.getElementById('qa-answer').value.trim() });
    document.getElementById('qa-question').value = ''; document.getElementById('qa-answer').value = '';
    renderContextList('qabank');
});

document.getElementById('assign-save-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('assign-save-btn');
    const statusEl = document.getElementById('assign-save-status');
    
    const payload = {
        company: document.getElementById('assign-company').value,
        title: document.getElementById('assign-title').value,
        details: document.getElementById('assign-details').value,
        key_points: document.getElementById('assign-keypoints').value,
    };
    
    try {
        btn.disabled = true;
        btn.querySelector('span').textContent = 'Saving...';
        const res = await fetch(`${API_BASE}/context/assignment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        
        statusEl.classList.remove('hidden');
        if (data.status === 'success') {
            statusEl.textContent = 'Assignment saved successfully!';
            statusEl.style.background = 'rgba(80,208,128,0.1)';
            statusEl.style.color = '#50d080';
        } else {
            statusEl.textContent = '' + (data.error || 'Failed to save');
            statusEl.style.background = 'rgba(239,68,68,0.1)';
            statusEl.style.color = '#ef4444';
        }
    } catch (e) {
        statusEl.classList.remove('hidden');
        statusEl.textContent = '' + e.message;
        statusEl.style.background = 'rgba(239,68,68,0.1)';
        statusEl.style.color = '#ef4444';
    } finally {
        btn.disabled = false;
        btn.querySelector('span').textContent = '+ Save Assignment Context';
        setTimeout(() => statusEl.classList.add('hidden'), 4000);
    }
});

document.getElementById('skill-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const val = e.target.value.trim();
        if (val && !contextData.skills.tags.includes(val)) {
            contextData.skills.tags.push(val);
            e.target.value = '';
            renderSkillTags();
        }
    }
});

function renderSkillTags() {
    renderToolbeltSummary();
    const container = document.getElementById('skill-tags');
    if (!container) return;
    if (!contextData.skills.tags || contextData.skills.tags.length === 0) {
        container.innerHTML = '<span style="font-size:12px; color:var(--ink-muted); font-family:var(--font-mono);">No skills added yet. Type a skill above and press Enter.</span>';
    } else {
        container.innerHTML = contextData.skills.tags.map((s, i) =>
            `<span class="skill-tag-pill"><span class="skill-tag-icon"><svg class="i em-i" aria-hidden="true"><use href="#i-lightning"/></svg></span><span>${escapeHtml(s)}</span><span class="skill-tag-del" onclick="removeSkill(${i})" title="Remove skill">×</span></span>`
        ).join('');
    }
    const countEl = document.getElementById('count-skills');
    if (countEl) countEl.textContent = contextData.skills.tags.length;
}

async function removeSkill(i) {
    const skillName = contextData.skills.tags[i];
    if (!skillName) return;
    const confirmed = await showConfirmModal({
        badge: 'CONFIRM DELETION',
        variant: 'danger',
        title: `Do you really want to delete "${skillName}"?`,
        description: 'This skill tag will be removed from your active toolbelt list.',
        metaText: `Skill Tag • ${skillName}`,
        confirmText: 'Yes, Delete',
        cancelText: 'No, Keep It',
    });
    if (!confirmed) return;
    contextData.skills.tags.splice(i, 1);
    renderSkillTags();
}

// Context lists in the Toolbelt: every item is an editable card; each change saves through updateContextItem
const CTX_FIELDS = {
    qabank: [['question', 'input', 'Question'], ['answer', 'textarea', 'Answer', 3]],
    stories: [['title', 'input', 'Story title'], ['content', 'textarea', 'Situation, task, action, result', 3, 'situation']],
    projects: [['name', 'input', 'Project name'], ['tech_stack', 'textarea', 'Tech stack', 2], ['role', 'input', 'Your role (Lead, Solo dev...)'], ['description', 'textarea', 'What did you build? What problem did it solve?', 3, 'details'], ['challenges', 'textarea', 'Key challenges and how you solved them', 3]],
    experience: [['company', 'input', 'Company name'], ['role', 'input', 'Role or job title'], ['duration', 'input', 'Duration (e.g. Jan 2023 to present)'], ['details', 'textarea', 'Key achievements', 3, 'achievements']],
};
function renderContextList(type) {
    const map = { projects: contextData.projects, experience: contextData.experience, stories: contextData.stories, qabank: contextData.qa_bank };
    const items = map[type] || [];
    const listEl = document.getElementById(`list-${type}`);
    const countEl = document.getElementById(`count-${type}`);
    if (countEl) countEl.textContent = items.length;
    renderToolbeltSummary();
    if (!listEl) return;
    const fields = CTX_FIELDS[type] || [];
    listEl.innerHTML = items.map((item, i) => `
        <div class="ctx-item" data-i="${i}">
            <div class="ctx-item-head">
                <span class="ctx-item-no">${type === 'qabank' ? `Q&amp;A ${i + 1}` : `#${i + 1}`}</span>
                <button type="button" class="ctx-remove" onclick="removeContextItem('${type}',${i})" aria-label="Remove this item"><svg aria-hidden="true"><use href="#i-x-bold"/></svg></button>
            </div>
            ${fields.map(([key, tag, label, rows, alt]) => {
                const value = escapeHtml(item[key] || (alt && item[alt]) || '');
                return tag === 'input'
                    ? `<input type="text" class="ctx-field${key === fields[0][0] ? ' ctx-title' : ''}" placeholder="${label}" aria-label="${label}" value="${value}" onchange="updateContextItem('${type}', ${i}, '${key}', this.value)">`
                    : `<textarea class="ctx-field" rows="${rows}" placeholder="${label}" aria-label="${label}" onchange="updateContextItem('${type}', ${i}, '${key}', this.value)">${value}</textarea>`;
            }).join('')}
        </div>`).join('');
    if (type === 'qabank') filterQaBank();
}

// Q&A bank search: hides the pairs that do not match, as you type
function filterQaBank() {
    const q = (document.getElementById('qa-search')?.value || '').trim().toLowerCase();
    document.querySelectorAll('#list-qabank .ctx-item').forEach(el => {
        const item = contextData.qa_bank[Number(el.dataset.i)] || {};
        el.hidden = Boolean(q) && !`${item.question || ''} ${item.answer || ''}`.toLowerCase().includes(q);
    });
}
document.getElementById('qa-search')?.addEventListener('input', filterQaBank);

// The summary strip: what the copilot knows about you, each chip jumps to its section
function renderToolbeltSummary() {
    const strip = document.getElementById('tb-summary');
    if (!strip) return;
    const role = contextData.assignment?.title;
    const parts = [
        ['skills', 'lightning', 'Skills', contextData.skills.tags.length],
        ['projects', 'wand', 'Projects', contextData.projects.length],
        ['experience', 'briefcase', 'Experience', contextData.experience.length],
        ['stories', 'books', 'STAR stories', contextData.stories.length],
        ['qabank', 'list-checks', 'Q&amp;A bank', contextData.qa_bank.length],
        ['assignment', 'target', role ? escapeHtml(role) : 'Target role', role ? 1 : 0],
    ];
    strip.innerHTML = parts.map(([tab, icon, label, n], i) => `
        <button type="button" class="tb-chip${n ? ' is-filled' : ''}" data-tab-jump="${tab}" style="--i:${i}">
            <svg aria-hidden="true"><use href="#i-${icon}"/></svg><span class="tb-label">${label}</span>
            ${tab === 'assignment' ? '' : `<b class="num">${n}</b>`}
            <span class="tb-state" aria-hidden="true">${n ? '<svg><use href="#i-check-bold"/></svg>' : '<svg><use href="#i-plus"/></svg>'}</span>
        </button>`).join('');
}
renderToolbeltSummary();
document.getElementById('tb-summary')?.addEventListener('click', e => {
    const b = e.target.closest('[data-tab-jump]');
    if (!b) return;
    document.querySelector(`.tab-btn[data-tab="${b.dataset.tabJump}"]`)?.click();
    document.getElementById('context-card')?.scrollIntoView({ behavior: Motion.calm() ? 'auto' : 'smooth', block: 'start' });
});

function updateContextItem(type, i, field, value) {
    const map = { projects: 'projects', experience: 'experience', stories: 'stories', qabank: 'qa_bank' };
    contextData[map[type]][i][field] = value;
}

async function removeContextItem(type, i) {
    const map = { projects: 'projects', experience: 'experience', stories: 'stories', qabank: 'qa_bank' };
    const list = contextData[map[type]] || [];
    const item = list[i];
    const itemLabel = item?.name || item?.company || item?.title || item?.question || `${type} item #${i + 1}`;

    const confirmed = await showConfirmModal({
        badge: 'CONFIRM DELETION',
        variant: 'danger',
        title: `Do you really want to delete "${itemLabel.substring(0, 42)}${itemLabel.length > 42 ? '...' : ''}"?`,
        description: 'This item will be removed from your custom background modules list.',
        metaText: `Module: ${type.toUpperCase()} • Item #${i + 1}`,
        confirmText: 'Yes, Delete',
        cancelText: 'No, Keep It',
    });
    if (!confirmed) return;

    list.splice(i, 1);
    renderContextList(type);
}

// ─── Save All Context ────────────────────────────────────────

document.getElementById('save-all-context-btn')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('context-save-status');
    contextData.skills.strongest = document.getElementById('skill-strongest')?.value || '';
    contextData.skills.learning = document.getElementById('skill-learning')?.value || '';

    const payload = {
        projects: contextData.projects,
        experience: contextData.experience,
        skills: { tags: contextData.skills.tags.join(', '), strongest: contextData.skills.strongest, learning: contextData.skills.learning },
        stories: contextData.stories,
        qa_bank: contextData.qa_bank,
    };

    // Also save quick notes
    const notes = document.getElementById('quick-notes-content')?.value?.trim();
    if (notes) {
        try { await fetch(`${API_BASE}/context/notes`, { method: 'POST', body: new URLSearchParams({ notes }) }); } catch (e) {}
    }

    try {
        const res = await fetch(`${API_BASE}/context/structured`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        const data = await res.json();
        statusEl.classList.remove('hidden');
        statusEl.textContent = data.status === 'success' ? 'All context saved!' : '' + (data.error || 'Failed');
        statusEl.style.background = data.status === 'success' ? 'rgba(80,208,128,0.1)' : 'rgba(239,68,68,0.1)';
        statusEl.style.color = data.status === 'success' ? '#50d080' : '#ef4444';
        setTimeout(() => statusEl.classList.add('hidden'), 4000);
    } catch (e) {
        statusEl.classList.remove('hidden'); statusEl.textContent = '' + e.message;
        statusEl.style.background = 'rgba(239,68,68,0.1)'; statusEl.style.color = '#ef4444';
    }
});

// ─── Auto-fill from Resume ───────────────────────────────────

document.getElementById('autofill-btn')?.addEventListener('click', async () => {
    try {
        const res = await fetch(`${API_BASE}/context/resume-extract`);
        const data = await res.json();
        if (data.error) return alert(data.error);

        if (data.skills && Array.isArray(data.skills)) {
            contextData.skills.tags = [...new Set([...contextData.skills.tags, ...data.skills])];
            renderSkillTags();
        }
        document.getElementById('autofill-bar').style.display = 'none';
        alert('Skills auto-filled from resume!');
    } catch (e) { alert('Auto-fill failed: ' + e.message); }
});

// ─── Quick Notes Toggle ──────────────────────────────────────

document.getElementById('quick-notes-toggle')?.addEventListener('click', () => {
    const body = document.getElementById('quick-notes-body');
    body.style.display = body.style.display === 'none' ? '' : 'none';
});

// ─── Server Connection ──────────────────────────────────────

document.getElementById('server-connect-btn')?.addEventListener('click', checkServerConnection);

async function checkServerConnection() {
    const url = document.getElementById('server-url-input')?.value.trim() || `${API_BASE}/api/health`;
    const statusText = document.getElementById('server-status-text');
    const statusPill = document.getElementById('server-status-pill');
    const statusDot = document.querySelector('#server-status .status-dot');
    const sidebarDot = document.querySelector('#sidebar-status .status-dot');
    const sidebarLabel = document.querySelector('#sidebar-status .status-label');
    const telemetryPing = document.getElementById('telemetry-ping');
    const telemetryEngine = document.getElementById('telemetry-engine');

    if (statusText) statusText.textContent = 'Pinging engine daemon...';
    const t0 = performance.now();
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const pingTime = Math.round(performance.now() - t0);
        const data = await res.json();
        if (data.status === 'running') {
            if (statusText) statusText.textContent = `Connected — ${data.name} v${data.version}`;
            if (statusDot) { statusDot.className = 'status-dot online'; }
            if (statusPill) {
                statusPill.className = 'badge-pill badge-pill-emerald pulse-dot';
                statusPill.innerHTML = '<span class="badge-dot"></span>SERVER ONLINE';
            }
            if (telemetryPing) telemetryPing.innerHTML = `<svg class="i em-i" aria-hidden="true"><use href="#i-lightning"/></svg>${pingTime}ms ping`;
            if (telemetryEngine) telemetryEngine.textContent = `${data.name} v${data.version}`;
            if (sidebarDot) { sidebarDot.className = 'status-dot online'; }
            if (sidebarLabel) sidebarLabel.textContent = 'Online';
            updateChecklist('check-server', true);
        } else {
            if (statusText) statusText.textContent = 'Unexpected response';
            if (statusDot) { statusDot.className = 'status-dot offline'; }
            if (statusPill) {
                statusPill.className = 'badge-pill badge-pill-rose';
                statusPill.innerHTML = '<span class="badge-dot"></span>SERVER OFFLINE';
            }
        }
    } catch (e) {
        if (statusText) statusText.textContent = `Offline: ${e.message}`;
        if (statusDot) { statusDot.className = 'status-dot offline'; }
        if (statusPill) {
            statusPill.className = 'badge-pill badge-pill-rose';
            statusPill.innerHTML = '<span class="badge-dot"></span>SERVER OFFLINE';
        }
        if (sidebarDot) sidebarDot.className = 'status-dot offline';
        if (sidebarLabel) sidebarLabel.textContent = 'Offline';
        updateChecklist('check-server', false);
    }
}

function updateChecklist(id, done) {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === 'check-resume') {
        el.className = done ? 'badge-pill badge-pill-emerald' : 'badge-pill badge-pill-slate';
        el.innerHTML = done ? '<span class="badge-dot"></span>PARSED' : '<span class="badge-dot"></span>PENDING';
    } else if (id === 'check-github') {
        el.className = done ? 'badge-pill badge-pill-emerald' : 'badge-pill badge-pill-slate';
        el.innerHTML = done ? '<span class="badge-dot"></span>INDEXED' : '<span class="badge-dot"></span>PENDING';
    } else if (id === 'check-server') {
        el.className = done ? 'badge-pill badge-pill-emerald' : 'badge-pill badge-pill-rose';
        el.innerHTML = done ? '<span class="badge-dot"></span>CONNECTED' : '<span class="badge-dot"></span>OFFLINE';
    } else if (id === 'check-overlay') {
        el.className = done ? 'badge-pill badge-pill-emerald' : 'badge-pill badge-pill-orange';
        el.innerHTML = done ? '<span class="badge-dot"></span>SYNCED' : '<span class="badge-dot"></span>PENDING';
    }

    // Update overall checklist progress pill
    const resumeDone = document.getElementById('check-resume')?.classList.contains('badge-pill-emerald');
    const githubDone = document.getElementById('check-github')?.classList.contains('badge-pill-emerald');
    const serverDone = document.getElementById('check-server')?.classList.contains('badge-pill-emerald');
    const overlayDone = document.getElementById('check-overlay')?.classList.contains('badge-pill-emerald');
    const count = [resumeDone, githubDone, serverDone, overlayDone].filter(Boolean).length;
    const progressPill = document.getElementById('checklist-progress-pill');
    if (progressPill) {
        progressPill.innerHTML = `<span class="badge-dot"></span>${count}/4 READY`;
        progressPill.className = count === 4 ? 'badge-pill badge-pill-emerald' : 'badge-pill badge-pill-orange';
    }
}

// ─── Utilities ───────────────────────────────────────────────

function escapeHtml(text) {
    if (!text) return '';
    return text.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ─── Load existing data on page load ────────────────────────

window.addEventListener('DOMContentLoaded', () => {
    const serverUrlInput = document.getElementById('server-url-input');
    if (serverUrlInput) {
        serverUrlInput.value = `${API_BASE}/api/health`;
    }
    
    restoreChatMessages();
    setTimeout(checkServerConnection, 1500);

    // Load existing context status from server
    setTimeout(async () => { 
        try {
            const res = await fetch(`${API_BASE}/context`);
            const data = await res.json();

            // If resume exists, show status
            if (data.resume) {
                const rs = document.getElementById('resume-status');
                if (rs) rs.classList.remove('hidden');
                const rfn = document.getElementById('resume-filename');
                if (rfn) rfn.textContent = data.resume_file || 'Your resume';
                renderResumeTags(typeof data.resume === 'object' && data.resume ? Object.keys(data.resume) : []);
                const uz = document.getElementById('upload-zone');
                if (uz) uz.classList.add('hidden');
                updateChecklist('check-resume', true);
            }

            // If GitHub exists
            if (data.github && data.github.username) {
                const guser = document.getElementById('github-username');
                if (guser) guser.value = data.github.username;
                const gbtn = document.getElementById('github-fetch-btn');
                if (gbtn) gbtn.textContent = 'Synced';
                updateChecklist('check-github', true);
                
                const gs = document.getElementById('github-status');
                if (gs) {
                    gs.classList.remove('hidden');
                    if (data.github.repos && data.github.repos.length > 0) {
                        const repoBadges = data.github.repos.map(r => `
                            <span class="repo-badge">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/></svg>
                                ${escapeHtml(r.name)}
                                <span class="repo-badge-sub">Indexed</span>
                            </span>
                        `).join('');
                        gs.innerHTML = `<div class="repo-badge-grid">${repoBadges}</div>`;
                        gs.style.background = 'transparent';
                        gs.style.border = 'none';
                        gs.style.padding = '0';
                    } else {
                        gs.innerHTML = `<span class="badge-pill badge-pill-emerald"><span class="badge-dot"></span>GITHUB PROFILE CONNECTED</span>`;
                    }
                }
            }

            // Show context length
            if (data.full_context_length > 100) {
                console.log(`Context loaded: ${data.full_context_length} chars`);
            }
        } catch (e) {
            console.log('Server not reachable for context check');
        }

        // Load existing assignment context
        try {
            const res = await fetch(`${API_BASE}/context/assignment`);
            if (res.ok) {
                const adata = await res.json();
                if (adata.company) document.getElementById('assign-company').value = adata.company;
                if (adata.title) document.getElementById('assign-title').value = adata.title;
                if (adata.details) document.getElementById('assign-details').value = adata.details;
                if (adata.key_points) document.getElementById('assign-keypoints').value = adata.key_points;
                if (adata.company || adata.details) {
                    document.getElementById('count-assignment').textContent = '1';
                }
            }
        } catch (e) { /* silent */ }

        // Load existing job description context
        try {
            const res = await fetch(`${API_BASE}/context/job-description`);
            if (res.ok) {
                const jdata = await res.json();
                if (jdata.title) document.getElementById('jd-title').value = jdata.title;
                if (jdata.company) document.getElementById('jd-company').value = jdata.company;
                if (jdata.description) {
                    document.getElementById('jd-content').value = jdata.description;
                    const charCountEl = document.getElementById('jd-char-count');
                    if (charCountEl) charCountEl.textContent = `${jdata.description.length.toLocaleString()} characters`;
                    renderJdChips(jdata.description);
                    setJdState('saved');
                    updateChecklist('check-overlay', true);
                }
            }
        } catch (e) { /* silent */ }

        // Load existing structured context
        try {
            const res = await fetch(`${API_BASE}/context/structured`);
            if (res.ok) {
                const sdata = await res.json();
                if (sdata.projects) {
                    contextData.projects = sdata.projects;
                    renderContextList('projects');
                }
                if (sdata.experience) {
                    contextData.experience = sdata.experience;
                    renderContextList('experience');
                }
                if (sdata.stories) {
                    contextData.stories = sdata.stories;
                    renderContextList('stories');
                }
                if (sdata.qa_bank) {
                    contextData.qa_bank = sdata.qa_bank;
                    renderContextList('qabank');
                }
                if (sdata.skills && sdata.skills.tags) {
                    const tags = typeof sdata.skills.tags === 'string'
                        ? sdata.skills.tags.split(',').map(s => s.trim()).filter(Boolean)
                        : sdata.skills.tags;
                    contextData.skills.tags = tags;
                    renderSkillTags();
                    if (sdata.skills.strongest) document.getElementById('skill-strongest').value = sdata.skills.strongest;
                    if (sdata.skills.learning) document.getElementById('skill-learning').value = sdata.skills.learning;
                }
            }
        } catch (e) { /* silent */ }

        // Load existing prep questions
        loadPrepQuestions();

        // Load Persistent Recycle Bin
        loadRecycleBin();
    }, 2000);
});

// ─── Persistent Recycle Bin ───────────────────────────────────

let currentRecycleTab = 'chats';
let recycleBinData = { sessions: [], chats: [] };

function switchRecycleTab(tab, btn) {
    currentRecycleTab = tab;
    document.querySelectorAll('.recycle-tabs-nav .tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    const sessionsPanel = document.getElementById('recycle-panel-sessions');
    const chatsPanel = document.getElementById('recycle-panel-chats');
    if (sessionsPanel) sessionsPanel.style.display = tab === 'sessions' ? 'block' : 'none';
    if (chatsPanel) chatsPanel.style.display = tab === 'chats' ? 'block' : 'none';
}

async function loadRecycleBin() {
    try {
        const res = await fetch(`${API_BASE}/api/recycle-bin`);
        if (!res.ok) return;
        const result = await res.json();
        recycleBinData = result.data || { sessions: [], chats: [] };
        renderRecycleBin();
    } catch (e) {
        console.warn('Failed to load recycle bin:', e);
    }
}

function renderRecycleBin() {
    const sessions = recycleBinData.sessions || [];
    const chats = recycleBinData.chats || [];

    const sessCountEl = document.getElementById('recycle-sessions-count');
    const chatCountEl = document.getElementById('recycle-chats-count');
    const totalBadge = document.getElementById('recycle-total-badge');

    if (sessCountEl) sessCountEl.textContent = sessions.length;
    if (chatCountEl) chatCountEl.textContent = chats.length;
    if (totalBadge) totalBadge.textContent = `${chats.length} ITEMS PRESERVED`;

    // Render Chats
    const chatList = document.getElementById('recycle-chats-list');
    if (chatList) {
        if (chats.length === 0) {
            chatList.innerHTML = `
                <div class="recycle-empty-state">
                    <div style="font-size:32px; margin-bottom:8px;"><svg class="i em-i" aria-hidden="true"><use href="#i-chats"/></svg></div>
                    <h4 style="font-family:var(--font-poster); font-size:18px; color:var(--ink-primary);">No Deleted Chats</h4>
                    <p style="font-size:13px; color:var(--ink-secondary); margin-top:4px;">Cleared Live Copilot conversations will be archived here.</p>
                </div>
            `;
        } else {
            chatList.innerHTML = chats.map(batch => {
                const messages = batch.messages || [];
                const deletedDate = batch.deleted_at ? new Date(batch.deleted_at).toLocaleString() : 'Recently';
                const firstUser = messages.find(m => m.role === 'user')?.content || 'No text';
                const snippet = escapeHtml(firstUser.substring(0, 100)) + (firstUser.length > 100 ? '...' : '');
                return `
                    <div class="recycle-item">
                        <div class="recycle-item-header">
                            <div class="recycle-item-title">
                                <span><svg class="i em-i" aria-hidden="true"><use href="#i-book"/></svg>${escapeHtml(batch.title || (firstUser !== 'No text' ? firstUser.split(/\s+/).slice(0, 7).join(' ') : 'An empty chapter'))}</span>
                                <span class="badge-pill badge-pill-blue">${batch.count || messages.length} ${(batch.count || messages.length) === 1 ? 'note' : 'notes'}</span>
                            </div>
                            <span class="recycle-item-meta">Cleared: ${deletedDate}</span>
                        </div>
                        <div class="recycle-item-body">
                            <strong>Sample Message:</strong> "${snippet}"
                        </div>
                        <div class="recycle-item-actions">
                            <button class="recycle-btn-restore" onclick="restoreRecycleItem('chat', '${batch.id}')">↩ Back into the register</button>
                            <button class="recycle-btn-purge" onclick="deleteRecycleItem('chat', '${batch.id}')"><svg class="i em-i" aria-hidden="true"><use href="#i-trash"/></svg>Delete permanently</button>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
}

async function restoreRecycleItem(itemType, id) {
    try {
        const res = await fetch(`${API_BASE}/api/recycle-bin/restore`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_type: itemType, id: String(id) }),
        });
        const data = await res.json();
        if (res.ok) {
            await loadRecycleBin();
            if (itemType === 'chat') {
                await restoreChatMessages();
            }
        } else {
            alert(data.error || 'Failed to restore');
        }
    } catch (e) {
        alert('Restore error: ' + e.message);
    }
}

async function deleteRecycleItem(itemType, id) {
    const label = `Chat Batch #${id}`;
    const confirmed = await showConfirmModal({
        badge: 'PERMANENT PURGE',
        variant: 'danger',
        title: `Do you really want to permanently delete ${label}?`,
        description: `This copilot chat batch will be permanently erased from disk. This action cannot be reversed.`,
        metaText: `${label} • Irreversible Deletion`,
        isDangerMeta: true,
        confirmText: 'Delete Forever',
        cancelText: 'Keep in Bin',
    });
    if (!confirmed) return;

    try {
        const res = await fetch(`${API_BASE}/api/recycle-bin/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ item_type: itemType, id: String(id) }),
        });
        if (res.ok) {
            await loadRecycleBin();
        } else {
            alert('Delete failed');
        }
    } catch (e) {
        alert('Delete error: ' + e.message);
    }
}

async function emptyRecycleBin() {
    const totalItems = (recycleBinData.chats?.length || 0);
    const confirmed = await showConfirmModal({
        badge: 'PERMANENT PURGE',
        variant: 'danger',
        title: 'Do you really want to empty the Recycle Bin?',
        description: 'All soft-deleted copilot chat history will be permanently wiped from storage. This cannot be undone.',
        metaText: `${totalItems} Preserved Items • Permanent Wipe`,
        isDangerMeta: true,
        confirmText: 'Yes, Empty Bin',
        cancelText: 'Cancel',
    });
    if (!confirmed) return;

    try {
        const res = await fetch(`${API_BASE}/api/recycle-bin/empty`, { method: 'POST' });
        if (res.ok) {
            await loadRecycleBin();
        } else {
            alert('Empty failed');
        }
    } catch (e) {
        alert('Empty error: ' + e.message);
    }
}

// ─── Custom Blueprint Confirmation & Prompt Modal Engine ─────

const MODAL_ICONS = {
    danger: `<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line>`,
    warning: `<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>`,
    primary: `<path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>`,
};

const CONFIRM_BTN_ICONS = {
    danger: `<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>`,
    warning: `<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>`,
    primary: `<polyline points="20 6 9 17 4 12"></polyline>`,
};

function ensureAcemateModalDom() {
    let backdrop = document.getElementById('acemate-modal-backdrop');
    if (backdrop) return backdrop;

    backdrop = document.createElement('div');
    backdrop.id = 'acemate-modal-backdrop';
    backdrop.className = 'acemate-modal-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.innerHTML = `
        <div class="acemate-modal-card" role="document">
            <div class="acemate-modal-accent" id="acemate-modal-accent"></div>
            <div class="acemate-modal-topbar">
                <span class="badge-pill badge-pill-rose" id="acemate-modal-badge">
                    <span class="badge-dot"></span>
                    <span id="acemate-modal-badge-text">CONFIRM DELETION</span>
                </span>
                <button type="button" class="acemate-modal-close" id="acemate-modal-close" aria-label="Close modal">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
            <div class="acemate-modal-body">
                <div class="acemate-modal-header-row">
                    <div class="acemate-modal-icon-wrap danger" id="acemate-modal-icon-wrap">
                        <svg id="acemate-modal-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${MODAL_ICONS.danger}</svg>
                    </div>
                    <div class="acemate-modal-copy">
                        <h3 class="acemate-modal-title" id="acemate-modal-title">Do you really want to delete this session?</h3>
                        <p class="acemate-modal-desc" id="acemate-modal-desc">This interview session will be moved to your Persistent Recycle Bin and can be restored anytime.</p>
                    </div>
                </div>
                <div class="acemate-modal-meta-box" id="acemate-modal-meta-box">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                    <span id="acemate-modal-meta-text">Session • Soft Delete • Restorable</span>
                </div>
                <div class="acemate-modal-input-wrap hidden" id="acemate-modal-input-wrap">
                    <label class="acemate-modal-input-label" for="acemate-modal-input" id="acemate-modal-input-label">REFINEMENT INSTRUCTION</label>
                    <input type="text" id="acemate-modal-input" class="acemate-modal-input" placeholder="e.g., Make it more concise..." autocomplete="off">
                </div>
            </div>
            <div class="acemate-modal-footer">
                <button type="button" class="acemate-modal-btn acemate-modal-btn-cancel" id="acemate-modal-cancel">
                    <span id="acemate-modal-cancel-text">No, Keep It</span>
                    <kbd class="acemate-modal-kbd">Esc</kbd>
                </button>
                <button type="button" class="acemate-modal-btn acemate-modal-btn-confirm danger" id="acemate-modal-confirm">
                    <svg id="acemate-modal-confirm-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${CONFIRM_BTN_ICONS.danger}</svg>
                    <span id="acemate-modal-confirm-text">Yes, Delete</span>
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(backdrop);
    return backdrop;
}

function openAcemateModal(config) {
    return new Promise((resolve) => {
        const backdrop = ensureAcemateModalDom();
        const variant = config.variant || 'danger';
        const isPrompt = Boolean(config.isPrompt);

        const accentEl = document.getElementById('acemate-modal-accent');
        const badgeEl = document.getElementById('acemate-modal-badge');
        const badgeTextEl = document.getElementById('acemate-modal-badge-text');
        const iconWrapEl = document.getElementById('acemate-modal-icon-wrap');
        const iconEl = document.getElementById('acemate-modal-icon');
        const titleEl = document.getElementById('acemate-modal-title');
        const descEl = document.getElementById('acemate-modal-desc');
        const metaBoxEl = document.getElementById('acemate-modal-meta-box');
        const metaTextEl = document.getElementById('acemate-modal-meta-text');
        const inputWrapEl = document.getElementById('acemate-modal-input-wrap');
        const inputLabelEl = document.getElementById('acemate-modal-input-label');
        const inputEl = document.getElementById('acemate-modal-input');
        const cancelBtn = document.getElementById('acemate-modal-cancel');
        const cancelTextEl = document.getElementById('acemate-modal-cancel-text');
        const confirmBtn = document.getElementById('acemate-modal-confirm');
        const confirmIconEl = document.getElementById('acemate-modal-confirm-icon');
        const confirmTextEl = document.getElementById('acemate-modal-confirm-text');
        const closeBtn = document.getElementById('acemate-modal-close');

        // Configure variant classes & icons
        accentEl.className = `acemate-modal-accent ${variant}`;
        iconWrapEl.className = `acemate-modal-icon-wrap ${variant}`;
        iconEl.innerHTML = MODAL_ICONS[variant] || MODAL_ICONS.danger;

        if (variant === 'danger') {
            badgeEl.className = 'badge-pill badge-pill-rose';
        } else if (variant === 'warning') {
            badgeEl.className = 'badge-pill badge-pill-orange';
        } else {
            badgeEl.className = 'badge-pill badge-pill-blue';
        }
        badgeTextEl.textContent = config.badge || 'CONFIRM ACTION';

        titleEl.textContent = config.title || 'Do you really want to delete this item?';
        descEl.textContent = config.description || 'Please confirm to proceed with this action.';

        if (config.metaText && !isPrompt) {
            metaBoxEl.classList.remove('hidden');
            metaBoxEl.classList.toggle('danger-meta', Boolean(config.isDangerMeta));
            metaTextEl.textContent = config.metaText;
        } else {
            metaBoxEl.classList.add('hidden');
        }

        if (isPrompt) {
            inputWrapEl.classList.remove('hidden');
            inputLabelEl.textContent = config.inputLabel || 'INPUT';
            inputEl.placeholder = config.placeholder || '';
            inputEl.value = config.defaultValue || '';
        } else {
            inputWrapEl.classList.add('hidden');
        }

        cancelTextEl.textContent = config.cancelText || 'Cancel';
        confirmBtn.className = `acemate-modal-btn acemate-modal-btn-confirm ${variant}`;
        confirmIconEl.innerHTML = CONFIRM_BTN_ICONS[variant] || CONFIRM_BTN_ICONS.danger;
        confirmTextEl.textContent = config.confirmText || 'Confirm';

        const previousActive = document.activeElement;

        function cleanup(result) {
            backdrop.classList.remove('active');
            backdrop.setAttribute('aria-hidden', 'true');
            document.removeEventListener('keydown', onKeyDown);
            backdrop.removeEventListener('mousedown', onBackdropClick);
            cancelBtn.removeEventListener('click', onCancel);
            closeBtn.removeEventListener('click', onCancel);
            confirmBtn.removeEventListener('click', onConfirm);
            if (previousActive && typeof previousActive.focus === 'function') {
                setTimeout(() => previousActive.focus(), 50);
            }
            resolve(result);
        }

        function onCancel() {
            cleanup(isPrompt ? null : false);
        }

        function onConfirm() {
            if (isPrompt) {
                const val = inputEl.value.trim();
                cleanup(val || null);
            } else {
                cleanup(true);
            }
        }

        function onBackdropClick(e) {
            if (e.target === backdrop) {
                onCancel();
            }
        }

        function onKeyDown(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
            } else if (e.key === 'Enter') {
                if (isPrompt && document.activeElement !== inputEl && document.activeElement !== confirmBtn) {
                    return;
                }
                if (document.activeElement === cancelBtn || document.activeElement === closeBtn) {
                    return;
                }
                e.preventDefault();
                onConfirm();
            } else if (e.key === 'Tab') {
                const focusables = [closeBtn, ...(isPrompt ? [inputEl] : []), cancelBtn, confirmBtn];
                const first = focusables[0];
                const last = focusables[focusables.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        }

        document.addEventListener('keydown', onKeyDown);
        backdrop.addEventListener('mousedown', onBackdropClick);
        cancelBtn.addEventListener('click', onCancel);
        closeBtn.addEventListener('click', onCancel);
        confirmBtn.addEventListener('click', onConfirm);

        backdrop.setAttribute('aria-hidden', 'false');
        requestAnimationFrame(() => {
            backdrop.classList.add('active');
            if (isPrompt) {
                setTimeout(() => inputEl.focus(), 60);
            } else {
                // Default focus on Cancel ("No, Keep It") to protect important sessions from accidental keypresses
                setTimeout(() => cancelBtn.focus(), 60);
            }
        });
    });
}

function showConfirmModal(options = {}) {
    return openAcemateModal({ ...options, isPrompt: false });
}

function showPromptModal(options = {}) {
    return openAcemateModal({ ...options, variant: options.variant || 'primary', isPrompt: true });
}

// ─── Home: today at a glance (Brain Bento progress and the Prep answers waiting for review) ───
// the Daybook (daybook.js) owns the home page; it re-reads everything when called
function renderToday() { window.Daybook?.refresh?.(); }
