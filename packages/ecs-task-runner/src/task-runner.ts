
import AWS from 'aws-sdk';

import {
  startTaskMonitor,
  TaskStatus,
  StatusHandlerFunc,
  TaskStatusUpdate,

} from '@moebius/aws-ecs-task-monitor';

export {
  StatusHandlerFunc,

} from '@moebius/aws-ecs-task-monitor';


export interface StartTaskOptions {
  request: AWS.ECS.RunTaskRequest;
  region?: string;
}

export interface StartedTask {
  taskId: string;
  task: AWS.ECS.Task;
  monitor: MonitorFunction;
}

export interface TaskFinishResult {
  exitCode: number;
}

export interface MonitorOptions {
  pollingInterval?: number;
  exitProcess?: boolean;
  onStatusChange?: StatusHandlerFunc;
}

export type MonitorFunction = (
  (options?: MonitorOptions) => Promise<TaskFinishResult>
);


export async function startTask(
  options: StartTaskOptions

): Promise<StartedTask> {

  const { request, region } = options;

  const ecs = new AWS.ECS({
    apiVersion: '2014-11-13',
    region,
  });

  const result = await (ecs
    .runTask(request)
    .promise()
  );

  if (!result.tasks?.[0]) {
    throw new Error(`Failed to start task`);
  }

  const task = result.tasks![0];
  const taskArn = task.taskArn as string;
  const parts = taskArn.split('/');
  const taskId = parts[parts.length - 1];

  return {
    taskId,
    task,
    monitor,
  };


  async function monitor(
    options?: MonitorOptions

  ): Promise<TaskFinishResult> {

    const {
      pollingInterval,
      exitProcess,
      onStatusChange,

    } = (options || {});

    let exitCode = -1;

    const monitorHandler = startTaskMonitor({
      taskArn,
      clusterName: request.cluster,
      pollingInterval,
      region,
      onStatusChange: statusChangeHandler,
    });

    await monitorHandler.stopPromise;

    if (exitProcess) {
      process.exit(exitCode);
    }

    return { exitCode };


    function statusChangeHandler(update: TaskStatusUpdate) {

      const { task, status } = update;

      if (status === TaskStatus.Stopped) {
        const container = task.containers?.[0];
        if (!container) {
          throw new Error(
            `Failed to get container from task description`
          );
        }
        if (container.exitCode === undefined) {
          throw new Error(`Container exit code is undefined`);
        }
        exitCode = container.exitCode;
      }

      onStatusChange?.(update);

    }

  }

}
