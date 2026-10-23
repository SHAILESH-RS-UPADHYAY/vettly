/**
 * Vettly — Dashboard & Prep Studio Logic
 * Handles all sections: Setup, Chat, Prep Studio, About Me, Settings
 */

const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:')
    ? 'http://127.0.0.1:8766'
    : (localStorage.getItem('vettly_api_base') || window.location.origin);

// ─── Section Navigation ──────────────────────────────────────

function switchSection(name) {
    document.body.dataset.section = name;
    mentorSyncMode();
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const page = document.getElementById(`page-${name}`);
    const nav = document.querySelector(`.nav-item[data-section="${name}"]`);
    if (page) page.classList.add('active');
    if (nav) nav.classList.add('active');

    // Load data for specific sections
    if (name === 'aboutme') loadAboutMe();
    if (name === 'prep') loadPrepQuestions();
    
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

document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchSection(btn.dataset.section));
});

// Load persistent state on boot
window.addEventListener('DOMContentLoaded', async () => {
    await restoreChatMessages();
    await restoreSetupState();
});

// ─── Hero Mock Typing ────────────────────────────────────────

const mockConversations = [
    { question: "Tell me about a challenging bug you debugged recently.", filler: "Yeah so actually... during my RADAR project we hit this tricky issue with the scraping pipeline...", answer: "So we were using Puppeteer for job scraping, and the DOM selectors kept breaking because LinkedIn changed class names weekly. I built a 3-layer fallback system — CSS selectors first, then XPath, then AI-based element detection. Reduced scraping failures from 40% to under 2%." },
    { question: "How do you handle tight deadlines?", filler: "Hmm that's a good one... I actually had a situation just last month...", answer: "I break deadlines into micro-milestones — daily checkpoints. During my SENTINEL project, we had 2 weeks to build an entire log analysis pipeline. I identified the critical path, cut scope on nice-to-haves, and shipped the core in 10 days." },
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
        expandBtn.innerHTML = '<span>🔍</span><span>Expand Detailed Answer</span>';
        
        const expandedPanel = document.createElement('div');
        expandedPanel.className = 'chat-expanded-panel hidden';

        expandBtn.onclick = async () => {
            if (!expandedPanel.classList.contains('hidden')) {
                expandedPanel.classList.add('hidden');
                expandBtn.innerHTML = '<span>🔍</span><span>Expand Detailed Answer</span>';
                return;
            }

            if (expandedPanel.dataset.loaded === 'true') {
                expandedPanel.classList.remove('hidden');
                expandBtn.innerHTML = '<span>🔼</span><span>Collapse Details</span>';
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
                            <span class="chat-detailed-badge">📖 IN-DEPTH TECHNICAL BREAKDOWN</span>
                        </div>
                        <div class="chat-detailed-body">${formatChatMessage(data.detailed_answer)}</div>
                    `;
                    expandedPanel.dataset.loaded = 'true';
                    expandedPanel.classList.remove('hidden');
                    expandBtn.innerHTML = '<span>🔼</span><span>Collapse Details</span>';
                } else {
                    alert('Could not expand answer: ' + (data.error || 'Unknown error'));
                    expandBtn.innerHTML = '<span>🔍</span><span>Expand Detailed Answer</span>';
                }
            } catch (err) {
                alert('Expand request failed: ' + err.message);
                expandBtn.innerHTML = '<span>🔍</span><span>Expand Detailed Answer</span>';
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

    // Add user bubble
    const userBubble = document.createElement('div');
    userBubble.className = 'chat-bubble user';
    userBubble.textContent = msg;
    messagesDiv.appendChild(userBubble);

    input.value = '';
    input.style.height = 'auto';
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    // Add typing indicator
    const typingBubble = document.createElement('div');
    typingBubble.className = 'chat-bubble assistant typing';
    typingBubble.textContent = 'Thinking...';
    messagesDiv.appendChild(typingBubble);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    chatHistory.push({ role: 'user', content: msg });

    try {
        const res = await fetch(`${API_BASE}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg, history: chatHistory.slice(-20) }),
        });
        const data = await res.json();
        typingBubble.remove();

        const reply = data.response || data.error || 'No response';
        const aiBubble = createAssistantBubble(reply, msg);
        messagesDiv.appendChild(aiBubble);

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

