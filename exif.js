/**
 * Hayalet EXIF viewer: reads the hidden metadata of a photo entirely in the browser.
 * No dependencies, no network. Supports JPEG, PNG and WebP; HEIC/AVIF are detected and reported as unsupported.
 *
 * Classic script (no ES module) so it also runs from file:// and offline. Exposes globalThis.HayaletExif.
 *
 * readMeta(arrayBuffer) -> {
 *   format, unsupported, gps: {lat, lng} | null, device: {...}, dates: {...},
 *   thumbnail, xmp, iptc, comment, texts, tags: [{group, id, name, value}], tagCount
 * }
 *
 * MIT License, (c) 2026 Hüseyin Açıkgöz
 */
(function (g) {
    'use strict';

    // Bytes per component for each TIFF field type.
    const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

    /** The tags people usually care about; everything else is listed by its hex id. */
    const TAG_NAMES = {
        0x010e: 'ImageDescription',
        0x010f: 'Make',
        0x0110: 'Model',
        0x0112: 'Orientation',
        0x0131: 'Software',
        0x0132: 'DateTime',
        0x013b: 'Artist',
        0x013c: 'HostComputer',
        0x0201: 'ThumbnailOffset',
        0x0202: 'ThumbnailLength',
        0x8298: 'Copyright',
        0x829a: 'ExposureTime',
        0x829d: 'FNumber',
        0x8827: 'ISO',
        0x9003: 'DateTimeOriginal',
        0x9004: 'DateTimeDigitized',
        0x9010: 'OffsetTime',
        0x9011: 'OffsetTimeOriginal',
        0x9012: 'OffsetTimeDigitized',
        0x920a: 'FocalLength',
        0x927c: 'MakerNote',
        0x9286: 'UserComment',
        0xa002: 'PixelXDimension',
        0xa003: 'PixelYDimension',
        0xa420: 'ImageUniqueID',
        0xa430: 'CameraOwnerName',
        0xa431: 'BodySerialNumber',
        0xa433: 'LensMake',
        0xa434: 'LensModel',
        0xa435: 'LensSerialNumber',
    };

    const GPS_NAMES = {
        0x00: 'GPSVersionID',
        0x01: 'GPSLatitudeRef',
        0x02: 'GPSLatitude',
        0x03: 'GPSLongitudeRef',
        0x04: 'GPSLongitude',
        0x05: 'GPSAltitudeRef',
        0x06: 'GPSAltitude',
        0x07: 'GPSTimeStamp',
        0x0c: 'GPSSpeedRef',
        0x0d: 'GPSSpeed',
        0x10: 'GPSImgDirectionRef',
        0x11: 'GPSImgDirection',
        0x12: 'GPSMapDatum',
        0x1d: 'GPSDateStamp',
    };

    const ascii = (bytes) => String.fromCharCode(...bytes);
    const startsWith = (u8, at, text) => [...text].every((c, i) => u8[at + i] === c.charCodeAt(0));

    /** Parses a TIFF/EXIF block starting at `start` of `view`. Returns IFD0, Exif, GPS and IFD1 as {tagId: value}. */
    function readTiff(view, start) {
        const le = view.getUint16(start) === 0x4949; // "II" = little-endian, "MM" = big-endian
        const end = view.byteLength;
        const u16 = (o) => view.getUint16(start + o, le);
        const u32 = (o) => view.getUint32(start + o, le);
        if (u16(2) !== 42) throw new Error('Not a TIFF header');

        const value = (type, count, off) => {
            const size = TYPE_SIZE[type] ?? 1;
            if (start + off + size * count > end) return null;
            if (type === 2) return ascii(new Uint8Array(view.buffer, view.byteOffset + start + off, count)).replace(/\0+$/, '').trim();
            const one = (i) => {
                const o = off + i * size;
                switch (type) {
                    case 3:
                        return u16(o);
                    case 4:
                        return u32(o);
                    case 9:
                        return view.getInt32(start + o, le);
                    case 5:
                        return u32(o) / (u32(o + 4) || 1);
                    case 10:
                        return view.getInt32(start + o, le) / (view.getInt32(start + o + 4, le) || 1);
                    default:
                        return view.getUint8(start + o);
                }
            };
            // Bytes/undefined: keep them as a byte array (maker notes can be kilobytes).
            if (type === 1 || type === 7 || type === 6) return new Uint8Array(view.buffer, view.byteOffset + start + off, count);
            const out = Array.from({ length: count }, (_, i) => one(i));
            return count === 1 ? out[0] : out;
        };

        const readIfd = (off) => {
            const tags = {};
            if (!off || start + off + 2 > end) return { tags, next: 0 };
            const n = u16(off);
            for (let i = 0; i < n; i++) {
                const e = off + 2 + i * 12;
                if (start + e + 12 > end) break;
                const tag = u16(e);
                const type = u16(e + 2);
                const count = u32(e + 4);
                const inline = (TYPE_SIZE[type] ?? 1) * count <= 4;
                tags[tag] = value(type, count, inline ? e + 8 : u32(e + 8));
            }
            const nextAt = off + 2 + n * 12;
            return { tags, next: start + nextAt + 4 <= end ? u32(nextAt) : 0 };
        };

        const ifd0 = readIfd(u32(4));
        const exif = typeof ifd0.tags[0x8769] === 'number' ? readIfd(ifd0.tags[0x8769]).tags : {};
        const gps = typeof ifd0.tags[0x8825] === 'number' ? readIfd(ifd0.tags[0x8825]).tags : {};
        const ifd1 = ifd0.next ? readIfd(ifd0.next).tags : {};
        return { ifd0: ifd0.tags, exif, gps, ifd1 };
    }

    /** Degrees/minutes/seconds + N/S/E/W reference -> signed decimal degrees. */
    function toDecimal(dms, ref) {
        if (!Array.isArray(dms) || dms.length < 3 || dms.some((v) => !Number.isFinite(v))) return null;
        const v = dms[0] + dms[1] / 60 + dms[2] / 3600;
        return ref === 'S' || ref === 'W' ? -v : v;
    }

    /** XMP stores GPS as "41,1.5360N". */
    function xmpCoord(s) {
        const m = /^\s*(\d+),(\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?))?([NSEW])\s*$/.exec(s ?? '');
        if (!m) return null;
        const v = Number(m[1]) + Number(m[2]) / 60 + Number(m[3] ?? 0) / 3600;
        return m[4] === 'S' || m[4] === 'W' ? -v : v;
    }

    /** Finds the metadata blocks inside the file container. */
    function scan(u8) {
        const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
        const found = { format: 'unknown', tiff: null, xmp: null, iptc: false, comment: null, texts: [], unsupported: false };

        if (u8[0] === 0xff && u8[1] === 0xd8) {
            found.format = 'JPEG';
            let p = 2;
            while (p + 4 <= u8.length && u8[p] === 0xff) {
                const marker = u8[p + 1];
                if (marker === 0xda || marker === 0xd9) break; // image data starts: no more metadata
                if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
                    p += 2;
                    continue;
                }
                const len = view.getUint16(p + 2);
                const body = p + 4;
                if (marker === 0xe1 && startsWith(u8, body, 'Exif\0\0') && !found.tiff) found.tiff = body + 6;
                else if (marker === 0xe1 && startsWith(u8, body, 'http://ns.adobe.com/xap/1.0/\0')) {
                    found.xmp = new TextDecoder().decode(u8.subarray(body + 29, p + 2 + len));
                } else if (marker === 0xed && startsWith(u8, body, 'Photoshop 3.0')) found.iptc = true;
                else if (marker === 0xfe) found.comment = new TextDecoder().decode(u8.subarray(body, p + 2 + len)).replace(/\0+$/, '');
                p += 2 + len;
            }
        } else if (startsWith(u8, 0, '\x89PNG\r\n\x1a\n')) {
            found.format = 'PNG';
            let p = 8;
            while (p + 12 <= u8.length) {
                const len = view.getUint32(p);
                const type = ascii(u8.subarray(p + 4, p + 8));
                const body = p + 8;
                if (type === 'eXIf') found.tiff = body;
                else if (type === 'tEXt' || type === 'iTXt') {
                    const raw = new TextDecoder().decode(u8.subarray(body, body + len));
                    const key = raw.slice(0, raw.indexOf('\0'));
                    if (key === 'XML:com.adobe.xmp') found.xmp = raw.slice(raw.indexOf('<'));
                    else found.texts.push(key + ': ' + raw.slice(key.length + 1).replace(/^\0+/, '').replace(/\0/g, ' ').trim());
                }
                if (type === 'IEND') break;
                p += 12 + len;
            }
        } else if (startsWith(u8, 0, 'RIFF') && startsWith(u8, 8, 'WEBP')) {
            found.format = 'WebP';
            let p = 12;
            while (p + 8 <= u8.length) {
                const type = ascii(u8.subarray(p, p + 4));
                const len = view.getUint32(p + 4, true);
                const body = p + 8;
                if (type === 'EXIF') found.tiff = startsWith(u8, body, 'Exif\0\0') ? body + 6 : body;
                else if (type === 'XMP ') found.xmp = new TextDecoder().decode(u8.subarray(body, body + len));
                p += 8 + len + (len % 2);
            }
        } else if (startsWith(u8, 4, 'ftyp')) {
            found.format = ascii(u8.subarray(8, 12)).trim().toUpperCase();
            found.unsupported = true;
        }
        return { view, found };
    }

    /** Reads every privacy-relevant detail from a photo file. Never throws for odd files: it reports what it can. */
    function readMeta(buffer) {
        const u8 = new Uint8Array(buffer);
        const { view, found } = scan(u8);
        const out = {
            format: found.format,
            unsupported: found.unsupported,
            gps: null,
            device: {},
            dates: {},
            thumbnail: false,
            xmp: found.xmp,
            iptc: found.iptc,
            comment: found.comment,
            texts: found.texts,
            tags: [],
            tagCount: 0,
        };

        let t = { ifd0: {}, exif: {}, gps: {}, ifd1: {} };
        if (found.tiff !== null) {
            try {
                t = readTiff(view, found.tiff);
            } catch {
                // A broken EXIF block is still worth reporting as present.
                out.tags.push({ group: 'EXIF', id: -1, name: 'Unreadable EXIF block', value: '' });
            }
        }

        const push = (group, tags, names) => {
            for (const [id, value] of Object.entries(tags)) {
                const n = Number(id);
                if (n === 0x8769 || n === 0x8825) continue; // pointers, not information
                out.tags.push({ group, id: n, name: names[n] ?? `0x${n.toString(16).padStart(4, '0')}`, value });
            }
        };
        push('IFD0', t.ifd0, TAG_NAMES);
        push('EXIF', t.exif, TAG_NAMES);
        push('GPS', t.gps, GPS_NAMES);
        push('Thumbnail', t.ifd1, TAG_NAMES);
        out.tagCount = out.tags.length;

        const lat = toDecimal(t.gps[0x02], t.gps[0x01]);
        const lng = toDecimal(t.gps[0x04], t.gps[0x03]);
        if (lat !== null && lng !== null && !(lat === 0 && lng === 0)) out.gps = { lat, lng, source: 'EXIF' };
        if (!out.gps && out.xmp) {
            const xl = xmpCoord(/exif:GPSLatitude(?:="|>)([^"<]+)/.exec(out.xmp)?.[1]);
            const xg = xmpCoord(/exif:GPSLongitude(?:="|>)([^"<]+)/.exec(out.xmp)?.[1]);
            if (xl !== null && xg !== null) out.gps = { lat: xl, lng: xg, source: 'XMP' };
        }

        const str = (v) => (typeof v === 'string' && v ? v : undefined);
        out.device = {
            make: str(t.ifd0[0x010f]),
            model: str(t.ifd0[0x0110]),
            software: str(t.ifd0[0x0131]),
            lens: str(t.exif[0xa434]),
            serial: str(t.exif[0xa431]) ?? str(t.exif[0xa435]),
            owner: str(t.exif[0xa430]) ?? str(t.ifd0[0x013b]),
        };
        out.dates = {
            original: str(t.exif[0x9003]),
            digitized: str(t.exif[0x9004]),
            modified: str(t.ifd0[0x0132]),
            offset: str(t.exif[0x9011]) ?? str(t.exif[0x9010]),
        };
        // An embedded preview can show the photo before it was cropped or masked.
        out.thumbnail = typeof t.ifd1[0x0201] === 'number' && (t.ifd1[0x0202] ?? 0) > 0;
        return out;
    }

    g.HayaletExif = { readMeta, readTiff, toDecimal, xmpCoord, TAG_NAMES, GPS_NAMES };
})(globalThis);
