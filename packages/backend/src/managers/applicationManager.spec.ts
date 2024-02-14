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
import { type MockInstance, describe, expect, test, vi, beforeEach } from 'vitest';
import type { ContainerAttachedInfo, ImageInfo, ApplicationPodInfo } from './applicationManager';
import { LABEL_RECIPE_ID, ApplicationManager } from './applicationManager';
import type { RecipeStatusRegistry } from '../registries/RecipeStatusRegistry';
import type { GitManager } from './gitManager';
import os from 'os';
import fs from 'node:fs';
import type { Recipe } from '@shared/src/models/IRecipe';
import type { ModelInfo } from '@shared/src/models/IModelInfo';
import { RecipeStatusUtils } from '../utils/recipeStatusUtils';
import { ModelsManager } from './modelsManager';
import path from 'node:path';
import type { AIConfig, ContainerConfig } from '../models/AIConfig';
import * as portsUtils from '../utils/ports';
import { goarch } from '../utils/arch';
import * as utils from '../utils/utils';
import type { Webview, TelemetryLogger, PodInfo } from '@podman-desktop/api';
import type { CatalogManager } from './catalogManager';
import type {
  PodmanConnection,
  machineStopHandle,
  podRemoveHandle,
  podStartHandle,
  podStopHandle,
  startupHandle,
} from './podmanConnection';
import type { LocalRepositoryRegistry } from '../registries/LocalRepositoryRegistry';
import { TaskRegistry } from '../registries/TaskRegistry';

const mocks = vi.hoisted(() => {
  return {
    parseYamlFileMock: vi.fn(),
    buildImageMock: vi.fn(),
    listImagesMock: vi.fn(),
    getImageInspectMock: vi.fn(),
    createPodMock: vi.fn(),
    createContainerMock: vi.fn(),
    replicatePodmanContainerMock: vi.fn(),
    startContainerMock: vi.fn(),
    startPod: vi.fn(),
    deleteContainerMock: vi.fn(),
    inspectContainerMock: vi.fn(),
    logUsageMock: vi.fn(),
    logErrorMock: vi.fn(),
    registerLocalRepositoryMock: vi.fn(),
    postMessageMock: vi.fn(),
    getContainerConnectionsMock: vi.fn(),
    pullImageMock: vi.fn(),
    stopContainerMock: vi.fn(),
    getFreePortMock: vi.fn(),
    containerRegistrySubscribeMock: vi.fn(),
    onPodStartMock: vi.fn(),
    onPodStopMock: vi.fn(),
    onPodRemoveMock: vi.fn(),
    startupSubscribeMock: vi.fn(),
    onMachineStopMock: vi.fn(),
    listContainersMock: vi.fn(),
    listPodsMock: vi.fn(),
    stopPodMock: vi.fn(),
    removePodMock: vi.fn(),
    performDownloadMock: vi.fn(),
    onEventDownloadMock: vi.fn(),
  };
});
vi.mock('../models/AIConfig', () => ({
  parseYamlFile: mocks.parseYamlFileMock,
}));

vi.mock('../utils/downloader', () => ({
  Downloader: class {
    onEvent = mocks.onEventDownloadMock;
    perform = mocks.performDownloadMock;
  },
}));

vi.mock('@podman-desktop/api', () => ({
  provider: {
    getContainerConnections: mocks.getContainerConnectionsMock,
  },
  containerEngine: {
    buildImage: mocks.buildImageMock,
    listImages: mocks.listImagesMock,
    getImageInspect: mocks.getImageInspectMock,
    createPod: mocks.createPodMock,
    createContainer: mocks.createContainerMock,
    replicatePodmanContainer: mocks.replicatePodmanContainerMock,
    startContainer: mocks.startContainerMock,
    startPod: mocks.startPod,
    deleteContainer: mocks.deleteContainerMock,
    inspectContainer: mocks.inspectContainerMock,
    pullImage: mocks.pullImageMock,
    stopContainer: mocks.stopContainerMock,
    listContainers: mocks.listContainersMock,
    listPods: mocks.listPodsMock,
    stopPod: mocks.stopPodMock,
    removePod: mocks.removePodMock,
  },
}));

let setTaskMock: MockInstance;
let taskUtils: RecipeStatusUtils;
let setTaskStateMock: MockInstance;
let setTaskErrorMock: MockInstance;

const telemetryLogger = {
  logUsage: mocks.logUsageMock,
  logError: mocks.logErrorMock,
} as unknown as TelemetryLogger;

const localRepositoryRegistry = {
  register: mocks.registerLocalRepositoryMock,
} as unknown as LocalRepositoryRegistry;

