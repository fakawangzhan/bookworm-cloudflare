import { WorkflowEntrypoint } from 'cloudflare:workers';
import { runCloudTask } from './cloudflare-task-engine.js';
export class BookwormLongTaskWorkflow extends WorkflowEntrypoint {
  async run(event,step) { return runCloudTask(this.env,event,step); }
}
