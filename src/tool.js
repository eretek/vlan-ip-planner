/*! Eretek Online Araçlar #03 — VLAN ve VLSM IP Planlayıcı */
ERT.def('03', {
	run: function (v, c) {
		var I = ERT.ip, b = I.parseCidr(v.block);
		if (b.err || b.fam !== 4) { throw c.fe('block', 'badBlock'); }
		if (b.addr !== b.net) { throw c.fe('block', 'blockHost', { n: I.fmt4(b.net) + '/' + b.len }); }
		var lines = c.lines(v.rows, 500, 'rows'), req = [], seen = {};
		lines.forEach(function (l, i) {
			var p = l.split(/[;,\t]/).map(function (x) { return x.trim(); });
			var vlan = +p[0], name = p[1] || '', dev = ERT.parseNum(p[2], 'en'), gw = p[3] === undefined || p[3] === '' ? 1 : ERT.parseNum(p[3], 'en'), st = p[4] === undefined || p[4] === '' ? 0 : ERT.parseNum(p[4], 'en');
			if (!/^\d+$/.test(p[0]) || vlan < 1 || vlan > 4094) { throw c.fe('rows', 'rowVlan', { r: i + 1 }); }
			if (seen[vlan]) { throw c.fe('rows', 'rowDup', { r: i + 1, v: vlan }); }
			if (!(dev >= 0) || Math.floor(dev) !== dev || !(gw >= 0) || !(st >= 0)) { throw c.fe('rows', 'rowNum', { r: i + 1 }); }
			seen[vlan] = 1;
			var need = Math.ceil(dev * (1 + (v.growth || 0) / 100) - 1e-9) + gw + st;
			var len = 32; while (len > 0 && Math.pow(2, 32 - len) - (len <= 30 ? 2 : 0) < need) { len--; }
			if (need <= 2 && len > 30) { len = 30; } // en küçük ağ /30 (ağ+yayın+2)
			req.push({ i: i, vlan: vlan, name: name, dev: dev, gw: gw, st: st, need: need, len: len, size: Math.pow(2, 32 - len) });
		});
		// serbest alan: blok − sabit/ayrılmış ağlar
		var free = [[Number(b.net), Number(b.last)]], fixed = [];
		c.lines(v.reserved || '', 200, 'reserved').forEach(function (l, i) {
			var r = I.parseCidr(l.split(/[;\s]/)[0]);
			if (r.err || r.fam !== 4) { throw c.fe('reserved', 'rowCidr', { r: i + 1 }); }
			var s = Number(r.net), e = Number(r.last);
			if (s < Number(b.net) || e > Number(b.last)) { throw c.fe('reserved', 'resOut', { r: i + 1 }); }
			fixed.push(I.fmt4(r.net) + '/' + r.len);
			var nf = [];
			free.forEach(function (f) { if (e < f[0] || s > f[1]) { nf.push(f); } else { if (f[0] < s) { nf.push([f[0], s - 1]); } if (e < f[1]) { nf.push([e + 1, f[1]]); } } });
			free = nf;
		});
		var order = req.slice().sort(function (a, z) { return z.size - a.size || a.i - z.i; });
		order.forEach(function (r) {
			for (var k = 0; k < free.length; k++) {
				var f = free[k], st = Math.ceil(f[0] / r.size) * r.size;
				if (st + r.size - 1 <= f[1]) {
					r.net = st; r.last = st + r.size - 1;
					var nf = []; if (f[0] < st) { nf.push([f[0], st - 1]); } if (r.last < f[1]) { nf.push([r.last + 1, f[1]]); }
					free.splice.apply(free, [k, 1].concat(nf));
					return;
				}
			}
			r.nofit = true;
		});
		var f4 = function (n) { return I.fmt4(BigInt(n)); }, rows = [], cls = [], plan = [], nofit = [], usedHosts = 0;
		req.forEach(function (r) {
			if (r.nofit) { rows.push([r.vlan, r.name, r.dev, r.need, c.t('noFit'), '/' + r.len, '', '', '', '']); cls.push('err'); nofit.push(r.vlan); return; }
			var first = r.net + 1, lastU = r.last - 1, gws = [], stat = [], dhcpS, dhcpE;
			if (v.gwpos === 'last') {
				for (var g = 0; g < r.gw; g++) { gws.push(f4(lastU - g)); }
				var sEnd = lastU - r.gw; dhcpS = first + r.st; dhcpE = sEnd; if (r.st) { stat = [f4(first), f4(first + r.st - 1)]; }
			} else {
				for (var g2 = 0; g2 < r.gw; g2++) { gws.push(f4(first + g2)); }
				if (r.st) { stat = [f4(first + r.gw), f4(first + r.gw + r.st - 1)]; }
				dhcpS = first + r.gw + r.st; dhcpE = lastU;
			}
			var usable = r.size - 2, spare = usable - r.need;
			usedHosts += r.need;
			var cidr = f4(r.net) + '/' + r.len;
			plan.push({ vlan: r.vlan, cidr: cidr });
			rows.push([r.vlan, r.name, r.dev, r.need, cidr, I.lenMask4(r.len), gws.join(', ') || '–', stat.length ? stat.join(' – ') : '–', dhcpS <= dhcpE ? f4(dhcpS) + ' – ' + f4(dhcpE) : '–', spare]);
			cls.push(spare < Math.ceil(r.dev * 0.1) ? 'warn' : '');
		});
		var freeList = []; // boş bloklar: kalan aralıklar tam CIDR'lara bölünür
		free.forEach(function (f) { freeList = freeList.concat(I.rangeToCidrs(4, BigInt(f[0]), BigInt(f[1]))); });
		var cols = [c.t('c_vlan'), c.t('c_name'), c.t('c_dev'), c.t('c_need'), c.t('c_net'), c.t('c_mask'), c.t('c_gw'), c.t('c_static'), c.t('c_dhcp'), c.t('c_spare')];
		var msgs = [];
		if (nofit.length) { msgs.push(['err', c.t('nofitMsg', { v: nofit.join(', ') })]); } else { msgs.push(['ok', c.t('allFit', { n: req.length })]); }
		if (fixed.length) { msgs.push(['info', c.t('fixedKept', { l: fixed.join(', ') })]); }
		var freeTxt = freeList.map(I.str);
		var sheetRows = rows.map(function (r) { return r.map(function (x) { return typeof x === 'number' ? x : String(x); }); });
		return {
			big: c.t('summary', { n: plan.length, t: req.length, b: I.fmt4(b.net) + '/' + b.len }),
			msgs: msgs, tables: [{ h: c.t('planH'), cols: cols, rows: rows, cls: cls }, { h: c.t('freeH'), cols: [c.t('c_net'), c.t('c_size')], rows: freeList.map(function (f) { return [I.str(f), c.n(Math.pow(2, 32 - f.len), 0)]; }) }],
			x: { xlsx: { name: 'vlan-plan', sheets: [{ name: 'Plan', cols: cols, rows: sheetRows }, { name: c.t('freeH'), cols: [c.t('c_net')], rows: freeTxt.map(function (f) { return [f]; }) }] }, csv: { name: 'vlan-plan', cols: cols, rows: sheetRows } },
			v: { plan: plan, nofit: nofit, free: freeTxt }
		};
	}
});
