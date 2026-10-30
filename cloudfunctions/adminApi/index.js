// 壁纸管理后台统一入口 云函数 adminApi
// 所有后台读写都经过这里 先校验管理员身份 再操作数据库和云存储 前端不直接写库
const tcb = require('@cloudbase/node-sdk')
const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV })
const db = app.database()
const _ = db.command

const COLS = ['wallpapers', 'categories', 'users', 'favorites', 'collections', 'download_history', 'user_events',
  'wallpaper_stats_daily', 'search_terms', 'recommendation_rules', 'download_policies', 'membership_orders',
  'feedback', 'copyright_reports', 'admins', 'admin_audit_logs']
// 允许后台修改的字段白名单 统计计数 下载数 收藏数永远不允许后台改
const SPEC = {
  wallpapers: ['title', 'description', 'categoryIds', 'tags', 'colorTags', 'styleTags', 'sortWeight', 'copyrightStatus'],
  categories: ['name', 'group', 'icon', 'sortWeight', 'enabled', 'desc'],
  download_policies: ['enabled', 'mode', 'wallpaperIds', 'memberFree', 'onAdFail', 'effectiveAt'],
  feedback: ['status', 'note'],
  copyright_reports: ['status', 'note'],
  users: ['memberLevel', 'memberExpireAt', 'status'],
  admins: ['uid', 'name', 'role', 'enabled']
}
const SUPER_ONLY = ['download_policies', 'users', 'admins']
const SEED = [['动漫游戏', ['动漫二次元', '游戏', '影视角色']], ['自然风景', ['山川风景', '海洋湖泊', '星空宇宙', '花卉植物']],
  ['动物萌宠', ['猫狗宠物', '野生动物', '奇趣动物']], ['人物生活', ['人物肖像', '情侣友情', '生活方式']],
  ['设计美学', ['极简高级', '抽象几何', '文字语录']], ['视觉艺术', ['手绘插画', '3D立体', '摄影写实', '像素复古']],
  ['城市科技', ['城市建筑', '汽车机车', '科技科幻']], ['其他主题', ['美食', '节日主题', '其他']]]

const pick = (o, ks) => Object.fromEntries(ks.filter(k => o && k in o).map(k => [k, o[k]]))
const fail = msg => ({ ok: false, msg })
const ok = data => ({ ok: true, data })
const toDate = d => (d ? new Date(d) : null)
const day = off => new Date(Date.now() + 8 * 36e5 - off * 864e5).toISOString().slice(0, 10)
const days = n => Array.from({ length: n }, (_, i) => day(n - 1 - i))
async function all(q) {
  let out = [], skip = 0
  for (;;) {
    const r = await q.skip(skip).limit(1000).get()
    out = out.concat(r.data)
    if (r.data.length < 1000) return out
    skip += 1000
  }
}
const log = (a, action, detail) =>
  db.collection('admin_audit_logs').add({ adminUid: a.uid, adminName: a.name || '', action, detail, at: new Date() }).catch(() => {})

async function init(uid, key) {
  for (const c of COLS) { try { await db.createCollection(c) } catch (e) {} }
  const n = (await db.collection('admins').count()).total
  let msg = '集合已就绪'
  if (n > 0) return fail('已经有管理员了 请把你的账号编号发给超级管理员 请他在管理员页面添加你')
  if (n === 0) {
    if (!process.env.BOOTSTRAP_KEY || key !== process.env.BOOTSTRAP_KEY) return fail('初始化密钥不正确')
    await db.collection('admins').add({ uid, name: '超级管理员', role: 'super', enabled: true, createdAt: new Date() })
    msg += '并已设为超级管理员'
  }
  if ((await db.collection('categories').count()).total === 0) {
    let i = 0
    for (const [g, items] of SEED) for (const name of items)
      await db.collection('categories').add({ name, group: g, sortWeight: 1000 - i++, enabled: true, desc: '', icon: '' })
  }
  return ok(msg)
}

