
import pWaitFor from 'p-wait-for';
import AWS from 'aws-sdk';


export interface TaskMonitorOptions {
  taskArn: string;
  clusterName?: string;
  pollingInterval?: number;
  region?: string;
  onStatusChange?: StatusHandlerFunc;
}

export interface TaskMonitorHandler {
  stop: () => void;
  stopPromise: Promise<TaskStatusUpdate>;
}

export type StatusHandlerFunc = (
  (update: TaskStatusUpdate) => void
);

export interface TaskStatusUpdate {
  status: TaskStatus;
  task: AWS.ECS.Task;
}

export enum TaskStatus {
  Provisioning = 'PROVISIONING',
  Pending = 'PENDING',
  Running = 'RUNNING',
  Deprovisioning = 'DEPROVISIONING',
  Stopped = 'STOPPED',
}


export function startTaskMonitor(
  options: TaskMonitorOptions

): TaskMonitorHandler {

  const {
    pollingInterval = 3000,
    region,

  } = options;

  let task: AWS.ECS.Task;
  let taskStatus: TaskStatus;

  const ecs = new AWS.ECS({
    apiVersion: '2014-11-13',
    region,
  });

  let isRunning = true;

  const stopPromise = (async () => {

    await pWaitFor(pollingHandler, {
      interval: pollingInterval,
    });

    return {
      status: taskStatus!,
      task: task!,
    };

  })();

  return {
    stop,
    stopPromise,
  };


  function stop() {
    isRunning = false;
  }

  async function pollingHandler(): Promise<boolean> {

    await updateTask();

    await handleTaskStatus();

    // Stopping the polling once monitoring is stopped
    // or the task is complete
    return (
      !isRunning ||
      (taskStatus === TaskStatus.Stopped)
    );

  }

  /**
   * Loads fresh task descriptor from the ECS and
   * updated the `task` property.
   */
  async function updateTask() {

    const {
      clusterName,
      taskArn,

    } = options;

    const request: AWS.ECS.DescribeTasksRequest = {
      tasks: [taskArn],
    };

    if (clusterName) {
      request.cluster = clusterName;
    }

    const result = await (ecs
      .describeTasks(request)
      .promise()
    );

    if (!result.tasks?.[0]) {
      throw new Error(`Failed to fetch task descriptor`);
    }

    task = result.tasks![0];

  }

  async function handleTaskStatus() {

    // Checking if status has actually changed between polls
    if (task.lastStatus === taskStatus) {
      return;
    }

    taskStatus = task.lastStatus as TaskStatus;

    options.onStatusChange?.({
      status: taskStatus,
      task,
    });

  }

}
