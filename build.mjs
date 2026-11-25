// ゲームまとめサイト 静的ビルドスクリプト（Node標準機能のみ・依存パッケージなし）
// 使い方: node build.mjs
// 原稿: articles.md（## 見出しで区切られた記事群）
// デザイン: style.src.css（Gemini生成デザインを統合したもの）を dist/style.css にコピー

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ============================================================
// サイト名はここ1か所で管理する（全ページがこの定数を参照）
// ============================================================
const SITE_NAME = 'ゲーム議事堂';

// 記事メタ（原稿の並び順と対応）
const SLUGS = [
  'melty-blood-twi-lumina',
  'dbd-terrifier',
  'digimon-alysion-release',
  'resleriana-atelier-service-end',
  'mabinogi-mobile-denki-update',
  'gbf-goldmoon-150',
  'showa-american-story',
  'makendo-1-2',
  'bluearchive-publisher-transfer',
  'gothic-1-remake-ps5',
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
  'eスポーツ',
  '速報',
  '速報',
  '賛否',
  '速報',
  '知恵袋発掘',
  '賛否',
  '速報',
  '賛否',
  '賛否',
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

const DATES = [
  '2026-11-25',
  '2026-11-25',
  '2026-11-25',
  '2026-11-25',
  '2026-11-25',
  '2026-11-25',
  '2026-11-24',
  '2026-11-24',
  '2026-11-24',
  '2026-11-22',
  '2026-11-21',
  '2026-11-21',
  '2026-11-21',
  '2026-11-21',
  '2026-11-21',
  '2026-11-21',
  '2026-11-21',
  '2026-11-21',
  '2026-11-21',
  '2026-11-21',
];

// カテゴリ → Geminiデザインのタグ用クラス
const CAT_CLASS = {
  '速報': 'cat-sokuho',
  '賛否': 'cat-sanpi',
  'eスポーツ': 'cat-esports',
  'VTuber': 'cat-vtuber',
  'インディー': 'cat-indie',
  'グッズ': 'cat-goods',
  '知恵袋発掘': 'cat-chie',
};
const catClass = (cat) => CAT_CLASS[cat] ?? '';
const NAV_CATS = ['速報', '賛否', 'eスポーツ', 'VTuber', 'インディー', 'グッズ', '知恵袋発掘'];

// ---------- 入力 ----------
const root = dirname(fileURLToPath(import.meta.url));
const srcPath = existsSync(join(root, 'articles.md'))
  ? join(root, 'articles.md')
  : join(root, 'content', 'articles.md');
const source = readFileSync(srcPath, 'utf8');
const cssSource = readFileSync(join(root, 'style.src.css'), 'utf8');

// ---------- ユーティリティ ----------
const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+?)`/g, '<code>$1</code>');
const plainText = (s) => s.replace(/[*`]/g, '').trim();
const dateLabel = (d) => {
  const [y, m, dd] = d.split('-').map(Number);
  return `${y}年${m}月${dd}日`;
};
const dateShort = (d) => d.replace(/-/g, '/');

// ---------- Markdown パース ----------
// 冒頭のタイトル行（#）と説明文は記事ではないので、最初の ## 以前は捨てる。
// ## = 記事タイトル / ### = 小見出し / > [埋め込み：〜] = 埋め込み枠 /
// > それ以外 = 引用ボックス / --- = 記事区切り（無視）/
// 「コメント」見出し配下で『〜』で始まる段落 = コメント。
// それ以外の『〜』で始まる段落 = 反応の声。
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
    if (!cur) continue;
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
  date: DATES[i],
  dateLabel: dateLabel(DATES[i]),
  dateShort: dateShort(DATES[i]),
  commentCount: a.blocks.filter((b) => b.type === 'comment').length,
}));

// ---------- HTML 部品（Geminiデザインの構造に合わせる） ----------
const header = (prefix) => `
<header class="site-header">
  <div class="header-top-bar">
    <span>個人運営のゲームニュース・反応まとめブログ</span>
    <div class="header-top-links">
      <a href="${prefix}index.html#about">このサイトについて</a>
    </div>
  </div>
  <div class="header-main">
    <div>
      <p class="site-title"><a href="${prefix}index.html">ゲーム<span>議事堂</span></a></p>
      <p class="site-tagline">家庭用・PCゲーム・VTuber界隈の話題とネットの反応を記録するまとめブログ</p>
    </div>
  </div>
</header>
<nav class="category-nav" aria-label="カテゴリナビゲーション">
  <ul>
    <li><a href="${prefix}index.html">トップ</a></li>
    ${NAV_CATS.map((c) => `<li><a href="${prefix}index.html#${catClass(c)}">${esc(c)}</a></li>`).join('')}
  </ul>
</nav>`;