beforeEach(() => {
  vi.resetAllMocks();
  taskUtils = new RecipeStatusUtils('recipe', {
    setStatus: vi.fn(),
  } as unknown as RecipeStatusRegistry);
  setTaskMock = vi.spyOn(taskUtils, 'setTask');
  setTaskStateMock = vi.spyOn(taskUtils, 'setTaskState');
  setTaskErrorMock = vi.spyOn(taskUtils, 'setTaskError');
});
describe('pullApplication', () => {
  interface mockForPullApplicationOptions {
    recipeFolderExists: boolean;
  }
  const setStatusMock = vi.fn();
  const cloneRepositoryMock = vi.fn();
  let manager: ApplicationManager;
  let modelsManager: ModelsManager;
  vi.spyOn(utils, 'timeout').mockResolvedValue();
  function mockForPullApplication(options: mockForPullApplicationOptions) {
    vi.spyOn(os, 'homedir').mockReturnValue('/home/user');
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
    vi.spyOn(fs, 'existsSync').mockImplementation((path: string) => {
      if (path.endsWith('recipe1')) {
        return options.recipeFolderExists;
      } else if (path.endsWith('ai-studio.yaml')) {
        return true;
      } else if (path.endsWith('contextdir1')) {
        return true;
      }
      return false;
    });
    vi.spyOn(fs, 'statSync').mockImplementation((path: string) => {
      if (path.endsWith('recipe1')) {
        const stat = new fs.Stats();
        stat.isDirectory = () => true;
        return stat;
      } else if (path.endsWith('ai-studio.yaml')) {
        const stat = new fs.Stats();
        stat.isDirectory = () => false;
        return stat;
      }
    });
    vi.spyOn(fs, 'readFileSync').mockImplementation((_path: string) => {
      return '';
    });
    mocks.parseYamlFileMock.mockReturnValue({
      application: {
        containers: [
          {
            name: 'container1',
            contextdir: 'contextdir1',
            containerfile: 'Containerfile',
            arch: [goarch()],
            gpu_env: [],
          },
        ],
      },
    });
    mocks.inspectContainerMock.mockResolvedValue({
      State: {
        Running: true,
      },
    });
    mocks.buildImageMock.mockResolvedValue(undefined);
    mocks.listImagesMock.mockResolvedValue([
      {
        RepoTags: ['container1:latest'],
        engineId: 'engine',
        Id: 'id1',
      },
    ]);
    mocks.getImageInspectMock.mockResolvedValue({
      Config: {
        ExposedPorts: {
          '8080': '8080',
        },
      },
    });
    mocks.createPodMock.mockResolvedValue({
      engineId: 'engine',
      Id: 'id',
    });
    mocks.createContainerMock.mockResolvedValue({
      id: 'id',
    });
    modelsManager = new ModelsManager(
      'appdir',
      {} as Webview,
      {
        getModels(): ModelInfo[] {
          return [];
        },
      } as CatalogManager,
      telemetryLogger,
      new TaskRegistry({ postMessage: vi.fn().mockResolvedValue(undefined) } as unknown as Webview),
    );
    manager = new ApplicationManager(
      '/home/user/aistudio',
      {
        cloneRepository: cloneRepositoryMock,
      } as unknown as GitManager,
      {
        setStatus: setStatusMock,
      } as unknown as RecipeStatusRegistry,
      {} as Webview,
      {} as PodmanConnection,
      {} as CatalogManager,
      modelsManager,
      telemetryLogger,
      localRepositoryRegistry,
    );
  }
  test('pullApplication should clone repository and call downloadModelMain and buildImage', async () => {
    mockForPullApplication({
      recipeFolderExists: false,
    });
    vi.spyOn(modelsManager, 'isModelOnDisk').mockReturnValue(false);
    mocks.performDownloadMock.mockResolvedValue('path');
    const recipe: Recipe = {
      id: 'recipe1',
      name: 'Recipe 1',
      categories: [],
      description: '',
      ref: '000000',
      readme: '',
      repository: 'repo',
    };
    const model: ModelInfo = {
      id: 'model1',
      description: '',
      hw: '',
      license: '',
      name: 'Model 1',
      popularity: 1,
      registry: '',
      url: '',
    };
    mocks.inspectContainerMock.mockResolvedValue({
      State: {
        Running: true,
      },
    });
    vi.spyOn(utils, 'getDurationSecondsSince').mockReturnValue(99);
    await manager.pullApplication(recipe, model);
    const gitCloneOptions = {
      repository: 'repo',
      ref: '000000',
      targetDirectory: '\\home\\user\\aistudio\\recipe1',
    };
    if (process.platform === 'win32') {
      expect(cloneRepositoryMock).toHaveBeenNthCalledWith(1, gitCloneOptions);
    } else {
      gitCloneOptions.targetDirectory = '/home/user/aistudio/recipe1';
      expect(cloneRepositoryMock).toHaveBeenNthCalledWith(1, gitCloneOptions);
    }
    expect(mocks.performDownloadMock).toHaveBeenCalledOnce();
    expect(mocks.buildImageMock).toHaveBeenCalledOnce();
    expect(mocks.buildImageMock).toHaveBeenCalledWith(
      `${gitCloneOptions.targetDirectory}${path.sep}contextdir1`,
      expect.anything(),
      {
        containerFile: 'Containerfile',
        tag: 'container1:latest',
        labels: {
          [LABEL_RECIPE_ID]: 'recipe1',
        },
      },
    );
    expect(mocks.logUsageMock).toHaveBeenNthCalledWith(1, 'recipe.pull', {
      'recipe.id': 'recipe1',
      'recipe.name': 'Recipe 1',
      durationSeconds: 99,
    });
  });
  test('pullApplication should not clone repository if folder already exists locally', async () => {
    mockForPullApplication({
      recipeFolderExists: true,
    });
    vi.spyOn(modelsManager, 'isModelOnDisk').mockReturnValue(false);
    mocks.performDownloadMock.mockResolvedValue('path');
    const recipe: Recipe = {
      id: 'recipe1',
      name: 'Recipe 1',
      categories: [],
      description: '',
      ref: '000000',
      readme: '',
      repository: 'repo',
    };
    const model: ModelInfo = {
      id: 'model1',
      description: '',
      hw: '',
      license: '',
      name: 'Model 1',
      popularity: 1,
      registry: '',
      url: '',
    };
    await manager.pullApplication(recipe, model);
    expect(cloneRepositoryMock).not.toHaveBeenCalled();
  });
  test('pullApplication should not download model if already on disk', async () => {
    mockForPullApplication({
      recipeFolderExists: true,
    });
    vi.spyOn(modelsManager, 'isModelOnDisk').mockReturnValue(true);
    vi.spyOn(modelsManager, 'getLocalModelPath').mockReturnValue('path');
    const recipe: Recipe = {
      id: 'recipe1',
      name: 'Recipe 1',
      categories: [],
      ref: '000000',
      description: '',
      readme: '',
      repository: 'repo',
    };
    const model: ModelInfo = {
      id: 'model1',
      description: '',
      hw: '',
      license: '',
      name: 'Model 1',
      popularity: 1,
      registry: '',
      url: '',
    };
    await manager.pullApplication(recipe, model);
    expect(cloneRepositoryMock).not.toHaveBeenCalled();
    expect(mocks.performDownloadMock).not.toHaveBeenCalled();
  });

  test('pullApplication should mark the loading config as error if not container are found', async () => {
    mockForPullApplication({
      recipeFolderExists: true,
    });

    const recipe: Recipe = {
      id: 'recipe1',
      name: 'Recipe 1',
      categories: [],
      description: '',
      ref: '000000',
      readme: '',
      repository: 'repo',
    };
    const model: ModelInfo = {
      id: 'model1',
      description: '',
      hw: '',
      license: '',
      name: 'Model 1',
      popularity: 1,
      registry: '',
      url: '',
    };

    mocks.parseYamlFileMock.mockReturnValue({
      application: {
        containers: [],
      },
    });

    await expect(manager.pullApplication(recipe, model)).rejects.toThrowError('No containers available.');

    expect(cloneRepositoryMock).not.toHaveBeenCalled();
    expect(mocks.performDownloadMock).not.toHaveBeenCalled();
  });
});
describe('doCheckout', () => {
  test('clone repo if not present locally', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'mkdirSync');
    const cloneRepositoryMock = vi.fn();
    const manager = new ApplicationManager(
      '/home/user/aistudio',
      {
        cloneRepository: cloneRepositoryMock,
      } as unknown as GitManager,
      {} as unknown as RecipeStatusRegistry,
      {} as Webview,
      {} as PodmanConnection,
      {} as CatalogManager,
      {} as unknown as ModelsManager,
      telemetryLogger,
      localRepositoryRegistry,
    );
    const gitCloneOptions = {
      repository: 'repo',
      ref: '000000',
      targetDirectory: 'folder',
    };
    await manager.doCheckout(gitCloneOptions, taskUtils);

    expect(cloneRepositoryMock).toBeCalledWith(gitCloneOptions);
    expect(setTaskMock).toHaveBeenLastCalledWith({
      id: 'checkout',
      name: 'Checkout repository',
      state: 'success',
      labels: {
        git: 'checkout',
      },
    });
  });
  test('do not clone repo if already present locally', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const stats = {
      isDirectory: vi.fn().mockReturnValue(true),
    } as unknown as fs.Stats;
    vi.spyOn(fs, 'statSync').mockReturnValue(stats);
    const mkdirSyncMock = vi.spyOn(fs, 'mkdirSync');
    const cloneRepositoryMock = vi.fn();
    const manager = new ApplicationManager(
      '/home/user/aistudio',
      {
        cloneRepository: cloneRepositoryMock,
      } as unknown as GitManager,
      {} as unknown as RecipeStatusRegistry,
      {} as Webview,
      {} as PodmanConnection,
      {} as CatalogManager,
      {} as unknown as ModelsManager,
      telemetryLogger,
      localRepositoryRegistry,
    );
    await manager.doCheckout(
      {
        repository: 'repo',
        ref: '000000',
        targetDirectory: 'folder',
      },
      taskUtils,
    );
    expect(mkdirSyncMock).not.toHaveBeenCalled();
    expect(cloneRepositoryMock).not.toHaveBeenCalled();
    expect(setTaskMock).toHaveBeenLastCalledWith({
      id: 'checkout',
      name: 'Checkout repository (cached).',
      state: 'success',
      labels: {
        git: 'checkout',
      },
    });
  });
});

