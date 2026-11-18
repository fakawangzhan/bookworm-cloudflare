const SEASONS = {
  spring: { label: '春 · 樱雾', path: '<path d="M12 8c-6-8-11 1-5 4-6 5 2 11 5 4 3 7 11 1 5-4 6-3 1-12-5-4Z"/><circle cx="12" cy="12" r="2"/>' },
  summer: { label: '夏 · 薄荷', path: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>' },
  autumn: { label: '秋 · 杏茶', path: '<path d="M20 3C10 2 3 6 4 13c1 7 10 8 14 2 2-3 2-7 2-12Z"/><path d="m3 21 12-12m-6 6v-4m4 0h4"/>' },
  winter: { label: '冬 · 雪青', path: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3M4 10l4-1-1-4m10 14-1-4 4-1M4 14l4 1-1 4M17 5l-1 4 4 1"/>' }
};

const seasonKey = 'novelforge-mobile-season';
const mobileScreen = window.matchMedia('(max-width: 760px)');
const seasonIcon = value => `<svg viewBox="0 0 24 24" aria-hidden="true">${SEASONS[value].path}</svg>`;
let currentSeason = seasonValue();
let buttonObserver;

function escapeText(value) {
  return String(value || '').replace(/[&<>\"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function seasonValue() {
  try {
    const value = window.localStorage.getItem(seasonKey);
    return SEASONS[value] ? value : 'spring';
  } catch { return 'spring'; }
}

function applySeason(value, save = false) {
  const next = SEASONS[value] ? value : 'spring';
  currentSeason = next;
  document.documentElement.dataset.season = next;
  if (save) {
    try { window.localStorage.setItem(seasonKey, next); } catch { /* Keep the selection for this session. */ }
  }
  document.querySelectorAll('[data-mobile-season]').forEach(button => {
    const selected = button.dataset.mobileSeason === next;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const label = document.querySelector('[data-mobile-season-label]');
  if (label) {
    label.innerHTML = seasonIcon(next);
    const trigger = label.closest('summary');
    trigger.setAttribute('aria-label', `切换季节主题，当前${SEASONS[next].label}`);
    trigger.title = `当前${SEASONS[next].label}，点击切换`;
  }
}

function closeMenu() {
  document.body.classList.remove('mobile-menu-open');
  document.querySelector('[data-mobile-menu]')?.setAttribute('aria-expanded', 'false');
}

function openMenu() {
  document.querySelector('.mobile-season')?.removeAttribute('open');
  document.body.classList.add('mobile-menu-open');
  const menu = document.querySelector('[data-mobile-menu]');
  menu?.setAttribute('aria-expanded', 'true');
  document.querySelector('.wf-sidebar [data-wf-book]')?.focus({ preventScroll: true });
}

// Measure only resized buttons. Keep text at least 14px; exceptional long
// labels use balanced lines instead of truncating text or shrinking further.
function fitButtonLabels() {
  buttonObserver?.disconnect();
  let fitFrame = null;
  if (!mobileScreen.matches || !window.ResizeObserver) return;
  const buttons = [...document.querySelectorAll('.wf-main .button, .wf-modal .button')];
  buttons.forEach(button => {
    if (button.querySelector('.mobile-button-label')) return;
    const text = [...button.childNodes].filter(node => node.nodeType === Node.TEXT_NODE);
    if (!text.some(node => node.textContent.trim())) return;
    const label = document.createElement('span');
    label.className = 'mobile-button-label';
    text[0].before(label);
    text.forEach(node => label.append(node));
  });
  buttonObserver = new ResizeObserver(entries => {
    // Batch measurements before style writes to avoid layout thrashing.
    const changes = entries.flatMap(({ target: button }) => {
      const label = button.querySelector('.mobile-button-label');
      if (!label?.clientWidth) return [];
      const range = document.createRange();
      range.selectNodeContents(label);
      const width = [...range.getClientRects()].reduce((total, rect) => total + rect.width, 0);
      const base = parseFloat(getComputedStyle(button).fontSize);
      const current = parseFloat(getComputedStyle(label).fontSize);
      const natural = width * base / current;
      const size = Math.max(14, Math.min(base, base * (label.clientWidth - 1) / Math.max(1, natural)));
      const multiline = natural * 14 / base > label.clientWidth + 1;
      return [{ label, size: `${Math.floor(size * 10) / 10}px`, multiline }];
    });
    // ResizeObserver delivers inside layout. Apply size changes on the next
    // frame so measuring a button cannot recursively resize it in that layout.
    if(fitFrame!==null)cancelAnimationFrame(fitFrame);
    fitFrame=requestAnimationFrame(()=>{
      fitFrame=null;
      changes.forEach(({ label, size, multiline }) => {
        if(!label.isConnected)return;
        if(label.style.getPropertyValue('--mobile-button-fit')!==size)label.style.setProperty('--mobile-button-fit', size);
        if(label.classList.contains('is-multiline')!==multiline)label.classList.toggle('is-multiline', multiline);
      });
    });
  });
  buttons.forEach(button => buttonObserver.observe(button));
}

mobileScreen.addEventListener('change', () => { closeMenu(); fitButtonLabels(); });
document.addEventListener('click', event => {
  if (mobileScreen.matches && !event.target.closest('.mobile-season')) document.querySelector('.mobile-season')?.removeAttribute('open');
});
document.addEventListener('keydown', event => {
  if (!mobileScreen.matches || event.key !== 'Escape') return;
  const menuOpen = document.body.classList.contains('mobile-menu-open');
  closeMenu();
  const season = document.querySelector('.mobile-season[open]');
  season?.removeAttribute('open');
  if (menuOpen) document.querySelector('[data-mobile-menu]')?.focus();
  else season?.querySelector('summary')?.focus();
});

/** Adds mobile navigation chrome around the existing workflow controls.
 * It delegates navigation to the existing [data-tab] buttons so no workflow
 * state or project persistence code is duplicated.
 */
export function enhanceMobileUI({ icon } = {}) {
  const app = document.querySelector('.wf-app');
  const top = document.querySelector('.wf-top');
  const sidebar = document.querySelector('.wf-sidebar');
  if (!app || !top || !sidebar) return;
  closeMenu();

  document.documentElement.dataset.season = currentSeason;
  const oldChrome = app.querySelectorAll('.mobile-chrome');
  oldChrome.forEach(node => node.remove());

  const pageName = document.querySelector('.wf-page-title h1')?.textContent?.trim() || '创作工作台';
  const mobileHeader = document.createElement('div');
  mobileHeader.className = 'mobile-chrome mobile-header';
  mobileHeader.innerHTML = `<div class="mobile-brand"><span class="mobile-brand-mark">B</span><div><b>BookWorm</b><small>${escapeText(pageName)}</small></div></div><div class="mobile-header-actions"><details class="mobile-season"><summary aria-label="切换界面季节主题"><span data-mobile-season-label></span></summary><div class="mobile-season-options" role="group" aria-label="季节主题">${Object.entries(SEASONS).map(([key, value]) => `<button type="button" data-mobile-season="${key}" aria-pressed="false" aria-label="${value.label}" title="${value.label}">${seasonIcon(key)}</button>`).join('')}</div></details><button type="button" class="mobile-menu-button" data-mobile-menu aria-expanded="false" aria-controls="mobile-drawer"><span></span><span></span><span></span><em>菜单</em></button></div>`;
  top.before(mobileHeader);

  // Keep the original sidebar in the layout for desktop. On small screens the
  // same element becomes the slide-up drawer, so its existing event handlers
  // and all workflow actions remain intact.
  const drawer = sidebar;
  drawer.id = 'mobile-drawer';
  drawer.classList.add('mobile-drawer');
  const drawerHead = document.createElement('div');
  drawerHead.className = 'mobile-drawer-head mobile-chrome';
  drawerHead.innerHTML = `<div><b>全部功能</b><small>创作流程与作品管理</small></div><button type="button" class="mobile-drawer-close" data-mobile-close aria-label="关闭菜单">×</button>`;
  drawer.prepend(drawerHead);

  const backdrop = document.createElement('button');
  backdrop.type = 'button';
  backdrop.className = 'mobile-chrome mobile-menu-backdrop';
  backdrop.setAttribute('aria-label', '关闭菜单');
  app.append(backdrop);

  const bottom = document.createElement('nav');
  bottom.className = 'mobile-chrome mobile-bottom-nav';
  bottom.setAttribute('aria-label', '常用功能');
  const glyph = (name, fallback) => icon ? icon(name) : fallback;
  bottom.innerHTML = `<button type="button" data-mobile-tab="settings"><span>${glyph('sliders', '✎')}</span><em>设定</em></button><button type="button" data-mobile-tab="studio"><span>${glyph('pen', '▤')}</span><em>章节</em></button><button type="button" data-mobile-tab="works"><span>${glyph('book', '▣')}</span><em>作品</em></button><button type="button" data-mobile-open-menu><span>${glyph('more', '☰')}</span><em>更多</em></button>`;
  app.append(bottom);

  const activeTab = sidebar.querySelector('.wf-nav.active')?.dataset.tab || sidebar.querySelector('.wf-nav-group.active [data-tab]')?.dataset.tab;
  const activeButton = bottom.querySelector(`[data-mobile-tab="${activeTab}"]`) || bottom.querySelector('[data-mobile-open-menu]');
  activeButton?.setAttribute('aria-current', 'page');
  applySeason(currentSeason);
  mobileHeader.querySelectorAll('[data-mobile-season]').forEach(button => button.addEventListener('click', () => {
    applySeason(button.dataset.mobileSeason, true);
    mobileHeader.querySelector('.mobile-season').removeAttribute('open');
    mobileHeader.querySelector('.mobile-season summary').focus({ preventScroll: true });
  }));
  mobileHeader.querySelector('[data-mobile-menu]')?.addEventListener('click', openMenu);
  drawer.querySelector('[data-mobile-close]')?.addEventListener('click', closeMenu);
  backdrop.addEventListener('click', closeMenu);
  bottom.querySelector('[data-mobile-open-menu]')?.addEventListener('click', openMenu);
  bottom.querySelectorAll('[data-mobile-tab]').forEach(button => button.addEventListener('click', () => {
    const target = document.querySelector(`.wf-sidebar [data-tab="${button.dataset.mobileTab}"]`);
    if (target && !target.disabled) { target.click(); closeMenu(); }
  }));
  drawer.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', closeMenu));
  fitButtonLabels();
}
