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

import type { InstructlabSession } from '@shared/src/models/instructlab/IInstructlabSession';
import type { InstructlabContainerConfiguration } from '@shared/src/models/instructlab/IInstructlabContainerConfiguration';
import type { TaskRegistry } from '../../registries/TaskRegistry';
import {
  type TelemetryLogger,
  containerEngine,
  type ContainerProviderConnection,
  type ContainerCreateOptions,
} from '@podman-desktop/api';
import type { PodmanConnection, PodmanConnectionEvent } from '../podmanConnection';
import instructlab_images from '../../assets/instructlab-images.json';
import { getImageInfo } from '../../utils/inferenceUtils';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { ContainerRegistry, ContainerEvent } from '../../registries/ContainerRegistry';
import { DISABLE_SELINUX_LABEL_SECURITY_OPTION } from '../../utils/utils';
import { INSTRUCTLAB_CONTAINER_TRACKINGID } from '@shared/src/models/instructlab/IInstructlabContainerInfo';
import { getRandomName } from '../../utils/randomUtils';

export const INSTRUCTLAB_CONTAINER_LABEL = 'ai-lab-instructlab-container';

export class InstructlabManager {
  #initialized: boolean;
  #containerId: string | undefined;

  constructor(
    private readonly appUserDirectory: string,
    private taskRegistry: TaskRegistry,
    private podmanConnection: PodmanConnection,
    private containerRegistry: ContainerRegistry,
    private telemetryLogger: TelemetryLogger,
  ) {
    this.#initialized = false;
    this.podmanConnection.onPodmanConnectionEvent(this.watchMachineEvent.bind(this));
    this.containerRegistry.onStartContainerEvent(this.onStartContainerEvent.bind(this));
    this.containerRegistry.onStopContainerEvent(this.onStopContainerEvent.bind(this));
  }

  private async refreshInstructlabContainer(id?: string): Promise<void> {
    const containers = await containerEngine.listContainers();
    const containerId = (this.#containerId = containers
      .filter(c => !id || c.Id === id)
      .filter(c => c.State === 'running' && c.Labels && INSTRUCTLAB_CONTAINER_LABEL in c.Labels)
      .map(c => c.Id)
      .at(0));
    if ((id && containerId) || !id) {
      this.#containerId = containerId;
    }
  }