describe('getConfiguration', () => {
  test('throws error if config file do not exists', async () => {
    const manager = new ApplicationManager(
      '/home/user/aistudio',
      {} as unknown as GitManager,
      {} as unknown as RecipeStatusRegistry,
      {} as Webview,
      {} as PodmanConnection,
      {} as CatalogManager,
      {} as unknown as ModelsManager,
      telemetryLogger,
      localRepositoryRegistry,
    );
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    expect(() => manager.getConfiguration('config', 'local')).toThrowError(
      `The file located at ${path.join('local', 'config')} does not exist.`,
    );
  });

  test('return AIConfigFile', async () => {
    const manager = new ApplicationManager(
      '/home/user/aistudio',
      {} as unknown as GitManager,
      {} as unknown as RecipeStatusRegistry,
      {} as Webview,
      {} as PodmanConnection,
      {} as CatalogManager,
      {} as unknown as ModelsManager,
      telemetryLogger,
      localRepositoryRegistry,
    );
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const stats = {
      isDirectory: vi.fn().mockReturnValue(false),
    } as unknown as fs.Stats;
    vi.spyOn(fs, 'statSync').mockReturnValue(stats);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('');
    const aiConfig = {
      application: {
        containers: [
          {
            name: 'container1',
            contextdir: 'contextdir1',
            containerfile: 'Containerfile',
          },
        ],
      },
    };
    mocks.parseYamlFileMock.mockReturnValue(aiConfig);

    const result = manager.getConfiguration('config', 'local');
    expect(result.path).toEqual(path.join('local', 'config'));
    expect(result.aiConfig).toEqual(aiConfig);
  });
});

