const ROLES=[['lead_author','主笔作者'],['co_author','协作作者'],['editor','责任编辑'],['reviewer','审稿人'],['super_admin','超级管理员'],['programmer','程序员']];
const required='<span class="wf-required" aria-label="必填">*</span>';
export function accountCreateView() {
  return `<section class="panel setting-card account-create"><h3>添加用户</h3><p class="setting-hint">新账号默认普通用户。选择超级管理员或程序员角色将授予系统管理权限。</p>
    <form data-account-create><div class="account-create-grid">
      <label><span>登录用户名 ${required}</span><input name="username" required minlength="3" maxlength="128" pattern="[A-Za-z0-9][A-Za-z0-9_.@\\-]{2,127}" autocomplete="off" aria-describedby="account-username-help"><small id="account-username-help">3—128 位字母、数字或 . _ @ -，不区分大小写。</small></label>
      <label><span>显示名称（可选）</span><input name="name" maxlength="100" autocomplete="off"><small>留空时显示登录用户名。</small></label>
      <label><span>初始密码 ${required}</span><input name="password" type="password" required minlength="8" maxlength="256" autocomplete="new-password"><small>8—256 位，请使用独立密码。</small></label>
      <label><span>确认初始密码 ${required}</span><input name="confirmPassword" type="password" required minlength="8" maxlength="256" autocomplete="new-password"></label>
      <label><span>用户角色 ${required}</span><select name="role" required>${ROLES.map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select><small data-account-create-group>用户组：普通用户</small></label>
    </div><p class="wf-warning" data-account-create-error role="alert" hidden></p><div class="wf-actions"><button class="button primary" type="submit">添加用户</button></div></form></section>`;
}

export function bindAccountCreate({root=document,fetcher=fetch,onCreated}={}) {
  const form=root.querySelector('[data-account-create]');if(!form)return;
  let pending=false;
  form.elements.role.addEventListener('change',()=>{form.querySelector('[data-account-create-group]').textContent='用户组：'+(['super_admin','programmer'].includes(form.elements.role.value)?'系统管理员':'普通用户');});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(pending||!form.reportValidity())return;
    const error=form.querySelector('[data-account-create-error]'),submit=form.querySelector('[type="submit"]');
    error.hidden=true;
    if(form.elements.password.value!==form.elements.confirmPassword.value){error.textContent='两次输入的密码不一致。';error.hidden=false;return;}
    pending=true;submit.disabled=true;submit.textContent='正在添加…';
    try {
      const response=await fetcher('/api/auth/users',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({username:form.elements.username.value.trim(),name:form.elements.name.value.trim(),password:form.elements.password.value,roles:[form.elements.role.value]})});
      const body=await response.json().catch(()=>({}));
      if(!response.ok||!body.user?.id)throw new Error(body.error||'账号未能添加，请重试。');
      form.reset();await onCreated?.(body.user);
    } catch(e) {error.textContent=e.message||'账号未能添加，请重试。';error.hidden=false;}
    finally {pending=false;submit.disabled=false;submit.textContent='添加用户';}
  });
}
