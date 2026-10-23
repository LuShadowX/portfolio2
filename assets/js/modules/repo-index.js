/* FILE: assets/js/modules/repo-index.js */

import { $, $$, debounce, escapeHTML, formatNumber, timeAgo, isTyping } from './utils.js';
import { local, cache } from './storage.js';
import * as debug from './debug.js';

const USER = 'LuShadowX';
const API = `https://api.github.com/users/${USER}/repos?per_page=100&sort=pushed`;
const SNAPSHOT = 'assets/data/repos.json';
const PREFS_KEY = 'repo-index:prefs';
const PINS_KEY = 'repo-index:pins';
const MAX_PINS = 6;

// Unauthenticated GitHub calls are capped at 60 an hour per IP,
// so a tab only asks once every half hour.
const repoCache = cache('repo-index:repos', 30 * 60 * 1000);

const LANG_COLORS = {
    Python: '#3572a5',
    JavaScript: '#e0c341',
    TypeScript: '#3178c6',
    HTML: '#e34c26',
    CSS: '#663399',
    'C++': '#f34b7d',
    C: '#555555',
    Java: '#b07219',
    Lua: '#000080',
    Shell: '#89e051',
    'Jupyter Notebook': '#da5b0b',
    Other: '#a8a398'
};
const colorFor = (language) => LANG_COLORS[language] ?? LANG_COLORS.Other;

// Each sort has a natural direction; `reverse` flips it
const SORTS = {
    pushed: (a, b) => b.pushedAt - a.pushedAt,
    created: (a, b) => b.createdAt - a.createdAt,
    stars: (a, b) => b.stars - a.stars || b.pushedAt - a.pushedAt,
    name: (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }),
    language: (a, b) => (a.language ?? '~').localeCompare(b.language ?? '~') || a.name.localeCompare(b.name)
};
const ASCENDING = new Set(['name', 'language']);

const KEEP = ['name', 'html_url', 'description', 'fork', 'language', 'stargazers_count',
    'forks_count', 'topics', 'homepage', 'pushed_at', 'created_at', 'archived'];
const trim = (repo) => Object.fromEntries(KEEP.map(key => [key, repo[key]]));

const normalize = (repo) => ({
    name: repo.name,
    url: repo.html_url,
    description: repo.description ?? '',
    language: repo.language ?? null,
    stars: repo.stargazers_count ?? 0,
    forks: repo.forks_count ?? 0,
    topics: repo.topics ?? [],
    homepage: repo.homepage ?? '',
    fork: Boolean(repo.fork),
    archived: Boolean(repo.archived),
    pushedAt: new Date(repo.pushed_at),
    createdAt: new Date(repo.created_at)
});

/* ---------- data ---------- */

async function fetchJSON(url, timeout = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
            const err = new Error(`${res.status} ${res.statusText} for ${url}`);
            err.rateLimited = res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0';
            throw err;
        }
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
}

// Cache first, then the live API, then the copy committed with the site
async function loadRepos({ fresh = false } = {}) {
    const cached = fresh ? null : repoCache.read();
    if (cached) return { repos: cached, source: 'cache' };

    try {
        const live = (await fetchJSON(API)).map(trim);
        repoCache.write(live);
        return { repos: live, source: 'live' };
    } catch (err) {
        debug.warn('GitHub API unavailable, falling back to the snapshot.', err);
        const snapshot = await fetchJSON(SNAPSHOT);
        return {
            repos: snapshot.repos,
            source: 'snapshot',
            savedAt: new Date(snapshot.savedAt),
            reason: err.rateLimited ? 'rate-limit' : err.name === 'AbortError' ? 'timeout' : 'offline'
        };
    }
}

/* ---------- search ---------- */

// Plain words plus a few GitHub-style qualifiers:
//   lang:python  topic:ml  stars:>2  stars:1..5  is:fork  is:source
const QUALIFIER = /\b(lang|language|topic|stars|is):("[^"]*"|\S+)/gi;
const NUMBER_RULE = /^(?:(>=|<=|>|<)?(\d+)|(\d+)\.\.(\d+))$/;