describe('filterContainers', () => {
  test('return empty array when no container fit the system', () => {
    const aiConfig: AIConfig = {
      application: {
        containers: [
          {
            name: 'container2',
            contextdir: 'contextdir2',
            containerfile: 'Containerfile',
            arch: ['arm64'],
            modelService: false,
            gpu_env: [],
          },
        ],
      },
    };
    Object.defineProperty(process, 'arch', {
      value: 'amd64',
    });
    const manager = new ApplicationManager(
      '/home/user/aistudio',
      {} as unknown as GitManager,
      {} as unknown as RecipeStatusRegistry,
      {} as Webview,
      {} as PodmanConnection,
      {} as CatalogManager,
      {} as unknown as ModelsManager,
      telemetryLogger,
      localRepositoryRegistry,
    );
    const containers = manager.filterContainers(aiConfig);
    expect(containers.length).toBe(0);
  });
  test('return one container when only one fit the system', () => {
    const aiConfig: AIConfig = {
      application: {
        containers: [
          {
            name: 'container1',
            contextdir: 'contextdir1',
            containerfile: 'Containerfile',
            arch: ['amd64'],
            modelService: false,
            gpu_env: [],
          },
          {
            name: 'container2',
            contextdir: 'contextdir2',
            containerfile: 'Containerfile',
            arch: ['arm64'],
            modelService: false,
            gpu_env: [],
          },
        ],
      },
    };
    Object.defineProperty(process, 'arch', {
      value: 'amd64',
    });
    const manager = new ApplicationManager(
      '/home/user/aistudio',
      {} as unknown as GitManager,
      {} as unknown as RecipeStatusRegistry,
      {} as Webview,
      {} as PodmanConnection,
      {} as CatalogManager,
      {} as unknown as ModelsManager,
      telemetryLogger,
      localRepositoryRegistry,
    );
    const containers = manager.filterContainers(aiConfig);
    expect(containers.length).toBe(1);
    expect(containers[0].name).equal('container1');
  });
  test('return 2 containers when two fit the system', () => {
    const containerConfig: ContainerConfig[] = [
      {
        name: 'container1',
        contextdir: 'contextdir1',
        containerfile: 'Containerfile',
        arch: ['amd64'],
        modelService: false,
        gpu_env: [],
      },
      {
        name: 'container2',
        contextdir: 'contextdir2',
        containerfile: 'Containerfile',
        arch: ['arm64'],
        modelService: false,
        gpu_env: [],
      },
      {
        name: 'container3',
        contextdir: 'contextdir3',
        containerfile: 'Containerfile',
        arch: ['amd64'],
        modelService: false,
        gpu_env: [],
      },
    ];
    const aiConfig: AIConfig = {
      application: {
        containers: containerConfig,
      },
    };
    Object.defineProperty(process, 'arch', {
      value: 'amd64',
    });
    const manager = new ApplicationManager(
      '/home/user/aistudio',
      {} as unknown as GitManager,
      {} as unknown as RecipeStatusRegistry,
      {} as Webview,
      {} as PodmanConnection,
      {} as CatalogManager,
      {} as unknown as ModelsManager,
      telemetryLogger,
      localRepositoryRegistry,
    );
    const containers = manager.filterContainers(aiConfig);
    expect(containers.length).toBe(2);
    expect(containers[0].name).equal('container1');
    expect(containers[1].name).equal('container3');
  });
});

