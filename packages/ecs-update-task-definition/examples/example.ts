
import {
  updateTaskDefinition,

} from '@moebius/aws-ecs-update-task-definition';


(async () => {

  await updateTaskDefinition({
    name: 'task-definition-name',
    containerOverrides: {
      container: {
        imageTag: 'abcd123',
      },
    },
  });

})();
