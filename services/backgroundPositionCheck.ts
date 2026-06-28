/**
 * Background position advisor check — dùng expo-background-task (Expo SDK 56).
 * Thay cho expo-background-fetch (deprecated); minimumInterval tính bằng phút, tối thiểu 15.
 */
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { runPositionAdvisorAlerts } from './positionAdvisorAlertRunner';

export const BACKGROUND_POSITION_TASK = 'gd1-position-check';

TaskManager.defineTask(BACKGROUND_POSITION_TASK, async () => {
  try {
    const { sent } = await runPositionAdvisorAlerts();
    return sent
      ? BackgroundTask.BackgroundTaskResult.Success
      : BackgroundTask.BackgroundTaskResult.Success;
  } catch (err) {
    console.error('[backgroundPositionCheck] task lỗi:', err);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundPositionCheck(): Promise<void> {
  const status = await BackgroundTask.getStatusAsync();
  if (status === BackgroundTask.BackgroundTaskStatus.Restricted) {
    console.warn('[backgroundPositionCheck] Background task bị hệ điều hành chặn');
    return;
  }

  const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_POSITION_TASK);
  if (registered) return;

  await BackgroundTask.registerTaskAsync(BACKGROUND_POSITION_TASK, {
    minimumInterval: 15,
  });
}

export async function unregisterBackgroundPositionCheck(): Promise<void> {
  const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_POSITION_TASK);
  if (!registered) return;
  await BackgroundTask.unregisterTaskAsync(BACKGROUND_POSITION_TASK);
}
