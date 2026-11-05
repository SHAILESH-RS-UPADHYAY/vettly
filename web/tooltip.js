/**
 * Tooltips in Vettly's own dress. The browser draws `title` tooltips as small black boxes nobody can style, so this
 * adopts every title in the app (including ones added later by code) the moment it is hovered or focused:
 * the text moves to data-tip and shows in a slip drawn from the active look's tokens (tooltip.css).
 * - Hover waits a moment; moving from one tip to the next is instant; keyboard focus shows it at once.
 * - Esc closes it; the pointer can move onto it without it vanishing (WCAG 1.4.13); touch screens skip it.
 * - The text stays with assistive tech: it names an element that has no name, otherwise it describes it.
 * - It opens in the top layer (popover), so it shows above open dialogs too.
 */
const Tooltip = (() => {
    const SKIP = '[class*="cl-"], .no-tip';   // Clerk draws its own
    const tip = document.createElement('div');
    tip.className = 'vt-tip'; tip.id = 'vt-tip'; tip.setAttribute('role', 'tooltip');
    tip.innerHTML = '<span class="vt-tip-text"></span><i class="vt-tip-arrow" aria-hidden="true"></i>';
    const text = tip.querySelector('.vt-tip-text');
    const popover = typeof tip.showPopover === 'function';
    if (popover) tip.popover = 'manual';
    let target = null, showTimer = 0, hideTimer = 0, warmUntil = 0;

    // the title becomes data-tip; assistive tech keeps the words
    function adopt(el) {
        const t = el.getAttribute('title');
        if (t === null) return el.dataset.tip || '';
        el.removeAttribute('title');
        el.dataset.tip = t;
        const named = el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby') || el.textContent.trim();
        if (!named && t) el.setAttribute('aria-label', t);
        else if (t && !el.hasAttribute('aria-description')) el.setAttribute('aria-description', t);
        return t;
    }
    const owner = node => node?.closest?.('[title], [data-tip]');

    function place() {
        if (!target?.isConnected) { hide(true); return; }
        const r = target.getBoundingClientRect(), gap = 10, pad = 8;
        const w = tip.offsetWidth, h = tip.offsetHeight;
        const below = r.top - h - gap < pad;
        let x = r.left + r.width / 2 - w / 2;
        x = Math.max(pad, Math.min(innerWidth - w - pad, x));
        const y = below ? Math.min(innerHeight - h - pad, r.bottom + gap) : r.top - h - gap;
        tip.dataset.side = below ? 'below' : 'above';
        tip.style.left = `${Math.round(x)}px`; tip.style.top = `${Math.round(y)}px`;
        tip.style.setProperty('--tip-ax', `${Math.round(Math.max(14, Math.min(w - 14, r.left + r.width / 2 - x)))}px`);
    }
    function show(el) {
        const words = adopt(el);
        if (!words) return;
        clearTimeout(hideTimer);
        if (target && target !== el) target.removeAttribute('aria-describedby');
        target = el;
        text.textContent = words;
        if (popover) { if (!tip.matches(':popover-open')) { document.body.append(tip); tip.showPopover(); } }
        else (el.closest('dialog[open]') || document.body).append(tip);
        tip.hidden = false;
        tip.classList.remove('is-in'); void tip.offsetWidth; tip.classList.add('is-in');
        place();
        warmUntil = Infinity;
    }
    function hide(now = false) {
        clearTimeout(showTimer);
        clearTimeout(hideTimer);
        const go = () => {
            if (popover && tip.matches(':popover-open')) tip.hidePopover();
            tip.hidden = true;
            target = null;
            warmUntil = Date.now() + 600;   // the next tip within this window shows at once
        };
        if (now) go(); else hideTimer = setTimeout(go, 120);
    }

    document.addEventListener('pointerover', e => {
        if (e.pointerType === 'touch') return;
        if (tip.contains(e.target)) { clearTimeout(hideTimer); return; }   // hoverable: the slip itself keeps it open
        const el = owner(e.target);
        if (!el || el.closest(SKIP)) return;
        if (el === target) { clearTimeout(hideTimer); return; }
        clearTimeout(showTimer);
        if (target || Date.now() < warmUntil) show(el);
        else showTimer = setTimeout(() => { if (el.matches(':hover')) show(el); }, 420);
    }, true);
    document.addEventListener('pointerout', e => {
        if (!target) { clearTimeout(showTimer); return; }
        const to = e.relatedTarget;
        if (to && (target.contains(to) || tip.contains(to))) return;
        hide();
    }, true);
    document.addEventListener('focusin', e => {
        const el = owner(e.target);
        if (el && !el.closest(SKIP) && el.matches(':focus-visible')) show(el);
    });
    document.addEventListener('focusout', () => { if (target) hide(true); });
    document.addEventListener('pointerdown', () => { if (target) hide(true); }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && target) { hide(true); } }, true);
    addEventListener('scroll', () => { if (target) place(); }, true);
    addEventListener('resize', () => { if (target) hide(true); });
    tip.hidden = true;
    document.body.append(tip);
    return { hide: () => hide(true) };
})();
window.Tooltip = Tooltip;