describe('getRandomName', () => {
  test('return base name plus random string', () => {
    const manager = new ApplicationManager(
      '/home/user/aistudio',
      {} as unknown as GitManager,
      {} as unknown as RecipeStatusRegistry,
      {} as Webview,
      {} as PodmanConnection,
      {} as CatalogManager,
      {} as unknown as ModelsManager,
      telemetryLogger,
      localRepositoryRegistry,
    );
    const randomName = manager.getRandomName('base');
    expect(randomName).not.equal('base');
    expect(randomName.length).toBeGreaterThan(4);
  });
  test('return random string when base is empty', () => {
    const manager = new ApplicationManager(
      '/home/user/aistudio',
      {} as unknown as GitManager,
      {} as unknown as RecipeStatusRegistry,
      {} as Webview,
      {} as PodmanConnection,
      {} as CatalogManager,
      {} as unknown as ModelsManager,
      telemetryLogger,
      localRepositoryRegistry,
    );
    const randomName = manager.getRandomName('');
    expect(randomName.length).toBeGreaterThan(0);
  });
});

describe('buildImages', () => {
  const containers: ContainerConfig[] = [
    {
      name: 'container1',
      contextdir: 'contextdir1',
      containerfile: 'Containerfile',
      arch: ['amd64'],
      modelService: false,
      gpu_env: [],
    },
  ];
  const manager = new ApplicationManager(
    '/home/user/aistudio',
    {} as unknown as GitManager,
    {} as unknown as RecipeStatusRegistry,
    {} as Webview,
    {} as PodmanConnection,
    {} as CatalogManager,
    {} as unknown as ModelsManager,
    telemetryLogger,
    localRepositoryRegistry,
  );
  test('setTaskState should be called with error if context does not exist', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    mocks.listImagesMock.mockRejectedValue([]);
    await expect(manager.buildImages(containers, 'config', taskUtils)).rejects.toThrow(
      'Context configured does not exist.',
    );
  });
  test('setTaskState should be called with error if buildImage executon fails', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    mocks.buildImageMock.mockRejectedValue('error');
    mocks.listImagesMock.mockRejectedValue([]);
    await expect(manager.buildImages(containers, 'config', taskUtils)).rejects.toThrow(
      'Something went wrong while building the image: error',
    );
    expect(setTaskErrorMock).toBeCalledWith('container1', 'Something went wrong while building the image: error');
  });
  test('setTaskState should be called with error if unable to find the image after built', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    mocks.buildImageMock.mockResolvedValue({});
    mocks.listImagesMock.mockResolvedValue([]);
    await expect(manager.buildImages(containers, 'config', taskUtils)).rejects.toThrow(
      'no image found for container1:latest',
    );
    expect(setTaskErrorMock).toBeCalledWith('container1', 'no image found');
  });
  test('succeed if building image do not fail', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    mocks.buildImageMock.mockResolvedValue({});
    mocks.listImagesMock.mockResolvedValue([
      {
        RepoTags: ['container1:latest'],
        engineId: 'engine',
        Id: 'id1',
      },
    ]);
    mocks.getImageInspectMock.mockResolvedValue({
      Config: {
        ExposedPorts: {
          '8080': '8080',
        },
      },
    });
    const imageInfoList = await manager.buildImages(containers, 'config', taskUtils);
    expect(setTaskStateMock).toBeCalledWith('container1', 'success');
    expect(imageInfoList.length).toBe(1);
    expect(imageInfoList[0].ports.length).toBe(1);
    expect(imageInfoList[0].ports[0]).equals('8080');
  });
});

describe('createPod', async () => {
  const imageInfo1: ImageInfo = {
    id: 'id',
    appName: 'appName',
    modelService: false,
    ports: ['8080'],
  };
  const imageInfo2: ImageInfo = {
    id: 'id2',
    appName: 'appName2',
    modelService: true,
    ports: ['8082'],
  };
  const manager = new ApplicationManager(
    '/home/user/aistudio',
    {} as unknown as GitManager,
    {} as unknown as RecipeStatusRegistry,
    {} as Webview,
    {} as PodmanConnection,
    {} as CatalogManager,
    {} as unknown as ModelsManager,
    telemetryLogger,
    localRepositoryRegistry,
  );
  test('throw an error if there is no sample image', async () => {
    const images = [imageInfo2];
    await expect(
      manager.createPod({ id: 'recipe-id' } as Recipe, { id: 'model-id' } as ModelInfo, images),
    ).rejects.toThrowError('no sample app found');
  });
  test('call createPod with sample app exposed port', async () => {
    const images = [imageInfo1, imageInfo2];
    vi.spyOn(manager, 'getRandomName').mockReturnValue('name');
    vi.spyOn(portsUtils, 'getPortsInfo').mockResolvedValue('9000');
    mocks.createPodMock.mockResolvedValue({
      Id: 'podId',
      engineId: 'engineId',
    });
    await manager.createPod({ id: 'recipe-id' } as Recipe, { id: 'model-id' } as ModelInfo, images);
    expect(mocks.createPodMock).toBeCalledWith({
      name: 'name',
      portmappings: [
        {
          container_port: 8080,
          host_port: 9000,
          host_ip: '',
          protocol: '',
          range: 1,
        },
        {
          container_port: 8082,
          host_port: 9000,
          host_ip: '',
          protocol: '',
          range: 1,
        },
      ],
      labels: {
        'ai-studio-recipe-id': 'recipe-id',
        'ai-studio-model-id': 'model-id',
      },
    });
  });
});

