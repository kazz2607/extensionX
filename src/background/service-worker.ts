import './messages.ts';
import { loadPersistedQueue, broadcastQueueUpdate } from './queue.ts';

loadPersistedQueue().then(() => {
  broadcastQueueUpdate();
});