  private async watchMachineEvent(event: PodmanConnectionEvent): Promise<void> {
    if ((event.status === 'started' && !this.#containerId) || (event.status === 'stopped' && this.#containerId)) {
      await this.refreshInstructlabContainer();
    }
  }

  private async onStartContainerEvent(event: ContainerEvent): Promise<void> {
    await this.refreshInstructlabContainer(event.id);
  }

  private onStopContainerEvent(event: ContainerEvent): void {
    console.log('event id:', event.id, ' containerId: ', this.#containerId);
    if (this.#containerId === event.id) {
      this.#containerId = undefined;
      this.taskRegistry.deleteByLabels({ trackingId: INSTRUCTLAB_CONTAINER_TRACKINGID });
    }
  }

  public getSessions(): InstructlabSession[] {
    return [
      {
        name: 'session 1',
        modelId: 'hf.facebook.detr-resnet-101',
        targetModel: 'hf.facebook.detr-resnet-101-target',
        repository: '/a1',
        status: 'fine-tuned',
        createdTime: new Date(new Date().getTime() - 6 * 24 * 60 * 60 * 1000).getTime() / 1000, // 6 days ago
      },
      {
        name: 'session 2',
        modelId: 'hf.ibm-granite.granite-8b-code-instruct',
        targetModel: 'hf.ibm-granite.granite-8b-code-instruct-target',
        repository: '/a2',
        status: 'generating-instructions',
        createdTime: new Date(new Date().getTime() - 4 * 60 * 60 * 1000).getTime() / 1000, // 4 hours ago
      },
    ];
  }

  async getInstructLabContainer(): Promise<string | undefined> {
    if (!this.#initialized) {
      const containers = await containerEngine.listContainers();
      this.#containerId = containers
        .filter(c => c.State === 'running' && c.Labels && INSTRUCTLAB_CONTAINER_LABEL in c.Labels)
        .map(c => c.Id)
        .at(0);
      this.#initialized = true;
    }
    return this.#containerId;
  }

  async requestCreateInstructlabContainer(config: InstructlabContainerConfiguration): Promise<void> {
    // create a tracking id to put in the labels
    const trackingId: string = INSTRUCTLAB_CONTAINER_TRACKINGID;

    const labels = {
      trackingId: trackingId,
    };

    const task = this.taskRegistry.createTask('Creating InstructLab container', 'loading', {
      trackingId: trackingId,
    });

    let connection: ContainerProviderConnection | undefined;
    if (config.connection) {
      connection = this.podmanConnection.getContainerProviderConnection(config.connection);
    } else {
      connection = this.podmanConnection.findRunningContainerProviderConnection();
    }

    if (!connection) throw new Error('cannot find running container provider connection');

    this.createInstructlabContainer(connection, labels)
      .then((containerId: string) => {
        this.#containerId = containerId;
        this.taskRegistry.updateTask({
          ...task,
          state: 'success',
          labels: {
            ...task.labels,
            containerId: containerId,
          },
        });
        this.telemetryLogger.logUsage('instructlab.startContainer');
      })
      .catch((err: unknown) => {
        // Get all tasks using the tracker
        const tasks = this.taskRegistry.getTasksByLabels({
          trackingId: trackingId,
        });
        // Filter the one no in loading state
        tasks
          .filter(t => t.state === 'loading' && t.id !== task.id)
          .forEach(t => {
            this.taskRegistry.updateTask({
              ...t,
              state: 'error',
            });
          });
        // Update the main task
        this.taskRegistry.updateTask({
          ...task,
          state: 'error',
          error: `Something went wrong while trying to create an inference server ${String(err)}.`,
        });
        this.telemetryLogger.logError('instructlab.startContainer', { error: err });
      });
  }

  async createInstructlabContainer(
    connection: ContainerProviderConnection,
    labels: { [p: string]: string },
  ): Promise<string> {
    const image = instructlab_images.default;
    const pullingTask = this.taskRegistry.createTask(`Pulling ${image}.`, 'loading', labels);
    const imageInfo = await getImageInfo(connection, image, () => {})
      .catch((err: unknown) => {
        pullingTask.state = 'error';
        pullingTask.progress = undefined;
        pullingTask.error = `Something went wrong while pulling ${image}: ${String(err)}`;
        throw err;
      })
      .then(imageInfo => {
        pullingTask.state = 'success';
        pullingTask.progress = undefined;
        return imageInfo;
      })
      .finally(() => {
        this.taskRegistry.updateTask(pullingTask);
      });

    const folder = await this.getInstructLabContainerFolder();

    const containerTask = this.taskRegistry.createTask('Starting InstructLab container', 'loading', labels);
    const createContainerOptions: ContainerCreateOptions = {
      Image: imageInfo.Id,
      name: getRandomName('instructlab'),
      Labels: { [INSTRUCTLAB_CONTAINER_LABEL]: image },
      HostConfig: {
        AutoRemove: true,
        SecurityOpt: [DISABLE_SELINUX_LABEL_SECURITY_OPTION],
        Mounts: [
          {
            Target: '/instructlab/.cache/instructlab',
            Source: path.join(folder, '.cache'),
            Type: 'bind',
          },
          {
            Target: '/instructlab/.config/instructlab',
            Source: path.join(folder, '.config'),
            Type: 'bind',
          },
          {
            Target: '/instructlab/.local/share/instructlab',
            Source: path.join(folder, '.local'),
            Type: 'bind',
          },
        ],
        UsernsMode: 'keep-id:uid=1000,gid=1000',
      },
      OpenStdin: true,
      start: true,
    };
    try {
      const { id } = await containerEngine.createContainer(imageInfo.engineId, createContainerOptions);
      // update the task
      containerTask.state = 'success';
      containerTask.progress = undefined;
      return id;
    } catch (err: unknown) {
      containerTask.state = 'error';
      containerTask.progress = undefined;
      containerTask.error = `Something went wrong while creating container: ${String(err)}`;
      throw err;
    } finally {
      this.taskRegistry.updateTask(containerTask);
    }
  }

  private async getInstructLabContainerFolder(): Promise<string> {
    const instructlabPath = path.join(this.appUserDirectory, 'instructlab', 'container');
    await fs.mkdir(instructlabPath, { recursive: true });
    await fs.mkdir(path.join(instructlabPath, '.cache'), { recursive: true });
    await fs.mkdir(path.join(instructlabPath, '.config'), { recursive: true });
    await fs.mkdir(path.join(instructlabPath, '.local'), { recursive: true });
    return instructlabPath;
  }
}