describe('createApplicationPod', () => {
  const imageInfo1: ImageInfo = {
    id: 'id',
    appName: 'appName',
    modelService: false,
    ports: ['8080'],
  };
  const imageInfo2: ImageInfo = {
    id: 'id2',
    appName: 'appName2',
    modelService: true,
    ports: ['8082'],
  };
  const manager = new ApplicationManager(
    '/home/user/aistudio',
    {} as unknown as GitManager,
    {} as unknown as RecipeStatusRegistry,
    {} as Webview,
    {} as PodmanConnection,
    {} as CatalogManager,
    {} as unknown as ModelsManager,
    telemetryLogger,
    localRepositoryRegistry,
  );
  const images = [imageInfo1, imageInfo2];
  test('throw if createPod fails', async () => {
    vi.spyOn(manager, 'createPod').mockRejectedValue('error createPod');
    await expect(
      manager.createApplicationPod(
        { id: 'recipe-id' } as Recipe,
        { id: 'model-id' } as ModelInfo,
        images,
        'path',
        taskUtils,
      ),
    ).rejects.toThrowError('error createPod');
    expect(setTaskMock).toBeCalledWith({
      error: 'Something went wrong while creating pod: error createPod',
      id: 'fake-pod-id',
      state: 'error',
      name: 'Creating application',
    });
  });
  test('call createAndAddContainersToPod after pod is created', async () => {
    const pod: ApplicationPodInfo = {
      engineId: 'engine',
      Id: 'id',
      portmappings: [],
    };
    vi.spyOn(manager, 'createPod').mockResolvedValue(pod);
    const createAndAddContainersToPodMock = vi
      .spyOn(manager, 'createAndAddContainersToPod')
      .mockImplementation((_pod: ApplicationPodInfo, _images: ImageInfo[], _modelPath: string) => Promise.resolve([]));
    await manager.createApplicationPod(
      { id: 'recipe-id' } as Recipe,
      { id: 'model-id' } as ModelInfo,
      images,
      'path',
      taskUtils,
    );
    expect(createAndAddContainersToPodMock).toBeCalledWith(pod, images, 'path');
    expect(setTaskMock).toBeCalledWith({
      id: 'id',
      state: 'success',
      name: 'Creating application',
    });
  });
  test('throw if createAndAddContainersToPod fails', async () => {
    const pod: ApplicationPodInfo = {
      engineId: 'engine',
      Id: 'id',
      portmappings: [],
    };
    vi.spyOn(manager, 'createPod').mockResolvedValue(pod);
    vi.spyOn(manager, 'createAndAddContainersToPod').mockRejectedValue('error');
    await expect(() =>
      manager.createApplicationPod(
        { id: 'recipe-id' } as Recipe,
        { id: 'model-id' } as ModelInfo,
        images,
        'path',
        taskUtils,
      ),
    ).rejects.toThrowError('error');
    expect(setTaskMock).toHaveBeenLastCalledWith({
      id: 'id',
      state: 'error',
      error: 'Something went wrong while creating pod: error',
      name: 'Creating application',
    });
  });
});

describe('restartContainerWhenModelServiceIsUp', () => {
  const containerAttachedInfo: ContainerAttachedInfo = {
    name: 'name',
    modelService: false,
    ports: ['9000'],
  };
  const manager = new ApplicationManager(
    '/home/user/aistudio',
    {} as unknown as GitManager,
    {} as unknown as RecipeStatusRegistry,
    {} as Webview,
    {} as PodmanConnection,
    {} as CatalogManager,
    {} as unknown as ModelsManager,
    telemetryLogger,
    localRepositoryRegistry,
  );
  test('restart container if endpoint is alive', async () => {
    mocks.inspectContainerMock.mockResolvedValue({
      State: {
        Running: false,
      },
    });
    vi.spyOn(utils, 'isEndpointAlive').mockResolvedValue(true);
    await manager.restartContainerWhenModelServiceIsUp('engine', 'endpoint', containerAttachedInfo);
    expect(mocks.startContainerMock).toBeCalledWith('engine', 'name');
  });
});

describe('runApplication', () => {
  const manager = new ApplicationManager(
    '/home/user/aistudio',
    {} as unknown as GitManager,
    {} as unknown as RecipeStatusRegistry,
    {} as Webview,
    {} as PodmanConnection,
    {} as CatalogManager,
    {} as unknown as ModelsManager,
    telemetryLogger,
    localRepositoryRegistry,
  );
  const pod: ApplicationPodInfo = {
    engineId: 'engine',
    Id: 'id',
    containers: [
      {
        name: 'first',
        modelService: false,
        ports: ['8080'],
      },
      {
        name: 'second',
        modelService: true,
        ports: ['9000'],
      },
    ],
    portmappings: [
      {
        container_port: 9000,
        host_port: 9001,
        host_ip: '',
        protocol: '',
        range: -1,
      },
    ],
  };
  test('check startPod is called and also restartContainerWhenEndpointIsUp for sample app', async () => {
    const restartContainerWhenEndpointIsUpMock = vi
      .spyOn(manager, 'restartContainerWhenModelServiceIsUp')
      .mockImplementation((_engineId: string, _modelEndpoint: string, _container: ContainerAttachedInfo) =>
        Promise.resolve(),
      );
    vi.spyOn(utils, 'timeout').mockResolvedValue();
    await manager.runApplication(pod, taskUtils);
    expect(mocks.startPod).toBeCalledWith(pod.engineId, pod.Id);
    expect(restartContainerWhenEndpointIsUpMock).toBeCalledWith(pod.engineId, 'http://localhost:9001', {
      name: 'first',
      modelService: false,
      ports: ['8080'],
    });
  });
});

