// UI for the viewer. Everything read from a file is untrusted: it is only ever set as textContent, never as HTML.
import { readMeta } from './exif.js';
import { ICONS } from './icons.js';

const STRINGS = {
    tr: {
        title: 'Fotoğrafının içinde ne var?',
        lead: 'Bir fotoğraf seç ya da buraya sürükle. İçine gizlenmiş konumu, telefonu ve çekim saatini göster.',
        lock: 'Dosya bilgisayarından ya da telefonundan çıkmaz. Bu sayfanın herhangi bir yere bağlanması tarayıcı tarafından engellenir.',
        pick: 'Fotoğraf seç',
        pickSub: 'ya da buraya sürükle · JPEG, PNG, WebP',
        open: 'Açık kaynak:',
        source: 'kaynak kodu GitHub’da',
        clean: 'Bunları silmek için:',
        risky: 'Bu fotoğraf nerede çekildiğini söylüyor',
        some: 'Bu fotoğraf iz taşıyor',
        none: 'Görünür bir iz yok',
        riskySub: 'Paylaşırsan, isteyen herkes konumu haritada görebilir.',
        someSub: 'Konum yok ama cihaz ya da tarih bilgisi var.',
        noneSub: 'Bu dosyada okunabilir gizli bilgi bulunamadı.',
        location: 'Konum',
        device: 'Cihaz',
        date: 'Çekim zamanı',
        other: 'Diğer izler',
        noValue: 'Yok',
        map: 'Haritada aç',
        mapNote: 'Bağlantıya tıklarsan koordinat OpenStreetMap’e gider.',
        serial: 'Seri numarası',
        owner: 'Sahip adı',
        software: 'Yazılım',
        lens: 'Lens',
        thumb: 'Küçük önizleme gömülü (kırpılmadan önceki hali görünebilir)',
        xmp: 'XMP verisi var',
        iptc: 'IPTC verisi var',
        comment: 'Yorum',
        all: 'Tüm etiketler',
        file: 'Dosya',
        heic: 'HEIC/AVIF henüz desteklenmiyor. iPhone’da fotoğrafı paylaşırken “Daha Uyumlu” biçimi seç ya da JPEG olarak dışa aktar.',
        unknown: 'Bu dosya biçimi tanınmadı.',
        android: 'Not: Android, “fotoğraf konumu” izni olmayan uygulamalardan (tarayıcılar dahil) konumu gizler. Telefonda konum görünmüyorsa dosyada yine de olabilir; emin olmak için dosyayı bilgisayardan kontrol et.',
        another: 'Başka fotoğraf seç',
        bytes: 'bayt',
    },
    en: {
        title: 'What’s inside your photo?',
        lead: 'Pick a photo or drop it here. See the location, phone and capture time hidden inside it.',
        lock: 'The file never leaves your computer or phone. The browser blocks this page from connecting anywhere.',
        pick: 'Choose a photo',
        pickSub: 'or drop it here · JPEG, PNG, WebP',
        open: 'Open source:',
        source: 'source code on GitHub',
        clean: 'To remove all this:',
        risky: 'This photo says where it was taken',
        some: 'This photo carries traces',
        none: 'No visible traces',
        riskySub: 'If you share it, anyone can see the location on a map.',
        someSub: 'No location, but device or date details are inside.',
        noneSub: 'No readable hidden details were found in this file.',
        location: 'Location',
        device: 'Device',
        date: 'Taken',
        other: 'Other traces',
        noValue: 'None',
        map: 'Open on map',
        mapNote: 'Clicking the link sends the coordinates to OpenStreetMap.',
        serial: 'Serial number',
        owner: 'Owner name',
        software: 'Software',
        lens: 'Lens',
        thumb: 'Embedded thumbnail (may show the photo before cropping)',
        xmp: 'XMP data present',
        iptc: 'IPTC data present',
        comment: 'Comment',
        all: 'All tags',
        file: 'File',
        heic: 'HEIC/AVIF isn’t supported yet. On iPhone, share the photo as “Most Compatible” or export it as JPEG.',
        unknown: 'This file format wasn’t recognised.',
        android: 'Note: Android hides the location from apps without “photo location” access, browsers included. If no location shows on your phone it may still be in the file; check it on a computer to be sure.',
        another: 'Choose another photo',
        bytes: 'bytes',
    },
};

const root = document.documentElement;
let lang = 'tr';
let last = null; // {name, size, meta, url} of the shown file, re-rendered on language change
const t = (k) => STRINGS[lang][k];

/** Small DOM builder: el('div', {class: 'x'}, child, 'text'). Strings become text nodes, never HTML. */
function el(tag, attrs = {}, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    for (const c of children) if (c !== null && c !== undefined && c !== false) n.append(c instanceof Node ? c : String(c));
    return n;
}

function icon(name, cls = 'i') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 512 512');
    svg.setAttribute('class', cls);
    svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', ICONS[name]);
    svg.append(p);
    return svg;
}

