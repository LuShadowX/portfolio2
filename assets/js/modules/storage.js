/* FILE: assets/js/modules/storage.js */

// Web Storage throws in some browsers (Safari private tabs, blocked site data),
// so every read and write here fails soft and the page keeps working without it.
const wrap = (name) => {
    const area = () => window[name];
    return {
        get(key, fallback = null) {
            try {
                const raw = area().getItem(key);
                return raw === null ? fallback : JSON.parse(raw);
            } catch {
                return fallback;
            }
        },
        set(key, value) {
            try {
                area().setItem(key, JSON.stringify(value));
                return true;
            } catch {
                return false;
            }
        },
        remove(key) {
            try { area().removeItem(key); } catch { /* nothing to clean up */ }
        }
    };
};

export const local = wrap('localStorage');
export const session = wrap('sessionStorage');

// sessionStorage entry that goes stale after ttl ms
export const cache = (key, ttl) => ({
    read() {
        const hit = session.get(key);
        return hit && Date.now() - hit.savedAt < ttl ? hit.value : null;
    },
    write(value) {
        session.set(key, { savedAt: Date.now(), value });
    },
    clear() {
        session.remove(key);
    }
});
