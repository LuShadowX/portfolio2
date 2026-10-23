/* FILE: assets/js/modules/debug.js */

// Add ?debug to the URL to get timings and data tables in the console.
// Without it these helpers stay quiet, so they can be left in production code.
export const enabled = new URLSearchParams(location.search).has('debug');

const tag = ['%cportfolio', 'color:#c15f3c;font-weight:700'];

export const log = (...args) => { if (enabled) console.log(...tag, ...args); };
export const table = (rows, columns) => { if (enabled) console.table(rows, columns); };

export const warn = (...args) => console.warn(...tag, ...args);

// time('repos') ... time('repos', true) logs the gap between the two marks
export const time = (label, end = false) => {
    if (!enabled) return;
    if (!end) {
        performance.mark(`${label}:start`);
        return;
    }
    performance.mark(`${label}:end`);
    const { duration } = performance.measure(label, `${label}:start`, `${label}:end`);
    log(`${label} took ${duration.toFixed(1)} ms`);
};

// One feature crashing shouldn't take the rest of the page with it
export const guard = (name, init) => {
    try {
        time(name);
        init();
        time(name, true);
    } catch (err) {
        warn(`${name} failed to start`, err);
    }
};
