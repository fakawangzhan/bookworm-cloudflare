const escapeHtml = value => String(value ?? '').replace(/[&><"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[ch]));

const scenes = [
  { title: 'TOKEN千万下笔成神', text: '一键自动、小白、专业三种创作模式，按你的节奏推进每一章。', cls: 'scene-mountain' },
  { title: '让长篇故事保持连贯', text: '故事圣经、章节规划、AI 修订与全书终审协同工作，重要设定持续可追溯。', cls: 'scene-night' },
  { title: '作品保存在自己的数据库', text: '账号隔离管理作品与配置，支持导出常用格式，随时继续创作。', cls: 'scene-horizon' }
];

export function authPageView(auth) {
  const bootstrap = auth.bootstrapRequired;
  const register = auth.register && !bootstrap;
  const form = auth.form || {};
  const title = bootstrap ? '初始化系统管理员' : register ? '注册普通用户' : '登录 BookWorm';
  const subtitle = bootstrap ? '首次使用请认领系统管理员账号，现有作品和配置会继续保留。' : register ? '注册后默认进入普通用户组，可在工作区开始创作。' : '登录后访问创作工作区、小说数据库与 AI 服务。';
  const submit = bootstrap ? '初始化并登录' : register ? '注册并登录' : '登录';
  const passwordAutocomplete = register || bootstrap ? 'new-password' : 'current-password';
  const sceneMarkup = scenes.map((scene, i) => `<div class="auth-scene ${scene.cls}${i === 0 ? ' active' : ''}" data-auth-scene="${i}" aria-hidden="${i ? 'true' : 'false'}"></div>`).join('');
  return `<main class="auth-shell"><section class="auth-stage"><div class="auth-backdrop" aria-hidden="true">${sceneMarkup}<div class="auth-backdrop-shade"></div></div><div class="auth-content"><section class="auth-promo"><span class="auth-eyebrow">BookWorm · STORY WORKSPACE</span><h1 data-auth-promo-title>${scenes[0].title}</h1><p data-auth-promo-text>${scenes[0].text}</p><ul><li><b>三种模式</b><span>从轻量试写到专业流程自由切换</span></li><li><b>全程可追溯</b><span>章节规划、质量检查与修订结果连贯保存</span></li><li><b>数据自主</b><span>作品进入本地数据库，账号之间相互隔离</span></li></ul></section><section class="panel setting-card auth-card" aria-labelledby="auth-title"><div class="panel-kicker">本地账户服务</div><h2 id="auth-title">${title}</h2><p>${subtitle}</p>${auth.error ? `<div class="auth-error" role="alert">${escapeHtml(auth.error)}</div>` : ''}<form data-auth-form novalidate><label>用户名<span class="auth-required">*</span><input required minlength="3" name="username" autocomplete="username" value="${escapeHtml(form.username)}" placeholder="例如：admin"></label>${bootstrap || register ? `<label>显示名称<input name="name" autocomplete="name" value="${escapeHtml(form.name || (bootstrap ? '系统管理员' : ''))}" placeholder="用于工作区展示"></label>` : ''}<label>密码<span class="auth-required">*</span><input required minlength="8" type="password" name="password" autocomplete="${passwordAutocomplete}" value="${escapeHtml(form.password)}" placeholder="至少 8 位"></label>${bootstrap || register ? '<label>确认密码<span class="auth-required">*</span><input required minlength="8" type="password" name="confirmPassword" autocomplete="new-password" value="' + escapeHtml(form.confirmPassword) + '" placeholder="再次输入密码"></label>' : ''}<button class="button primary" type="submit" ${auth.pending ? 'disabled aria-busy="true"' : ''}>${submit}</button></form>${!bootstrap ? (register ? '<button class="button secondary auth-switch" data-auth-back type="button">返回登录</button>' : '<button class="button secondary auth-switch" data-auth-register type="button">注册普通用户</button>') : ''}<p class="auth-footnote">@2026 · Beta6.6　账户数据由本地服务保存</p></section></div></section></main>`;
}

export function bindAuthCarousel() {
  const root = document.querySelector('.auth-shell');
  if (!root) return () => {};
  const scenesEls = [...root.querySelectorAll('[data-auth-scene]')];
  let index = 0;
  const set = next => { index = (next + scenes.length) % scenes.length; scenesEls.forEach((el, i) => { el.classList.toggle('active', i === index); el.setAttribute('aria-hidden', i === index ? 'false' : 'true'); }); };
  const timer = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? null : window.setInterval(() => { if (!document.hidden) set(index + 1); }, 7600);
  return () => { if (timer) window.clearInterval(timer); };
}