describe('createAndAddContainersToPod', () => {
  const manager = new ApplicationManager(
    '/home/user/aistudio',
    {} as unknown as GitManager,
    {} as unknown as RecipeStatusRegistry,
    {} as Webview,
    {} as PodmanConnection,
    {} as CatalogManager,
    {} as unknown as ModelsManager,
    telemetryLogger,
    localRepositoryRegistry,
  );
  const pod: ApplicationPodInfo = {
    engineId: 'engine',
    Id: 'id',
    portmappings: [],
  };
  const imageInfo1: ImageInfo = {
    id: 'id',
    appName: 'appName',
    modelService: false,
    ports: ['8080'],
  };
  test('check that after the creation and copy inside the pod, the container outside the pod is actually deleted', async () => {
    mocks.createContainerMock.mockResolvedValue({
      id: 'container-1',
    });
    vi.spyOn(manager, 'getRandomName').mockReturnValue('name');
    await manager.createAndAddContainersToPod(pod, [imageInfo1], 'path');
    expect(mocks.createContainerMock).toBeCalledWith('engine', {
      Image: 'id',
      Detach: true,
      HostConfig: {
        AutoRemove: true,
      },
      Env: [],
      start: false,
    });
    expect(mocks.replicatePodmanContainerMock).toBeCalledWith(
      {
        id: 'container-1',
        engineId: 'engine',
      },
      {
        engineId: 'engine',
      },
      {
        pod: 'id',
        name: 'name',
      },
    );
    expect(mocks.deleteContainerMock).toBeCalledWith('engine', 'container-1');
  });
});

