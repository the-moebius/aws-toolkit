
import pWaitFor from 'p-wait-for';
import AWS from 'aws-sdk';


export interface TaskMonitorOptions {
  taskArn: string;
  clusterName?: string;
  pollingInterval?: number;
}

export enum TaskStatus {
  Provisioning = 'PROVISIONING',
  Pending = 'PENDING',
  Running = 'RUNNING',
  Deprovisioning = 'DEPROVISIONING',
  Stopped = 'STOPPED',
}

export type StatusHandlerFunc = (
  (update: TaskStatusUpdate) => void
);

export interface TaskStatusUpdate {
  status: TaskStatus;
  task: AWS.ECS.Task;
}


export class TaskMonitor {

  private task?: AWS.ECS.Task;
  private taskStatus?: TaskStatus;

  private readonly ecs = new AWS.ECS({
    apiVersion: '2014-11-13',
  });

  private statusHandlers = new Set<StatusHandlerFunc>();

  private isRunning = false;

  private options?: TaskMonitorOptions;


  public async start(options: TaskMonitorOptions) {

    if (this.isRunning) {
      throw new Error(`Task monitoring is already running`);
    }

    this.options = options;

    const {
      pollingInterval = 3000,

    } = options;

    this.isRunning = true;

    await pWaitFor(() => this.pollingHandler(), {
      interval: pollingInterval,
    });

  }

  public async stop() {
    this.isRunning = false;
  }

  public onStatusChange(handler: StatusHandlerFunc) {
    this.statusHandlers.add(handler);
  }


  private async pollingHandler(): Promise<boolean> {

    await this.updateTask();

    await this.handleTaskStatus();

    // Stopping the polling once monitoring is stopped
    // or the task is complete
    return (
      !this.isRunning ||
      (this.taskStatus === TaskStatus.Stopped)
    );

  }

  /**
   * Loads fresh task descriptor from the ECS and
   * updated the `task` property.
   */
  private async updateTask() {

    if (!this.options) {
      throw new Error(`Missing task monitoring options`);
    }

    const {
      clusterName,
      taskArn,

    } = this.options;

    const request: AWS.ECS.DescribeTasksRequest = {
      tasks: [taskArn],
    };

    if (clusterName) {
      request.cluster = clusterName;
    }

    const result = await (this.ecs
      .describeTasks(request)
      .promise()
    );

    if (!result.tasks?.[0]) {
      throw new Error(`Failed to fetch task descriptor`);
    }

    this.task = result.tasks![0];

  }

  private async handleTaskStatus() {

    if (!this.task) {
      return;
    }

    // Checking if status has actually changed between polls
    if (this.task.lastStatus === this.taskStatus) {
      return;
    }

    this.taskStatus = this.task.lastStatus as TaskStatus;

    this.triggerHandlers();

  }

  private triggerHandlers() {

    if (!this.task || !this.taskStatus) {
      return;
    }

    // Calling all the registered handlers
    for (const handler of this.statusHandlers) {
      handler({
        status: this.taskStatus,
        task: this.task,
      });
    }

  }

}
