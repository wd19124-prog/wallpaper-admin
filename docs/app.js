if (typeof cloudbase === 'undefined') { document.body.innerHTML = '<p style="padding:40px">无法加载云开发组件 请检查网络后刷新页面</p>'; throw new Error('cloudbase sdk not loaded') }
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)]
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const ic = n => `<i data-lucide="${n}"></i>`
const sleep = ms => new Promise(r => setTimeout(r, ms))
const fmtD = d => (d ? new Date(d).toLocaleString('zh-CN', { hour12: false }).slice(0, 16) : '-')
const ST = { draft: '草稿', published: '已发布', offline: '已下架', pending: '待处理', processing: '处理中', done: '已处理', rejected: '已驳回' }
const badge = s => `<span class="badge ${s}">${ST[s] || esc(s)}</span>`
const app = cloudbase.init({ env: CFG.env, region: CFG.region, accessKey: CFG.accessKey })
const auth = app.auth({ persistence: 'local' })
let ME = null

const paint = el => { $$('[data-s],tbody tr', el).forEach((n, i) => n.style.setProperty('--i', i)); window.lucide && lucide.createIcons() }
function toast(m, e) { const d = Object.assign(document.createElement('div'), { textContent: m, className: e ? 'e' : '' }); $('#toast').append(d); setTimeout(() => d.remove(), 3200) }
async function call(action, data = {}) {
  const r = (await app.callFunction({ name: 'adminApi', data: { action, ...data } })).result
  if (!r?.ok) throw new Error(r?.msg || '请求失败')
  return r.data
}
const safe = fn => async (...a) => { try { return await fn(...a) } catch (e) { toast(e.message, 1) } }
function ask(msg) {
  return new Promise(ok => {
    const m = Object.assign(document.createElement('div'), { className: 'modal', innerHTML: `<div class="card"><p>${esc(msg)}</p><div class="bar"><span class="sp"></span><button class="btn" data-v="0">取消</button><button class="btn primary" data-v="1">确认</button></div></div>` })
    m.onclick = e => { const v = e.target.dataset?.v; if (v != null || e.target === m) { m.remove(); ok(v === '1') } }
    document.body.append(m)
  })
}
const plain = (v, k) => v == null ? '' : /At$|^at$/.test(k) ? fmtD(v) : typeof v === 'object' ? (Array.isArray(v) ? v.join('|') : JSON.stringify(v)) : v
function download(name, head, rows) {
  const t = [head, ...rows].map(r => r.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n')
  Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob(['\ufeff' + t], { type: 'text/csv' })), download: name + '.csv' }).click(); toast('已导出')
}
async function exportAll(c, where, sort, cols, name, q) {
  let rows = [], skip = 0
  for (;;) { const r = await call('list', { c, where, q, sort, skip, limit: 100 }); rows = rows.concat(r.data); skip += 100; if (skip >= r.total || skip >= 5000) break }
  download(name, cols.map(x => x[1]), rows.map(d => cols.map(x => plain(d[x[0]], x[0]))))
}
const cache = {}
async function urls(ids) {
  const need = [...new Set(ids.filter(i => i && !cache[i]))]
  for (let i = 0; i < need.length; i += 50) Object.assign(cache, await call('urls', { ids: need.slice(i, i + 50) }))
  return cache
}
let CATS
const getCats = async (force) => (CATS = !force && CATS || (await call('list', { c: 'categories', sort: ['sortWeight', 'desc'], limit: 100 })).data)