describe('pod detection', async () => {
  let manager: ApplicationManager;

  beforeEach(() => {
    vi.resetAllMocks();

    manager = new ApplicationManager(
      '/path/to/user/dir',
      {} as GitManager,
      {
        setStatus: vi.fn(),
      } as unknown as RecipeStatusRegistry,
      {
        postMessage: mocks.postMessageMock,
      } as unknown as Webview,
      {
        onPodStart: mocks.onPodStartMock,
        onPodStop: mocks.onPodStopMock,
        onPodRemove: mocks.onPodRemoveMock,
        startupSubscribe: mocks.startupSubscribeMock,
        onMachineStop: mocks.onMachineStopMock,
      } as unknown as PodmanConnection,
      {} as CatalogManager,
      {} as ModelsManager,
      {} as TelemetryLogger,
      localRepositoryRegistry,
    );
  });

  test('adoptRunningEnvironments updates the environment state with the found pod', async () => {
    mocks.listPodsMock.mockResolvedValue([
      {
        Labels: {
          'ai-studio-recipe-id': 'recipe-id-1',
        },
      },
    ]);
    mocks.startupSubscribeMock.mockImplementation((f: startupHandle) => {
      f();
    });
    const updateEnvironmentStateSpy = vi.spyOn(manager, 'updateEnvironmentState');
    manager.adoptRunningEnvironments();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(updateEnvironmentStateSpy).toHaveBeenNthCalledWith(1, 'recipe-id-1', {
      pod: {
        Labels: {
          'ai-studio-recipe-id': 'recipe-id-1',
        },
      },
      recipeId: 'recipe-id-1',
    });
  });

  test('adoptRunningEnvironments does not update the environment state with the found pod without label', async () => {
    mocks.listPodsMock.mockResolvedValue([{}]);
    mocks.startupSubscribeMock.mockImplementation((f: startupHandle) => {
      f();
    });
    const updateEnvironmentStateSpy = vi.spyOn(manager, 'updateEnvironmentState');
    manager.adoptRunningEnvironments();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(updateEnvironmentStateSpy).not.toHaveBeenCalled();
  });

  test('onMachineStop updates the environments state with no environment running', async () => {
    mocks.listPodsMock.mockResolvedValue([]);
    mocks.onMachineStopMock.mockImplementation((f: machineStopHandle) => {
      f();
    });
    const sendEnvironmentStateSpy = vi.spyOn(manager, 'sendEnvironmentState').mockResolvedValue();
    manager.adoptRunningEnvironments();
    expect(sendEnvironmentStateSpy).toHaveBeenCalledOnce();
  });

  test('onPodStart updates the environments state with the started pod', async () => {
    mocks.listPodsMock.mockResolvedValue([]);
    mocks.onMachineStopMock.mockImplementation((_f: machineStopHandle) => {});
    mocks.onPodStartMock.mockImplementation((f: podStartHandle) => {
      f({
        engineId: 'engine-1',
        engineName: 'Engine 1',
        kind: 'podman',
        Labels: {
          'ai-studio-recipe-id': 'recipe-id-1',
        },
      } as unknown as PodInfo);
    });
    const sendEnvironmentStateSpy = vi.spyOn(manager, 'sendEnvironmentState').mockResolvedValue();
    manager.adoptRunningEnvironments();
    expect(sendEnvironmentStateSpy).toHaveBeenCalledOnce();
  });

  test('onPodStart does no update the environments state with the started pod without labels', async () => {
    mocks.listPodsMock.mockResolvedValue([]);
    mocks.onMachineStopMock.mockImplementation((_f: machineStopHandle) => {});
    mocks.onPodStartMock.mockImplementation((f: podStartHandle) => {
      f({
        engineId: 'engine-1',
        engineName: 'Engine 1',
        kind: 'podman',
      } as unknown as PodInfo);
    });
    const sendEnvironmentStateSpy = vi.spyOn(manager, 'sendEnvironmentState').mockResolvedValue();
    manager.adoptRunningEnvironments();
    expect(sendEnvironmentStateSpy).not.toHaveBeenCalledOnce();
  });

  test('onPodStop updates the environments state by removing the stopped pod', async () => {
    mocks.startupSubscribeMock.mockImplementation((f: startupHandle) => {
      f();
    });
    mocks.listPodsMock.mockResolvedValue([
      {
        Labels: {
          'ai-studio-recipe-id': 'recipe-id-1',
        },
      },
    ]);
    mocks.onMachineStopMock.mockImplementation((_f: machineStopHandle) => {});
    mocks.onPodStopMock.mockImplementation((f: podStopHandle) => {
      setTimeout(() => {
        f({
          engineId: 'engine-1',
          engineName: 'Engine 1',
          kind: 'podman',
          Labels: {
            'ai-studio-recipe-id': 'recipe-id-1',
          },
        } as unknown as PodInfo);
      }, 1);
    });
    const sendEnvironmentStateSpy = vi.spyOn(manager, 'sendEnvironmentState').mockResolvedValue();
    manager.adoptRunningEnvironments();
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(sendEnvironmentStateSpy).toHaveBeenCalledTimes(2);
  });

  test('onPodRemove updates the environments state by removing the removed pod', async () => {
    mocks.startupSubscribeMock.mockImplementation((f: startupHandle) => {
      f();
    });
    mocks.listPodsMock.mockResolvedValue([
      {
        Id: 'pod-id-1',
        Labels: {
          'ai-studio-recipe-id': 'recipe-id-1',
        },
      },
    ]);
    mocks.onMachineStopMock.mockImplementation((_f: machineStopHandle) => {});
    mocks.onPodRemoveMock.mockImplementation((f: podRemoveHandle) => {
      setTimeout(() => {
        f('pod-id-1');
      }, 1);
    });
    const sendEnvironmentStateSpy = vi.spyOn(manager, 'sendEnvironmentState').mockResolvedValue();
    manager.adoptRunningEnvironments();
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(sendEnvironmentStateSpy).toHaveBeenCalledTimes(2);
  });

  test('getEnvironmentPod', async () => {
    mocks.listPodsMock.mockResolvedValue([
      {
        Labels: {
          'ai-studio-recipe-id': 'recipe-id-1',
        },
      },
      {
        Labels: {
          'ai-studio-recipe-id': 'recipe-id-2',
        },
      },
    ]);
    const result = await manager.getEnvironmentPod('recipe-id-1');
    expect(result).toEqual({
      Labels: {
        'ai-studio-recipe-id': 'recipe-id-1',
      },
    });
  });

  test('deleteEnvironment calls stopPod and removePod', async () => {
    mocks.listPodsMock.mockResolvedValue([
      {
        engineId: 'engine-1',
        Id: 'pod-1',
        Labels: {
          'ai-studio-recipe-id': 'recipe-id-1',
        },
      },
      {
        engineId: 'engine-2',
        Id: 'pod-2',
        Labels: {
          'ai-studio-recipe-id': 'recipe-id-2',
        },
      },
    ]);
    await manager.deleteEnvironment('recipe-id-1');
    expect(mocks.stopPodMock).toHaveBeenCalledWith('engine-1', 'pod-1');
    expect(mocks.removePodMock).toHaveBeenCalledWith('engine-1', 'pod-1');
  });

  test('deleteEnvironment calls stopPod and removePod even if stopPod fails because pod already stopped', async () => {
    mocks.listPodsMock.mockResolvedValue([
      {
        engineId: 'engine-1',
        Id: 'pod-1',
        Labels: {
          'ai-studio-recipe-id': 'recipe-id-1',
        },
      },
      {
        engineId: 'engine-2',
        Id: 'pod-2',
        Labels: {
          'ai-studio-recipe-id': 'recipe-id-2',
        },
      },
    ]);
    mocks.stopPodMock.mockRejectedValue('something went wrong, pod already stopped...');
    await manager.deleteEnvironment('recipe-id-1');
    expect(mocks.stopPodMock).toHaveBeenCalledWith('engine-1', 'pod-1');
    expect(mocks.removePodMock).toHaveBeenCalledWith('engine-1', 'pod-1');
  });
});
