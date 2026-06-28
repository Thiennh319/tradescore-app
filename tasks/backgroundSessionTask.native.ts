import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

export const BACKGROUND_SESSION_TASK = 'tradescore-background-session';

TaskManager.defineTask(BACKGROUND_SESSION_TASK, async () => {
  try {
    const { runBackgroundTradingWork } = await import('../services/backgroundWorker');
    await runBackgroundTradingWork(new Date());
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Chu kỳ 1 phút (WorkManager có thể gom trên Android khi app đóng hẳn). */
export async function registerBackgroundSessionTask(): Promise<void> {
  const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SESSION_TASK);
  if (registered) return;
  await BackgroundTask.registerTaskAsync(BACKGROUND_SESSION_TASK, {
    minimumInterval: 1,
  });
}

export async function unregisterBackgroundSessionTask(): Promise<void> {
  const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SESSION_TASK);
  if (!registered) return;
  await BackgroundTask.unregisterTaskAsync(BACKGROUND_SESSION_TASK);
}
