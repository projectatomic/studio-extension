/**********************************************************************
 * Copyright (C) 2024 Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 ***********************************************************************/
import { TaskRegistry } from '../../registries/TaskRegistry';
import { beforeAll, beforeEach, expect, test, vi } from 'vitest';
import type { ContainerCreateResult, ContainerInfo, ImageInfo, TelemetryLogger, Webview } from '@podman-desktop/api';
import { containerEngine, EventEmitter } from '@podman-desktop/api';
import type { PodmanConnection } from '../podmanConnection';
import { INSTRUCTLAB_CONTAINER_LABEL, InstructlabManager } from './instructlabManager';
import { ContainerRegistry } from '../../registries/ContainerRegistry';
import { TestEventEmitter } from '../../tests/utils';
import { VMType } from '@shared/src/models/IPodman';
import type { Task } from '@shared/src/models/ITask';
import instructlab_images from '../../assets/instructlab-images.json';
import { INSTRUCTLAB_CONTAINER_TRACKINGID } from '@shared/src/models/instructlab/IInstructlabContainerInfo';

vi.mock('@podman-desktop/api', () => {
  return {
    EventEmitter: vi.fn(),
    containerEngine: {
      listContainers: vi.fn(),
      listImages: vi.fn(),
      createContainer: vi.fn(),
      onEvent: vi.fn(),
    },
  };
});

const taskRegistry = new TaskRegistry({ postMessage: vi.fn().mockResolvedValue(undefined) } as unknown as Webview);

const podmanConnection: PodmanConnection = {
  onPodmanConnectionEvent: vi.fn(),
  findRunningContainerProviderConnection: vi.fn(),
} as unknown as PodmanConnection;

const telemetryMock = {
  logUsage: vi.fn(),
  logError: vi.fn(),
} as unknown as TelemetryLogger;

let instructlabManager: InstructlabManager;

beforeAll(() => {
  vi.mocked(EventEmitter).mockImplementation(() => new TestEventEmitter() as unknown as EventEmitter<unknown>);
});

beforeEach(() => {
  const containerRegistry = new ContainerRegistry();
  containerRegistry.init();
  instructlabManager = new InstructlabManager('', taskRegistry, podmanConnection, containerRegistry, telemetryMock);
  taskRegistry.deleteByLabels({ trackingId: INSTRUCTLAB_CONTAINER_TRACKINGID });
});

test('getInstructLabContainer should return undefined if no containers', async () => {
  vi.mocked(containerEngine.listContainers).mockResolvedValue([]);
  const containerId = await instructlabManager.getInstructLabContainer();
  expect(containerId).toBeUndefined();
});

test('getInstructLabContainer should return undefined if no instructlab container', async () => {
  vi.mocked(containerEngine.listContainers).mockResolvedValue([{ Id: 'dummyId' } as unknown as ContainerInfo]);
  const containerId = await instructlabManager.getInstructLabContainer();
  expect(containerId).toBeUndefined();
});

test('getInstructLabContainer should return id if instructlab container', async () => {
  vi.mocked(containerEngine.listContainers).mockResolvedValue([
    {
      Id: 'dummyId',
      State: 'running',
      Labels: { [`${INSTRUCTLAB_CONTAINER_LABEL}`]: 'dummyLabel' },
    } as unknown as ContainerInfo,
  ]);
  const containerId = await instructlabManager.getInstructLabContainer();
  expect(containerId).toBe('dummyId');
});

test('requestCreateInstructlabContainer throws error if no podman connection', async () => {
  const containerIdPromise = instructlabManager.requestCreateInstructlabContainer({});
  await expect(containerIdPromise).rejects.toBeInstanceOf(Error);
});

async function waitTasks(id: string, nb: number): Promise<Task[]> {
  return vi.waitFor(() => {
    const tasks = taskRegistry.getTasksByLabels({ trackingId: id });
    if (tasks.length !== nb) {
      throw new Error('not completed');
    }
    return tasks;
  });
}

test('requestCreateInstructlabContainer returns id and error if listImage returns error', async () => {
  vi.mocked(podmanConnection.findRunningContainerProviderConnection).mockReturnValue({
    name: 'Podman Machine',
    vmType: VMType.UNKNOWN,
    type: 'podman',
    status: () => 'started',
    endpoint: {
      socketPath: 'socket.sock',
    },
  });
  vi.mocked(containerEngine.listImages).mockRejectedValue(new Error());
  await instructlabManager.requestCreateInstructlabContainer({});
  const tasks = await waitTasks(INSTRUCTLAB_CONTAINER_TRACKINGID, 2);
  expect(tasks.some(task => task.state === 'error')).toBeTruthy();
});

test('requestCreateInstructlabContainer returns id and error if listImage returns image', async () => {
  vi.mocked(podmanConnection.findRunningContainerProviderConnection).mockReturnValue({
    name: 'Podman Machine',
    vmType: VMType.UNKNOWN,
    type: 'podman',
    status: () => 'started',
    endpoint: {
      socketPath: 'socket.sock',
    },
  });
  vi.mocked(containerEngine.listImages).mockResolvedValue([
    { RepoTags: [instructlab_images.default] } as unknown as ImageInfo,
  ]);
  await instructlabManager.requestCreateInstructlabContainer({});
  const tasks = await waitTasks(INSTRUCTLAB_CONTAINER_TRACKINGID, 3);
  expect(tasks.some(task => task.state === 'error')).toBeTruthy();
});

test('requestCreateInstructlabContainer returns id and no error if createContainer returns id', async () => {
  vi.mocked(podmanConnection.findRunningContainerProviderConnection).mockReturnValue({
    name: 'Podman Machine',
    vmType: VMType.UNKNOWN,
    type: 'podman',
    status: () => 'started',
    endpoint: {
      socketPath: 'socket.sock',
    },
  });
  vi.mocked(containerEngine.listImages).mockResolvedValue([
    { RepoTags: [instructlab_images.default] } as unknown as ImageInfo,
  ]);
  vi.mocked(containerEngine.createContainer).mockResolvedValue({
    id: 'containerId',
  } as unknown as ContainerCreateResult);
  await instructlabManager.requestCreateInstructlabContainer({});
  const tasks = await waitTasks(INSTRUCTLAB_CONTAINER_TRACKINGID, 3);
  expect(tasks.some(task => task.state === 'error')).toBeFalsy();
});