function setLang(l) {
    lang = l;
    root.lang = l;
    root.dataset.lang = l;
    document.getElementById('lang').textContent = l === 'tr' ? 'EN' : 'TR';
    document.querySelectorAll('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
    if (last) render(last);
}

/** Readable form of any tag value. */
function show(v) {
    if (v instanceof Uint8Array) {
        if (v.length <= 8) return Array.from(v).join('.');
        const text = String.fromCharCode(...v.subarray(0, 64)).replace(/[^\x20-\x7e]/g, '');
        return text.length > 8 ? text : `${v.length} ${t('bytes')}`;
    }
    if (Array.isArray(v)) return v.map((x) => (typeof x === 'number' ? +x.toFixed(4) : x)).join(', ');
    if (typeof v === 'number') return String(+v.toFixed(4));
    return String(v ?? '');
}

function row(label, value) {
    return el('div', { class: 'row' }, el('span', { class: 'k' }, label), el('span', { class: 'v' }, value ?? t('noValue')));
}

function card(iconName, color, title, ...rows) {
    return el('div', { class: 'card' }, el('div', { class: 'card-h' }, el('span', { class: `badge ${color}` }, icon(iconName)), el('h3', {}, title)), ...rows);
}

function render({ name, size, meta, url }) {
    const box = document.getElementById('result');
    box.replaceChildren();
    box.hidden = false;

    const head = el('div', { class: 'file' }, el('img', { src: url, alt: '' }), el('div', {}, el('b', {}, name), el('span', {}, `${meta.format} · ${(size / 1024).toFixed(0)} KB`)));
    box.append(head);

    if (meta.unsupported || meta.format === 'unknown') {
        box.append(el('p', { class: 'note' }, meta.unsupported ? t('heic') : t('unknown')));
        box.append(anotherButton());
        return;
    }

    const d = meta.device;
    const hasDevice = !!(d.make || d.model || d.software || d.serial || d.owner);
    const hasDate = !!(meta.dates.original || meta.dates.modified);
    const level = meta.gps ? 'risky' : hasDevice || hasDate || meta.tagCount ? 'some' : 'none';
    box.append(
        el(
            'div',
            { class: `verdict ${level}` },
            icon(level === 'none' ? 'checkmark-circle' : 'warning', 'i big'),
            el('div', {}, el('b', {}, t(level)), el('span', {}, t(`${level}Sub`))),
        ),
    );

    const grid = el('div', { class: 'grid' });
    if (meta.gps) {
        const { lat, lng } = meta.gps;
        const coords = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        const link = el('a', { href: `https://www.openstreetmap.org/?mlat=${lat.toFixed(5)}&mlon=${lng.toFixed(5)}#map=15/${lat.toFixed(5)}/${lng.toFixed(5)}`, target: '_blank', rel: 'noopener noreferrer' }, t('map'));
        grid.append(card('location', 'red', t('location'), row('GPS', coords), el('p', { class: 'small' }, link, ' · ', t('mapNote'))));
    } else {
        grid.append(card('location', 'gray', t('location'), row('GPS', null)));
    }
    grid.append(
        card(
            'phone-portrait',
            hasDevice ? 'blue' : 'gray',
            t('device'),
            row(t('device'), [d.make, d.model].filter(Boolean).join(' ') || null),
            d.software ? row(t('software'), d.software) : null,
            d.lens ? row(t('lens'), d.lens) : null,
            d.serial ? row(t('serial'), d.serial) : null,
            d.owner ? row(t('owner'), d.owner) : null,
        ),
    );
    grid.append(
        card(
            'time',
            hasDate ? 'orange' : 'gray',
            t('date'),
            row(t('date'), meta.dates.original ?? meta.dates.modified ?? null),
            meta.dates.offset ? row('UTC', meta.dates.offset) : null,
        ),
    );
    const others = [
        meta.thumbnail && el('li', {}, t('thumb')),
        meta.xmp && el('li', {}, t('xmp')),
        meta.iptc && el('li', {}, t('iptc')),
        meta.comment && el('li', {}, `${t('comment')}: ${meta.comment.slice(0, 200)}`),
        ...meta.texts.slice(0, 20).map((x) => el('li', {}, x.slice(0, 200))),
    ].filter(Boolean);
    grid.append(card('document-text', others.length ? 'purple' : 'gray', t('other'), others.length ? el('ul', {}, ...others) : row(t('other'), null)));
    box.append(grid);

    if (/Android/i.test(navigator.userAgent) && !meta.gps) box.append(el('p', { class: 'note' }, t('android')));

    if (meta.tags.length) {
        const table = el('table', {}, ...meta.tags.map((tag) => el('tr', {}, el('td', {}, tag.group), el('td', {}, tag.name), el('td', {}, show(tag.value).slice(0, 300)))));
        box.append(el('details', { class: 'all' }, el('summary', {}, `${t('all')} (${meta.tags.length})`), el('div', { class: 'scroll' }, table)));
    }
    box.append(anotherButton());
}

function anotherButton() {
    const b = el('button', { type: 'button', class: 'again' }, t('another'));
    b.addEventListener('click', () => document.getElementById('file').click());
    return b;
}

async function open(file) {
    if (!file) return;
    if (last) URL.revokeObjectURL(last.url);
    const meta = readMeta(await file.arrayBuffer());
    last = { name: file.name, size: file.size, meta, url: URL.createObjectURL(file) };
    render(last);
    document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Wiring
document.querySelectorAll('[data-icon]').forEach((n) => n.replaceWith(icon(n.dataset.icon, n.className || 'i')));
const input = document.getElementById('file');
input.addEventListener('change', () => open(input.files[0]));
const drop = document.getElementById('drop');
for (const ev of ['dragenter', 'dragover']) drop.addEventListener(ev, (e) => (e.preventDefault(), drop.classList.add('over')));
for (const ev of ['dragleave', 'drop']) drop.addEventListener(ev, () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => (e.preventDefault(), open(e.dataTransfer.files[0])));
window.addEventListener('paste', (e) => open([...(e.clipboardData?.files ?? [])][0]));

let saved = null;
try {
    saved = localStorage.getItem('hayalet_lang');
} catch {}
setLang(saved || ((navigator.language || 'tr').toLowerCase().startsWith('tr') ? 'tr' : 'en'));
document.getElementById('lang').addEventListener('click', () => {
    setLang(lang === 'tr' ? 'en' : 'tr');
    try {
        localStorage.setItem('hayalet_lang', lang);
    } catch {}
});
