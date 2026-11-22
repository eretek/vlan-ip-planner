/*! Eretek — IPv4/IPv6 kitaplığı (BigInt, tam sayı hassasiyeti; RFC 4291 / RFC 5952 gösterimi). */
(function (root) {
	'use strict';
	var ERT = root.ERT = root.ERT || {};
	var B = BigInt, ONE = B(1), ZERO = B(0);
	function bits(f) { return f === 4 ? 32 : 128; }
	function maxv(f) { return (ONE << B(bits(f))) - ONE; }
	function hostMask(f, len) { return (ONE << B(bits(f) - len)) - ONE; }

	function parse4(s) {
		if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) { return null; }
		var p = s.split('.'), v = ZERO;
		for (var i = 0; i < 4; i++) {
			if (p[i].length > 1 && p[i][0] === '0') { return null; } // baştaki sıfır (oktal belirsizliği) reddedilir
			var n = +p[i]; if (n > 255) { return null; }
			v = (v << B(8)) | B(n);
		}
		return v;
	}
	function parse6(s) {
		var zone = '';
		var zi = s.indexOf('%'); if (zi !== -1) { zone = s.slice(zi + 1); s = s.slice(0, zi); if (!/^[\w.\-]+$/.test(zone)) { return null; } }
		if (!/^[0-9a-fA-F:.]+$/.test(s) || s.indexOf(':') === -1) { return null; }
		var v4 = null;
		var lc = s.lastIndexOf(':');
		if (s.indexOf('.', lc) !== -1) { v4 = parse4(s.slice(lc + 1)); if (v4 === null) { return null; } s = s.slice(0, lc + 1) + '0:0'; }
		var dbl = s.split('::'); if (dbl.length > 2) { return null; }
		var head = dbl[0] ? dbl[0].split(':') : [], tail = dbl.length === 2 && dbl[1] ? dbl[1].split(':') : [];
		var all = head.concat(tail);
		for (var i = 0; i < all.length; i++) { if (!/^[0-9a-fA-F]{1,4}$/.test(all[i])) { return null; } }
		var groups;
		if (dbl.length === 2) { var miss = 8 - all.length; if (miss < 1) { return null; } groups = head.concat(new Array(miss).fill('0'), tail); }
		else { if (all.length !== 8) { return null; } groups = all; }
		var v = ZERO; groups.forEach(function (g) { v = (v << B(16)) | B(parseInt(g, 16)); });
		if (v4 !== null) { v = (v >> B(32) << B(32)) | v4; }
		return { v: v, zone: zone };
	}
	function parse(s) {
		s = String(s || '').trim();
		if (s[0] === '[' && s[s.length - 1] === ']') { s = s.slice(1, -1); }
		var a = parse4(s); if (a !== null) { return { fam: 4, v: a, zone: '' }; }
		var b = parse6(s); if (b) { return { fam: 6, v: b.v, zone: b.zone }; }
		return null;
	}
	function fmt4(v) { v = B(v); return [24, 16, 8, 0].map(function (s) { return Number((v >> B(s)) & B(255)); }).join('.'); }
	function groups6(v) { var g = []; for (var i = 7; i >= 0; i--) { g.push(Number((v >> B(i * 16)) & B(0xffff))); } return g; }
	function full6(v) { return groups6(B(v)).map(function (x) { return ('000' + x.toString(16)).slice(-4); }).join(':'); }
	/** RFC 5952: küçük harf, baştaki sıfırlar yok, en uzun (≥2) sıfır dizisi ::, eşitlikte ilki; IPv4-mapped ::ffff:a.b.c.d */
	function fmt6(v) {
		v = B(v);
		var g = groups6(v);
		if (v >> B(32) === B(0xffff)) { return '::ffff:' + fmt4(v & B(0xffffffff)); }
		var bs = -1, bl = 0, cs = -1, cl = 0;
		for (var i = 0; i < 8; i++) {
			if (g[i] === 0) { if (cs === -1) { cs = i; cl = 1; } else { cl++; } if (cl > bl) { bs = cs; bl = cl; } }
			else { cs = -1; cl = 0; }
		}
		var hx = g.map(function (x) { return x.toString(16); });
		if (bl < 2) { return hx.join(':'); }
		return hx.slice(0, bs).join(':') + '::' + hx.slice(bs + bl).join(':');
	}
	function fmt(f, v) { return f === 4 ? fmt4(v) : fmt6(v); }
	function maskLen4(s) {
		var m = parse4(s); if (m === null) { return -1; }
		var n = Number(m), len = 0, seen0 = false;
		for (var i = 31; i >= 0; i--) { var b = (n >>> i) & 1; if (b && seen0) { return -1; } if (b) { len++; } else { seen0 = true; } }
		return len;
	}
	function lenMask4(len) { return fmt4(maxv(4) ^ hostMask(4, len)); }
	/** "a/len", "a mask", "a/mask" → {fam, addr, len, net, last, zone}; err: 'addr'|'len'|'mask' */
	function parseCidr(s, defLen) {
		s = String(s || '').trim().replace(/\s+/g, ' ');
		var a, l;
		if (s.indexOf('/') !== -1) { var p = s.split('/'); if (p.length !== 2) { return { err: 'addr' }; } a = p[0].trim(); l = p[1].trim(); }
		else if (s.indexOf(' ') !== -1) { var q = s.split(' '); a = q[0]; l = q[1]; }
		else { a = s; l = defLen === undefined ? null : String(defLen); }
		var ip = parse(a); if (!ip) { return { err: 'addr' }; }
		var len;
		if (l === null) { len = bits(ip.fam); }
		else if (/^\d{1,3}$/.test(l)) { len = +l; }
		else if (ip.fam === 4 && parse4(l) !== null) { len = maskLen4(l); if (len < 0) { return { err: 'mask' }; } }
		else { return { err: 'len' }; }
		if (len < 0 || len > bits(ip.fam)) { return { err: 'len' }; }
		var hm = hostMask(ip.fam, len), net = ip.v & ~hm & maxv(ip.fam);
		return { fam: ip.fam, addr: ip.v, len: len, net: net, last: net | hm, zone: ip.zone, size: hm + ONE };
	}
	/** [start,end] aralığını kapsayan en az CIDR listesi (adresleri tek tek açmaz). */
	function rangeToCidrs(fam, s, e) {
		var out = [], W = bits(fam);
		s = B(s); e = B(e);
		while (s <= e) {
			var len = W;
			// s'nin hizalandığı en büyük blok
			while (len > 0) {
				var nl = len - 1, hm = hostMask(fam, nl);
				if ((s & hm) !== ZERO) { break; }
				if ((s | hm) > e) { break; }
				len = nl;
			}
			out.push({ fam: fam, net: s, len: len });
			var last = s | hostMask(fam, len);
			if (last === maxv(fam)) { break; }
			s = last + ONE;
		}
		return out;
	}
	/** CIDR listesini aynı kümeyi tam kapsayan en az CIDR listesine indirger (aile başına). */
	function aggregate(list) {
		var res = [];
		[4, 6].forEach(function (f) {
			var r = list.filter(function (c) { return c.fam === f; }).map(function (c) { return [c.net, c.net | hostMask(f, c.len)]; });
			r.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
			var m = [];
			r.forEach(function (x) { var t = m[m.length - 1]; if (t && x[0] <= t[1] + ONE) { if (x[1] > t[1]) { t[1] = x[1]; } } else { m.push([x[0], x[1]]); } });
			m.forEach(function (x) { res = res.concat(rangeToCidrs(f, x[0], x[1])); });
		});
		return res;
	}
	function str(c) { return fmt(c.fam, c.net) + '/' + c.len; }
	function relation(a, b) { // 'equal' | 'a_in_b' | 'b_in_a' | 'disjoint'
		if (a.fam !== b.fam) { return 'disjoint'; }
		if (a.net === b.net && a.len === b.len) { return 'equal'; }
		if (a.net >= b.net && a.last <= b.last) { return 'a_in_b'; }
		if (b.net >= a.net && b.last <= a.last) { return 'b_in_a'; }
		return 'disjoint';
	}
	ERT.ip = { parse: parse, parse4: parse4, parse6: parse6, fmt: fmt, fmt4: fmt4, fmt6: fmt6, full6: full6, parseCidr: parseCidr, maskLen4: maskLen4, lenMask4: lenMask4,
		rangeToCidrs: rangeToCidrs, aggregate: aggregate, str: str, relation: relation, hostMask: hostMask, bits: bits, maxv: maxv };
}(typeof window !== 'undefined' ? window : globalThis));
