/* FILE: assets/js/modules/utils.js */

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export const debounce = (fn, wait = 200) => {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
    };
};

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, ch => ENTITIES[ch]);

export const formatNumber = new Intl.NumberFormat('en-IN').format;

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const UNITS = [
    ['year', 31536000], ['month', 2592000], ['week', 604800],
    ['day', 86400], ['hour', 3600], ['minute', 60]
];

// "3 days ago", "last month", "just now"
export const timeAgo = (date, now = Date.now()) => {
    const seconds = Math.round((date - now) / 1000);
    for (const [unit, size] of UNITS) {
        if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
    }
    return 'just now';
};

export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Ignore global shortcuts while the visitor is typing somewhere
export const isTyping = (el = document.activeElement) =>
    !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
