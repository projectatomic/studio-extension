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
import type { InferenceServer, InferenceServerStatus, InferenceType } from '@shared/src/models/IInference';
import type { PodmanConnection, PodmanConnectionEvent } from '../podmanConnection';
import { containerEngine, Disposable } from '@podman-desktop/api';
import type { ContainerInfo, TelemetryLogger, Webview, ContainerProviderConnection } from '@podman-desktop/api';
import type { ContainerRegistry, ContainerEvent } from '../../registries/ContainerRegistry';
import { getInferenceType, isTransitioning, LABEL_INFERENCE_SERVER } from '../../utils/inferenceUtils';
import { Publisher } from '../../utils/Publisher';
import { Messages } from '@shared/Messages';
import type { InferenceServerConfig } from '@shared/src/models/InferenceServerConfig';
import type { ModelsManager } from '../modelsManager';
import type { TaskRegistry } from '../../registries/TaskRegistry';
import { getRandomString } from '../../utils/randomUtils';
import { basename, dirname } from 'node:path';
import type { InferenceProviderRegistry } from '../../registries/InferenceProviderRegistry';
import type { InferenceProvider } from '../../workers/provider/InferenceProvider';
import type { ModelInfo } from '@shared/src/models/IModelInfo';
import type { CatalogManager } from '../catalogManager';
import { getHash } from '../../utils/sha';

export class InferenceManager extends Publisher<InferenceServer[]> implements Disposable {
  // Inference server map (containerId -> InferenceServer)
  #servers: Map<string, InferenceServer>;
  // Is initialized
  #initialized: boolean;
  // Disposables
  #disposables: Disposable[];

  constructor(
    webview: Webview,
    private containerRegistry: ContainerRegistry,
    private podmanConnection: PodmanConnection,
    private modelsManager: ModelsManager,
    private telemetry: TelemetryLogger,
    private taskRegistry: TaskRegistry,
    private inferenceProviderRegistry: InferenceProviderRegistry,
    private catalogManager: CatalogManager,
  ) {
    super(webview, Messages.MSG_INFERENCE_SERVERS_UPDATE, () => this.getServers());
    this.#servers = new Map<string, InferenceServer>();
    this.#disposables = [];
    this.#initialized = false;
  }

  init(): void {
    this.podmanConnection.onPodmanConnectionEvent(this.watchMachineEvent.bind(this));
    this.containerRegistry.onStartContainerEvent(this.watchContainerStart.bind(this));
    this.catalogManager.onUpdate(() => {
      this.retryableRefresh(1);
    });
    this.retryableRefresh(3);
  }

  public isInitialize(): boolean {
    return this.#initialized;
  }

  /**
   * Cleanup the manager
   */
  dispose(): void {
    this.cleanDisposables();
    this.#servers.clear();
    this.#initialized = false;
  }

  /**
   * Clean class disposables
   */
  private cleanDisposables(): void {
    this.#disposables.forEach(disposable => disposable.dispose());
  }