let currentPrepCategory = 'GENERAL';
// Always default to 'desc' (Newest First on top) so newly generated questions appear right below the Synthesize button
let prepSortOrder = 'desc';

function setPrepSortOrder(order) {
    prepSortOrder = order === 'asc' ? 'asc' : 'desc';
    syncPrepSortToolbarUI();
    loadPrepQuestions();
}

function syncPrepSortToolbarUI(totalCount) {
    const descBtn = document.getElementById('prep-sort-desc');
    const ascBtn = document.getElementById('prep-sort-asc');
    const statusText = document.getElementById('prep-sort-status-text');
    const countBadge = document.getElementById('prep-total-count');

    if (descBtn) descBtn.classList.toggle('active', prepSortOrder === 'desc');
    if (ascBtn) ascBtn.classList.toggle('active', prepSortOrder === 'asc');
    if (statusText) {
        statusText.textContent = prepSortOrder === 'desc'
            ? 'Latest generated question stays at the top (Q# ↓)'
            : 'Showing oldest to newest order (Q# ↑)';
    }
    if (typeof totalCount === 'number' && countBadge) {
        countBadge.textContent = `${totalCount} ${totalCount === 1 ? 'QUESTION' : 'QUESTIONS'}`;
    }
}

function selectCategory(category, btnEl) {
    currentPrepCategory = category;
    
    document.querySelectorAll('.category-btn').forEach(btn => {
        const on = btn === btnEl;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', on);
    });
}

let recentlyGenerated = false;

async function generateSinglePrep(categoryOverride) {
    const category = categoryOverride || currentPrepCategory;
    const role = contextData.assignment?.title || 'Software Engineer';
    const company = contextData.assignment?.company || 'Tech Company';
    const generateBtn = document.getElementById('prep-generate-btn');
    const langToggle = document.getElementById('prep-lang-toggle');
    const language = langToggle && langToggle.checked ? 'HINGLISH' : 'ENGLISH';

    const progressEl = document.getElementById('prep-progress');
    const textEl = document.getElementById('prep-progress-text');
    
    // Disable inputs during generation
    document.querySelectorAll('.prep-category-buttons button').forEach(b => b.disabled = true);
    if (generateBtn) generateBtn.disabled = true;
    
    progressEl.classList.remove('hidden');
    textEl.textContent = `Synthesizing ${category} context...`;

    try {
        const res = await fetch(`${API_BASE}/prepare/single`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category, job_role: role, company: company, language: language }),
        });
        let data;
        try {
            data = await res.json();
        } catch (e) {
            alert('Server error: The backend returned an invalid response. Please ensure Groq API key is valid and context is set.');
            return;
        }

        if (!res.ok) {
            alert(data.error || 'Failed to generate question');
            return;
        }

        // Always keep Newest First active on generation so the new question streams right at the top below the button
        prepSortOrder = 'desc';
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

function getCategoryPillClass(category) {
    const cat = (category || 'GENERAL').toUpperCase();
    if (cat.includes('TECH')) return 'prep-pill-technical';
    if (cat.includes('BEHAVIOR')) return 'prep-pill-behavioral';
    if (cat.includes('SYSTEM')) return 'prep-pill-system-design';
    if (cat.includes('PROJECT')) return 'prep-pill-project-deep-dive';
    if (cat.includes('DSA') || cat.includes('COD')) return 'prep-pill-dsa-coding';
    if (cat.includes('SITUAT')) return 'prep-pill-situational';
    if (cat.includes('HR') || cat.includes('CULT')) return 'prep-pill-hr-culture-fit';
    if (cat.includes('ASSIGN')) return 'prep-pill-assignment';
    return 'prep-pill-general';
}

