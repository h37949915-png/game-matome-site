// ゲームまとめサイト 静的ビルドスクリプト（Node標準機能のみ・依存パッケージなし）
// 使い方: node build.mjs
// 原稿: content/articles.md（## 見出しで区切られた記事群）

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ============================================================
// サイト名はここ1か所で管理する（全ページがこの定数を参照）
// ============================================================
const SITE_NAME = 'ゲーム議事堂';

const DATE = '2026-11-21';
const DATE_LABEL = '2026年11月21日';

const SLUGS = [
  'umamusume-nfl',
  'zzz-ver34',
  'steam-machine',
  'azurlane-napoli',
  'sf6-queens-cup',
  'holojan',
  'saihate-station-switch',
  'capcom-goods-2026-11',
  'nikke-mileage',
  'solo-game-chiebukuro',
];

const CATEGORIES = [
  '速報',
  '速報',
  '賛否',
  '賛否',
  'eスポーツ',
  'VTuber',
  'インディー',
  'グッズ',
  '知恵袋発掘',
  '知恵袋発掘',
];

// カテゴリごとの色とアイコン（一覧のラベル＆サムネイル代わりの色ブロック用）
const CATEGORY_STYLE = {
  '速報':       { color: '#c62828', grad: 'linear-gradient(135deg,#e53935,#8e1414)', icon: '⚡' },
  '賛否':       { color: '#6a1b9a', grad: 'linear-gradient(135deg,#8e24aa,#4a116e)', icon: '⚖' },
  'eスポーツ':  { color: '#1565c0', grad: 'linear-gradient(135deg,#1e88e5,#0d3f75)', icon: '🏆' },
  'VTuber':     { color: '#d81b60', grad: 'linear-gradient(135deg,#ec407a,#8f103f)', icon: '🎤' },
  'インディー': { color: '#00796b', grad: 'linear-gradient(135deg,#26a69a,#00473f)', icon: '🎮' },
  'グッズ':     { color: '#2e7d32', grad: 'linear-gradient(135deg,#43a047,#17491a)', icon: '🛍' },
  '知恵袋発掘': { color: '#ef6c00', grad: 'linear-gradient(135deg,#fb8c00,#8f4a00)', icon: '💡' },
};
const DEFAULT_STYLE = { color: '#555555', grad: 'linear-gradient(135deg,#757575,#333333)', icon: '📰' };
const catStyle = (cat) => CATEGORY_STYLE[cat] ?? DEFAULT_STYLE;

// ---------- 入力 ----------
const root = dirname(fileURLToPath(import.meta.url));
const srcPath = existsSync(join(root, 'articles.md'))
  ? join(root, 'articles.md')
  : existsSync(join(root, 'content', 'articles.md'))
    ? join(root, 'content', 'articles.md')
    : join(root, '..', 'your_files', 'game-matome-trial-10-v4.md');
const source = readFileSync(srcPath, 'utf8');

// ---------- ユーティリティ ----------
const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+?)`/g, '<code>$1</code>');
const plainText = (s) => s.replace(/[*`]/g, '').trim();

