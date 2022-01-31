
import AWS from 'aws-sdk';
import { TaskDefinition } from 'aws-sdk/clients/ecs';

import {
  LogStreamerHandle,
  streamLogs as startLogsStreaming,

} from '@moebius/aws-cw-log-streamer';

import {
  startTaskMonitor,
  TaskStatus,
  StatusHandlerFunc,
  TaskStatusUpdate,

} from '@moebius/aws-ecs-task-monitor';


export {
  StatusHandlerFunc,
  TaskStatusUpdate,

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
  streamLogs?: boolean;
}

export type MonitorFunction = (
  (options?: MonitorOptions) => Promise<TaskFinishResult>
);

interface LogConfig {
  logRegion: string;
  logGroupName: string;
  logStreamName: string;
}


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
      streamLogs,

    } = (options || {});

    let exitCode = -1;

    const monitorHandler = startTaskMonitor({
      taskArn,
      clusterName: request.cluster,
      pollingInterval,
      region,
      onStatusChange: statusChangeHandler,
    });

    let logStreamerHandle: LogStreamerHandle;

    await monitorHandler.stopPromise;

    if (exitProcess) {
      process.exit(exitCode);
    }

    return { exitCode };


    function statusChangeHandler(update: TaskStatusUpdate) {

      const { task, status } = update;

      if (streamLogs) {
        // Starting the logs streaming
        if (status === TaskStatus.Running) {
          beginLogsStreaming();
        }

        // Stopping the logs streaming
        switch (status) {
          case TaskStatus.Deprovisioning:
          case TaskStatus.Stopped:
            logStreamerHandle?.stop();
        }
      }

      if (status === TaskStatus.Stopped) {
        getExitCode();
      }

      onStatusChange?.(update);


      function getExitCode() {

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

      async function beginLogsStreaming() {

        const {
          logRegion,
          logGroupName,
          logStreamName,

        } = await getTaskLogConfig(task);

        console.log(`Starting to stream task logs`);

        logStreamerHandle = startLogsStreaming({
          logGroupName,
          logStreamName,
          region: logRegion,
        });

      }

    }

  }

  async function getTaskLogConfig(
    task: AWS.ECS.Task

  ): Promise<LogConfig> {

    const taskDefinition = (
      await getTaskDefinitionForTask(task)
    );

    const containerDefinition = taskDefinition.containerDefinitions?.[0];
    if (!containerDefinition) {
      throw new Error(
        `Can't get container definition from task definition`
      );
    }

    const { logConfiguration } = containerDefinition;
    if (!logConfiguration) {
      throw new Error(
        `Can't get log configuration from container definition`
      );
    }

    if (logConfiguration.logDriver !== 'awslogs') {
      throw new Error(
        `Can't stream logs using unsupported ` +
        `log driver: ${logConfiguration.logDriver}`
      );
    }

    const logGroupName = (
      logConfiguration.options?.['awslogs-group']
    );

    const logStreamPrefix = (
      logConfiguration.options?.['awslogs-stream-prefix']
    );

    if (!logStreamPrefix) {
      throw new Error(
        `Log configuration without stream prefix ` +
        `is not supported`
      );
    }

    const logRegion = (
      logConfiguration.options?.['awslogs-region']
    );

    const logStreamName = (
      `${logStreamPrefix}/container/${taskId}`
    );

    if (!logGroupName || !logRegion) {
      throw new Error(
        `Missing required awslogs options`
      );
    }

    return {
      logRegion,
      logGroupName,
      logStreamName,
    };

  }

  async function getTaskDefinitionForTask(
    task: AWS.ECS.Task

  ): Promise<TaskDefinition> {

    if (!task.taskDefinitionArn) {
      throw new Error(
        `Missing task definition ARN from task descriptor`
      );
    }

    const parts = task.taskDefinitionArn.split('/');
    const taskDefinitionName = parts[parts.length - 1];

    return getTaskDefinitionByName(taskDefinitionName);

  }

  async function getTaskDefinitionByName(
    name: string

  ): Promise<TaskDefinition> {

    const result = await (ecs
      .describeTaskDefinition({
        taskDefinition: name,
      })
      .promise()
    );

    if (!result.taskDefinition) {
      throw new Error(`Failed to get task definition: ${name}`);
    }

    return result.taskDefinition;

  }

}
