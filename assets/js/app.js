/* FILE: assets/js/app.js */

// Entry point for the newer, module-based parts of the site.
// The older effects still live in common.js and blackhole.js.

import { initRepoIndex } from './modules/repo-index.js';
import { initContactForm } from './modules/contact-form.js';
import { initDesk } from './modules/desk.js';
import * as debug from './modules/debug.js';

addEventListener('error', e => debug.warn('Uncaught error:', e.message, `${e.filename}:${e.lineno}`));
addEventListener('unhandledrejection', e => debug.warn('Unhandled promise rejection:', e.reason));

const repoSection = document.getElementById('repos');
if (repoSection) {
    debug.guard('repo-index', () => {
        const index = initRepoIndex(repoSection);
        // Don't spend one of GitHub's 60 hourly requests until the section is close
        const watcher = new IntersectionObserver(entries => {
            if (!entries.some(entry => entry.isIntersecting)) return;
            watcher.disconnect();
            index.load();
        }, { rootMargin: '600px 0px' });
        watcher.observe(repoSection);
    });
}

const contactForm = document.getElementById('contact-form');
if (contactForm) debug.guard('contact-form', () => initContactForm(contactForm));

const desk = document.getElementById('desk');
if (desk) debug.guard('desk', () => initDesk(desk));

debug.log('modules ready', Math.round(performance.now()), 'ms after navigation start');
