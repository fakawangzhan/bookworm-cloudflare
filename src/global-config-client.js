import { selectGlobal, selectPersonal, legacyParameters } from './global-config.js';
export class GlobalConfigClient {
  constructor({state,user,notify}) {this.state=state;this.user=user;this.notify=notify;this.reset();}
  reset() {clearTimeout(this.timer);this.record=null;this.personal=null;this.owner=null;this.version=0;this.chain=Promise.resolve();this.failedPreferences=false;}
  async api(path,method='GET',body) {
    const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(new Error(data.error||'数据库配置服务不可用；当前配置保留。'),{code:data.code,status:response.status});
    return data;
  }
  async load({migrate=true}={}) {
    const user=this.user();if(!user)return;
    const [record,personal]=await Promise.all([this.api('/api/system-config'),this.api('/api/user-preferences')]);
    // Static preview/test mocks cannot accidentally become an authority.
    if(!record.settings||!Number.isInteger(record.version))return;
    this.owner=user.id;this.record=record;this.personal=personal;this.failedPreferences=false;
    if(!record.version&&migrate&&(user.group==='system_admin'||user.roles?.some(r=>['super_admin','programmer'].includes(r.id)))) {
      this.record=await this.api('/api/system-config','POST',{version:0,settings:selectGlobal(this.state),legacy:legacyParameters(this.state)});
    }
    if(!personal.exists&&migrate) this.personal=await this.api('/api/user-preferences','PUT',{version:personal.version,values:selectPersonal({autoSave:this.state.programmerSettings.autoSave,sidebarCollapsed:this.state.sidebarCollapsed})});
    this.apply();
  }
  apply() {
    if(!this.record||this.owner!==this.user()?.id)return;
    for(const [group,fields] of Object.entries(this.record.settings))this.state[group]={...this.state[group],...fields};
    if(this.personal?.values){this.state.programmerSettings.autoSave=this.personal.values.autoSave;this.state.sidebarCollapsed=this.personal.values.sidebarCollapsed;}
    this.version=this.record.version;
  }
  async save(settings) {
    if(!this.record)await this.load({migrate:false});
    if(!this.record)throw new Error('请启动支持数据库全局配置的本地服务。');
    this.record=await this.api('/api/system-config','PATCH',{version:this.version,settings});this.apply();
  }
  schedulePreferences() {
    if(!this.personal||this.owner!==this.user()?.id||this.failedPreferences)return;
    const values=selectPersonal({autoSave:this.state.programmerSettings.autoSave,sidebarCollapsed:this.state.sidebarCollapsed});
    if(JSON.stringify(values)===JSON.stringify(this.personal.values))return;
    clearTimeout(this.timer);const owner=this.owner;
    this.timer=setTimeout(()=>{
      this.chain=this.chain.then(async()=>{
        if(owner!==this.user()?.id)return;
        this.personal=await this.api('/api/user-preferences','PUT',{version:this.personal.version,values});
      }).catch(error=>{this.failedPreferences=true;this.notify(error.message);});
    },500);
  }
  async authorizeExport() {
    if(this.record)await this.api('/api/export-permission');
    else if(this.state.adminSettings.allowExport===false)throw new Error('管理员已关闭投稿包导出。');
  }
  clearCapabilities() {return this.api('/api/system-config/capabilities','DELETE');}
}