// ---------- Markdown パース ----------
// 冒頭のタイトル行（#）と説明文は記事ではないので、最初の ## 以前は捨てる。
// ## = 記事タイトル / ### = 小見出し / > [埋め込み：〜] = 埋め込み枠 /
// > それ以外 = 引用ボックス / --- = 記事区切り（無視）/
// 「コメント」見出し配下で『〜』で始まる段落 = コメント風ボックス。
// それ以外の『〜』で始まる段落 = 反応の声として引用風に表示。
function parseArticles(md) {
  const lines = md.split(/\r?\n/);
  const articles = [];
  let cur = null;
  let section = '';
  let para = [];
  let quote = [];

  const flushPara = () => {
    if (!cur || para.length === 0) { para = []; return; }
    const text = para.join('').trim();
    para = [];
    if (!text) return;
    if (text === 'コメント' || text === 'ネットの反応') {
      cur.blocks.push({ type: 'h3', text });
      section = text;
      return;
    }
    if (section.includes('コメント') && text.startsWith('『')) {
      cur.blocks.push({ type: 'comment', text });
    } else if (text.startsWith('『')) {
      cur.blocks.push({ type: 'voice', text });
    } else {
      cur.blocks.push({ type: 'p', text });
      if (!cur.excerpt) cur.excerpt = plainText(text);
    }
  };

  const flushQuote = () => {
    if (!cur || quote.length === 0) { quote = []; return; }
    const text = quote.join('').trim();
    quote = [];
    if (!text) return;
    const m = text.match(/^\[\s*埋め込み[:：](.+?)\]\s*$/s);
    if (m) {
      cur.blocks.push({ type: 'embed', text: m[1].trim() });
    } else {
      cur.blocks.push({ type: 'quote', text });
    }
  };

  const flushAll = () => { flushPara(); flushQuote(); };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('## ') && !line.startsWith('### ')) {
      flushAll();
      cur = { title: line.slice(3).trim(), blocks: [], excerpt: '' };
      articles.push(cur);
      section = '';
      continue;
    }
    if (!cur) continue; // 最初の ## より前は捨てる
    if (line.startsWith('### ')) {
      flushAll();
      const text = line.slice(4).trim();
      cur.blocks.push({ type: 'h3', text });
      section = text;
      continue;
    }
    if (line.trim() === '---') { flushAll(); continue; }
    if (line.startsWith('>')) {
      flushPara();
      quote.push(line.replace(/^>\s?/, ''));
      continue;
    }
    if (line.trim() === '') { flushAll(); continue; }
    flushQuote();
    para.push(line.trim());
  }
  flushAll();
  return articles;
}

const parsed = parseArticles(source);
if (parsed.length !== SLUGS.length) {
  console.error(`記事数が想定と違います: ${parsed.length} 件（想定 ${SLUGS.length} 件）`);
  process.exit(1);
}
const articles = parsed.map((a, i) => ({
  ...a,
  slug: SLUGS[i],
  category: CATEGORIES[i],
  date: DATE,
  dateLabel: DATE_LABEL,
}));

// ---------- HTML 部品 ----------
const navCats = [...new Set(CATEGORIES)];
const header = (prefix) => `
<header class="site-header">
  <div class="header-inner">
    <a class="site-logo" href="${prefix}index.html">${esc(SITE_NAME)}</a>
    <nav class="cat-nav">
      ${navCats.map((c) => `<a href="${prefix}index.html#cat-${encodeURIComponent(c)}" style="--cat:${catStyle(c).color}">${esc(c)}</a>`).join('')}
    </nav>
  </div>
</header>`;

const footer = `
<footer class="site-footer">
  <p>${esc(SITE_NAME)} ｜ ゲームの話題とネットの反応をまとめるサイト</p>
  <p class="footer-note">掲載している反応は試作用のサンプルです。公開時は実ポストの埋め込みに差し替えます。</p>
</footer>`;

const page = ({ title, prefix, body, extraHead = '' }) => `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}｜${esc(SITE_NAME)}</title>
<link rel="stylesheet" href="${prefix}style.css">
${extraHead}
</head>
<body>
${header(prefix)}
<main>
${body}
</main>
${footer}
<script defer src="/_vercel/insights/script.js"></script>
</body>
</html>
`;

// ---------- 記事本文の描画 ----------
function renderBlocks(blocks) {
  return blocks.map((b) => {
    switch (b.type) {
      case 'h3':
        return `<h2 class="section-title">${esc(b.text)}</h2>`;
      case 'embed':
        return `<div class="embed-box"><span class="embed-tag">公式ポスト</span><p class="embed-title">${esc(b.text)}</p><p class="embed-note">ここに公式ポストが埋め込まれます（X埋め込み枠）</p></div>`;
      case 'quote':
        return `<blockquote class="quote-box">${inline(b.text)}</blockquote>`;
      case 'comment':
        return `<div class="comment-box"><span class="comment-avatar">💬</span><p>${inline(b.text)}</p></div>`;
      case 'voice':
        return `<p class="voice">${inline(b.text)}</p>`;
      default:
        return `<p>${inline(b.text)}</p>`;
    }
  }).join('\n');
}

