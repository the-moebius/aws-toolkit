
import AWS from 'aws-sdk';

import {
  ContainerDefinition,
  RegisterTaskDefinitionRequest,

} from 'aws-sdk/clients/ecs';


export interface UpdateTaskDefinitionOptions {

  name: string;

  region?: string;

  overrides?: Partial<RegisterTaskDefinitionRequest>;

  containerOverrides?: Record<
    (ContainerName | ContainerIndex),
    Partial<ContainerDefinition & {
      imageTag?: string;
    }>
  >;

}

export type ContainerIndex = number;
export type ContainerName = string;

export interface UpdateTaskDefinitionResult {

  name: string;

  revision: number;

}


export async function updateTaskDefinition(
  options: UpdateTaskDefinitionOptions

): Promise<UpdateTaskDefinitionResult> {

  const {
    name,
    region,

  } = options;

  const ecs = new AWS.ECS({
    apiVersion: '2014-11-13',
    region,
  });

  console.log(`Loading existing task definition: ${name}`);

  const { taskDefinition } = await (ecs
    .describeTaskDefinition({
      taskDefinition: name,
    })
    .promise()
  );

  if (!taskDefinition) {
    throw new Error(`Failed to get task definition: ${name}`);
  }

  console.log(
    `Working with revision #${taskDefinition.revision}\n` +
    `(registered: ${taskDefinition.registeredAt})`
  );

  if (!taskDefinition.family) {
    throw new Error(
      `Missing "family" property from existing task definition`
    );
  }

  const request: RegisterTaskDefinitionRequest = {
    family: taskDefinition.family,
    taskRoleArn: taskDefinition.taskRoleArn,
    executionRoleArn: taskDefinition.executionRoleArn,
    networkMode: taskDefinition.networkMode,
    containerDefinitions: (
      taskDefinition.containerDefinitions || []
    ),
    volumes: taskDefinition.volumes,
    placementConstraints: taskDefinition.placementConstraints,
    requiresCompatibilities: taskDefinition.requiresCompatibilities,
    cpu: taskDefinition.cpu,
    memory: taskDefinition.memory,
    pidMode: taskDefinition.pidMode,
    ipcMode: taskDefinition.ipcMode,
    proxyConfiguration: taskDefinition.proxyConfiguration,
    inferenceAccelerators: taskDefinition.inferenceAccelerators,
    ephemeralStorage: taskDefinition.ephemeralStorage,
    runtimePlatform: taskDefinition.runtimePlatform,
    ...(options.overrides || {}),
  };

  // Deleting undefined properties from the request,
  // otherwise it will raise validation errors
  for (const [key, value] of Object.entries(request)) {
    if (value === undefined) {
      delete (request as any)[key];
    }
  }

  applyContainerOverrides();

  const { taskDefinition: newTaskDefinition } = await (ecs
    .registerTaskDefinition(request)
    .promise()
  );

  if (!newTaskDefinition) {
    throw new Error(
      `Failed to register updated task definition`
    );
  }

  if (!newTaskDefinition.family) {
    throw new Error(
      `Missing family from new task definition`
    );
  }

  if (!newTaskDefinition.revision) {
    throw new Error(
      `Missing revision from new task definition`
    );
  }

  console.log(
    `\nSuccessfully registered new task definition:\n` +
    `${newTaskDefinition.family}` +
    `revision: ${newTaskDefinition.revision}`
  );

  return {
    name: `${newTaskDefinition.family}:${newTaskDefinition.revision}`,
    revision: newTaskDefinition.revision,
  };


  function applyContainerOverrides() {

    const { containerOverrides } = options;

    if (!containerOverrides) {
      return;
    }

    console.log(`Applying container overrides`);

    for (const nameOrIndex in containerOverrides) {

      const container = (
        getContainerByIndex(nameOrIndex) ||
        getContainerByName(nameOrIndex)
      );

      if (!container) {
        throw new Error(
          `Failed to find container to override: ${nameOrIndex}`
        );
      }

      const {
        imageTag,
        ...overrides

      } = containerOverrides[nameOrIndex];

      // Replacing image tag in the container image
      if (imageTag && container.image) {
        overrides.image = container.image
          .replace(/:[^:]+$/, `:${imageTag}`)
        ;
      }

      Object.assign(container, overrides);

    }

  }

  function getContainerByName(
    containerName: string

  ): (ContainerDefinition | undefined) {

    return request.containerDefinitions
      .find(definition => definition.name === containerName)
    ;

  }

  function getContainerByIndex(
    index: string

  ): (ContainerDefinition | undefined) {

    return request.containerDefinitions[
      parseInt(index, 10)
    ];

  }

}
