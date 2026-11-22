/*! Eretek — en küçük XLSX yazıcı (Office Open XML, sıkıştırmasız ZIP). Hücreler sayı veya satır içi metindir; formül yazılmaz. */
(function (root) {
	'use strict';
	var ERT = root.ERT = root.ERT || {};
	var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) { c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; } t[n] = c >>> 0; } return t; }());
	function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) { c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); } return (c ^ 0xFFFFFFFF) >>> 0; }
	function enc(s) { return new TextEncoder().encode(s); }
	function x(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); }
	function colName(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
	function sheetXml(sh) {
		var rows = [sh.cols].concat(sh.rows), o = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
		var w = sh.cols.map(function (c, i) { var m = String(c).length; rows.forEach(function (r) { var v = r[i]; m = Math.max(m, v === null || v === undefined ? 0 : String(v).length); }); return Math.min(60, Math.max(8, m + 2)); });
		o += '<cols>' + w.map(function (v, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + v + '" customWidth="1"/>'; }).join('') + '</cols><sheetData>';
		rows.forEach(function (r, ri) {
			o += '<row r="' + (ri + 1) + '">';
			r.forEach(function (v, ci) {
				var ref = colName(ci) + (ri + 1), st = ri === 0 ? ' s="1"' : '';
				if (v === null || v === undefined || v === '') { return; }
				if (typeof v === 'number' && isFinite(v)) { o += '<c r="' + ref + '"' + st + '><v>' + v + '</v></c>'; }
				else { o += '<c r="' + ref + '" t="inlineStr"' + st + '><is><t xml:space="preserve">' + x(v) + '</t></is></c>'; }
			});
			o += '</row>';
		});
		return o + '</sheetData><autoFilter ref="A1:' + colName(sh.cols.length - 1) + Math.max(1, rows.length) + '"/></worksheet>';
	}
	function zip(files) {
		var parts = [], cen = [], off = 0;
		files.forEach(function (f) {
			var name = enc(f.name), data = enc(f.data), crc = crc32(data);
			var lh = new DataView(new ArrayBuffer(30));
			lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true); lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true);
			lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
			parts.push(new Uint8Array(lh.buffer), name, data);
			var ch = new DataView(new ArrayBuffer(46));
			ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true);
			ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
			ch.setUint32(42, off, true);
			cen.push(new Uint8Array(ch.buffer), name);
			off += 30 + name.length + data.length;
		});
		var csize = cen.reduce(function (a, b) { return a + b.length; }, 0);
		var end = new DataView(new ArrayBuffer(22));
		end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
		return new Blob(parts.concat(cen, [new Uint8Array(end.buffer)]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
	}
	/** sheets: [{name, cols:[...], rows:[[...]]}] → Blob */
	ERT.xlsx = function (sheets) {
		var safe = sheets.map(function (s, i) { return { name: String(s.name || ('Sheet' + (i + 1))).replace(/[\\\/\?\*\[\]:]/g, ' ').slice(0, 31), cols: s.cols, rows: s.rows }; });
		var files = [
			{ name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + safe.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') + '</Types>' },
			{ name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
			{ name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + safe.map(function (s, i) { return '<sheet name="' + x(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets></workbook>' },
			{ name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + safe.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') + '<Relationship Id="rId' + (safe.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
			{ name: 'xl/styles.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0"/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>' }
		];
		safe.forEach(function (s, i) { files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: sheetXml(s) }); });
		return zip(files);
	};
	ERT._xlsxFiles = function (sheets) { return sheets.map(sheetXml); };
}(typeof window !== 'undefined' ? window : globalThis));