// ---------- スタイル ----------
const CSS = `
:root{
  --red:#a5121d; --red-dark:#7c0d15; --ink:#22252a; --muted:#6b7280;
  --line:#e7e5e4; --bg:#faf9f7; --card:#ffffff;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);
  font-family:"Hiragino Kaku Gothic ProN","Hiragino Sans","Noto Sans JP",system-ui,sans-serif;
  line-height:1.8;font-size:16px}
a{color:inherit;text-decoration:none}
main{max-width:860px;margin:0 auto;padding:0 14px 48px}

/* ヘッダー */
.site-header{background:linear-gradient(90deg,var(--red-dark),var(--red) 55%,#c1272d);
  color:#fff;box-shadow:0 2px 10px rgba(124,13,21,.35);position:sticky;top:0;z-index:10}
.header-inner{max-width:860px;margin:0 auto;padding:12px 14px 10px}
.site-logo{display:inline-block;font-size:24px;font-weight:900;letter-spacing:.02em;line-height:1.2}
.site-logo::before{content:"⚡ ";color:#ffd54d}
.cat-nav{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}
.cat-nav a{font-size:12.5px;font-weight:700;background:rgba(255,255,255,.14);
  border:1px solid rgba(255,255,255,.35);padding:2px 10px;border-radius:999px}
.cat-nav a:hover{background:rgba(255,255,255,.3)}

/* ヒーロー */
.hero{padding:26px 4px 6px}
.hero h1{font-size:26px;margin:0 0 6px;font-weight:900}
.hero p{margin:0;color:var(--muted);font-size:14.5px}

/* 一覧カード */
.card-list{display:flex;flex-direction:column;gap:12px;margin-top:18px}
.card{display:flex;gap:13px;align-items:stretch;background:var(--card);
  border:1px solid var(--line);border-radius:14px;padding:13px 14px;
  box-shadow:0 1px 4px rgba(0,0,0,.05);transition:transform .08s,box-shadow .08s}
.card:hover{transform:translateY(-1px);box-shadow:0 5px 16px rgba(0,0,0,.1)}
.card-thumb{flex:0 0 62px;border-radius:10px;display:flex;align-items:center;justify-content:center;
  font-size:29px;color:#fff;min-height:86px}
.card-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.card-meta{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted)}
.cat-label{display:inline-block;color:#fff;font-size:11.5px;font-weight:800;
  padding:1px 9px;border-radius:999px;line-height:1.7}
.card-title{font-weight:800;font-size:16.5px;line-height:1.5}
.card-excerpt{font-size:13px;color:var(--muted);line-height:1.65;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card-arrow{align-self:center;font-size:24px;color:#c9c4c0;font-weight:700}

/* 記事ページ */
.article{background:var(--card);border:1px solid var(--line);border-radius:14px;
  margin-top:20px;padding:24px 22px 10px;box-shadow:0 1px 4px rgba(0,0,0,.05)}
.article-meta{display:flex;align-items:center;gap:9px;font-size:12.5px;color:var(--muted)}
.article-title{font-size:23px;line-height:1.5;font-weight:900;margin:10px 0 18px;
  border-bottom:3px solid var(--red);padding-bottom:13px}
.article-body p{margin:0 0 1.15em}
.article-body .section-title{font-size:17.5px;font-weight:900;margin:1.7em 0 .8em;
  padding:6px 12px;background:#fdf1f1;border-left:5px solid var(--red);border-radius:0 8px 8px 0}
.article-body .voice{background:#fffaf0;border:1px solid #f3e2b8;border-radius:10px;
  padding:9px 13px;font-size:15px}
.embed-box{border:2px dashed #b6bcc7;border-radius:12px;background:#f7f9fc;
  padding:16px;margin:0 0 1.3em;text-align:center;color:#4b5563}
.embed-tag{display:inline-block;background:#1d9bf0;color:#fff;font-size:11.5px;font-weight:800;
  padding:1px 10px;border-radius:999px;margin-bottom:7px}
.embed-title{font-weight:800;margin:0 0 3px !important;color:#1f2937}
.embed-note{font-size:12.5px;color:#8a93a3;margin:0 !important}
.quote-box{margin:0 0 1.3em;padding:13px 16px;background:#f5f5f4;border-left:5px solid #a8a29e;
  border-radius:0 10px 10px 0;font-size:15px}
.comment-box{display:flex;gap:10px;background:#f4f8ff;border:1px solid #dbeafe;
  border-radius:12px;padding:10px 13px;margin:0 0 10px}
.comment-avatar{flex:0 0 auto;width:32px;height:32px;border-radius:50%;background:#dbeafe;
  display:flex;align-items:center;justify-content:center;font-size:16px}
.comment-box p{margin:0 !important;font-size:14.5px;line-height:1.7}

/* 前後リンク */
.pager{display:flex;gap:10px;align-items:stretch;margin:26px 0 16px;flex-wrap:wrap}
.pager-link{flex:1 1 200px;border:1px solid var(--line);border-radius:10px;padding:9px 12px;background:#fcfcfb}
.pager-link span{display:block;font-size:12px;color:var(--red);font-weight:800}
.pager-link strong{display:block;font-size:13.5px;line-height:1.55;font-weight:700}
.pager-link.next{text-align:right}
.pager-top{align-self:center;font-size:13px;font-weight:800;color:var(--red);
  border:1px solid var(--red);border-radius:999px;padding:5px 14px;white-space:nowrap}
.pager-spacer{flex:1 1 200px}

/* フッター */
.site-footer{border-top:1px solid var(--line);background:#fff;margin-top:8px}
.site-footer p{max-width:860px;margin:0 auto;padding:14px;font-size:13px;color:var(--muted)}
.site-footer .footer-note{padding-top:0;font-size:12px}

/* スマホ */
@media (max-width:560px){
  .site-logo{font-size:20px}
  .hero h1{font-size:21px}
  .card-thumb{flex-basis:48px;font-size:23px;min-height:74px}
  .card-title{font-size:15px}
  .article{padding:18px 15px 6px}
  .article-title{font-size:19.5px}
  body{font-size:15.5px}
}
`;

