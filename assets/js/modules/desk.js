/* FILE: assets/js/modules/desk.js */

import { $, formatNumber } from './utils.js';

const MY_ZONE = 'Asia/Kolkata';
const DESK = { lat: 31.2560, lon: 75.7051 }; // LPU, Phagwara

const clock = (timeZone) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone });

// "GMT+5:30" -> 330 (minutes east of UTC)
const OFFSET_RE = /GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?/;
function offsetMinutes(timeZone, date = new Date()) {
    const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' })
        .formatToParts(date)
        .find(part => part.type === 'timeZoneName')?.value ?? 'GMT';
    const [, sign = '+', hours = 0, minutes = 0] = name.match(OFFSET_RE) ?? [];
    return (sign === '-' ? -1 : 1) * (Number(hours) * 60 + Number(minutes));
}

function gapText(minutes) {
    if (minutes === 0) return 'Same time zone as me.';
    const hours = Math.abs(minutes) / 60;
    const amount = Number.isInteger(hours) ? hours : hours.toFixed(1);
    return `I'm ${amount} hour${hours === 1 ? '' : 's'} ${minutes > 0 ? 'ahead of' : 'behind'} you.`;
}

function moodAt(hour) {
    if (hour < 7) return 'Probably asleep, so expect a reply in the morning.';
    if (hour < 9) return 'Waking up with coffee and the GitHub notifications.';
    if (hour < 17) return 'In class or at the desk. Replies within a few hours.';
    if (hour < 23) return 'Usually coding around now. Good time to reach me.';
    return 'Late-night commits. I might still answer.';
}

// Great-circle distance in km (haversine)
function distanceKm(a, b) {
    const rad = (deg) => (deg * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const locate = (options) => new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
        reject(Object.assign(new Error('unsupported'), { code: 0 }));
        return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
});

const GEO_ERRORS = {
    0: 'This browser can\'t share a location.',
    1: 'No problem, location stays with you.',
    2: 'Your device couldn\'t work out where it is.',
    3: 'That took too long. Try again?'
};

function initClocks(desk) {
    const mine = $('#desk-mine', desk);
    const yours = $('#desk-yours', desk);
    const note = $('#desk-note', desk);
    const visitorZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const myClock = clock(MY_ZONE);
    const yourClock = clock(visitorZone);

    $('#desk-zone', desk).textContent = visitorZone.replace(/_/g, ' ').split('/').pop();

    const tick = () => {
        const now = new Date();
        mine.textContent = myClock.format(now);
        mine.dateTime = now.toISOString();
        yours.textContent = yourClock.format(now);
        yours.dateTime = now.toISOString();

        const myHour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: MY_ZONE }).format(now));
        note.textContent = `${gapText(offsetMinutes(MY_ZONE, now) - offsetMinutes(visitorZone, now))} ${moodAt(myHour)}`;

        // line the next tick up with the start of the next second
        setTimeout(tick, 1000 - (Date.now() % 1000));
    };
    tick();
}

function initDistance(desk) {
    const button = $('#desk-locate', desk);
    const output = $('#desk-distance', desk);

    button.addEventListener('click', async () => {
        button.disabled = true;
        output.textContent = 'Asking your browser…';
        try {
            const { coords } = await locate({ enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
            const km = distanceKm({ lat: coords.latitude, lon: coords.longitude }, DESK);
            output.textContent = km < 2
                ? 'You\'re basically on campus. Come say hi.'
                : `You're about ${formatNumber(Math.round(km))} km from my desk. Nothing is stored or sent anywhere.`;
            button.hidden = true;
        } catch (err) {
            output.textContent = GEO_ERRORS[err.code] ?? GEO_ERRORS[2];
            button.disabled = false;
        }
    });
}

function initVoiceNote(desk) {
    const player = $('.voice', desk);
    const audio = $('audio', player);
    const toggle = $('.voice__toggle', player);
    const seek = $('.voice__seek', player);
    const time = $('.voice__time', player);

    const format = (seconds) => {
        const s = Math.floor(seconds || 0);
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };
    const setPlaying = (playing) => {
        player.classList.toggle('is-playing', playing);
        toggle.setAttribute('aria-label', playing ? 'Pause voice note' : 'Play voice note');
    };

    // The card only shows once there's actually a recording to play
    audio.addEventListener('loadedmetadata', () => {
        player.hidden = false;
        seek.max = audio.duration;
        time.textContent = format(audio.duration);
    });
    audio.lastElementChild?.addEventListener('error', () => { player.hidden = true; });

    audio.addEventListener('timeupdate', () => {
        seek.value = audio.currentTime;
        seek.style.setProperty('--progress', `${(audio.currentTime / audio.duration) * 100 || 0}%`);
        time.textContent = format(audio.duration - audio.currentTime);
    });
    audio.addEventListener('play', () => setPlaying(true));
    audio.addEventListener('pause', () => setPlaying(false));
    audio.addEventListener('ended', () => {
        audio.currentTime = 0;
        time.textContent = format(audio.duration);
    });

    toggle.addEventListener('click', () => {
        audio.paused ? audio.play().catch(() => setPlaying(false)) : audio.pause();
    });
    seek.addEventListener('input', () => { audio.currentTime = Number(seek.value); });
}

export function initDesk(desk) {
    initClocks(desk);
    initDistance(desk);
    initVoiceNote(desk);
}
