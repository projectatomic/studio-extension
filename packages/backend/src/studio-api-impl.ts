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

import type { StudioAPI } from '@shared/src/StudioAPI';
import type { ApplicationManager } from './managers/application/applicationManager';
import type { ModelInfo } from '@shared/src/models/IModelInfo';
import * as podmanDesktopApi from '@podman-desktop/api';

import type { CatalogManager } from './managers/catalogManager';
import type { ApplicationCatalog } from '@shared/src/models/IApplicationCatalog';
import type { ModelsManager } from './managers/modelsManager';
import type { ApplicationState } from '@shared/src/models/IApplicationState';
import type { Task } from '@shared/src/models/ITask';
import type { TaskRegistry } from './registries/TaskRegistry';
import type { LocalRepository } from '@shared/src/models/ILocalRepository';
import type { LocalRepositoryRegistry } from './registries/LocalRepositoryRegistry';
import path from 'node:path';
import type { InferenceServer } from '@shared/src/models/IInference';
import type { CreationInferenceServerOptions } from '@shared/src/models/InferenceServerConfig';
import type { InferenceManager } from './managers/inference/inferenceManager';
import type { Conversation } from '@shared/src/models/IPlaygroundMessage';
import type { PlaygroundV2Manager } from './managers/playgroundV2Manager';
import { getFreeRandomPort } from './utils/ports';
import { withDefaultConfiguration } from './utils/inferenceUtils';
import type { RequestOptions } from '@shared/src/models/RequestOptions';
import type { SnippetManager } from './managers/SnippetManager';
import type { Language } from 'postman-code-generators';
import type { ModelOptions } from '@shared/src/models/IModelOptions';
import type { CancellationTokenRegistry } from './registries/CancellationTokenRegistry';
import type { LocalModelImportInfo } from '@shared/src/models/ILocalModelInfo';
import { getPodmanConnection } from './utils/podman';
import type {
  CheckContainerConnectionResourcesOptions,
  ContainerConnectionInfo,
  ContainerProviderConnectionInfo,
} from '@shared/src/models/IContainerConnectionInfo';
import type { ExtensionConfiguration } from '@shared/src/models/IExtensionConfiguration';
import type { ConfigurationRegistry } from './registries/ConfigurationRegistry';
import type { RecipeManager } from './managers/recipes/RecipeManager';
import type { PodmanConnection } from './managers/podmanConnection';
import type { RecipePullOptions } from '@shared/src/models/IRecipe';
import type { ContainerProviderConnection } from '@podman-desktop/api';
import type { NavigationRegistry } from './registries/NavigationRegistry';
import type { FilterRecipesResult, RecipeFilters } from '@shared/src/models/FilterRecipesResult';
import type { ErrorState } from '@shared/src/models/IError';
import type { ServiceMetadata } from '@shared/src/models/ServiceMetadata';
import { Messages } from '@shared/Messages';
import type { RpcBrowser } from '@shared/src/messages/MessageProxy';

interface PortQuickPickItem extends podmanDesktopApi.QuickPickItem {
  port: number;
}

export class StudioApiImpl implements StudioAPI {
  #errors: ErrorState[] = [];
  #rpcBrowser: RpcBrowser | undefined;

  constructor(
    private applicationManager: ApplicationManager,
    private catalogManager: CatalogManager,
    private modelsManager: ModelsManager,
    private telemetry: podmanDesktopApi.TelemetryLogger,
    private localRepositories: LocalRepositoryRegistry,
    private taskRegistry: TaskRegistry,
    private inferenceManager: InferenceManager,
    private playgroundV2: PlaygroundV2Manager,
    private snippetManager: SnippetManager,
    private cancellationTokenRegistry: CancellationTokenRegistry,
    private configurationRegistry: ConfigurationRegistry,
    private recipeManager: RecipeManager,
    private podmanConnection: PodmanConnection,
    private navigationRegistry: NavigationRegistry,
    rpcBrowser?: RpcBrowser,
  ) {
    this.#rpcBrowser = rpcBrowser;
  }

  async getErrors(): Promise<ErrorState[]> {
    return this.#errors;
  }