/* 抽屉 表单 */
function form(fields, v = {}, cats = []) {
  return fields.map(f => {
    const x = v[f.k]
    const body = f.t === 'textarea' ? `<textarea name="${f.k}" rows="3">${esc(x)}</textarea>`
      : f.t === 'select' ? `<select name="${f.k}">${f.o.map(([a, b]) => `<option value="${a}" ${x === a ? 'selected' : ''}>${b}</option>`).join('')}</select>`
      : f.t === 'bool' ? `<span class="sw"><input type="checkbox" name="${f.k}" ${x ? 'checked' : ''}>${f.hint || '开启'}</span>`
      : f.t === 'tags' ? `<input name="${f.k}" value="${esc((x || []).join(','))}" placeholder="用逗号分隔">`
      : f.t === 'date' ? `<input type="datetime-local" name="${f.k}" value="${x ? new Date(new Date(x) - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : ''}">`
      : f.t === 'cats' ? `<div class="chips">${cats.map(c => `<label><input type="checkbox" name="${f.k}" value="${c._id}" ${(x || []).includes(c._id) ? 'checked' : ''}>${esc(c.name)}</label>`).join('')}</div>`
      : f.t === 'ro' ? `<div>${esc(x)}</div>`
      : `<input name="${f.k}" type="${f.t === 'number' ? 'number' : 'text'}" value="${esc(x)}">`
    return `<label data-s>${f.l}${body}</label>`
  }).join('')
}
function read(root, fields) {
  const o = {}
  fields.forEach(f => {
    if (f.t === 'ro') return
    const el = $$(`[name="${f.k}"]`, root)
    o[f.k] = f.t === 'bool' ? el[0].checked : f.t === 'cats' ? el.filter(e => e.checked).map(e => e.value)
      : f.t === 'tags' ? el[0].value.split(/[,，]/).map(s => s.trim()).filter(Boolean)
      : f.t === 'number' ? Number(el[0].value || 0) : f.t === 'date' ? (el[0].value ? new Date(el[0].value).toISOString() : null) : el[0].value
  })
  return o
}
function drawer(title, html, onSave, hero, after) {
  const d = $('#drawer'), p = $('.panel', d)
  const open = () => {
    p.innerHTML = `<h2 data-s>${esc(title)}</h2>${hero ? `<img class="hero" style="view-transition-name:hero" src="${hero}">` : ''}${html}<div class="bar" data-s><button class="btn primary" id="ds">${ic('check')}保存</button><button class="btn" id="dc">关闭</button></div>`
    d.classList.add('open'); paint(p); after?.(p)
    $('#dc').onclick = $('.mask', d).onclick = close
    $('#ds').onclick = safe(async () => { await onSave(p); close() })
  }
  document.startViewTransition ? document.startViewTransition(open) : open()
  function close() { d.classList.remove('open') }
}