const footer = (prefix) => `
<footer class="site-footer">
  <div class="footer-inner">
    <div class="footer-links">
      <a href="${prefix}index.html">トップページ</a>
      <a href="${prefix}index.html#about">サイトについて</a>
    </div>
    <p class="footer-note">掲載している反応・コメントは試作用のサンプルです。公開運用時は実ポストの埋め込みに差し替えます。</p>
    <p class="copyright">&copy; 2026 ${esc(SITE_NAME)} All Rights Reserved.</p>
  </div>
</footer>`;

const sidebar = (prefix) => {
  const latest = articles.slice(0, 5);
  const counts = {};
  for (const a of articles) counts[a.category] = (counts[a.category] ?? 0) + 1;
  return `
<aside class="sidebar-column">
  <section class="sidebar-widget">
    <h2 class="widget-title">■ 新着記事</h2>
    <div class="widget-content">
      <ol class="ranking-list">
        ${latest.map((a, i) => `
        <li>
          <span class="rank-num${i < 3 ? ` top${i + 1}` : ''}">${i + 1}</span>
          <div>
            <a href="${prefix}articles/${a.slug}.html">${esc(a.title)}</a>
            <span class="ranking-meta">${esc(a.category)} / ${a.commentCount}コメント</span>
          </div>
        </li>`).join('')}
      </ol>
    </div>
  </section>

  <section class="sidebar-widget">
    <h2 class="widget-title">■ カテゴリ一覧</h2>
    <div class="widget-content">
      <ul class="side-cat-list">
        ${NAV_CATS.map((c) => `<li><a href="${prefix}index.html#${catClass(c)}"><span>» ${esc(c)}</span><span class="side-cat-count">${counts[c] ?? 0}</span></a></li>`).join('')}
      </ul>
    </div>
  </section>

  <section class="sidebar-widget" id="about">
    <h2 class="widget-title">■ サイト紹介</h2>
    <div class="widget-content about-box">
      <p><strong>${esc(SITE_NAME)}</strong>は、ゲームの発表や賛否が割れる話題を、ネットの反応と一緒にまとめる個人運営のブログです。</p>
      <p>現在は試作版として公開中です。記事中の反応・コメントは、確認できた賛否を代表する試作用の声で、実在ポストの引用ではありません。運用が本格化する段階で、実ポストの埋め込みに差し替えていきます。</p>
    </div>
  </section>
</aside>`;
};

const page = ({ title, prefix, body }) => `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}｜${esc(SITE_NAME)}</title>
<link rel="stylesheet" href="${prefix}style.css">
</head>
<body>
<div class="site-wrapper">
${header(prefix)}
${body}
${footer(prefix)}
</div>
<script defer src="/_vercel/insights/script.js"></script>
</body>
</html>
`;

// ---------- 記事本文の描画 ----------
// h3「ネットの反応」以降を反応セクション、h3「コメント」以降をコメント欄として描く
function renderArticleBody(a) {
  const parts = { main: [], reaction: [], comments: [] };
  let mode = 'main';
  for (const b of a.blocks) {
    if (b.type === 'h3' && b.text.includes('ネットの反応')) { mode = 'reaction'; continue; }
    if (b.type === 'h3' && b.text.includes('コメント')) { mode = 'comments'; continue; }
    if (b.type === 'h3') { parts[mode].push(`<h2>${esc(b.text)}</h2>`); continue; }
    parts[mode].push(b);
  }

  const renderInlineBlock = (b) => {
    switch (b.type) {
      case 'embed':
        return `<div class="x-embed-wrap" role="region" aria-label="Xの投稿埋め込み枠">
  <div class="x-embed-header">
    <div class="x-embed-author">
      <div class="x-avatar-placeholder">公式</div>
      <div><span class="x-author-name">公式ポスト</span></div>
    </div>
    <span class="x-logo-mark">X</span>
  </div>
  <p class="x-embed-text">${esc(b.text)}</p>
  <div class="x-embed-footer"><span>ここに公式ポストが埋め込まれます（X埋め込み枠）</span></div>
</div>`;
      case 'quote':
        return `<div class="entry-lead-quote">${inline(b.text)}</div>`;
      case 'voice':
        return `<p>${inline(b.text)}</p>`;
      case 'raw':
        return b.text;
      default:
        return `<p>${inline(b.text)}</p>`;
    }
  };

  const mainHtml = parts.main.map(renderInlineBlock).join('\n');
  const reactionBlocks = parts.reaction.filter((b) => typeof b !== 'string' || b);
  const reactionHtml = reactionBlocks.length
    ? `
<section class="reaction-section" aria-label="ネットの反応">
  <h2 class="section-bar">ネットの反応</h2>
  <div class="reaction-thread">
${reactionBlocks.map((b) => (typeof b === 'string' ? b : renderInlineBlock(b))).join('\n')}
  </div>
</section>`
    : '';
  const commentBlocks = parts.comments.filter((b) => b.type === 'comment');
  const otherCommentBlocks = parts.comments.filter((b) => b.type !== 'comment');
  const commentsHtml = `
<section class="comments-section" id="comments" aria-label="コメント欄">
  <h2 class="section-bar">この記事へのコメント（${commentBlocks.length}件）</h2>
  <div class="comment-list">
${commentBlocks.map((b, i) => `
    <div class="comment-item">
      <div class="comment-head">
        <span class="comment-num">${i + 1}.</span>
        <span class="comment-author">名無しさん</span>
      </div>
      <p class="comment-body">${inline(b.text.replace(/^『|』$/g, ''))}</p>
    </div>`).join('')}
${otherCommentBlocks.map((b) => (typeof b === 'string' ? b : renderInlineBlock(b))).join('\n')}
  </div>
</section>`;

  return { mainHtml, reactionHtml, commentsHtml };
}

