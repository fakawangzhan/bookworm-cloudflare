import { offPeakAt, nextOffPeak } from './performance-policy.js';
export async function waitForOffPeak({state,save,signal,progress,clock=()=>new Date(),wait}) {
  if(!state.workflow.performance?.offPeak || state.workflow.performance.profileId&&state.workflow.performance.profileId!=='deepseek')return;
  const queue=state.workflow.performanceQueue ||= {status:'queued',createdAt:clock().toISOString(),readyAt:nextOffPeak(clock()).toISOString()};
  queue.status='queued';await save();
  const pause=wait||((ms)=>new Promise((resolve,reject)=>{
    const abort=()=>{clearTimeout(timer);reject(signal.reason);};
    const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);
    signal?.addEventListener('abort',abort,{once:true});
  }));
  try {
    while(!offPeakAt(clock())){signal?.throwIfAborted();progress(`任务已保存，等待官方谷时 ${new Date(queue.readyAt).toLocaleString('zh-CN')}；保持页面打开可自动开始。`);await pause(30000);}
    signal?.throwIfAborted();queue.status='started';queue.startedAt=clock().toISOString();await save();
  } catch(e){queue.status='paused';await save();throw e;}
}