/* 通用表格页 */
function tableView(cfg) {
  return safe(async v => {
    const st = { skip: 0, f: {} }
    const cats = cfg.cats ? await getCats() : []
    v.innerHTML = `<h1 data-s>${cfg.title}</h1><div class="bar" data-s>${(cfg.filters || []).map(f => `<select data-f="${f.k}"><option value="">${f.l}</option>${f.o.map(([a, b]) => `<option value="${a}">${b}</option>`).join('')}</select>`).join('')}<span class="sp"></span><button class="btn" id="ex">${ic('download')}导出 CSV</button>${cfg.add ? `<button class="btn primary" id="add">${ic('plus')}新增</button>` : ''}</div><div class="card" data-s id="box"></div>`
    const load = safe(async () => {
      const r = await call('list', { c: cfg.c, where: st.f, sort: cfg.sort, skip: st.skip, limit: 20 })
      $('#box').innerHTML = `<table><thead><tr>${cfg.cols.map(c => `<th>${c[1]}</th>`).join('')}</tr></thead><tbody>${r.data.map((d, i) => `<tr class="${cfg.fields ? 'row' : ''}" data-i="${i}">${cfg.cols.map(c => `<td>${c[2] ? c[2](d[c[0]], d) : esc(d[c[0]])}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="9" class="muted">暂无数据</td></tr>`}</tbody></table>
      <div class="pg"><span class="muted">共 ${r.total} 条</span><button class="btn sm" id="pp" ${st.skip ? '' : 'disabled'}>上一页</button><button class="btn sm" id="pn" ${st.skip + 20 < r.total ? '' : 'disabled'}>下一页</button></div>`
      paint($('#box'))
      $('#pp').onclick = () => { st.skip -= 20; load() }; $('#pn').onclick = () => { st.skip += 20; load() }
      $$('tr.row', v).forEach(tr => tr.onclick = () => edit(r.data[tr.dataset.i]))
    })
    const edit = d => drawer(d ? '编辑' : '新增', form(cfg.fields, d || cfg.blank || {}, cats), safe(async p => {
      if (cfg.confirm && !await ask(cfg.confirm)) throw new Error('已取消')
      await call('save', { c: cfg.c, id: d?._id, data: read(p, cfg.fields) }); toast('已保存'); if (cfg.c === 'categories') await getCats(1); load()
    }))
    $$('[data-f]', v).forEach(s => s.onchange = () => { s.value ? st.f[s.dataset.f] = s.value : delete st.f[s.dataset.f]; st.skip = 0; load() })
    if (cfg.add) $('#add').onclick = () => edit()
    $('#ex').onclick = safe(() => exportAll(cfg.c, st.f, cfg.sort, cfg.cols, cfg.title))
    load()
  })
}
const STAT_OPT = [['pending', '待处理'], ['processing', '处理中'], ['done', '已处理'], ['rejected', '已驳回']]
const FB_FIELDS = [{ k: 'status', l: '处理状态', t: 'select', o: STAT_OPT }, { k: 'note', l: '处理备注', t: 'textarea' }]
const FB_COLS = [['type', '类型'], ['wallpaperId', '壁纸 ID'], ['content', '内容', (_, d) => esc(d.content || d.description || d.evidence || '')], ['status', '状态', badge], ['createdAt', '提交时间', fmtD], ['note', '备注']]

/* 仪表盘 */
const vDash = safe(async v => {
  let days = 30
  const draw = safe(async () => {
    const d = await call('stats', { days }); const u = await urls([...d.topDownload, ...d.topFavorite].map(w => w.thumbnailFileId))
    const card = ([l, n, h]) => `<a class="stat" href="${h}" data-s>${l}<b>${n}</b></a>`
    const max = Math.max(1, ...d.series.map(s => s.downloads))
    const top = (a, k) => a.map((w, i) => `<a class="li" href="#/wallpapers" data-s><b>${i + 1}</b><img class="th" src="${u[w.thumbnailFileId] || ''}"><span>${esc(w.title)}</span><b>${w[k] || 0}</b></a>`).join('') || '<p class="muted">暂无数据</p>'
    $('#dash').innerHTML = `<div class="grid">${[['壁纸总数', d.total, '#/wallpapers'], ['已发布', d.published, '#/wallpapers?status=published'], ['草稿', d.draft, '#/wallpapers?status=draft'], ['已下架', d.offline, '#/wallpapers?status=offline'],
      ['今日下载', d.today, '#/ranks'], ['近 7 天下载', d.d7, '#/ranks'], ['近 30 天下载', d.d30, '#/ranks'], ['近 7 天新增收藏', d.fav7, '#/ranks'], ['待处理反馈', d.pending, '#/feedback'], ['待处理版权投诉', d.pendingReports, '#/reports']].map(card).join('')}</div>
    <div class="card" data-s><h2>下载趋势</h2><div class="chart">${d.series.map((s, i) => `<i style="--i:${i};height:${Math.max(2, s.downloads / max * 100)}%" title="${s.date}  下载 ${s.downloads}  收藏 ${s.favorites}"></i>`).join('')}</div></div>
    <div class="two"><div class="card" data-s><h2>下载量 TOP 10</h2>${top(d.topDownload, 'downloadCount')}</div><div class="card" data-s><h2>收藏量 TOP 10</h2>${top(d.topFavorite, 'favoriteCount')}</div></div>`
    paint($('#dash'))
  })
  v.innerHTML = `<h1 data-s>数据仪表盘</h1><div class="bar" data-s><select id="rg"><option value="7">近 7 天</option><option value="30" selected>近 30 天</option><option value="90">近 90 天</option></select></div><div id="dash"></div>`
  $('#rg').onchange = e => { days = +e.target.value; draw() }
  draw()
})

/* 壁纸管理 */
const WFIELDS = [{ k: 'title', l: '标题', t: 'text' }, { k: 'description', l: '介绍', t: 'textarea' }, { k: 'categoryIds', l: '分类', t: 'cats' }, { k: 'tags', l: '标签', t: 'tags' }, { k: 'colorTags', l: '色系标签', t: 'tags' }, { k: 'styleTags', l: '风格标签', t: 'tags' },
  { k: 'sortWeight', l: '运营排序权重', t: 'number' }, { k: 'copyrightStatus', l: '版权核查', t: 'select', o: [['unchecked', '未核查'], ['ok', '已通过'], ['disputed', '有争议']] }]
const trend = safe(async id => {
  const s = await call('trend', { id }), mx = k => Math.max(1, ...s.map(x => x[k]))
  const ch = (k, l) => `<p class="muted">${l} 合计 ${s.reduce((a, x) => a + x[k], 0)}</p><div class="chart" style="height:64px">${s.map((x, i) => `<i style="--i:${i};height:${Math.max(3, x[k] / mx(k) * 100)}%" title="${x.date}  ${x[k]}"></i>`).join('')}</div>`
  $('#trend').innerHTML = `<h2>近 30 天趋势</h2>${ch('downloads', '下载')}${ch('favorites', '新增收藏')}`
})
const vWall = safe(async (v, q) => {
  const cats = await getCats()
  const st = { status: q.get('status') || '', cat: '', q: '', sort: 'publishedAt', skip: 0, sel: new Set() }
  v.innerHTML = `<h1 data-s>壁纸管理</h1><div class="bar" data-s><input id="q" placeholder="标题或 ID"><select id="fs"><option value="">全部状态</option>${['draft', 'published', 'offline'].map(s => `<option value="${s}" ${st.status === s ? 'selected' : ''}>${ST[s]}</option>`).join('')}</select>
    <select id="fc"><option value="">全部分类</option>${cats.map(c => `<option value="${c._id}">${esc(c.name)}</option>`).join('')}</select>
    <select id="so"><option value="publishedAt">发布时间</option><option value="downloadCount">下载量</option><option value="favoriteCount">收藏量</option><option value="createdAt">上传时间</option></select><span class="sp"></span><button class="btn" id="ex">${ic('download')}导出 CSV</button><a class="btn primary" href="#/upload">${ic('upload')}批量上传</a></div>
    <div class="bar" id="bb" hidden><b id="bn"></b><button class="btn sm" data-b="published">批量发布</button><button class="btn sm" data-b="offline">批量下架</button><select id="bc"><option value="">批量改分类为</option>${cats.map(c => `<option value="${c._id}">${esc(c.name)}</option>`).join('')}</select></div>
    <div class="card" data-s id="box"></div>`
  const load = safe(async () => {
    const where = {}; if (st.status) where.status = st.status; if (st.cat) where.categoryIds = st.cat
    if (/^[a-f0-9]{16,}$/i.test(st.q)) where._id = st.q
    const r = await call('list', { c: 'wallpapers', where, q: /^[a-f0-9]{16,}$/i.test(st.q) ? '' : st.q, sort: [st.sort, 'desc'], skip: st.skip, limit: 20 })
    const u = await urls(r.data.map(d => d.thumbnailFileId)); st.sel.clear(); bar()
    $('#box').innerHTML = `<table><thead><tr><th><input type="checkbox" id="all"></th><th></th><th>标题</th><th>状态</th><th>下载</th><th>收藏</th><th>发布时间</th></tr></thead><tbody>${r.data.map((d, i) => `<tr class="row" data-i="${i}"><td><input type="checkbox" class="ck" value="${d._id}"></td><td><img class="th" src="${u[d.thumbnailFileId] || ''}"></td><td>${esc(d.title)}<div class="muted">${d._id}</div></td><td>${badge(d.status)}</td><td>${d.downloadCount || 0}</td><td>${d.favoriteCount || 0}</td><td>${fmtD(d.publishedAt)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">暂无壁纸</td></tr>'}</tbody></table>
      <div class="pg"><span class="muted">共 ${r.total} 张</span><button class="btn sm" id="pp" ${st.skip ? '' : 'disabled'}>上一页</button><button class="btn sm" id="pn" ${st.skip + 20 < r.total ? '' : 'disabled'}>下一页</button></div>`
    paint($('#box'))
    $('#pp').onclick = () => { st.skip -= 20; load() }; $('#pn').onclick = () => { st.skip += 20; load() }
    $('#all').onchange = e => $$('.ck', v).forEach(c => { c.checked = e.target.checked; c.onchange() })
    $$('.ck', v).forEach(c => { c.onclick = e => e.stopPropagation(); c.onchange = () => { c.checked ? st.sel.add(c.value) : st.sel.delete(c.value); bar() } })
    $$('tr.row', v).forEach(tr => tr.onclick = () => { const d = r.data[tr.dataset.i], img = $('img', tr); img.style.viewTransitionName = 'hero'
      drawer('编辑壁纸', form(WFIELDS, d, cats) + '<div class="card" id="trend" data-s></div>', async p => { await call('patch', { ids: [d._id], patch: read(p, WFIELDS) }); toast('已保存'); load() }, u[d.thumbnailFileId], () => trend(d._id)); setTimeout(() => (img.style.viewTransitionName = ''), 500) })
  })
  const bar = () => { $('#bb').hidden = !st.sel.size; $('#bn').textContent = `已选 ${st.sel.size} 张` }
  $$('[data-b]', v).forEach(b => b.onclick = safe(async () => {
    const s = b.dataset.b; if (s === 'offline' && !await ask(`确认下架选中的 ${st.sel.size} 张壁纸 下架只改变状态 不删除原图和统计`)) return
    await call('setStatus', { ids: [...st.sel], status: s }); toast('操作完成'); load()
  }))
  $('#bc').onchange = safe(async e => { if (!e.target.value || !await ask('确认批量替换所选壁纸的分类')) return; await call('patch', { ids: [...st.sel], patch: { categoryIds: [e.target.value] } }); e.target.value = ''; toast('已更新'); load() })
  let t; $('#q').oninput = e => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value.trim(); st.skip = 0; load() }, 350) }
  ;[['fs', 'status'], ['fc', 'cat'], ['so', 'sort']].forEach(([id, k]) => $('#' + id).onchange = e => { st[k] = e.target.value; st.skip = 0; load() })
  $('#ex').onclick = safe(() => { const w = {}; if (st.status) w.status = st.status; if (st.cat) w.categoryIds = st.cat
    return exportAll('wallpapers', w, [st.sort, 'desc'], [['_id', 'ID'], ['title', '标题'], ['status', '状态'], ['categoryIds', '分类ID'], ['tags', '标签'], ['downloadCount', '下载'], ['favoriteCount', '收藏'], ['viewCount', '浏览'], ['publishedAt', '发布时间']], '壁纸列表', /^[a-f0-9]{16,}$/i.test(st.q) ? '' : st.q) })
  load()
})

/* 批量上传工作台 */
const MAXMB = 20, MINSIDE = 720
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')
function post(m, blob, onp) {
  return new Promise((ok, no) => {
    const f = new FormData(), x = new XMLHttpRequest()
    f.append('key', m.path); f.append('signature', m.authorization); f.append('x-cos-security-token', m.token); f.append('x-cos-meta-fileid', m.cosFileId); f.append('file', blob)
    x.open('POST', m.url); x.upload.onprogress = e => e.lengthComputable && onp?.(e.loaded / e.total)
    x.onload = () => (x.status < 300 ? ok() : no(new Error('存储返回 ' + x.status))); x.onerror = () => no(new Error('网络中断或存储跨域未配置'))
    x.send(f)
  })
}
const thumbOf = bmp => new Promise(ok => { const w = Math.min(480, bmp.width), c = Object.assign(document.createElement('canvas'), { width: w, height: Math.round(bmp.height * w / bmp.width) }); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); c.toBlob(ok, 'image/jpeg', .82) })
function csv(t) { return t.trim().split(/\r?\n/).map(l => l.split(',').map(s => s.trim().replace(/^"|"$/g, ''))) }
const vUpload = safe(async v => {
  const cats = await getCats(), Q = []; let paused = false, running = 0, seq = 0
  v.innerHTML = `<h1 data-s>批量上传工作台</h1>
  <label class="card drop" id="drop" data-s>${ic('upload')}<p>拖拽图片到这里或点击选择</p><small class="muted">支持 jpg png webp 单张不超过 ${MAXMB}MB 短边不小于 ${MINSIDE}px 重复文件自动跳过</small><input type="file" id="pick" multiple accept="image/jpeg,image/png,image/webp" hidden></label>
  <div class="card" data-s><h2>批量信息</h2><div class="two"><label>分类<div class="chips">${cats.map(c => `<label><input type="checkbox" class="bc" value="${c._id}">${esc(c.name)}</label>`).join('')}</div></label>
  <div style="display:grid;gap:10px"><label>标签<input id="bt" placeholder="用逗号分隔"></label><label>上传完成后<select id="bs"><option value="draft">保存为草稿</option><option value="published">直接发布</option></select></label></div></div>
  <div class="bar" style="margin:14px 0 0"><label class="btn">${ic('file-spreadsheet')}导入 CSV<input type="file" id="csv" accept=".csv" hidden></label><span class="muted">列 filename title categoryIds tags 多值用 | 分隔</span><span class="sp"></span>
  <button class="btn primary" id="go">${ic('play')}开始上传</button><button class="btn" id="ps">${ic('pause')}暂停</button><button class="btn" id="rt">${ic('rotate-cw')}重试失败</button><button class="btn" id="cl">清空已完成</button></div>
  <div class="prog"><i id="tp"></i></div></div>
  <div class="card" data-s><table><thead><tr><th></th><th>文件</th><th>标题</th><th>状态</th></tr></thead><tbody id="qb"></tbody></table></div>`
  const total = () => { const n = Q.filter(i => i.s !== 'dup').length; $('#tp').style.width = (n ? Q.filter(i => i.s === 'done').length / n * 100 : 0) + '%' }
  const upd = it => { const r = $('#r' + it.id); if (!r) return; $('.st', r).innerHTML = `${badge(it.s)} <span class="muted">${esc(it.msg || '')}</span><div class="prog"><i style="width:${it.p * 100}%"></i></div>`; total() }
  const addRow = it => { const tr = document.createElement('tr'); tr.id = 'r' + it.id; tr.innerHTML = `<td><img class="th" src="${it.url}"></td><td>${esc(it.file.name)}<div class="muted">${(it.file.size / 1048576).toFixed(1)}MB  ${it.w || '?'}x${it.h || '?'}</div></td><td><input value="${esc(it.title)}"></td><td class="st"></td>`; $('input', tr).oninput = e => (it.title = e.target.value); $('#qb').append(tr); upd(it); paint(tr) }
  const add = safe(async files => {
    const fresh = []
    for (const f of files) {
      const it = { id: ++seq, file: f, title: f.name.replace(/\.[^.]+$/, ''), s: 'wait', p: 0, url: URL.createObjectURL(f) }
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { it.s = 'error'; it.msg = '格式不支持' }
      else if (f.size > MAXMB * 1048576) { it.s = 'error'; it.msg = `超过 ${MAXMB}MB` }
      else { try { it.bmp = await createImageBitmap(f); it.w = it.bmp.width; it.h = it.bmp.height; if (Math.min(it.w, it.h) < MINSIDE) { it.s = 'error'; it.msg = `分辨率过低 短边需不小于 ${MINSIDE}px` } else it.sha = hex(await crypto.subtle.digest('SHA-256', await f.arrayBuffer())) } catch (e) { it.s = 'error'; it.msg = '无法读取图片' } }
      Q.push(it); fresh.push(it); addRow(it)
    }
    const hs = fresh.filter(i => i.sha).map(i => i.sha), seen = new Set(Q.filter(i => !fresh.includes(i) && i.sha).map(i => i.sha))
    const dups = new Set((await call('dupCheck', { hashes: hs })).map(d => d.sha256))
    fresh.forEach(i => { if (i.sha && (dups.has(i.sha) || seen.has(i.sha))) { i.s = 'dup'; i.msg = '已存在 不会覆盖原图' } else if (i.sha) seen.add(i.sha); upd(i) })
  })
  const one = async it => {
    const d = new Date(), base = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}/${it.sha.slice(0, 24)}`
    it.s = 'uploading'; it.p = 0; it.msg = ''; upd(it)
    if (!it.orig) {  // 先传文件 再建记录 失败重试时跳过已完成步骤
      const ext = it.file.type.split('/')[1].replace('jpeg', 'jpg')
      const [mo, mt] = await call('uploadMeta', { paths: [`wallpapers/original/${base}.${ext}`, `wallpapers/thumb/${base}.jpg`] })
      await post(mo, it.file, p => { it.p = p * .85; upd(it) }); it.orig = mo.fileId
      await post(mt, await thumbOf(it.bmp)); it.thumb = mt.fileId
    }
    const sel = $$('.bc:checked').map(c => c.value)
    await call('create', { items: [{ title: it.title, originalFileId: it.orig, thumbnailFileId: it.thumb, width: it.w, height: it.h, fileSize: it.file.size, sha256: it.sha,
      categoryIds: it.cats || sel, tags: it.tags || $('#bt').value.split(/[,，]/).map(s => s.trim()).filter(Boolean), status: $('#bs').value }] })
    it.s = 'done'; it.p = 1; upd(it)
  }
  const worker = async () => {
    for (;;) {
      const it = !paused && Q.find(i => i.s === 'ready'); if (!it) return
      it.s = 'uploading'
      try { await one(it) } catch (e) { it.s = 'error'; it.msg = e.message; upd(it) }
    }
  }
  const start = () => { paused = false; Q.filter(i => i.s === 'wait').forEach(i => (i.s = 'ready')); if (running) return; running = 2; Promise.all([worker(), worker()]).then(() => { running = 0; total(); if (!paused) toast('队列已处理完毕') }) }
  $('#go').onclick = start
  $('#ps').onclick = () => { paused = true; toast('已暂停 当前文件传完后停止') }
  $('#rt').onclick = () => { Q.filter(i => i.s === 'error' && i.sha).forEach(i => { i.s = 'wait'; i.msg = '' }); start() }
  $('#cl').onclick = () => { Q.filter(i => i.s === 'done').forEach(i => { $('#r' + i.id)?.remove(); Q.splice(Q.indexOf(i), 1) }); total() }
  $('#pick').onchange = e => add([...e.target.files])
  const dz = $('#drop'); dz.ondragover = e => { e.preventDefault(); dz.classList.add('over') }; dz.ondragleave = () => dz.classList.remove('over')
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove('over'); add([...e.dataTransfer.files]) }
  $('#csv').onchange = async e => {
    const [h, ...rows] = csv(await e.target.files[0].text()), ix = k => h.indexOf(k); let n = 0
    rows.forEach(r => { const it = Q.find(i => i.file.name === r[ix('filename')]); if (!it) return; n++
      if (ix('title') > -1 && r[ix('title')]) { it.title = r[ix('title')]; $('#r' + it.id + ' input').value = it.title }
      if (ix('categoryIds') > -1 && r[ix('categoryIds')]) it.cats = r[ix('categoryIds')].split('|')
      if (ix('tags') > -1 && r[ix('tags')]) it.tags = r[ix('tags')].split('|') })
    toast(`已匹配 ${n} 个文件`)
  }
})

/* 榜单 */
const vRanks = safe(async v => {
  const st = { period: '7', by: 'download' }; let last = []
  v.innerHTML = `<h1 data-s>榜单管理</h1><div class="bar" data-s><select id="rp"><option value="today">今日</option><option value="7" selected>近 7 天</option><option value="30">近 30 天</option><option value="all">累计</option></select><select id="rb"><option value="download">按下载量</option><option value="favorite">按收藏量</option></select><button class="btn" id="ex">${ic('download')}导出 CSV</button><span class="muted">榜单只读 数据来自真实统计 如需运营精选请使用壁纸的排序权重</span></div><div class="card" id="box" data-s></div>`
  const load = safe(async () => {
    const r = (last = await call('rank', st)), u = await urls(r.map(w => w.thumbnailFileId))
    $('#box').innerHTML = `<table><thead><tr><th>排名</th><th></th><th>标题</th><th>${st.by === 'favorite' ? '收藏' : '下载'}</th><th>总下载</th><th>总收藏</th></tr></thead><tbody>${r.map((w, i) => `<tr><td><b>${i + 1}</b></td><td><img class="th" src="${u[w.thumbnailFileId] || ''}"></td><td>${esc(w.title)}<div class="muted">${w._id}</div></td><td><b>${w.value}</b></td><td>${w.downloadCount || 0}</td><td>${w.favoriteCount || 0}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">暂无数据</td></tr>'}</tbody></table>`; paint($('#box'))
  })
  $('#ex').onclick = () => download('榜单', ['排名', 'ID', '标题', '数值', '总下载', '总收藏'], last.map((w, i) => [i + 1, w._id, w.title, w.value, w.downloadCount || 0, w.favoriteCount || 0]))
  $('#rp').onchange = e => { st.period = e.target.value; load() }; $('#rb').onchange = e => { st.by = e.target.value; load() }
  load()
})

