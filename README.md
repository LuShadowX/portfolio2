# Portfolio2

My personal site: who I am, what I've built, the open-source fixes I've landed, and a live index of everything on my GitHub.

**Live:** https://lushadowx.github.io/portfolio2/

No framework and no build step. It's plain HTML, CSS and JavaScript (ES modules), hosted on GitHub Pages.

## What's on the page

| Section | What it does |
|---|---|
| Intro + hero | Paper-cutout stage you can drag around, animated name lockup |
| Building in public | GitHub contribution heatmap for the last 12 months, drawn as SVG |
| About / Skills | Scroll-revealed story, skills orbit on a canvas particle globe |
| Certificates | 3D keyboard, press a key to open a certificate |
| Projects / Open source / Notes | Slide-in project catalogue, read from JSON in the page |
| **Repo index** | Live list of my repos from the GitHub API: search with filters, cards or a sortable table, pin to a shelf with drag and drop |
| **Contact** | Validated form that saves your draft, plus a "from the desk" card with both our clocks, a map and an optional distance check |

## Repo index

- Pulls `api.github.com/users/LuShadowX/repos` with `fetch` + `async/await`, with an 8 second timeout through `AbortController`.
- Results are cached in `sessionStorage` for 30 minutes. GitHub only allows 60 unauthenticated calls an hour, so this matters.
- If the API fails (rate limit, offline, timeout), it falls back to `assets/data/repos.json`, a snapshot committed with the site, and says so on the page.
- The search box understands GitHub-style qualifiers, parsed with regular expressions:
  `lang:python`, `topic:cli`, `stars:>2`, `stars:1..5`, `is:fork`, `is:source`, plus plain words.
- Cards or a table. The table has a caption, `scope` on the headers, and `aria-sort` on the column you sorted by. On narrow screens a container query turns its rows into stacked blocks.
- Pin up to 6 repos to the shelf by button or by dragging (HTML Drag and Drop API). Chips can be reordered by drag or with the arrow keys, and Delete removes one. Pins and view settings are saved in `localStorage`.
- Press `/` to jump to search, `Esc` to clear it.

## Contact form

- `novalidate` on the form, with my own validation in `modules/contact-form.js`: Unicode-aware name regex, email regex, a required reason `<select>`, and message length and link-count limits.
- Errors show after you leave a field, then update while you type. The fields get `aria-invalid` and point to their error text with `aria-describedby`. On submit, focus jumps to the first problem.
- Your draft is autosaved to `localStorage` (debounced) and restored on the next visit, with a "Start over" button.
- A hidden honeypot field catches bots. There is no backend, so sending opens your email app with a `mailto:` link.

## From the desk

- Two live clocks, mine (Asia/Kolkata) and yours, built with `Intl.DateTimeFormat`. The time-zone gap is read from the `shortOffset` name with a regex.
- OpenStreetMap `<iframe>` of LPU.
- "How far away are you?" uses the Geolocation API (only on click) and the haversine formula. Nothing is stored or sent.
- An optional voice note: a custom `<audio>` player driven by `loadedmetadata`, `timeupdate`, `play`, `pause` and `ended`. It stays hidden until `assets/audio/hello.m4a` exists.

## Project structure

```
Portfolio
├── index.html
├── robots.txt, sitemap.xml
└── assets
    ├── css
    │   ├── main.css          # whole site
    │   └── repo-index.css    # repo index section
    ├── js
    │   ├── common.js         # menu, reveals, heatmap, cursor, certificates, projects
    │   ├── blackhole.js      # canvas effect
    │   ├── app.js            # entry for the ES modules below
    │   └── modules
    │       ├── repo-index.js
    │       ├── contact-form.js
    │       ├── desk.js
    │       ├── storage.js    # safe local/session storage + TTL cache
    │       ├── utils.js      # debounce, escapeHTML, timeAgo, ...
    │       └── debug.js      # ?debug logging, timings, error guard
    ├── data/repos.json       # offline snapshot for the repo index
    └── images, video
```

## Running it locally

ES modules don't load from `file://`, so serve the folder:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Add `?debug` to the URL (`http://localhost:8000/?debug`) to see load timings, a `console.table` of the repos, and warnings when a feature fails.

To refresh the offline snapshot:

```bash
gh api "users/LuShadowX/repos?per_page=100&sort=pushed" > /tmp/repos.json
# then keep only the fields the page uses and wrap it as {"savedAt": ..., "repos": [...]}
```

## Accessibility and performance notes

- Skip link, visible `:focus-visible` styles, live regions for search results and pin changes, and keyboard alternatives for everything you can drag.
- `prefers-reduced-motion` turns off the shimmer, shakes and transitions.
- The GitHub request waits until the repo section is about 600px from the viewport (IntersectionObserver). Search input is debounced, and lists render through a `DocumentFragment`.
- SEO: meta description, canonical URL, Open Graph tags, JSON-LD `Person` schema, sitemap and robots.txt.

## Deploying

Push to `main`. GitHub Pages serves the repository root.