  async acknowledgeError(errorId: string): Promise<void> {
    const error = this.#errors.find(e => e.id === errorId);
    if (error) {
      error.acknowledged = true;
      // Notify subscribers of the updated error state
      this.notify(Messages.MSG_NEW_ERROR_STATE, this.#errors);
    }
  }

  async resolveServiceUri(uri: string): Promise<ServiceMetadata> {
    // Basic validation of MCP URI format
    if (!uri.startsWith('mcp://')) {
      throw new Error('Invalid MCP URI format. Must start with mcp://');
    }

    // For now return empty metadata - this can be expanded based on requirements
    return {};
  }

  // Helper method to create and track errors
  async createError(error: Omit<ErrorState, 'id' | 'timestamp'>): Promise<void> {
    const newError: ErrorState = {
      ...error,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    this.#errors.push(newError);
    // Notify subscribers of the new error state
    this.notify(Messages.MSG_NEW_ERROR_STATE, this.#errors);
  }

  private notify(channel: string, message: unknown): void {
    if (this.#rpcBrowser) {
      // Use the RpcBrowser's subscribe mechanism to notify subscribers
      const subscribers = this.#rpcBrowser.subscribers.get(channel);
      if (subscribers) {
        subscribers.forEach(listener => listener(message));
      }
    }
  }

  async readRoute(): Promise<string | undefined> {
    return this.navigationRegistry.readRoute();
  }

  async requestDeleteConversation(conversationId: string): Promise<void> {
    // Do not wait on the promise as the api would probably timeout before the user answer.
    podmanDesktopApi.window
      .showWarningMessage(`Are you sure you want to delete this playground ?`, 'Confirm', 'Cancel')
      .then((result: string | undefined) => {
        if (result === 'Confirm') {
          this.playgroundV2.deleteConversation(conversationId);
        }
      })
      .catch((err: unknown) => {
        console.error(`Something went wrong with confirmation modals`, err);
      });
  }

  async requestCreatePlayground(name: string, model: ModelInfo): Promise<string> {
    try {
      return await this.playgroundV2.requestCreatePlayground(name, model);
    } catch (err: unknown) {
      console.error('Something went wrong while trying to create playground environment', err);
      throw err;
    }
  }

  submitPlaygroundMessage(containerId: string, userInput: string, options?: ModelOptions): Promise<number> {
    return this.playgroundV2.submit(containerId, userInput, options);
  }

  async setPlaygroundSystemPrompt(conversationId: string, content: string | undefined): Promise<void> {
    this.playgroundV2.setSystemPrompt(conversationId, content);
  }

  async getPlaygroundConversations(): Promise<Conversation[]> {
    return this.playgroundV2.getConversations();
  }

  async getExtensionConfiguration(): Promise<ExtensionConfiguration> {
    return this.configurationRegistry.getExtensionConfiguration();
  }

  async updateExtensionConfiguration(update: Partial<ExtensionConfiguration>): Promise<void> {
    return this.configurationRegistry.updateExtensionConfiguration(update);
  }

  async getSnippetLanguages(): Promise<Language[]> {
    return this.snippetManager.getLanguageList();
  }

  createSnippet(options: RequestOptions, language: string, variant: string): Promise<string> {
    return this.snippetManager.generate(options, language, variant);
  }

  async getInferenceServers(): Promise<InferenceServer[]> {
    return this.inferenceManager.getServers();
  }

  async requestDeleteInferenceServer(...containerIds: string[]): Promise<void> {
    // Do not wait on the promise as the api would probably timeout before the user answer.
    if (containerIds.length === 0) throw new Error('At least one container id should be provided.');

    let dialogMessage: string;
    if (containerIds.length === 1) {
      dialogMessage = `Are you sure you want to delete this service ?`;
    } else {
      dialogMessage = `Are you sure you want to delete those ${containerIds.length} services ?`;
    }

    podmanDesktopApi.window
      .showWarningMessage(dialogMessage, 'Confirm', 'Cancel')
      .then((result: string | undefined) => {
        if (result !== 'Confirm') return;

        Promise.all(containerIds.map(containerId => this.inferenceManager.deleteInferenceServer(containerId))).catch(
          (err: unknown) => {
            console.error('Something went wrong while trying to delete the inference server', err);
          },
        );
      })
      .catch((err: unknown) => {
        console.error(`Something went wrong with confirmation modals`, err);
      });
  }

  async requestCreateInferenceServer(options: CreationInferenceServerOptions): Promise<string> {
    try {
      const config = await withDefaultConfiguration(options);
      return this.inferenceManager.requestCreateInferenceServer(config);
    } catch (err: unknown) {
      console.error('Something went wrong while trying to start inference server', err);
      throw err;
    }
  }

  startInferenceServer(containerId: string): Promise<void> {
    return this.inferenceManager.startInferenceServer(containerId);
  }

  stopInferenceServer(containerId: string): Promise<void> {
    return this.inferenceManager.stopInferenceServer(containerId);
  }

  async ping(): Promise<string> {
    return 'pong';
  }

  async openURL(url: string): Promise<boolean> {
    return await podmanDesktopApi.env.openExternal(podmanDesktopApi.Uri.parse(url));
  }

  async openFile(file: string, recipeId?: string): Promise<boolean> {
    const telemetry: Record<string, unknown> = {
      'recipe.id': recipeId,
    };
    try {
      return await podmanDesktopApi.env.openExternal(podmanDesktopApi.Uri.file(file));
    } catch (err) {
      telemetry['errorMessage'] = String(err);
      throw err;
    } finally {
      this.telemetry.logUsage('studio.open-file', telemetry);
    }
  }

  async openDialog(options?: podmanDesktopApi.OpenDialogOptions): Promise<podmanDesktopApi.Uri[] | undefined> {
    return await podmanDesktopApi.window.showOpenDialog(options);
  }

  async cloneApplication(recipeId: string): Promise<void> {
    const recipe = this.catalogManager.getRecipes().find(recipe => recipe.id === recipeId);
    if (!recipe) throw new Error(`recipe with if ${recipeId} not found`);

    return this.recipeManager.cloneRecipe(recipe);
  }

  async getContainerProviderConnection(): Promise<ContainerProviderConnectionInfo[]> {
    return this.podmanConnection.getContainerProviderConnectionInfo();
  }

  async requestPullApplication(options: RecipePullOptions): Promise<string> {
    const recipe = this.catalogManager.getRecipes().find(recipe => recipe.id === options.recipeId);
    if (!recipe) throw new Error(`recipe with if ${options.recipeId} not found`);

    const model = this.catalogManager.getModelById(options.modelId);

    let connection: ContainerProviderConnection | undefined = undefined;
    if (options.connection) {
      connection = this.podmanConnection.getContainerProviderConnection(options.connection);
    } else {
      connection = this.podmanConnection.findRunningContainerProviderConnection();
    }

    if (!connection) throw new Error('no running container provider connection found.');

    return this.applicationManager.requestPullApplication(connection, recipe, model);
  }

  async getModelsInfo(): Promise<ModelInfo[]> {
    return this.modelsManager.getModelsInfo();
  }

  getModelMetadata(modelId: string): Promise<Record<string, unknown>> {
    return this.modelsManager.getModelMetadata(modelId);
  }

  async getCatalog(): Promise<ApplicationCatalog> {
    return this.catalogManager.getCatalog();
  }

  async filterRecipes(filters: RecipeFilters): Promise<FilterRecipesResult> {
    return this.catalogManager.filterRecipes(filters);
  }

  async requestRemoveLocalModel(modelId: string): Promise<void> {
    const modelInfo = this.modelsManager.getLocalModelInfo(modelId);

    // Do not wait on the promise as the api would probably timeout before the user answer.
    podmanDesktopApi.window
      .showWarningMessage(
        `Are you sure you want to delete ${modelId} ? The following files will be removed from disk "${modelInfo.file}".`,
        'Confirm',
        'Cancel',
      )
      .then((result: string | undefined) => {
        if (result === 'Confirm') {
          this.modelsManager.deleteModel(modelId).catch((err: unknown) => {
            console.error('Something went wrong while deleting the models', err);
            // Lets reloads the models (could fix the issue)
            this.modelsManager.loadLocalModels().catch((err: unknown) => {
              console.error('Cannot reload the models', err);
            });
          });
        }
      })
      .catch((err: unknown) => {
        console.error(`Something went wrong with confirmation modals`, err);
      });
  }

  async getModelsDirectory(): Promise<string> {
    return this.modelsManager.getModelsDirectory();
  }

  navigateToContainer(containerId: string): Promise<void> {
    return podmanDesktopApi.navigation.navigateToContainer(containerId);
  }

  async navigateToPod(podId: string): Promise<void> {
    const pods = await podmanDesktopApi.containerEngine.listPods();
    const pod = pods.find(pod => pod.Id === podId);
    if (pod === undefined) throw new Error(`Pod with id ${podId} not found.`);
    return podmanDesktopApi.navigation.navigateToPod(pod.kind, pod.Name, pod.engineId);
  }

  async navigateToResources(): Promise<void> {
    // navigateToResources is only available from desktop 1.10
    if (podmanDesktopApi.navigation.navigateToResources) {
      return podmanDesktopApi.navigation.navigateToResources();
    }
  }

  async navigateToEditConnectionProvider(connectionName: string): Promise<void> {
    // navigateToEditProviderContainerConnection is only available from desktop 1.10
    if (podmanDesktopApi.navigation.navigateToEditProviderContainerConnection) {
      const connection = getPodmanConnection(connectionName);
      return podmanDesktopApi.navigation.navigateToEditProviderContainerConnection(connection);
    }
  }

  async getApplicationsState(): Promise<ApplicationState[]> {
    return this.applicationManager.getApplicationsState();
  }

  async requestStartApplication(recipeId: string, modelId: string): Promise<void> {
    this.applicationManager.startApplication(recipeId, modelId).catch((err: unknown) => {
      console.error('Something went wrong while trying to start application', err);
    });
  }

  async requestStopApplication(recipeId: string, modelId: string): Promise<void> {
    this.applicationManager.stopApplication(recipeId, modelId).catch((err: unknown) => {
      console.error('Something went wrong while trying to stop application', err);
    });
  }

  async requestRemoveApplication(recipeId: string, modelId: string): Promise<void> {
    const recipe = this.catalogManager.getRecipeById(recipeId);
    // Do not wait on the promise as the api would probably timeout before the user answer.
    podmanDesktopApi.window
      .showWarningMessage(
        `Delete the AI App "${recipe.name}"? This will delete the containers running the application and model.`,
        'Confirm',
        'Cancel',
      )
      .then((result: string | undefined) => {
        if (result === 'Confirm') {
          this.applicationManager.removeApplication(recipeId, modelId).catch((err: unknown) => {
            console.error(`error deleting AI App's pod: ${String(err)}`);
            podmanDesktopApi.window
              .showErrorMessage(
                `Error deleting the AI App "${recipe.name}". You can try to stop and delete the AI App's pod manually.`,
              )
              .catch((err: unknown) => {
                console.error(`Something went wrong with confirmation modals`, err);
              });
          });
        }
      })
      .catch((err: unknown) => {
        console.error(`Something went wrong with confirmation modals`, err);
      });
  }

  async requestRestartApplication(recipeId: string, modelId: string): Promise<void> {
    const recipe = this.catalogManager.getRecipeById(recipeId);

    // get the state of the application
    const state = this.applicationManager
      .getApplicationsState()
      .find(state => state.recipeId === recipeId && state.modelId === modelId);
    if (!state) throw new Error('application is not running.');

    // get the corresponding connection
    const connection = await this.podmanConnection.getConnectionByEngineId(state.pod.engineId);

    // Do not wait on the promise as the api would probably timeout before the user answer.
    podmanDesktopApi.window
      .showWarningMessage(
        `Restart the AI App "${recipe.name}"? This will delete the containers running the application and model, rebuild the images with the current sources, and restart the containers.`,
        'Confirm',
        'Cancel',
      )
      .then((result: string | undefined) => {
        if (result === 'Confirm') {
          this.applicationManager.restartApplication(connection, recipeId, modelId).catch((err: unknown) => {
            console.error(`error restarting AI App: ${String(err)}`);
            podmanDesktopApi.window
              .showErrorMessage(`Error restarting the AI App "${recipe.name}"`)
              .catch((err: unknown) => {
                console.error(`Something went wrong with confirmation modals`, err);
              });
          });
        }
      })
      .catch((err: unknown) => {
        console.error(`Something went wrong with confirmation modals`, err);
      });
  }

  async requestOpenApplication(recipeId: string, modelId: string): Promise<void> {
    const recipe = this.catalogManager.getRecipeById(recipeId);
    this.applicationManager
      .getApplicationPorts(recipeId, modelId)
      .then((ports: number[]) => {
        if (ports.length === 0) {
          podmanDesktopApi.window
            .showErrorMessage(`AI App ${recipe.name} has no application ports to open`)
            .catch((err: unknown) => {
              console.error(`Something went wrong with confirmation modals`, err);
            });
        } else if (ports.length === 1) {
          const uri = `http://localhost:${ports[0]}`;
          podmanDesktopApi.env.openExternal(podmanDesktopApi.Uri.parse(uri)).catch((err: unknown) => {
            console.error(`Something went wrong while opening ${uri}`, err);
          });
        } else {
          podmanDesktopApi.window
            .showQuickPick(
              ports.map(p => {
                const item: PortQuickPickItem = { port: p, label: `${p}`, description: `Port ${p}` };
                return item;
              }),
              { placeHolder: 'Select the port to open' },
            )
            .then((selectedPort: PortQuickPickItem | undefined) => {
              if (!selectedPort) return;
              const uri = `http://localhost:${selectedPort.port}`;
              podmanDesktopApi.env.openExternal(podmanDesktopApi.Uri.parse(uri)).catch((err: unknown) => {
                console.error(`Something went wrong while opening ${uri}`, err);
              });
            })
            .catch((err: unknown) => {
              console.error(`Something went wrong with confirmation modals`, err);
            });
        }
      })
      .catch((err: unknown) => {
        console.error(`error opening AI App: ${String(err)}`);
        podmanDesktopApi.window.showErrorMessage(`Error opening the AI App "${recipe.name}"`).catch((err: unknown) => {
          console.error(`Something went wrong with confirmation modals`, err);
        });
      });
  }

  async telemetryLogUsage(eventName: string, data?: Record<string, unknown>): Promise<void> {
    this.telemetry.logUsage(eventName, data);
  }

  async telemetryLogError(eventName: string, data?: Record<string, unknown>): Promise<void> {
    this.telemetry.logError(eventName, data);
  }

  async getLocalRepositories(): Promise<LocalRepository[]> {
    return this.localRepositories.getLocalRepositories();
  }

  async getTasks(): Promise<Task[]> {
    return this.taskRegistry.getTasks();
  }

  async openVSCode(directory: string, recipeId?: string): Promise<void> {
    const telemetry: Record<string, unknown> = {
      'recipe.id': recipeId,
    };

    try {
      if (!path.isAbsolute(directory)) {
        throw new Error('Do not support relative directory.');
      }

      let unixPath: string = path.normalize(directory).replace(/[\\/]+/g, '/');
      if (!unixPath.startsWith('/')) {
        unixPath = `/${unixPath}`;
      }

      await podmanDesktopApi.env.openExternal(
        podmanDesktopApi.Uri.file(unixPath).with({ scheme: 'vscode', authority: 'file' }),
      );
    } catch (err) {
      telemetry['errorMessage'] = String(err);
      console.error('Something went wrong while trying to open VSCode', err);
      throw err;
    } finally {
      this.telemetry.logUsage('studio.open-vscode', telemetry);
    }
  }

  async downloadModel(modelId: string): Promise<void> {
    const modelInfo: ModelInfo = this.modelsManager.getModelInfo(modelId);

    // Do not wait for the download task as it is too long.
    this.modelsManager.requestDownloadModel(modelInfo).catch((err: unknown) => {
      console.error(`Something went wrong while trying to download the model ${modelId}`, err);
    });
  }

  getHostFreePort(): Promise<number> {
    return getFreeRandomPort('0.0.0.0');
  }

  async requestDeleteLocalRepository(path: string): Promise<void> {
    // Do not wait on the promise as the api would probably timeout before the user answer.
    podmanDesktopApi.window
      .showWarningMessage(`Delete permanently "${path}"?`, 'Confirm', 'Cancel')
      .then((result: string | undefined) => {
        if (result === 'Confirm') {
          this.localRepositories.deleteLocalRepository(path).catch((err: unknown) => {
            console.error(`error deleting path: ${String(err)}`);
            podmanDesktopApi.window
              .showErrorMessage(`Error deleting local path "${path}". Error: ${String(err)}`)
              .catch((err: unknown) => {
                console.error(`Something went wrong with confirmation modals`, err);
              });
          });
        }
      })
      .catch((err: unknown) => {
        console.error(`Something went wrong with confirmation modals`, err);
      });
  }

  async requestCancelToken(tokenId: number): Promise<void> {
    if (!this.cancellationTokenRegistry.hasCancellationTokenSource(tokenId))
      throw new Error(`Cancellation token with id ${tokenId} does not exist.`);
    this.cancellationTokenRegistry.getCancellationTokenSource(tokenId)?.cancel();
  }

  async importModels(models: LocalModelImportInfo[]): Promise<void> {
    return this.catalogManager.importUserModels(models);
  }

  async validateLocalModel(model: LocalModelImportInfo): Promise<void> {
    const catalogModels = await this.getModelsInfo();

    for (const catalogModel of catalogModels) {
      if (!catalogModel.file) {
        continue;
      }

      if (catalogModel.file.path === path.dirname(model.path) && catalogModel.file.file === path.basename(model.path)) {
        throw new Error('file already imported');
      }
    }
  }

  copyToClipboard(content: string): Promise<void> {
    return podmanDesktopApi.env.clipboard.writeText(content);
  }

  async checkContainerConnectionStatusAndResources(
    options: CheckContainerConnectionResourcesOptions,
  ): Promise<ContainerConnectionInfo> {
    return this.podmanConnection.checkContainerConnectionStatusAndResources(options);
  }
}