/* 广告策略 每次保存生成新版本 */
const PFIELDS = [{ k: 'enabled', l: '下载广告', t: 'bool', hint: '开启' }, { k: 'mode', l: '适用范围', t: 'select', o: [['all', '所有壁纸'], ['specified', '指定壁纸'], ['none', '都不需要']] },
  { k: 'wallpaperIds', l: '指定壁纸 ID', t: 'tags' }, { k: 'memberFree', l: '会员免广告', t: 'bool', hint: '会员下载免广告' },
  { k: 'onAdFail', l: '广告失败或未完成时', t: 'select', o: [['block', '不允许下载'], ['retry', '提示重试'], ['grant', '放行一次']] }, { k: 'effectiveAt', l: '生效时间', t: 'date' }]
const vPolicy = safe(async v => {
  const r = (await call('list', { c: 'download_policies', sort: ['version', 'desc'], limit: 20 })).data, cur = r[0] || { enabled: false, mode: 'none', onAdFail: 'retry', memberFree: true }
  v.innerHTML = `<h1 data-s>广告策略配置</h1><div class="two"><div class="card" data-s style="display:grid;gap:14px"><h2>当前版本 ${cur.version ? 'v' + cur.version : '尚未配置'}</h2>${form(PFIELDS, cur)}<button class="btn primary" id="sv">${ic('save')}保存为新版本</button><p class="muted">策略只控制业务规则 广告播放与奖励必须以微信广告平台回调及服务端校验为准</p></div>
  <div class="card" data-s><h2>修改记录</h2><table><tbody>${r.map(p => `<tr><td>v${p.version}</td><td>${p.enabled ? '开启' : '关闭'}</td><td>${p.mode}</td><td>${fmtD(p.createdAt)}</td></tr>`).join('') || '<tr><td class="muted">暂无记录</td></tr>'}</tbody></table></div></div>`
  $('#sv').onclick = safe(async () => { if (!await ask('确认保存并生效新的广告策略')) return; await call('save', { c: 'download_policies', data: read(v, PFIELDS) }); toast('已保存'); route() })
})

