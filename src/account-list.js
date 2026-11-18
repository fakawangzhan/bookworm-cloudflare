import './account-list.css';

const roles = {
  super_admin: '超级管理员', programmer: '程序员', lead_author: '主笔作者',
  co_author: '协作作者', editor: '责任编辑', reviewer: '审稿人'
};

export function accountListView(users, currentId, h) {
  if (!users.length) return '<p class="management-empty">暂无账号，请点击“刷新账号”。</p>';
  return `<div class="account-list">
    <div class="account-list-head" aria-hidden="true"><span>账号信息</span><span>用户组 / 状态</span><span>用户角色</span><span>操作</span></div>
    <div role="list">${users.map(user => {
      const assigned = [...new Set((user.roles || []).map(role => typeof role === 'string' ? role : role.id).filter(Boolean))];
      const selected = assigned.length === 1 && Object.hasOwn(roles, assigned[0]) ? assigned[0] : '';
      const name = user.name || user.displayName || user.username || '未命名用户';
      const disabled = user.status === 'disabled';
      return `<div class="account-row" role="listitem">
        <div class="account-identity"><strong>${h(name)}</strong><span class="account-username">${h(user.username || '未设置用户名')}</span>${user.id === currentId ? '<span class="account-current">当前账号</span>' : ''}</div>
        <div class="account-group"><span>${(user.groupName || user.group || user.role) === 'system_admin' ? '系统管理员' : '普通用户'}</span><span class="account-status ${disabled ? 'is-disabled' : ''}">${disabled ? '已停用' : '正常'}</span></div>
        <div class="account-roles"><div class="account-role-labels">${assigned.map(role => `<span>${h(roles[role] || role)}</span>`).join('') || '<span>未分配角色</span>'}</div><label><span class="account-control-label">调整角色</span><select class="native-select" data-auth-role="${h(user.id)}" aria-label="${h(name)}的角色">${!selected ? '<option value="" selected disabled>选择新角色</option>' : ''}${Object.entries(roles).map(([id, label]) => `<option value="${id}" ${selected === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div>
        <div class="account-actions"><button type="button" class="button secondary" data-auth-toggle="${h(user.id)}" aria-label="${disabled ? '启用' : '停用'}${h(name)}">${disabled ? '启用' : '停用'}</button></div>
      </div>`;
    }).join('')}</div>
  </div>`;
}