const A = {
  async stats({ days: n = 30 }) {
    const span = days(Math.max(n, 30))
    const rows = await all(db.collection('wallpaper_stats_daily').where({ date: _.gte(span[0]) }))
    const by = {}; span.forEach(d => (by[d] = { date: d, downloads: 0, favorites: 0, views: 0 }))
    rows.forEach(r => { const x = by[r.date]; if (x) { x.downloads += r.downloadCount || 0; x.favorites += r.favoriteAddCount || 0; x.views += r.viewCount || 0 } })
    const series = span.map(d => by[d])
    const sum = (k, m) => series.slice(-m).reduce((s, x) => s + x[k], 0)
    const cnt = s => db.collection('wallpapers').where(s ? { status: s } : {}).count().then(r => r.total)
    const top = f => db.collection('wallpapers').where({ status: 'published' }).orderBy(f, 'desc').limit(10)
      .field({ title: true, thumbnailFileId: true, downloadCount: true, favoriteCount: true }).get().then(r => r.data)
    const pend = c => db.collection(c).where({ status: 'pending' }).count().then(r => r.total)
    const [total, published, draft, offline, td, tf, p1, p2] = await Promise.all([cnt(), cnt('published'), cnt('draft'), cnt('offline'),
      top('downloadCount'), top('favoriteCount'), pend('feedback'), pend('copyright_reports')])
    return { total, published, draft, offline, topDownload: td, topFavorite: tf, pending: p1, pendingReports: p2,
      today: sum('downloads', 1), d7: sum('downloads', 7), d30: sum('downloads', 30), fav7: sum('favorites', 7),
      series: series.slice(-n) }
  },
  // 榜单 今日 / 7 / 30 来自每日统计聚合 累计直接读壁纸累计字段
  async rank({ period = '7', by = 'download' }) {
    const [daily, total] = by === 'favorite' ? ['favoriteAddCount', 'favoriteCount'] : ['downloadCount', 'downloadCount']
    if (period === 'all')
      return (await db.collection('wallpapers').where({ status: 'published' }).orderBy(total, 'desc').limit(20).get()).data
        .map(w => ({ ...w, value: w[total] || 0 }))
    const n = period === 'today' ? 1 : Number(period)
    const rows = await all(db.collection('wallpaper_stats_daily').where({ date: _.gte(days(n)[0]) }))
    const m = {}; rows.forEach(r => (m[r.wallpaperId] = (m[r.wallpaperId] || 0) + (r[daily] || 0)))
    const ids = Object.keys(m).sort((a, b) => m[b] - m[a]).slice(0, 20)
    if (!ids.length) return []
    const ws = (await db.collection('wallpapers').where({ _id: _.in(ids) }).get()).data
    return ids.map(id => ({ ...(ws.find(w => w._id === id) || { _id: id, title: '已删除' }), value: m[id] }))
  },
  async list({ c, where = {}, q, sort, skip = 0, limit = 20 }) {
    if (!COLS.includes(c)) throw new Error('集合不存在')
    const w = Object.fromEntries(Object.entries(where).filter(([, v]) => typeof v !== 'object'))
    if (q && c === 'wallpapers') w.title = db.RegExp({ regexp: String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), options: 'i' })
    const col = db.collection(c).where(w)
    const total = (await col.count()).total
    const data = (await (sort ? col.orderBy(sort[0], sort[1]) : col).skip(skip).limit(Math.min(limit, 100)).get()).data
    return { total, data }
  },
  // 单张壁纸的每日下载 收藏 浏览趋势
  async trend({ id, days: n = 30 }) {
    const span = days(n)
    const rows = await all(db.collection('wallpaper_stats_daily').where({ wallpaperId: id, date: _.gte(span[0]) }))
    return span.map(d => { const r = rows.find(x => x.date === d) || {}; return { date: d, downloads: r.downloadCount || 0, favorites: r.favoriteAddCount || 0, views: r.viewCount || 0 } })
  },
  async urls({ ids = [] }) {
    const fileList = ids.filter(i => String(i).startsWith('cloud://')).slice(0, 50)
    if (!fileList.length) return {}
    const r = await app.getTempFileURL({ fileList })
    return Object.fromEntries(r.fileList.map(f => [f.fileID, f.tempFileURL]))
  },
  // 返回 COS 直传凭证 浏览器直接上传 云存储对外保持只读
  async uploadMeta({ paths = [] }) {
    return Promise.all(paths.map(async p => {
      if (!/^wallpapers\/(original|thumb)\//.test(p)) throw new Error('非法路径')
      const r = await app.getUploadMetadata({ cloudPath: p })
      return { ...r.data, path: p }
    }))
  },
  async dupCheck({ hashes = [] }) {
    if (!hashes.length) return []
    return (await db.collection('wallpapers').where({ sha256: _.in(hashes) }).field({ sha256: true, title: true }).get()).data
  },
  // 文件上传成功后才创建记录
  async create({ items = [] }, a) {
    const ids = []
    for (const it of items) {
      if (!String(it.originalFileId).startsWith('cloud://')) throw new Error('原图文件标识无效')
      const published = it.status === 'published'
      const r = await db.collection('wallpapers').add({
        ...pick(it, [...SPEC.wallpapers, 'thumbnailFileId', 'originalFileId', 'width', 'height', 'fileSize', 'sha256']),
        categoryIds: it.categoryIds || [], tags: it.tags || [], colorTags: [], styleTags: [], sortWeight: 0,
        status: published ? 'published' : 'draft', publishedAt: published ? new Date() : null,
        createdAt: new Date(), updatedAt: new Date(), downloadCount: 0, favoriteCount: 0, viewCount: 0,
        copyrightStatus: 'unchecked', createdBy: a.uid
      })
      ids.push(r.id)
    }
    await log(a, 'wallpaper.create', { count: ids.length, ids })
    return ids
  },
  async patch({ ids = [], patch = {} }, a) {
    const data = { ...pick(patch, SPEC.wallpapers), updatedAt: new Date() }
    await db.collection('wallpapers').where({ _id: _.in(ids) }).update(data)
    await log(a, 'wallpaper.patch', { ids, fields: Object.keys(data) })
    return true
  },
  // 首次发布才写 publishedAt 之后编辑或重新上架不重置
  async setStatus({ ids = [], status }, a) {
    if (!['draft', 'published', 'offline'].includes(status)) throw new Error('状态无效')
    const docs = (await db.collection('wallpapers').where({ _id: _.in(ids) }).field({ publishedAt: true }).get()).data
    await Promise.all(docs.map(d => db.collection('wallpapers').doc(d._id).update({
      status, updatedAt: new Date(), ...(status === 'published' && !d.publishedAt ? { publishedAt: new Date() } : {})
    })))
    await log(a, 'wallpaper.status.' + status, { ids })
    return true
  },
  async save({ c, id, data }, a) {
    if (!SPEC[c] || c === 'wallpapers') throw new Error('不支持的集合')
    if (SUPER_ONLY.includes(c) && a.role !== 'super') throw new Error('需要超级管理员权限')
    const d = pick(data, SPEC[c])
    ;['effectiveAt', 'memberExpireAt'].forEach(k => { if (k in d) d[k] = toDate(d[k]) })
    if (c === 'admins') {
      if (!id && !d.uid) throw new Error('请填写账号编号')
      if (id === a._id && (d.enabled === false || (d.role && d.role !== 'super'))) throw new Error('不能降低自己的权限')
    }
    d.updatedAt = new Date()
    if (c === 'download_policies') {
      const last = (await db.collection(c).orderBy('version', 'desc').limit(1).get()).data[0]
      await db.collection(c).add({ ...d, version: (last?.version || 0) + 1, createdBy: a.uid, createdAt: new Date() })
    } else if (id) await db.collection(c).doc(id).update(d)
    else if (c === 'categories' || c === 'admins') await db.collection(c).add({ ...d, ...(c === 'admins' ? { createdAt: new Date() } : {}) })
    else throw new Error('缺少 id')
    await log(a, 'save.' + c, { id, fields: Object.keys(d) })
    return true
  }
}

exports.main = async ev => {
  const { userInfo } = app.auth().getEndUserInfo()
  const uid = userInfo && (userInfo.uid || userInfo.customUserId)
  if (!uid) return fail('未登录')
  if (ev.action === 'init') return init(uid, ev.key)
  let admin = null
  try { admin = (await db.collection('admins').where({ uid, enabled: true }).limit(1).get()).data[0] } catch (e) {}
  if (ev.action === 'me') return ok(admin || { notAdmin: true, uid })
  if (!admin) return fail('无管理员权限')
  try {
    if (!A[ev.action]) return fail('未知操作')
    return ok(await A[ev.action](ev, admin))
  } catch (e) { return fail(e.message) }
}
