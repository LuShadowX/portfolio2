/* FILE: assets/js/modules/contact-form.js */

import { $, $$, debounce } from './utils.js';
import { local } from './storage.js';

const DRAFT_KEY = 'contact:draft';
const MESSAGE_MAX = 1000;

// Letters from any script, plus spaces, dots, apostrophes and hyphens
const NAME_RE = /^\p{L}[\p{L}\p{M} .'-]{1,59}$/u;
// Deliberately loose: something@something.tld, no spaces. The mail app does the real check.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const LINK_RE = /https?:\/\/\S+/gi;

const RULES = {
    user_name(value) {
        if (!value) return 'Tell me what to call you.';
        if (value.length < 2) return 'That looks a little short for a name.';
        if (!NAME_RE.test(value)) return 'Letters, spaces, dots and hyphens only.';
        return '';
    },
    user_email(value) {
        if (!value) return 'I need an email to reply to.';
        if (!EMAIL_RE.test(value)) return 'That email doesn\'t look complete. Something like you@example.com.';
        return '';
    },
    reason(value) {
        return value ? '' : 'Pick the closest one, it helps me reply faster.';
    },
    message(value) {
        if (value.length < 20) return `A little more, please. At least 20 characters (${20 - value.length} to go).`;
        if (value.length > MESSAGE_MAX) return `Keep it under ${MESSAGE_MAX} characters.`;
        if ((value.match(LINK_RE) ?? []).length > 2) return 'Two links at most. Anything more and it reads like spam.';
        return '';
    }
};

export function initContactForm(form) {
    form.noValidate = true;
    const status = $('[role="status"]', form);
    const counter = $('#cf-count', form);
    const draftNote = $('.form-draft', form);
    const fields = Object.keys(RULES).map(name => form.elements[name]).filter(Boolean);
    const touched = new Set();

    const valueOf = (field) => field.value.trim();

    function check(field) {
        const message = RULES[field.name](valueOf(field));
        const error = document.getElementById(field.getAttribute('aria-describedby')?.split(' ')[0]);
        field.setAttribute('aria-invalid', String(Boolean(message)));
        field.closest('.field')?.classList.toggle('has-error', Boolean(message));
        if (error) error.textContent = message;
        return !message;
    }

    function updateCounter() {
        const length = form.elements.message.value.length;
        counter.textContent = `${length} / ${MESSAGE_MAX}`;
        counter.parentElement.classList.toggle('is-near', length > MESSAGE_MAX * 0.9);
    }

    /* ----- draft autosave ----- */

    const saveDraft = debounce(() => {
        const draft = Object.fromEntries(fields.map(field => [field.name, field.value]));
        const empty = Object.values(draft).every(value => !value.trim());
        empty ? local.remove(DRAFT_KEY) : local.set(DRAFT_KEY, { ...draft, savedAt: Date.now() });
    }, 400);

    const draft = local.get(DRAFT_KEY);
    if (draft) {
        fields.forEach(field => { if (draft[field.name]) field.value = draft[field.name]; });
        const when = new Date(draft.savedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
        draftNote.querySelector('span').textContent = `Picked up your unsent draft from ${when}.`;
        draftNote.hidden = false;
    }

    draftNote.addEventListener('click', e => {
        if (!e.target.closest('button')) return;
        form.reset();
        local.remove(DRAFT_KEY);
        draftNote.hidden = true;
        touched.clear();
        fields.forEach(field => {
            field.removeAttribute('aria-invalid');
            field.closest('.field')?.classList.remove('has-error');
        });
        $$('.field-error', form).forEach(error => { error.textContent = ''; });
        updateCounter();
        fields[0].focus();
    });

    /* ----- live validation ----- */

    // Errors wait until someone leaves a field, then update as they type
    form.addEventListener('focusout', e => {
        if (!RULES[e.target.name] || !valueOf(e.target)) return;
        touched.add(e.target.name);
        check(e.target);
    });

    form.addEventListener('input', e => {
        const field = e.target;
        if (field.name === 'message') updateCounter();
        if (touched.has(field.name)) check(field);
        if (RULES[field.name]) saveDraft();
    });

    form.addEventListener('change', e => {
        if (e.target.name === 'reason') {
            touched.add('reason');
            check(e.target);
            saveDraft();
        }
    });

    /* ----- submit ----- */

    form.addEventListener('submit', e => {
        e.preventDefault();

        // bots fill every field, people never see this one
        if (form.elements.website?.value) return;

        fields.forEach(field => touched.add(field.name));
        const invalid = fields.filter(field => !check(field));
        if (invalid.length) {
            status.textContent = invalid.length === 1 ? 'One thing to fix above.' : `${invalid.length} things to fix above.`;
            invalid[0].focus();
            return;
        }

        const data = new FormData(form);
        const reason = form.elements.reason.selectedOptions[0].textContent;
        const subject = `${reason}: message from ${data.get('user_name')}`;
        const body = `${data.get('message')}\n\n${data.get('user_name')} <${data.get('user_email')}>`;
        window.location.href = `mailto:${form.dataset.to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

        status.textContent = 'Opening your email app. Your draft is cleared.';
        local.remove(DRAFT_KEY);
        draftNote.hidden = true;
    });

    updateCounter();
}