function getCategoryLabel(category) {
    const cat = (category || 'GENERAL').toUpperCase();
    if (cat === 'PROJECT_DEEP_DIVE') return '🚀 Projects';
    if (cat === 'HR_CULTURE_FIT') return '🤝 HR / Culture';
    if (cat === 'DSA_CODING') return '⌨️ DSA / Coding';
    if (cat === 'SYSTEM_DESIGN') return '📐 System Design';
    if (cat === 'TECHNICAL') return '💻 Technical';
    if (cat === 'BEHAVIORAL') return '🧠 Behavioral';
    if (cat === 'SITUATIONAL') return '🤔 Situational';
    if (cat === 'ASSIGNMENT') return '🎯 Assignment';
    return '🌐 General';
}

async function loadPrepQuestions() {
    try {
        const res = await fetch(`${API_BASE}/prepare/questions`);
        const data = await res.json();
        const entries = data.entries || [];
        mentor.prep = entries;  // keeps the Mentor's @ picker in sync with Prep Studio
        const listEl = document.getElementById('prep-list');

        syncPrepSortToolbarUI(entries.length);

        if (entries.length === 0) {
            listEl.innerHTML = '<div class="prep-empty"><div class="empty-icon">🎯</div><h3>No Questions Yet</h3><p>Generate questions based on your resume, GitHub, and job description.</p></div>';
            return;
        }

        const lastIndex = entries.length - 1;
        const indexedEntries = entries.map((e, origIdx) => ({ e, origIdx }));
        if (prepSortOrder === 'desc') {
            indexedEntries.reverse();
        }

        listEl.innerHTML = indexedEntries.map(({ e, origIdx }) => {
            const pillClass = getCategoryPillClass(e.category);
            const pillLabel = getCategoryLabel(e.category);
            const statusClass = e.user_rating === 'accept' ? 'status-accepted' : e.user_rating === 'reject' ? 'status-rejected' : '';
            const statusLabel = e.user_rating === 'accept' ? '✅ Accepted' : e.user_rating === 'reject' ? '❌ Rejected' : `⭐ Score: ${e.score || '—'}/10`;
            const isJustGenerated = recentlyGenerated && origIdx === lastIndex;

            return `
            <div class="prep-card glass ${isJustGenerated ? 'newly-generated' : ''}" id="prep-card-${origIdx}">
                <div class="prep-card-header">
                    <div class="prep-card-meta">
                        <span class="prep-card-q-badge">Q${origIdx + 1}</span>
                        <span class="prep-pill ${pillClass}">${pillLabel}</span>
                        <span class="prep-card-difficulty">${(e.difficulty || 'MEDIUM').toUpperCase()}</span>
                        ${isJustGenerated ? '<span class="prep-new-stream-badge">NEWLY SYNTHESIZED</span>' : ''}
                    </div>
                    <div class="prep-card-score-badge ${statusClass}">
                        ${statusLabel}
                    </div>
                </div>

                <div class="prep-card-question-box">
                    <div class="prep-card-question" id="prep-q-${origIdx}">${escapeHtml(e.question)}</div>
                </div>

                <div class="prep-card-answer-box">
                    <div class="prep-card-answer-label">
                        <span class="prep-answer-icon">💬</span>
                        <span>Model Spoken Delivery</span>
                    </div>
                    <div class="prep-card-answer" id="prep-a-${origIdx}">${escapeHtml(e.answer)}</div>
                </div>

                <div class="prep-card-actions">
                    <div class="prep-card-btn-group">
                        <button class="prep-btn prep-btn-accept ${e.user_rating === 'accept' ? 'active' : ''}" onclick="event.stopPropagation();ratePrepAnswer(${origIdx},'accept')">
                            <span>✅</span><span>Accept</span>
                        </button>
                        <button class="prep-btn prep-btn-reject ${e.user_rating === 'reject' ? 'active' : ''}" onclick="event.stopPropagation();ratePrepAnswer(${origIdx},'reject')">
                            <span>❌</span><span>Reject</span>
                        </button>
                        <button class="prep-btn prep-btn-refine" onclick="event.stopPropagation();refinePrepAnswer(${origIdx})">
                            <span>✏️</span><span>Refine</span>
                        </button>
                        <button class="prep-btn prep-btn-mentor" onclick="event.stopPropagation();mentorAsk(${origIdx + 1})" title="Discuss Q${origIdx + 1} with Mentor">
                            <svg viewBox="0 0 24 24"><use href="#mentor-mark"/></svg><span>Ask Mentor</span>
                        </button>
                    </div>
                </div>
            </div>
            `;
        }).join('');

        if (recentlyGenerated && entries.length > 0) {
            recentlyGenerated = false;
            const cardEl = document.getElementById(`prep-card-${lastIndex}`);
            const qEl = document.getElementById(`prep-q-${lastIndex}`);
            const aEl = document.getElementById(`prep-a-${lastIndex}`);
            
            // Expand the newly generated card at the very top right under the Synthesize button without scrolling the button out of view
            if (cardEl) {
                cardEl.classList.add('expanded');
                requestAnimationFrame(() => {
                    cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                });
            }
            
            // Apply typewriter effect to both Q and A
            if (qEl) typewriteText(qEl, entries[lastIndex].question);
            if (aEl) typewriteText(aEl, entries[lastIndex].answer);
        }
    } catch (e) { /* silent */ }
}

