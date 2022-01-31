
import * as process from 'process';

import {
  startTask,
  StartTaskOptions,
  TaskStatusUpdate,
  TaskStatus,

} from '@moebius/aws-ecs-task-runner';


(async () => {

  console.log(`Starting the task`);

  const options: StartTaskOptions = {
    region: 'eu-central-1',
    request: {
      launchType: 'FARGATE',
      cluster: 'my-cluster',
      taskDefinition: 'family-name',
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: [
            'subnet-id-1',
            'subnet-id-2',
          ],
          securityGroups: [
            'sg-id',
          ],
        },
      },
      overrides: {
        containerOverrides: [
          {
            name: 'container-name',
            command: ['command', 'name'],
          },
        ],
      },
    },
  };

  const { taskId, monitor } = await startTask(options);

  console.log(`\nTask is created:\n${taskId}\n`);

  console.log(`Starting task monitoring`);

  const { exitCode } = await monitor({
    onStatusChange,
  });

  console.log(`Task finished`);

  console.log(
    `Container exited with code: ${exitCode}`
  );

  process.exit(exitCode);


  function onStatusChange(update: TaskStatusUpdate) {

    switch (update.status) {
      case TaskStatus.Provisioning:
        console.log(`The task is being provisioned…`);
        break;
      case TaskStatus.Pending:
        console.log(`The task is pending…`);
        break;
      case TaskStatus.Running:
        console.log(`The task is now running…`);
        break;
      case TaskStatus.Deprovisioning:
        console.log(`The task is being deprovisioned…`);
        break;
      case TaskStatus.Stopped:
        console.log(`The task is now stopped…`);
        break;
    }

  }

})();