const MEMBER = [['free', '普通用户'], ['vip', '会员']]
const routes = {
  dashboard: vDash, wallpapers: vWall, upload: vUpload, ranks: vRanks, policies: vPolicy,
  categories: tableView({ c: 'categories', title: '分类与标签', sort: ['sortWeight', 'desc'], add: 1, blank: { enabled: true, sortWeight: 0 },
    cols: [['name', '名称'], ['group', '分类组'], ['sortWeight', '排序权重'], ['enabled', '状态', e => `<span class="badge ${e ? 'ok' : 'offline'}">${e ? '启用' : '已停用'}</span>`]],
    fields: [{ k: 'name', l: '分类名称', t: 'text' }, { k: 'group', l: '分类组', t: 'text' }, { k: 'icon', l: '图标或封面', t: 'text' }, { k: 'desc', l: '简短介绍', t: 'textarea' }, { k: 'sortWeight', l: '排序权重 越大越靠前', t: 'number' }, { k: 'enabled', l: '启用状态', t: 'bool' }] }),
  users: tableView({ c: 'users', title: '用户与会员', sort: ['lastActiveAt', 'desc'], confirm: '确认修改该用户的会员权益 此操作会记入操作日志',
    cols: [['_id', '用户 ID'], ['nickname', '昵称'], ['memberLevel', '会员', x => MEMBER.find(m => m[0] === x)?.[1] || '普通用户'], ['memberExpireAt', '到期时间', fmtD], ['createdAt', '首次使用', fmtD], ['lastActiveAt', '最近活跃', fmtD]],
    fields: [{ k: 'memberLevel', l: '会员等级', t: 'select', o: MEMBER }, { k: 'memberExpireAt', l: '会员到期时间', t: 'date' }, { k: 'status', l: '账号状态', t: 'select', o: [['normal', '正常'], ['limited', '受限']] }] }),
  feedback: tableView({ c: 'feedback', title: '用户反馈', sort: ['createdAt', 'desc'], cols: FB_COLS, fields: FB_FIELDS, filters: [{ k: 'status', l: '全部状态', o: STAT_OPT }] }),
  reports: tableView({ c: 'copyright_reports', title: '版权投诉', sort: ['createdAt', 'desc'], cols: FB_COLS, fields: FB_FIELDS, filters: [{ k: 'status', l: '全部状态', o: STAT_OPT }] }),
  logs: tableView({ c: 'admin_audit_logs', title: '操作日志', sort: ['at', 'desc'], cols: [['at', '时间', fmtD], ['adminName', '操作人'], ['action', '操作'], ['detail', '详情', d => `<span class="muted">${esc(JSON.stringify(d)).slice(0, 90)}</span>`]] })
}
routes.admins = tableView({ c: 'admins', title: '管理员与权限', sort: ['createdAt', 'desc'], add: 1, blank: { enabled: true, role: 'editor' }, confirm: '确认修改管理员权限 此操作会记入操作日志',
  cols: [['name', '名称'], ['uid', '账号编号'], ['role', '角色', r => (r === 'super' ? '超级管理员' : '普通管理员')], ['enabled', '状态', e => `<span class="badge ${e ? 'ok' : 'offline'}">${e ? '启用' : '已停用'}</span>`], ['createdAt', '添加时间', fmtD]],
  fields: [{ k: 'name', l: '名称', t: 'text' }, { k: 'uid', l: '账号编号 对方登录后台时页面上会显示', t: 'text' }, { k: 'role', l: '角色', t: 'select', o: [['editor', '普通管理员 可上传和编辑壁纸'], ['super', '超级管理员 可改广告策略 会员 管理员']] }, { k: 'enabled', l: '启用', t: 'bool' }] })