// ---------- 出力 ----------
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'articles'), { recursive: true });

// style.css
writeFileSync(join(dist, 'style.css'), CSS, 'utf8');

// 記事ページ
articles.forEach((a, i) => {
  const st = catStyle(a.category);
  const prev = articles[i - 1];
  const next = articles[i + 1];
  const pager = `
<nav class="pager">
  ${prev ? `<a class="pager-link prev" href="${prev.slug}.html"><span>← 前の記事</span><strong>${esc(prev.title)}</strong></a>` : '<span class="pager-spacer"></span>'}
  <a class="pager-top" href="../index.html">一覧へ</a>
  ${next ? `<a class="pager-link next" href="${next.slug}.html"><span>次の記事 →</span><strong>${esc(next.title)}</strong></a>` : '<span class="pager-spacer"></span>'}
</nav>`;
  const body = `
<article class="article">
  <div class="article-meta">
    <span class="cat-label" style="background:${st.color}">${esc(a.category)}</span>
    <time datetime="${a.date}">${a.dateLabel}</time>
  </div>
  <h1 class="article-title">${esc(a.title)}</h1>
  <div class="article-body">
${renderBlocks(a.blocks)}
  </div>
  ${pager}
</article>`;
  writeFileSync(
    join(dist, 'articles', `${a.slug}.html`),
    page({ title: a.title, prefix: '../', body }),
    'utf8',
  );
});

// 一覧ページ
const cards = articles.map((a) => {
  const st = catStyle(a.category);
  const excerpt = a.excerpt.length > 110 ? a.excerpt.slice(0, 110) + '…' : a.excerpt;
  return `
<a class="card" id="cat-${encodeURIComponent(a.category)}" href="articles/${a.slug}.html">
  <span class="card-thumb" style="background:${st.grad}">${st.icon}</span>
  <span class="card-main">
    <span class="card-meta"><span class="cat-label" style="background:${st.color}">${esc(a.category)}</span><time datetime="${a.date}">${a.dateLabel}</time></span>
    <span class="card-title">${esc(a.title)}</span>
    <span class="card-excerpt">${esc(excerpt)}</span>
  </span>
  <span class="card-arrow">›</span>
</a>`;
}).join('');

const indexBody = `
<section class="hero">
  <h1>${esc(SITE_NAME)}</h1>
  <p>ゲームの発表・賛否・みんなの反応を、まとめて読める形でお届けします。</p>
</section>
<section class="card-list">
${cards}
</section>`;

writeFileSync(
  join(dist, 'index.html'),
  page({ title: '記事一覧', prefix: '', body: indexBody }),
  'utf8',
);

console.log(`ビルド完了: 記事 ${articles.length} 本 → dist/index.html, dist/articles/*.html, dist/style.css`);
articles.forEach((a) => console.log(` - articles/${a.slug}.html [${a.category}] ${a.title}`));