  /**
   * Get the Inference servers
   */
  public getServers(): InferenceServer[] {
    return Array.from(this.#servers.values());
  }

  /**
   * return an inference server
   * @param containerId the containerId of the inference server
   */
  public get(containerId: string): InferenceServer | undefined {
    return this.#servers.get(containerId);
  }

  /**
   * return the first inference server which is using the specific model
   * it throws if the model backend is not currently supported
   */
  public findServerByModel(model: ModelInfo): InferenceServer | undefined {
    // check if model backend is supported
    const backend: InferenceType = getInferenceType([model]);
    const providers: InferenceProvider[] = this.inferenceProviderRegistry
      .getByType(backend)
      .filter(provider => provider.enabled());
    if (providers.length === 0) {
      throw new Error('no enabled provider could be found.');
    }
    return this.getServers().find(s => s.models.some(m => m.id === model.id));
  }

  /**
   * Creating an inference server can be heavy task (pulling image, uploading model to WSL etc.)
   * The frontend cannot wait endlessly, therefore we provide a method returning a tracking identifier
   * that can be used to fetch the tasks
   *
   * @param config the config to use to create the inference server
   *
   * @return a unique tracking identifier to follow the creation request
   */
  requestCreateInferenceServer(config: InferenceServerConfig): string {
    // create a tracking id to put in the labels
    const trackingId: string = getRandomString();

    config.labels = {
      ...config.labels,
      trackingId: trackingId,
    };

    const task = this.taskRegistry.createTask('Creating Inference server', 'loading', {
      trackingId: trackingId,
    });

    this.createInferenceServer(config)
      .then((containerId: string) => {
        this.taskRegistry.updateTask({
          ...task,
          state: 'success',
          labels: {
            ...task.labels,
            containerId: containerId,
          },
        });
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
      });
    return trackingId;
  }

  /**
   * Given an engineId, it will create an inference server using an InferenceProvider.
   * @param config
   *
   * @return the containerId of the created inference server
   */
  async createInferenceServer(config: InferenceServerConfig): Promise<string> {
    if (!this.isInitialize()) throw new Error('Cannot start the inference server: not initialized.');

    // Get the backend for the model inference server {@link InferenceType}
    const backend: InferenceType = getInferenceType(config.modelsInfo);

    let provider: InferenceProvider;
    if (config.inferenceProvider) {
      provider = this.inferenceProviderRegistry.get(config.inferenceProvider);
      if (!provider.enabled()) throw new Error('provider requested is not enabled.');
    } else {
      const providers: InferenceProvider[] = this.inferenceProviderRegistry
        .getByType(backend)
        .filter(provider => provider.enabled());
      if (providers.length === 0) throw new Error('no enabled provider could be found.');
      provider = providers[0];
    }

    let connection: ContainerProviderConnection | undefined = undefined;
    if (config.connection) {
      connection = this.podmanConnection.getContainerProviderConnection(config.connection);
    } else {
      connection = this.podmanConnection.findRunningContainerProviderConnection();
    }

    if (!connection) throw new Error('cannot find running container provider connection');

    // upload models to podman machine if user system is supported
    config.modelsInfo = await Promise.all(
      config.modelsInfo.map(modelInfo =>
        this.modelsManager.uploadModelToPodmanMachine(connection, modelInfo, config.labels).then(path => ({
          ...modelInfo,
          file: {
            path: dirname(path),
            file: basename(path),
          },
        })),
      ),
    );

    // create the inference server using the selected inference provider
    const inferenceServer = await provider.perform(config);

    // Adding a new inference server
    this.#servers.set(inferenceServer.container.containerId, inferenceServer);

    // Watch for container changes
    this.watchContainerStatus(inferenceServer.container.engineId, inferenceServer.container.containerId);

    // Log usage
    this.telemetry.logUsage('inference.start', {
      models: config.modelsInfo.map(model => getHash(model.id)),
    });

    this.notify();
    return inferenceServer.container.containerId;
  }

  /**
   * Given an engineId and a containerId, inspect the container and update the servers
   * @param engineId
   * @param containerId
   * @private
   */
  private updateServerStatus(engineId: string, containerId: string): void {
    // Inspect container
    containerEngine
      .inspectContainer(engineId, containerId)
      .then(result => {
        const server = this.#servers.get(containerId);
        if (server === undefined)
          throw new Error('Something went wrong while trying to get container status got undefined Inference Server.');

        // we should not update the server while we are in a transition state.
        if (isTransitioning(server)) return;

        // Update server
        this.#servers.set(containerId, {
          ...server,
          status: result.State.Status === 'running' ? 'running' : 'stopped',
          health: result.State.Health,
        });
        this.notify();
      })
      .catch((err: unknown) => {
        console.error(
          `Something went wrong while trying to inspect container ${containerId}. Trying to refresh servers.`,
          err,
        );
        this.retryableRefresh(2);
      });
  }

  /**
   * Watch for container status changes
   * @param engineId
   * @param containerId the container to watch out
   */
  private watchContainerStatus(engineId: string, containerId: string): void {
    // Update now
    this.updateServerStatus(engineId, containerId);

    // Create a pulling update for container health check
    const intervalId = setInterval(this.updateServerStatus.bind(this, engineId, containerId), 10000);

    this.#disposables.push(
      Disposable.create(() => {
        clearInterval(intervalId);
      }),
    );
    // Subscribe to container status update
    const disposable = this.containerRegistry.subscribe(containerId, (status: string) => {
      switch (status) {
        case 'die':
          this.updateServerStatus(engineId, containerId);
          clearInterval(intervalId);
          break;
        case 'remove':
          // Update the list of servers
          this.removeInferenceServer(containerId);
          disposable.dispose();
          clearInterval(intervalId);
          break;
      }
    });
    // Allowing cleanup if extension is stopped
    this.#disposables.push(disposable);
  }

  private watchMachineEvent(_event: PodmanConnectionEvent): void {
    this.retryableRefresh(2);
  }

  /**
   * Listener for container start events
   * @param event the event containing the id of the container
   */
  private watchContainerStart(event: ContainerEvent): void {
    // We might have a start event for an inference server we already know about
    if (this.#servers.has(event.id)) return;

    containerEngine
      .listContainers()
      .then(containers => {
        const container = containers.find(c => c.Id === event.id);
        if (container === undefined) {
          return;
        }
        if (container.Labels && LABEL_INFERENCE_SERVER in container.Labels) {
          this.watchContainerStatus(container.engineId, container.Id);
        }
      })
      .catch((err: unknown) => {
        console.error(`Something went wrong in container start listener.`, err);
      });
  }

  /**
   * This non-async utility method is made to retry refreshing the inference server with some delay
   * in case of error raised.
   *
   * @param retry the number of retry allowed
   */
  private retryableRefresh(retry: number = 3): void {
    if (retry === 0) {
      console.error('Cannot refresh inference servers: retry limit has been reached. Cleaning manager.');
      this.cleanDisposables();
      this.#servers.clear();
      this.#initialized = false;
      return;
    }
    this.refreshInferenceServers().catch((err: unknown): void => {
      console.warn(`Something went wrong while trying to refresh inference server. (retry left ${retry})`, err);
      setTimeout(
        () => {
          this.retryableRefresh(retry - 1);
        },
        // eslint-disable-next-line sonarjs/pseudo-random
        2000 + Math.random() * 1000,
      );
    });
  }

  /**
   * Refresh the inference servers by listing all containers.
   *
   * This method has an important impact as it (re-)create all inference servers
   */
  private async refreshInferenceServers(): Promise<void> {
    const containers: ContainerInfo[] = await containerEngine.listContainers();
    const filtered = containers.filter(c => c.Labels && LABEL_INFERENCE_SERVER in c.Labels);

    // clean existing disposables
    this.cleanDisposables();
    this.#servers = new Map<string, InferenceServer>(
      filtered.map(containerInfo => {
        let modelInfos: ModelInfo[] = [];
        try {
          const modelIds: string[] = JSON.parse(containerInfo.Labels[LABEL_INFERENCE_SERVER]);
          modelInfos = modelIds
            .filter(id => this.modelsManager.isModelOnDisk(id))
            .map(id => this.modelsManager.getModelInfo(id));
        } catch (err: unknown) {
          console.error('Something went wrong while getting the models ids from the label.', err);
        }

        return [
          containerInfo.Id,
          {
            container: {
              containerId: containerInfo.Id,
              engineId: containerInfo.engineId,
            },
            connection: {
              port: !!containerInfo.Ports && containerInfo.Ports.length > 0 ? containerInfo.Ports[0].PublicPort : -1,
            },
            status: containerInfo.Status === 'running' ? 'running' : 'stopped',
            models: modelInfos,
            type: getInferenceType(modelInfos),
            labels: containerInfo.Labels || {},
          },
        ];
      }),
    );

    // (re-)create container watchers
    this.#servers.forEach(server => this.watchContainerStatus(server.container.engineId, server.container.containerId));
    this.#initialized = true;
    // notify update
    this.notify();
  }

  /**
   * Remove the reference of the inference server
   * /!\ Does not delete the corresponding container
   * @param containerId
   */
  private removeInferenceServer(containerId: string): void {
    this.#servers.delete(containerId);
    this.notify();
  }

  /**
   * Delete the InferenceServer instance from #servers and matching container
   * @param containerId the id of the container running the Inference Server
   */
  async deleteInferenceServer(containerId: string): Promise<void> {
    const server = this.#servers.get(containerId);
    if (!server) {
      throw new Error(`cannot find a corresponding server for container id ${containerId}.`);
    }

    try {
      // Set status a deleting
      this.setInferenceServerStatus(server.container.containerId, 'deleting');

      // If the server is running we need to stop it.
      if (server.status === 'running') {
        await containerEngine.stopContainer(server.container.engineId, server.container.containerId);
      }

      // Delete the container
      await containerEngine.deleteContainer(server.container.engineId, server.container.containerId);

      // Delete the reference
      this.removeInferenceServer(containerId);
    } catch (err: unknown) {
      console.error('Something went wrong while trying to delete the inference server.', err);
      this.setInferenceServerStatus(server.container.containerId, 'error');
      this.retryableRefresh(2);
    }
  }

  /**
   * Start an inference server from the container id
   * @param containerId the identifier of the container to start
   */
  async startInferenceServer(containerId: string): Promise<void> {
    if (!this.isInitialize()) throw new Error('Cannot start the inference server.');

    const server = this.#servers.get(containerId);
    if (server === undefined) throw new Error(`cannot find a corresponding server for container id ${containerId}.`);

    try {
      // set status to starting
      this.setInferenceServerStatus(server.container.containerId, 'starting');
      await containerEngine.startContainer(server.container.engineId, server.container.containerId);

      this.setInferenceServerStatus(server.container.containerId, 'running');
      // start watch for container status update
      this.watchContainerStatus(server.container.engineId, server.container.containerId);
    } catch (error: unknown) {
      console.error(error);
      this.telemetry.logError('inference.start', {
        message: 'error starting inference',
        error: error,
      });
      this.setInferenceServerStatus(server.container.containerId, 'error');
      this.retryableRefresh(1);
    }
  }

  /**
   * Stop an inference server from the container id
   * @param containerId the identifier of the container to stop
   */
  async stopInferenceServer(containerId: string): Promise<void> {
    if (!this.isInitialize()) throw new Error('Cannot stop the inference server.');

    const server = this.#servers.get(containerId);
    if (server === undefined) throw new Error(`cannot find a corresponding server for container id ${containerId}.`);

    if (isTransitioning(server)) throw new Error(`cannot stop a transitioning server.`);

    try {
      // set server to stopping
      this.setInferenceServerStatus(server.container.containerId, 'stopping');

      await containerEngine.stopContainer(server.container.engineId, server.container.containerId);
      // once stopped update the status
      this.setInferenceServerStatus(server.container.containerId, 'stopped');
    } catch (error: unknown) {
      console.error(error);
      this.telemetry.logError('inference.stop', {
        message: 'error stopping inference',
        error: error,
      });

      this.setInferenceServerStatus(server.container.containerId, 'error');
      this.retryableRefresh(1);
    }
  }

  /**
   * Given an containerId, set the status of the corresponding inference server
   * @param containerId
   * @param status
   */
  private setInferenceServerStatus(containerId: string, status: InferenceServerStatus): void {
    const server = this.#servers.get(containerId);
    if (server === undefined) throw new Error(`cannot find a corresponding server for container id ${containerId}.`);

    this.#servers.set(server.container.containerId, {
      ...server,
      status: status,
      health: undefined, // always reset health history when changing status
    });
    this.notify();
  }
}