const NAV = [['dashboard', 'layout-dashboard', '仪表盘'], ['wallpapers', 'image', '壁纸管理'], ['upload', 'upload', '批量上传'], ['categories', 'tags', '分类标签'], ['ranks', 'trophy', '榜单'], ['policies', 'megaphone', '广告策略'], ['users', 'users', '用户会员'], ['feedback', 'message-square', '反馈'], ['reports', 'shield-alert', '版权投诉'], ['logs', 'scroll-text', '操作日志'], ['admins', 'shield-check', '管理员']]

async function route() {
  if (!ME) return
  const [p, qs] = location.hash.slice(2).split('?'), name = routes[p] ? p : 'dashboard', view = $('#view')
  view.classList.add('leave'); await sleep(160); view.classList.remove('leave'); view.innerHTML = ''
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.r === name))
  await routes[name](view, new URLSearchParams(qs)); paint(view)
}
function showLogin(init, uid) { $('#myuid').textContent = uid || ''; $('#login').hidden = false; $('#shell').hidden = true; $('#lf').hidden = !!init; $('#initf').hidden = !init; paint($('#login')) }
async function enter(manual) {
  try { ME = await call('me') } catch (e) { console.error(e); if (manual) $('#le').textContent = '登录后无法连接后台 ' + (e.message || ''); return showLogin() }
  if (!ME || ME.notAdmin) return showLogin(true, ME?.uid)
  $('#login').hidden = true; $('#shell').hidden = false
  $('#who').textContent = ME.name + (ME.role === 'super' ? ' 超级管理员' : ' 管理员')
  $('#nav').innerHTML = `<div class="logo">壁纸运营后台</div>` + NAV.map(n => `<a href="#/${n[0]}" data-r="${n[0]}" data-s>${ic(n[1])}${n[2]}</a>`).join('')
  paint($('#nav')); route()
}
const logout = async () => { await auth.signOut(); location.reload() }
$('#lo').onclick = $('#lo1').onclick = logout
window.onhashchange = route
$('#lf').onsubmit = async e => {
  e.preventDefault(); const f = new FormData(e.target), u = f.get('u'), p = f.get('p'), b = $('button', e.target), le = $('#le')
  b.disabled = true; le.textContent = '登录中'
  try {
    const r = await Promise.race([auth.signIn ? auth.signIn({ username: u, password: p }) : auth.signInWithUsernameAndPassword(u, p), sleep(20000).then(() => { throw new Error('登录超时 请检查网络') })])
    if (r?.error) throw r.error
    le.textContent = ''; await enter(true)
  } catch (x) { console.error(x); le.textContent = x.error_description || x.message || x.msg || JSON.stringify(x) || '登录失败' }
  b.disabled = false
}
$('#initf').onsubmit = safe(async e => { e.preventDefault(); toast(await call('init', { key: new FormData(e.target).get('k') })); await enter() })
enter()
