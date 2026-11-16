// Run: node test/exif.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../exif.js';

const { readMeta, toDecimal, xmpCoord } = globalThis.HayaletExif;

const load = (name) => {
    const b = readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
const near = (a, b) => Math.abs(a - b) < 1e-4;

// Same Paris details in three containers.
for (const [file, format] of [['paris.jpg', 'JPEG'], ['paris.png', 'PNG'], ['paris.webp', 'WebP']]) {
    const m = readMeta(load(file));
    assert.equal(m.format, format, `${file}: format`);
    assert.ok(m.gps && near(m.gps.lat, 48.8584) && near(m.gps.lng, 2.2945), `${file}: GPS`);
    assert.equal(m.device.make, 'Apple', `${file}: make`);
    assert.equal(m.device.model, 'iPhone 18 Pro', `${file}: model`);
    assert.equal(m.device.serial, 'SN12345', `${file}: serial number`);
    assert.equal(m.dates.original, '2025:11:16 03:45:14', `${file}: capture date`);
    assert.equal(m.dates.offset, '+01:00', `${file}: time zone`);
    assert.ok(m.tags.some((t) => t.name === 'GPSLatitude'), `${file}: raw tag list`);
}

const clean = readMeta(load('clean.jpg'));
assert.equal(clean.format, 'JPEG');
assert.equal(clean.gps, null, 'clean: no GPS');
assert.equal(clean.tagCount, 0, 'clean: no tags');

// Hayalet's own fixture: EXIF + XMP + IPTC + comment segments.
const sample = readMeta(load('gps-sample.jpg'));
assert.ok(sample.xmp !== null, 'sample: XMP found');
assert.ok(sample.iptc, 'sample: IPTC found');
assert.ok(sample.comment !== null, 'sample: comment found');

// HEIC is detected, not misread.
const heic = new Uint8Array(32);
heic.set([...'\0\0\0\x18ftypheic'].map((c) => c.charCodeAt(0)));
const h = readMeta(heic.buffer);
assert.ok(h.unsupported && h.format === 'HEIC', 'HEIC reported as unsupported');

// Garbage never throws.
assert.equal(readMeta(new Uint8Array([1, 2, 3]).buffer).format, 'unknown');
const broken = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10, ...'Exif\0\0MM\0\x2a'].map((c) => (typeof c === 'string' ? c.charCodeAt(0) : c)));
assert.doesNotThrow(() => readMeta(broken.buffer), 'truncated EXIF does not throw');

assert.equal(toDecimal([41, 0, 30], 'S'), -(41 + 30 / 3600));
assert.equal(toDecimal(undefined, 'N'), null);
assert.ok(near(xmpCoord('41,1.536N'), 41.0256));
assert.ok(near(xmpCoord('28,58.446W'), -28.9741));
assert.equal(xmpCoord('nonsense'), null);

console.log('exif viewer self-check: OK');