function typewriteText(element, text) {
    element.innerHTML = ''; // Clear text
    let i = 0;
    const speed = 10; // Very fast typewriter effect (10ms per char)
    
    function typeChar() {
        if (i < text.length) {
            // Append char
            const char = text.charAt(i);
            element.innerHTML = escapeHtml(text.substring(0, i + 1)) + '<span class="typewriter-cursor"></span>';
            i++;
            setTimeout(typeChar, speed);
        } else {
            // Done typing, remove cursor
            element.innerHTML = escapeHtml(text);
        }
    }
    typeChar();
}

async function ratePrepAnswer(index, rating) {
    try {
        await fetch(`${API_BASE}/prepare/feedback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ index, rating }),
        });
        loadPrepQuestions();
    } catch (e) { console.error(e); }
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
        loadPrepQuestions();
    } catch (e) { alert('Refine failed: ' + e.message); }
}

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
    t = t.replace(/\[hmm\]/g, '💭');
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
        toggleAllBtn.textContent = allExpanded ? '📁 Collapse All' : '📂 Expand All';
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

        // Resilient cross-sync: If local server has fewer sessions or we are on local dashboard, check cloud backup
        const cloudUrl = 'https://acemate-backend.onrender.com';
        if (API_BASE !== cloudUrl) {
            try {
                const cloudRes = await fetch(`${cloudUrl}/api/history`, { signal: AbortSignal.timeout ? AbortSignal.timeout(2500) : undefined });
                if (cloudRes.ok) {
                    const cloudData = await cloudRes.json();
                    const cloudSessions = cloudData.sessions || [];
                    const localIds = new Set(rawSessions.map(s => String(s.id)));
                    let mergedAny = false;
                    for (const cs of cloudSessions) {
                        const cid = String(cs.id);
                        if (!localIds.has(cid) && cs.entries && cs.entries.length > 0) {
                            rawSessions.push(cs);
                            localIds.add(cid);
                            mergedAny = true;
                            // Silently persist to local server
                            fetch(`${API_BASE}/api/history`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(cs)
                            }).catch(() => {});
                        }
                    }
                }
            } catch (e) { /* silent timeout */ }
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
                    <div style="font-size:36px; margin-bottom:10px;">📚</div>
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
            toggleAllBtn.textContent = allExpanded ? '📁 Collapse All' : '📂 Expand All';
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
        btn.textContent = allExpanded ? '📂 Expand All' : '📁 Collapse All';
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

        let copyText = `Acemate Interview Session #${id} (${timeStr})\n`;
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
        statusEl.textContent = '✅ Saved!';
        statusEl.style.background = 'rgba(80,208,128,0.1)';
        statusEl.style.color = '#50d080';
        setTimeout(() => statusEl.classList.add('hidden'), 3000);
    } catch (e) {
        statusEl.classList.remove('hidden');
        statusEl.textContent = `❌ Error: ${e.message}`;
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
                    <span class="repo-item-name">📦 ${escapeHtml(repo.name)}</span>
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
            statusEl.textContent = `✅ Imported ${data.repos_imported} repos from @${username}`;
            statusEl.style.background = 'rgba(80,208,128,0.1)'; statusEl.style.color = '#50d080';
            updateChecklist('check-github', true);
        } else { statusEl.textContent = '❌ ' + (data.error || 'Failed'); statusEl.style.color = '#ef4444'; }
    } catch (e) { statusEl.textContent = '❌ ' + e.message; statusEl.style.color = '#ef4444'; }
    finally { importBtn.disabled = false; }
});