const COMPARE = {
    '>': n => x => x > n,
    '>=': n => x => x >= n,
    '<': n => x => x < n,
    '<=': n => x => x <= n
};

function starsRule(value) {
    const match = value.match(NUMBER_RULE);
    if (!match) return null;
    const [, op, n, lo, hi] = match;
    if (lo !== undefined) return x => x >= +lo && x <= +hi;
    return op ? COMPARE[op](+n) : x => x === +n;
}

export function parseQuery(input) {
    const tests = [];
    const problems = [];
    let forkMode = null;

    const rest = input.replace(QUALIFIER, (token, key, raw) => {
        const value = raw.replace(/"/g, '').toLowerCase();
        switch (key.toLowerCase()) {
            case 'lang':
            case 'language':
                tests.push(repo => (repo.language ?? 'other').toLowerCase() === value);
                break;
            case 'topic':
                tests.push(repo => repo.topics.some(topic => topic.includes(value)));
                break;
            case 'stars': {
                const rule = starsRule(value);
                if (rule) tests.push(repo => rule(repo.stars));
                else problems.push(token);
                break;
            }
            case 'is':
                if (value === 'fork') forkMode = 'fork';
                else if (value === 'source') forkMode = 'source';
                else problems.push(token);
                break;
        }
        return ' ';
    });

    rest.toLowerCase().split(/\s+/).filter(Boolean).forEach(word => {
        tests.push(repo => `${repo.name} ${repo.description} ${repo.topics.join(' ')}`.toLowerCase().includes(word));
    });

    return { tests, problems, forkMode };
}

/* ---------- section ---------- */

export function initRepoIndex(section) {
    const el = {
        form: $('.repo-controls', section),
        query: $('#repo-q', section),
        lang: $('#repo-lang', section),
        sort: $('#repo-sort', section),
        forks: $('#repo-forks', section),
        views: $$('input[name="repo-view"]', section),
        stats: $('#repo-stats', section),
        langbar: $('#repo-langbar', section),
        status: $('#repo-status', section),
        announcer: $('#repo-announcer', section),
        cards: $('#repo-cards', section),
        table: $('#repo-table', section),
        shelf: $('#repo-shelf', section),
        pins: $('#repo-pins', section),
        template: $('#repo-card-tpl', section)
    };

    const defaults = { sort: 'pushed', reverse: false, forks: false, view: 'cards', language: 'all' };
    const state = {
        ...defaults,
        ...local.get(PREFS_KEY, {}),
        query: '',
        repos: [],
        pins: local.get(PINS_KEY, []),
        loaded: false
    };
    if (!SORTS[state.sort]) state.sort = defaults.sort;

    const savePrefs = () => {
        const { sort, reverse, forks, view, language } = state;
        local.set(PREFS_KEY, { sort, reverse, forks, view, language });
    };
    const announce = (message) => { el.announcer.textContent = message; };

    // put saved preferences back into the controls
    el.sort.value = state.sort;
    el.forks.checked = state.forks;
    el.views.forEach(radio => { radio.checked = radio.value === state.view; });

    /* ----- derived data ----- */

    const byName = () => new Map(state.repos.map(repo => [repo.name, repo]));

    function visibleRepos() {
        const { tests, problems, forkMode } = parseQuery(state.query);
        const compare = SORTS[state.sort];
        const list = state.repos
            .filter(repo => forkMode === 'fork' ? repo.fork : forkMode === 'source' ? !repo.fork : state.forks || !repo.fork)
            .filter(repo => state.language === 'all' || (repo.language ?? 'Other') === state.language)
            .filter(repo => tests.every(test => test(repo)))
            .sort((a, b) => state.reverse ? compare(b, a) : compare(a, b));
        return { list, problems };
    }

    /* ----- rendering ----- */

    function renderSkeleton() {
        el.cards.replaceChildren(...Array.from({ length: 6 }, () => {
            const ghost = document.createElement('li');
            ghost.className = 'repo-card repo-card--ghost';
            ghost.setAttribute('aria-hidden', 'true');
            return ghost;
        }));
    }

    // GitHub reports no language for most forks, so count only what's on show
    function renderLanguages() {
        const counts = state.repos.filter(repo => state.forks || !repo.fork).reduce((acc, repo) => {
            const key = repo.language ?? 'Other';
            acc.set(key, (acc.get(key) ?? 0) + 1);
            return acc;
        }, new Map());

        const options = [...counts].sort((a, b) => b[1] - a[1]).map(([language, count]) => {
            const option = new Option(`${language} (${count})`, language);
            option.selected = language === state.language;
            return option;
        });
        el.lang.replaceChildren(new Option('All languages', 'all'), ...options);
        if (!counts.has(state.language)) state.language = 'all';
        el.lang.value = state.language;
    }

    function renderStats() {
        const own = state.repos.filter(repo => !repo.fork);
        const stars = own.reduce((sum, repo) => sum + repo.stars, 0);
        const forked = state.repos.length - own.length;
        el.stats.innerHTML = [
            [own.length, 'original repos'],
            [forked, 'forks I\'ve contributed to'],
            [formatNumber(stars), 'stars']
        ].map(([value, label]) => `<span class="repo-stat"><b>${value}</b> ${label}</span>`).join('');

        // language share of my own repos, drawn as one stacked SVG bar
        const shares = Object.entries(own.reduce((acc, repo) => {
            const key = repo.language ?? 'Other';
            acc[key] = (acc[key] ?? 0) + 1;
            return acc;
        }, {})).sort((a, b) => b[1] - a[1]);

        let x = 0;
        const bars = shares.map(([language, count]) => {
            const width = (count / own.length) * 100;
            const rect = `<rect x="${x}" width="${width}" height="6" fill="${colorFor(language)}"><title>${escapeHTML(language)}: ${count}</title></rect>`;
            x += width;
            return rect;
        }).join('');
        const summary = shares.map(([language, count]) => `${language} ${Math.round((count / own.length) * 100)}%`).join(', ');

        el.langbar.innerHTML = `
            <svg viewBox="0 0 100 6" preserveAspectRatio="none" role="img" aria-label="${escapeHTML(`Languages across my repos: ${summary}`)}">${bars}</svg>
            <ul>${shares.map(([language, count]) => `<li style="--dot:${colorFor(language)}">${escapeHTML(language)} <span>${Math.round((count / own.length) * 100)}%</span></li>`).join('')}</ul>`;
    }

    function cardFor(repo, pinned) {
        const card = el.template.content.firstElementChild.cloneNode(true);
        card.dataset.name = repo.name;
        card.dataset.fork = repo.fork;
        if (repo.archived) card.dataset.archived = 'true';
        card.style.setProperty('--lang', colorFor(repo.language));

        $('.repo-card__lang', card).textContent = repo.language ?? 'Other';
        $('.repo-card__stars', card).textContent = repo.stars ? `★ ${repo.stars}` : '';
        const link = $('.repo-card__name a', card);
        link.href = repo.url;
        link.textContent = repo.name;
        $('.repo-card__desc', card).textContent = repo.description || 'No description yet.';

        const topics = $('.repo-card__topics', card);
        topics.append(...repo.topics.slice(0, 4).map(topic => Object.assign(document.createElement('li'), { textContent: topic })));
        if (!repo.topics.length) topics.remove();

        const time = $('time', card);
        time.dateTime = repo.pushedAt.toISOString();
        time.textContent = `pushed ${timeAgo(repo.pushedAt)}`;
        time.title = repo.pushedAt.toLocaleString();

        const pin = $('.repo-pin', card);
        pin.setAttribute('aria-pressed', pinned);
        pin.setAttribute('aria-label', `${pinned ? 'Unpin' : 'Pin'} ${repo.name}`);
        pin.textContent = pinned ? 'Pinned' : 'Pin';
        return card;
    }

    function renderCards(list) {
        const pinned = new Set(state.pins);
        const fragment = document.createDocumentFragment();
        list.forEach(repo => fragment.append(cardFor(repo, pinned.has(repo.name))));
        el.cards.replaceChildren(fragment);
    }

    function renderTable(list) {
        const body = el.table.tBodies[0];
        body.replaceChildren();
        list.forEach(repo => {
            const row = body.insertRow();
            const name = document.createElement('th');
            name.scope = 'row';
            name.innerHTML = `<a href="${escapeHTML(repo.url)}" target="_blank" rel="noopener">${escapeHTML(repo.name)}</a>${repo.fork ? ' <small>fork</small>' : ''}`;
            row.append(name);

            const cells = [
                ['Language', repo.language ?? 'Other'],
                ['Stars', repo.stars],
                ['Updated', timeAgo(repo.pushedAt)]
            ];
            cells.forEach(([label, value]) => {
                const cell = row.insertCell();
                cell.dataset.label = label;
                cell.textContent = value;
            });
            row.cells[1].style.setProperty('--lang', colorFor(repo.language));
        });

        $$('th[data-sort]', el.table).forEach(th => {
            const key = th.dataset.sort;
            const ascending = ASCENDING.has(key) !== state.reverse;
            th.setAttribute('aria-sort', key === state.sort ? (ascending ? 'ascending' : 'descending') : 'none');
        });
    }

    function renderPins() {
        const known = byName();
        // forget pins for repos that were renamed or deleted
        if (state.loaded) state.pins = state.pins.filter(name => known.has(name));
        el.pins.replaceChildren(...state.pins.map((name, index) => {
            const repo = known.get(name);
            const chip = document.createElement('li');
            chip.className = 'repo-chip';
            chip.draggable = true;
            chip.tabIndex = 0;
            chip.dataset.name = name;
            chip.style.setProperty('--lang', colorFor(repo?.language));
            chip.setAttribute('aria-label', `${name}, pinned ${index + 1} of ${state.pins.length}. Arrow keys move it, Delete removes it.`);
            chip.innerHTML = `<a href="${escapeHTML(repo?.url ?? `https://github.com/${USER}/${name}`)}" target="_blank" rel="noopener" tabindex="-1">${escapeHTML(name)}</a>
                <button type="button" class="repo-chip__remove" aria-label="Unpin ${escapeHTML(name)}">&times;</button>`;
            return chip;
        }));
        el.shelf.classList.toggle('is-empty', state.pins.length === 0);
        $('.repo-shelf__count', el.shelf).textContent = `${state.pins.length}/${MAX_PINS}`;
    }

    function render() {
        if (!state.loaded) return;
        const { list, problems } = visibleRepos();
        const showTable = state.view === 'table';

        el.cards.hidden = showTable;
        el.table.hidden = !showTable;
        (showTable ? renderTable : renderCards)(list);
        renderPins();

        let message = list.length
            ? `Showing ${list.length} of ${state.repos.length} repos.`
            : 'Nothing matches that. ';
        if (problems.length) message += ` Couldn't read ${problems.join(', ')}; try stars:>2 or is:fork.`;
        el.status.querySelector('.repo-status__text').textContent = message;
        el.status.querySelector('.repo-reset').hidden = !(state.query || state.language !== 'all');
    }

    /* ----- pinning ----- */

    function pinAt(name, index = state.pins.length) {
        const from = state.pins.indexOf(name);
        if (from === -1 && state.pins.length >= MAX_PINS) {
            announce(`The shelf holds ${MAX_PINS}. Unpin one first.`);
            el.shelf.classList.add('is-full');
            setTimeout(() => el.shelf.classList.remove('is-full'), 600);
            return;
        }
        const pins = state.pins.filter(pin => pin !== name);
        const target = Math.max(0, Math.min(from !== -1 && from < index ? index - 1 : index, pins.length));
        pins.splice(target, 0, name);
        state.pins = pins;
        local.set(PINS_KEY, pins);
        announce(from === -1 ? `Pinned ${name}.` : `Moved ${name} to position ${target + 1} of ${pins.length}.`);
        render();
    }

    function unpin(name) {
        state.pins = state.pins.filter(pin => pin !== name);
        local.set(PINS_KEY, state.pins);
        announce(`Unpinned ${name}.`);
        render();
    }

    /* ----- controls ----- */

    const onQuery = debounce(() => {
        state.query = el.query.value.trim();
        render();
    }, 160);

    el.form.addEventListener('submit', e => e.preventDefault());
    el.query.addEventListener('input', onQuery);
    el.query.addEventListener('keydown', e => {
        if (e.key === 'Escape' && el.query.value) {
            el.query.value = '';
            onQuery();
        }
    });

    el.form.addEventListener('change', e => {
        const { target } = e;
        if (target === el.lang) state.language = target.value;
        if (target === el.forks) {
            state.forks = target.checked;
            renderLanguages();
        }
        if (target === el.sort) {
            state.sort = target.value;
            state.reverse = false;
        }
        if (target.name === 'repo-view') state.view = target.value;
        savePrefs();
        render();
    });

    el.table.tHead.addEventListener('click', e => {
        const th = e.target.closest('th[data-sort]');
        if (!th) return;
        const key = th.dataset.sort;
        state.reverse = key === state.sort ? !state.reverse : false;
        state.sort = key;
        if ([...el.sort.options].some(option => option.value === key)) el.sort.value = key;
        savePrefs();
        render();
    });

    el.status.addEventListener('click', e => {
        if (e.target.closest('.repo-reset')) {
            el.query.value = '';
            state.query = '';
            state.language = 'all';
            el.lang.value = 'all';
            savePrefs();
            render();
            el.query.focus();
        }
        if (e.target.closest('.repo-retry')) load({ fresh: true });
    });

    el.cards.addEventListener('click', e => {
        const button = e.target.closest('.repo-pin');
        if (!button) return;
        const { name } = button.closest('.repo-card').dataset;
        state.pins.includes(name) ? unpin(name) : pinAt(name);
        // the card was re-rendered, so put focus back on its new button
        $(`.repo-card[data-name="${CSS.escape(name)}"] .repo-pin`, el.cards)?.focus();
    });

    el.pins.addEventListener('click', e => {
        const remove = e.target.closest('.repo-chip__remove');
        if (remove) unpin(remove.closest('.repo-chip').dataset.name);
    });

    el.pins.addEventListener('keydown', e => {
        const chip = e.target.closest('.repo-chip');
        if (!chip || e.target !== chip) return;
        const { name } = chip.dataset;
        const index = state.pins.indexOf(name);
        const focusChip = (i) => el.pins.children[i]?.focus();

        switch (e.key) {
            case 'ArrowLeft':
            case 'ArrowUp':
                e.preventDefault();
                if (index > 0) { pinAt(name, index - 1); focusChip(index - 1); }
                break;
            case 'ArrowRight':
            case 'ArrowDown':
                e.preventDefault();
                if (index < state.pins.length - 1) { pinAt(name, index + 2); focusChip(index + 1); }
                break;
            case 'Delete':
            case 'Backspace':
                e.preventDefault();
                unpin(name);
                focusChip(Math.min(index, state.pins.length - 1));
                break;
            case 'Enter':
                chip.querySelector('a').click();
                break;
        }
    });

    // "/" jumps to search, like on GitHub
    document.addEventListener('keydown', e => {
        if (e.key !== '/' || isTyping() || e.metaKey || e.ctrlKey) return;
        const box = section.getBoundingClientRect();
        if (box.bottom < 0 || box.top > innerHeight) return;
        e.preventDefault();
        el.query.focus();
    });

    /* ----- drag and drop ----- */

    let dragging = null;

    // index in the shelf the pointer is currently over
    const dropIndex = (x, y) => {
        const chips = [...el.pins.children];
        const index = chips.findIndex(chip => {
            if (dragging?.from === 'shelf' && chip.dataset.name === dragging.name) return false;
            const box = chip.getBoundingClientRect();
            return y < box.bottom && x < box.left + box.width / 2;
        });
        return index === -1 ? chips.length : index;
    };

    const clearMarkers = () => {
        $$('.is-drop-before', el.pins).forEach(chip => chip.classList.remove('is-drop-before'));
        el.shelf.classList.remove('is-over');
        el.cards.classList.remove('is-drop-out');
        section.classList.remove('is-dragging');
    };

    section.addEventListener('dragstart', e => {
        const item = e.target.closest?.('.repo-card, .repo-chip');
        if (!item) return;
        dragging = { name: item.dataset.name, from: item.classList.contains('repo-chip') ? 'shelf' : 'list' };
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dragging.name);
        requestAnimationFrame(() => item.classList.add('is-dragging'));
        section.classList.add('is-dragging');
    });

    section.addEventListener('dragend', () => {
        $$('.is-dragging', section).forEach(node => node.classList.remove('is-dragging'));
        section.classList.remove('is-dragging');
        clearMarkers();
        dragging = null;
    });

    el.shelf.addEventListener('dragover', e => {
        if (!dragging) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        el.shelf.classList.add('is-over');
        const index = dropIndex(e.clientX, e.clientY);
        $$('.repo-chip', el.pins).forEach((chip, i) => chip.classList.toggle('is-drop-before', i === index));
    });

    el.shelf.addEventListener('dragleave', e => {
        if (!el.shelf.contains(e.relatedTarget)) clearMarkers();
    });

    el.shelf.addEventListener('drop', e => {
        e.preventDefault();
        const name = e.dataTransfer.getData('text/plain') || dragging?.name;
        if (name) pinAt(name, dropIndex(e.clientX, e.clientY));
        clearMarkers();
    });

    // dragging a chip back onto the list unpins it
    el.cards.addEventListener('dragover', e => {
        if (dragging?.from !== 'shelf') return;
        e.preventDefault();
        el.cards.classList.add('is-drop-out');
    });
    el.cards.addEventListener('dragleave', e => {
        if (!el.cards.contains(e.relatedTarget)) el.cards.classList.remove('is-drop-out');
    });
    el.cards.addEventListener('drop', e => {
        if (dragging?.from !== 'shelf') return;
        e.preventDefault();
        unpin(dragging.name);
        clearMarkers();
    });

    /* ----- loading ----- */

    async function load(options) {
        section.setAttribute('aria-busy', 'true');
        el.status.dataset.state = 'loading';
        el.status.querySelector('.repo-status__text').textContent = 'Asking GitHub…';
        renderSkeleton();
        debug.time('repo-index:load');

        try {
            const { repos, source, savedAt, reason } = await loadRepos(options);
            state.repos = repos.map(normalize);
            state.loaded = true;
            debug.time('repo-index:load', true);
            debug.table(state.repos, ['name', 'language', 'stars', 'fork']);

            renderLanguages();
            renderStats();
            render();

            const notes = {
                live: 'Live from the GitHub API.',
                cache: 'From this tab\'s cache, refreshed every 30 minutes.',
                snapshot: `GitHub ${reason === 'rate-limit' ? 'is rate limiting this network' : 'didn\'t answer'}, so this is the copy saved ${timeAgo(savedAt)}.`
            };
            $('.repo-source', section).textContent = notes[source];
            el.status.dataset.state = source;
        } catch (err) {
            debug.warn('Repo index could not load.', err);
            el.cards.replaceChildren();
            el.status.dataset.state = 'error';
            el.status.querySelector('.repo-status__text').textContent = 'Couldn\'t reach GitHub or the saved copy. Check your connection and';
        } finally {
            section.removeAttribute('aria-busy');
        }
    }

    renderPins();
    return { load };
}
