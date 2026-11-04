/**
 * Picker: every <select> on the page becomes a pretty, animated menu. The real <select> stays in place (hidden), so
 * forms, `form.field.value` and change listeners keep working; choosing an option sets it and fires input + change.
 * Options can carry data-icon (a sprite name) and data-hint (a second line). Mouse, touch and keyboard: arrows,
 * Home/End, Enter/Space, Esc, Tab and type-to-jump. The menu opens in the top layer (Popover API), so it is never
 * clipped by a dialog or a scrolling card; it flips upwards when there is no room below.
 * New selects are picked up automatically (a MutationObserver), and Picker.sync(select) redraws after code sets
 * a value.
 */
const Picker = (() => {
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const icon = (n, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
    const calm = () => window.Motion?.calm?.() || matchMedia('(prefers-reduced-motion: reduce)').matches;
    const topLayer = typeof HTMLElement !== 'undefined' && 'popover' in HTMLElement.prototype;
    let uid = 0, current = null, escAt = 0;

    function labelOf(sel) {
        const l = sel.labels?.[0];
        if (!l) return sel.getAttribute('aria-label') || '';
        const span = l.querySelector(':scope > span');
        return (span || l).textContent.replace(/\s+/g, ' ').trim();
    }
    function face(sel) {
        const o = sel.options[sel.selectedIndex];
        return `${o?.dataset.icon ? `<span class="pk-ico">${icon(o.dataset.icon)}</span>` : ''}<span class="pk-val">${esc(o ? o.textContent : '')}</span>${icon('caret-down', 'pk-caret')}`;
    }
    function sync(sel) {
        const p = sel._picker;
        if (!p) return;
        p.btn.innerHTML = face(sel);
        p.btn.disabled = sel.disabled;
        const o = sel.options[sel.selectedIndex];
        p.btn.setAttribute('aria-label', `${labelOf(sel)}${labelOf(sel) ? ': ' : ''}${o ? o.textContent : ''}`);
    }

    function enhance(sel) {
        if (sel._picker || sel.multiple || sel.size > 1 || sel.closest('[data-native-select]')) return;
        const wrap = document.createElement('span');
        wrap.className = 'pk';
        sel.parentNode.insertBefore(wrap, sel);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pk-btn';
        btn.setAttribute('aria-haspopup', 'listbox');
        btn.setAttribute('aria-expanded', 'false');
        const list = document.createElement('div');
        list.className = 'pk-list';
        list.id = `pk-${++uid}`;
        list.setAttribute('role', 'listbox');
        list.tabIndex = -1;
        if (topLayer) list.popover = 'manual';
        btn.setAttribute('aria-controls', list.id);
        wrap.append(btn, sel, list);   // the button comes first, so a wrapping <label> activates it
        sel.classList.add('pk-native');
        sel.tabIndex = -1;
        sel.setAttribute('aria-hidden', 'true');
        sel._picker = { wrap, btn, list };
        sync(sel);
        btn.addEventListener('click', () => (current?.sel === sel ? close(true) : open(sel)));
        btn.addEventListener('keydown', e => { if (['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); open(sel); } });
        sel.addEventListener('change', () => sync(sel));
        list.addEventListener('pointermove', e => { const o = e.target.closest('.pk-opt'); if (o && current) activate(+o.dataset.i, false); });
        // the menu sits inside the field's <label>: without preventDefault the label would re-click the button and reopen it
        list.addEventListener('click', e => { e.preventDefault(); const o = e.target.closest('.pk-opt'); if (o) choose(+o.dataset.i); });
        list.addEventListener('keydown', onKey);
    }

    function render(sel) {
        const { list } = sel._picker;
        list.setAttribute('aria-label', labelOf(sel) || 'Choose one');
        list.innerHTML = [...sel.options].map((o, i) => `
            <div class="pk-opt${o.disabled ? ' is-off' : ''}" role="option" id="${list.id}-${i}" data-i="${i}" aria-selected="${i === sel.selectedIndex}"${o.disabled ? ' aria-disabled="true"' : ''} style="--i:${i}">
                ${o.dataset.icon ? `<span class="pk-ico">${icon(o.dataset.icon)}</span>` : ''}
                <span class="pk-text"><b>${esc(o.textContent)}</b>${o.dataset.hint ? `<small>${esc(o.dataset.hint)}</small>` : ''}</span>
                ${icon('check-bold', 'pk-tick')}
            </div>`).join('');
    }

    // under the button when it fits, above it otherwise; never wider than the screen
    function place(sel) {
        const { btn, list } = sel._picker;
        const r = btn.getBoundingClientRect(), vw = innerWidth, vh = innerHeight, gap = 6, pad = 10;
        const below = vh - r.bottom - gap - pad, above = r.top - gap - pad;
        list.style.maxHeight = '';
        const want = Math.min(list.scrollHeight, 360);
        const up = below < want && above > below;
        const max = Math.max(160, Math.min(360, up ? above : below));
        const width = Math.min(Math.max(r.width, 240), vw - pad * 2);
        const left = Math.min(Math.max(pad, r.left), vw - width - pad);
        list.classList.toggle('pk-up', up);
        if (topLayer) {
            Object.assign(list.style, { position: 'fixed', left: `${left}px`, width: `${width}px`, maxHeight: `${max}px`, top: up ? 'auto' : `${r.bottom + gap}px`, bottom: up ? `${vh - r.top + gap}px` : 'auto' });
        } else {
            Object.assign(list.style, { position: 'absolute', left: '0', width: `${width}px`, maxHeight: `${max}px`, top: up ? 'auto' : `calc(100% + ${gap}px)`, bottom: up ? `calc(100% + ${gap}px)` : 'auto' });
        }
    }

    function open(sel) {
        if (sel.disabled) return;
        if (current) close(false);
        const { btn, list } = sel._picker;
        render(sel);
        if (topLayer) list.showPopover(); else list.classList.add('is-open');
        place(sel);
        current = { sel, active: Math.max(0, sel.selectedIndex), typed: '', timer: 0 };
        btn.setAttribute('aria-expanded', 'true');
        sel._picker.wrap.classList.add('is-open');
        activate(current.active, true);
        list.focus({ preventScroll: true });
        if (!calm()) {
            list.animate([{ opacity: 0, transform: `translateY(${list.classList.contains('pk-up') ? 8 : -8}px) scale(.97)` }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
            [...list.children].slice(0, 12).forEach((o, i) => o.animate([{ opacity: 0, transform: 'translateX(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: 30 + i * 22, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' }));
        }
        setTimeout(() => {
            document.addEventListener('pointerdown', outside, true);
            addEventListener('resize', onResize);
            addEventListener('scroll', onScroll, true);
        });
    }
    function close(focusBack) {
        if (!current) return;
        const { sel } = current, { btn, list, wrap } = sel._picker;
        current = null;
        document.removeEventListener('pointerdown', outside, true);
        removeEventListener('resize', onResize);
        removeEventListener('scroll', onScroll, true);
        btn.setAttribute('aria-expanded', 'false');
        wrap.classList.remove('is-open');
        const hide = () => { if (topLayer) { try { list.hidePopover(); } catch (e) { /* already closed */ } } else list.classList.remove('is-open'); };
        if (calm()) hide();
        else list.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.98)' }], { duration: 120, easing: 'ease-in' }).finished.then(hide, hide);
        if (focusBack) btn.focus({ preventScroll: true });
    }
    const outside = e => { if (current && !current.sel._picker.wrap.contains(e.target) && !current.sel._picker.list.contains(e.target)) close(false); };
    const onResize = () => current && place(current.sel);
    const onScroll = e => { if (current && !current.sel._picker.list.contains(e.target)) close(false); };

    function activate(i, scroll) {
        if (!current) return;
        const { list } = current.sel._picker, opts = list.children;
        if (!opts[i]) return;
        current.active = i;
        [...opts].forEach((o, k) => o.classList.toggle('is-active', k === i));
        list.setAttribute('aria-activedescendant', opts[i].id);
        if (scroll) opts[i].scrollIntoView({ block: 'nearest' });
    }
    function choose(i) {
        if (!current) return;
        const { sel } = current, o = sel.options[i];
        if (!o || o.disabled) return;
        const changed = sel.selectedIndex !== i;
        sel.selectedIndex = i;
        const pick = sel._picker.list.children[i];
        if (pick && !calm()) pick.animate([{ transform: 'scale(1)' }, { transform: 'scale(.97)' }, { transform: 'scale(1)' }], { duration: 180 });
        close(true);
        sync(sel);
        if (!calm()) sel._picker.btn.querySelector('.pk-val')?.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
        if (changed) { sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    function step(from, dir) {
        const opts = current.sel.options;
        for (let i = from + dir; i >= 0 && i < opts.length; i += dir) if (!opts[i].disabled) return i;
        return from;
    }
    function onKey(e) {
        if (!current) return;
        const n = current.sel.options.length;
        if (e.key === 'ArrowDown') { e.preventDefault(); activate(step(current.active, 1), true); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); activate(step(current.active, -1), true); }
        else if (e.key === 'Home') { e.preventDefault(); activate(step(-1, 1), true); }
        else if (e.key === 'End') { e.preventDefault(); activate(step(n, -1), true); }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(current.active); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); escAt = performance.now(); close(true); }
        else if (e.key === 'Tab') close(false);
        else if (e.key.length === 1 && /\S/.test(e.key)) {   // type to jump
            clearTimeout(current.timer);
            current.typed += e.key.toLowerCase();
            current.timer = setTimeout(() => { if (current) current.typed = ''; }, 700);
            const opts = [...current.sel.options], start = current.typed.length === 1 ? current.active + 1 : current.active;
            const hit = [...opts.slice(start), ...opts.slice(0, start)].find(o => !o.disabled && o.textContent.toLowerCase().startsWith(current.typed));
            if (hit) activate(hit.index, true);
        }
    }

    // Esc closes the menu only: the dialog around it (onboarding, say) stays open
    document.addEventListener('cancel', e => { if (current || performance.now() - escAt < 400) { e.preventDefault(); close(true); } }, true);

    function enhanceAll(root = document) { root.querySelectorAll?.('select').forEach(enhance); }
    enhanceAll();
    new MutationObserver(muts => muts.forEach(m => m.addedNodes.forEach(n => {
        if (n.nodeType !== 1) return;
        if (n.matches('select')) enhance(n); else enhanceAll(n);
    }))).observe(document.body, { childList: true, subtree: true });

    return { enhance, enhanceAll, sync, close: () => close(false) };
})();

// modules talk to each other through window: a top-level const is not a window property
window.Picker = Picker;