// ─── Setup: Job Description ──────────────────────────────────

document.getElementById('jd-save-btn')?.addEventListener('click', async () => {
    const title = document.getElementById('jd-title').value.trim();
    const company = document.getElementById('jd-company').value.trim();
    const desc = document.getElementById('jd-content').value.trim();
    if (!desc) return alert('Paste the job description');

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
            if (syncBadge) syncBadge.style.display = 'inline-flex';
            const statusBadge = document.getElementById('jd-status-badge');
            if (statusBadge) {
                statusBadge.className = 'badge-pill badge-pill-emerald';
                statusBadge.innerHTML = '<span class="badge-dot"></span>SPEC ACTIVE & SYNCED';
            }
            if (statusEl) {
                statusEl.classList.remove('hidden');
                statusEl.innerHTML = `<span class="badge-pill badge-pill-emerald"><span class="badge-dot"></span>${data.message || 'Job description spec active & synced to copilot engine'}</span>`;
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
    const updateJdCharCount = () => {
        jdCharCount.textContent = `${jdTextarea.value.length} characters`;
    };
    jdTextarea.addEventListener('input', updateJdCharCount);
    updateJdCharCount();
}

document.getElementById('jd-clear-btn')?.addEventListener('click', async () => {
    const confirmed = await showConfirmModal({
        badge: 'EDITOR BUFFER',
        variant: 'warning',
        title: 'Do you really want to clear the JD buffer?',
        description: 'This clears the current Job Description text in the editor. Your active server spec remains untouched until you save.',
        metaText: 'SPEC_REQUIREMENTS.md • Local Editor Buffer',
        confirmText: 'Yes, Clear Buffer',
        cancelText: 'Cancel',
    });
    if (confirmed && jdTextarea) {
        jdTextarea.value = '';
        if (jdCharCount) jdCharCount.textContent = '0 characters';
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
            statusEl.textContent = '✅ Assignment saved successfully!';
            statusEl.style.background = 'rgba(80,208,128,0.1)';
            statusEl.style.color = '#50d080';
        } else {
            statusEl.textContent = '❌ ' + (data.error || 'Failed to save');
            statusEl.style.background = 'rgba(239,68,68,0.1)';
            statusEl.style.color = '#ef4444';
        }
    } catch (e) {
        statusEl.classList.remove('hidden');
        statusEl.textContent = '❌ ' + e.message;
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
    const container = document.getElementById('skill-tags');
    if (!container) return;
    if (!contextData.skills.tags || contextData.skills.tags.length === 0) {
        container.innerHTML = '<span style="font-size:12px; color:var(--ink-muted); font-family:var(--font-mono);">No skills added yet. Type a skill above and press Enter.</span>';
    } else {
        container.innerHTML = contextData.skills.tags.map((s, i) =>
            `<span class="skill-tag-pill"><span class="skill-tag-icon">⚡</span><span>${escapeHtml(s)}</span><span class="skill-tag-del" onclick="removeSkill(${i})" title="Remove skill">×</span></span>`
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

function renderContextList(type) {
    const map = { projects: contextData.projects, experience: contextData.experience, stories: contextData.stories, qabank: contextData.qa_bank };
    const items = map[type] || [];
    const listEl = document.getElementById(`list-${type}`);
    const countEl = document.getElementById(`count-${type}`);
    if (countEl) countEl.textContent = items.length;
    if (!listEl) return;
    
    listEl.innerHTML = items.map((item, i) => {
        if (type === 'qabank') {
            return `<div class="glass" style="padding:10px; margin-bottom: 8px;">
                <div style="display:flex; justify-content:space-between; margin-bottom: 8px;">
                    <strong style="font-size:12px; color:var(--text-dim);">Q&A Pair #${i+1}</strong>
                    <button class="btn btn-sm" style="color:var(--red);background:none;border:none;cursor:pointer;padding:0;" onclick="removeContextItem('${type}',${i})">×</button>
                </div>
                <input type="text" placeholder="Question" value="${escapeHtml(item.question || '')}" onchange="updateContextItem('${type}', ${i}, 'question', this.value)" style="width:100%; margin-bottom: 8px; font-size: 13px; font-weight: bold; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); padding: 8px; border-radius: 4px; color: white;">
                <textarea rows="3" placeholder="Answer" onchange="updateContextItem('${type}', ${i}, 'answer', this.value)" style="width:100%; font-size: 13px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); padding: 8px; border-radius: 4px; color: white;">${escapeHtml(item.answer || '')}</textarea>
            </div>`;
        } else if (type === 'stories') {
            return `<div class="glass" style="padding:10px; margin-bottom: 8px;">
                <div style="display:flex; justify-content:space-between; margin-bottom: 8px;">
                    <input type="text" value="${escapeHtml(item.title || '')}" onchange="updateContextItem('${type}', ${i}, 'title', this.value)" style="flex:1; margin-right: 8px; font-weight: bold; font-size: 13px;">
                    <button class="btn btn-sm" style="color:var(--red);background:none;border:none;cursor:pointer;padding:0;" onclick="removeContextItem('${type}',${i})">×</button>
                </div>
                <textarea rows="3" onchange="updateContextItem('${type}', ${i}, 'content', this.value)" style="width:100%; font-size: 13px;">${escapeHtml(item.content || item.situation || '')}</textarea>
            </div>`;
        } else if (type === 'projects') {
             return `<div class="glass" style="padding:10px; margin-bottom: 8px;">
                <div style="display:flex; justify-content:space-between; margin-bottom: 8px;">
                    <input type="text" placeholder="Project Name" value="${escapeHtml(item.name || '')}" onchange="updateContextItem('${type}', ${i}, 'name', this.value)" style="flex:1; margin-right: 8px; font-weight: bold; font-size: 13px;">
                    <button class="btn btn-sm" style="color:var(--red);background:none;border:none;cursor:pointer;padding:0;" onclick="removeContextItem('${type}',${i})">×</button>
                </div>
                <textarea rows="2" placeholder="Tech Stack" onchange="updateContextItem('${type}', ${i}, 'tech_stack', this.value)" style="width:100%; font-size: 12px; margin-bottom: 4px;">${escapeHtml(item.tech_stack || '')}</textarea>
                <input type="text" placeholder="Your Role (Lead, Solo Dev...)" value="${escapeHtml(item.role || '')}" onchange="updateContextItem('${type}', ${i}, 'role', this.value)" style="width:100%; font-size: 12px; margin-bottom: 4px;">
                <textarea rows="3" placeholder="What did you build? What problems did it solve?" onchange="updateContextItem('${type}', ${i}, 'description', this.value)" style="width:100%; font-size: 12px; margin-bottom: 4px;">${escapeHtml(item.description || item.details || '')}</textarea>
                <textarea rows="3" placeholder="Key challenges faced and how you solved them..." onchange="updateContextItem('${type}', ${i}, 'challenges', this.value)" style="width:100%; font-size: 12px;">${escapeHtml(item.challenges || '')}</textarea>
            </div>`;
        } else if (type === 'experience') {
            return `<div class="glass" style="padding:10px; margin-bottom: 8px;">
                <div style="display:flex; justify-content:space-between; margin-bottom: 8px;">
                    <input type="text" placeholder="Company Name" value="${escapeHtml(item.company || '')}" onchange="updateContextItem('${type}', ${i}, 'company', this.value)" style="flex:1; margin-right: 8px; font-weight: bold; font-size: 13px;">
                    <button class="btn btn-sm" style="color:var(--red);background:none;border:none;cursor:pointer;padding:0;" onclick="removeContextItem('${type}',${i})">×</button>
                </div>
                <input type="text" placeholder="Role / Job Title" value="${escapeHtml(item.role || '')}" onchange="updateContextItem('${type}', ${i}, 'role', this.value)" style="width:100%; margin-bottom: 4px; font-size: 12px;">
                <input type="text" placeholder="Duration (e.g. Jan 2023 - Present)" value="${escapeHtml(item.duration || '')}" onchange="updateContextItem('${type}', ${i}, 'duration', this.value)" style="width:100%; margin-bottom: 4px; font-size: 12px;">
                <textarea rows="3" placeholder="Key Achievements / Description" onchange="updateContextItem('${type}', ${i}, 'details', this.value)" style="width:100%; font-size: 12px;">${escapeHtml(item.details || item.achievements || '')}</textarea>
            </div>`;
        } else {
            const title = item.name || item.company || item.title || item.question || 'Item';
            return `<div class="glass" style="padding:10px 14px;display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:13px;">${escapeHtml(title)}</span>
                <button class="btn btn-sm" style="color:var(--red);background:none;border:none;cursor:pointer;" onclick="removeContextItem('${type}',${i})">×</button>
            </div>`;
        }
    }).join('');
}

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
        statusEl.textContent = data.status === 'success' ? '✅ All context saved!' : '❌ ' + (data.error || 'Failed');
        statusEl.style.background = data.status === 'success' ? 'rgba(80,208,128,0.1)' : 'rgba(239,68,68,0.1)';
        statusEl.style.color = data.status === 'success' ? '#50d080' : '#ef4444';
        setTimeout(() => statusEl.classList.add('hidden'), 4000);
    } catch (e) {
        statusEl.classList.remove('hidden'); statusEl.textContent = '❌ ' + e.message;
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
            if (telemetryPing) telemetryPing.textContent = `⚡ ${pingTime}ms ping`;
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
                if (rfn) rfn.textContent = 'Shailesh_Upadhyay_Resume.pdf';
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
                console.log(`📊 Context loaded: ${data.full_context_length} chars`);
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
                    if (charCountEl) charCountEl.textContent = `${jdata.description.length} characters`;
                    const syncBadge = document.getElementById('jd-sync-badge');
                    if (syncBadge) syncBadge.style.display = 'inline-flex';
                    const statusBadge = document.getElementById('jd-status-badge');
                    if (statusBadge) {
                        statusBadge.className = 'badge-pill badge-pill-emerald';
                        statusBadge.innerHTML = '<span class="badge-dot"></span>SPEC ACTIVE & SYNCED';
                    }
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
                    <div style="font-size:32px; margin-bottom:8px;">💬</div>
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
                                <span>💬 Chat Batch #${batch.id}</span>
                                <span class="badge-pill badge-pill-blue">${batch.count || messages.length} Messages</span>
                            </div>
                            <span class="recycle-item-meta">Cleared: ${deletedDate}</span>
                        </div>
                        <div class="recycle-item-body">
                            <strong>Sample Message:</strong> "${snippet}"
                        </div>
                        <div class="recycle-item-actions">
                            <button class="recycle-btn-restore" onclick="restoreRecycleItem('chat', '${batch.id}')">↩️ Restore to Copilot</button>
                            <button class="recycle-btn-purge" onclick="deleteRecycleItem('chat', '${batch.id}')">❌ Delete Permanently</button>
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