// ---------- 出力 ----------
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'articles'), { recursive: true });

writeFileSync(join(dist, 'style.css'), cssSource, 'utf8');

// 記事ページ
articles.forEach((a, i) => {
  const prev = articles[i - 1];
  const next = articles[i + 1];
  const { mainHtml, reactionHtml, commentsHtml } = renderArticleBody(a);
  const body = `
<div class="breadcrumb">
  <a href="../index.html">ホーム</a><span>&gt;</span><a href="../index.html#${catClass(a.category)}">${esc(a.category)}</a><span>&gt;</span>${esc(a.title)}
</div>
<div class="main-container">
  <main class="content-column">
    <article>
      <header class="entry-header">
        <div class="entry-meta">
          <span class="cat-tag ${catClass(a.category)}">${esc(a.category)}</span>
          <time datetime="${a.date}">${a.dateLabel}</time>
        </div>
        <h1 class="entry-title">${esc(a.title)}</h1>
        <div class="entry-submeta">
          <a href="#comments">コメント（${a.commentCount}件）へ移動 ▼</a>
        </div>
      </header>
      <div class="entry-content">
${mainHtml}
      </div>
      ${reactionHtml}
      <nav class="prev-next-nav" aria-label="前後の記事">
        ${prev ? `<div class="prev-next-box"><span class="prev-next-label">« 前の記事</span><a href="${prev.slug}.html">${esc(prev.title)}</a></div>` : '<div class="prev-next-box"></div>'}
        ${next ? `<div class="prev-next-box is-next"><span class="prev-next-label">次の記事 »</span><a href="${next.slug}.html">${esc(next.title)}</a></div>` : '<div class="prev-next-box is-next"></div>'}
      </nav>
      ${commentsHtml}
    </article>
  </main>
  ${sidebar('../')}
</div>`;
  writeFileSync(
    join(dist, 'articles', `${a.slug}.html`),
    page({ title: a.title, prefix: '../', body }),
    'utf8',
  );
});

// 一覧ページ
const latestDate = articles[0].dateLabel;
const seenCat = new Set();
const items = articles.map((a) => {
  const anchor = seenCat.has(a.category) ? '' : ` id="${catClass(a.category)}"`;
  seenCat.add(a.category);
  const excerpt = a.excerpt.length > 110 ? a.excerpt.slice(0, 110) + '…' : a.excerpt;
  return `
<article class="article-item"${anchor}>
  <div class="article-body">
    <div class="article-meta">
      <span class="cat-tag ${catClass(a.category)}">${esc(a.category)}</span>
      <time datetime="${a.date}">${a.dateShort}</time>
      <span class="comment-count">コメント(${a.commentCount})</span>
    </div>
    <h3 class="article-title"><a href="articles/${a.slug}.html">${esc(a.title)}</a></h3>
    <p class="article-excerpt">${esc(excerpt)}</p>
  </div>
</article>`;
}).join('');

const pickup = articles.slice(0, 3);
const indexBody = `
<div class="notice-bar">
  <span class="notice-label">更新</span>
  <span>${latestDate}更新：記事は全${articles.length}本です。掲載中の反応・コメントは試作用のサンプルです。</span>
</div>
<div class="main-container">
  <main class="content-column">
    <section class="pickup-box" aria-label="注目記事">
      <h2 class="pickup-box-title">■ 本日の注目記事</h2>
      <ul class="pickup-list">
        ${pickup.map((a) => `<li><a href="articles/${a.slug}.html">» ${esc(a.title)}</a> <span class="pickup-cm">[${a.commentCount}コメ]</span></li>`).join('')}
      </ul>
    </section>
    <h2 class="section-bar">
      <span>新着記事一覧</span>
      <span class="section-bar-sub">全${articles.length}件</span>
    </h2>
    <div class="article-list">
${items}
    </div>
    <nav class="pagination" aria-label="ページ送り">
      <span class="is-current">1</span>
    </nav>
  </main>
  ${sidebar('')}
</div>`;

writeFileSync(
  join(dist, 'index.html'),
  page({ title: '記事一覧', prefix: '', body: indexBody }),
  'utf8',
);

console.log(`ビルド完了: 記事 ${articles.length} 本 → dist/index.html, dist/articles/*.html, dist/style.css`);
articles.forEach((a) => console.log(` - articles/${a.slug}.html [${a.category}] ${a.date} コメント${a.commentCount}件 ${a.title.slice(0, 30)}`));
