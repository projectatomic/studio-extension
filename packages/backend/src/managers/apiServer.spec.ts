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

/* eslint-disable sonarjs/no-nested-functions */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ApiServer, PREFERENCE_RANDOM_PORT } from './apiServer';
import request from 'supertest';
import type * as podmanDesktopApi from '@podman-desktop/api';
import path from 'node:path';
import type { Server } from 'node:http';
import type { ModelsManager } from './modelsManager';
import type { EventEmitter } from 'node:events';
import { once } from 'node:events';
import type { ConfigurationRegistry } from '../registries/ConfigurationRegistry';
import type { AddressInfo } from 'node:net';
import type { CatalogManager } from './catalogManager';
import type { Downloader } from '../utils/downloader';
import type { ProgressEvent } from '../models/baseEvent';
import type { InferenceManager } from './inference/inferenceManager';
import type { ContainerHealthy, ContainerRegistry } from '../registries/ContainerRegistry';
import type { InferenceServer } from '@shared/src/models/IInference';
import OpenAI from 'openai';
import type { ChatCompletion, ChatCompletionChunk } from 'openai/resources';
import { Stream } from 'openai/streaming';

vi.mock('openai', () => {
  const OpenAI = vi.fn();
  OpenAI.prototype = {
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  };
  return { default: OpenAI };
});

class TestApiServer extends ApiServer {
  public override getListener(): Server | undefined {
    return super.getListener();
  }
}

const extensionContext = {} as unknown as podmanDesktopApi.ExtensionContext;

let server: TestApiServer;

const modelsManager = {
  getModelsInfo: vi.fn(),
  isModelOnDisk: vi.fn(),
  createDownloader: vi.fn(),
} as unknown as ModelsManager;

const catalogManager = {
  getModelByName: vi.fn(),
} as unknown as CatalogManager;

const inferenceManager = {
  getServers: vi.fn(),
  createInferenceServer: vi.fn(),
  startInferenceServer: vi.fn(),
} as unknown as InferenceManager;

const configurationRegistry = {
  getExtensionConfiguration: () => {
    return {
      apiPort: PREFERENCE_RANDOM_PORT,
    };
  },
} as unknown as ConfigurationRegistry;

const containerRegistry = {
  onHealthyContainerEvent: vi.fn(),
} as unknown as ContainerRegistry;

beforeEach(async () => {
  vi.clearAllMocks();
  server = new TestApiServer(
    extensionContext,
    modelsManager,
    catalogManager,
    inferenceManager,
    configurationRegistry,
    containerRegistry,
  );
  vi.spyOn(server, 'displayApiInfo').mockReturnValue();
  vi.spyOn(server, 'getSpecFile').mockReturnValue(path.join(__dirname, '../../../../api/openapi.yaml'));
  vi.spyOn(server, 'getPackageFile').mockReturnValue(path.join(__dirname, '../../../../package.json'));
  await server.init();
  await new Promise(resolve => setTimeout(resolve, 0)); // wait for random port to be set
});

afterEach(async () => {
  server.dispose();
  await once(server.getListener() as EventEmitter, 'close');
});

test('/spec endpoint', async () => {
  expect(server.getListener()).toBeDefined();
  const res = await request(server.getListener()!)
    .get('/spec')
    .expect(200)
    .expect('Content-Type', 'application/yaml; charset=utf-8');
  expect(res.text).toMatch(/^openapi:/);
});

test('/spec endpoint when spec file is not found', async () => {
  expect(server.getListener()).toBeDefined();
  vi.spyOn(server, 'getSpecFile').mockReturnValue(path.join(__dirname, '../../../../api/openapi-notfound.yaml'));
  const res = await request(server.getListener()!).get('/spec').expect(500);
  expect(res.body.message).toEqual('unable to get spec');
});

test('/spec endpoint when getting spec file fails', async () => {
  expect(server.getListener()).toBeDefined();
  vi.spyOn(server, 'getSpecFile').mockImplementation(() => {
    throw new Error('an error getting spec file');
  });
  const res = await request(server.getListener()!).get('/spec').expect(500);
  expect(res.body.message).toEqual('unable to get spec');
  expect(res.body.errors[0]).toEqual('an error getting spec file');
});

test('/api/version endpoint', async () => {
  expect(server.getListener()).toBeDefined();
  const res = await request(server.getListener()!)
    .get('/api/version')
    .expect(200)
    .expect('Content-Type', 'application/json; charset=utf-8');
  expect(res.body.version).toBeDefined();
});

test('/api/version endpoint when package.json file is not found', async () => {
  expect(server.getListener()).toBeDefined();
  vi.spyOn(server, 'getPackageFile').mockReturnValue(path.join(__dirname, '../../../../package-notfound.json'));
  const res = await request(server.getListener()!).get('/api/version').expect(500);
  expect(res.body.message).toEqual('unable to get version');
});

test('/api/version endpoint when getting package.json file fails', async () => {
  expect(server.getListener()).toBeDefined();
  vi.spyOn(server, 'getPackageFile').mockImplementation(() => {
    throw new Error('an error getting package file');
  });
  const res = await request(server.getListener()!).get('/api/version').expect(500);
  expect(res.body.message).toEqual('unable to get version');
  expect(res.body.errors[0]).toEqual('an error getting package file');
});

test('/api/version endpoint with unexpected param', async () => {
  expect(server.getListener()).toBeDefined();
  const res = await request(server.getListener()!).get('/api/version?wrongParam').expect(400);
  expect(res.body.message).toEqual(`Unknown query parameter 'wrongParam'`);
});

test('/api/wrongEndpoint', async () => {
  expect(server.getListener()).toBeDefined();
  const res = await request(server.getListener()!).get('/api/wrongEndpoint').expect(404);
  expect(res.body.message).toEqual('not found');
});

test('/', async () => {
  expect(server.getListener()).toBeDefined();
  await request(server.getListener()!).get('/').expect(200);
});

test('/api/tags', async () => {
  expect(server.getListener()).toBeDefined();
  vi.mocked(modelsManager.getModelsInfo).mockReturnValue([]);
  await request(server.getListener()!).get('/api/tags').expect(200);
});

test('/api/tags returns error', async () => {
  expect(server.getListener()).toBeDefined();
  vi.mocked(modelsManager.getModelsInfo).mockRejectedValue({});
  const res = await request(server.getListener()!).get('/api/tags').expect(500);
  expect(res.body.message).toEqual('unable to get models');
});

test('verify listening on localhost', async () => {
  expect(server.getListener()).toBeDefined();
  expect((server.getListener()?.address() as AddressInfo).address).toEqual('127.0.0.1');
});

test('/api/pull returns an error if no body is passed', async () => {
  expect(server.getListener()).toBeDefined();
  await request(server.getListener()!).post('/api/pull').expect(415);
});

describe.each([undefined, true, false])('/api/pull endpoint, stream is %o', stream => {
  test('/api/pull returns an error if the model is not known', async () => {
    expect(server.getListener()).toBeDefined();
    vi.mocked(catalogManager.getModelByName).mockImplementation(() => {
      throw new Error('model unknown');
    });
    const req = request(server.getListener()!).post('/api/pull').send({ model: 'unknown-model-name', stream });
    if (stream === false) {
      const res = await req.expect(500).expect('Content-Type', 'application/json; charset=utf-8');
      expect(res.body.error).toEqual('pull model manifest: file does not exist');
    } else {
      const res = await req.expect(200);
      const lines = res.text.split('\n');
      expect(lines.length).toEqual(3);
      expect(lines[0]).toEqual('{"status":"pulling manifest"}');
      expect(lines[1]).toEqual('{"error":"pull model manifest: file does not exist"}');
      expect(lines[2]).toEqual('');
    }
  });

  test('/api/pull returns success if model already downloaded', async () => {
    expect(server.getListener()).toBeDefined();
    vi.mocked(catalogManager.getModelByName).mockReturnValue({
      id: 'modelId',
      name: 'model-name',
      description: 'a description',
    });
    vi.mocked(modelsManager.isModelOnDisk).mockReturnValue(true);
    const req = request(server.getListener()!).post('/api/pull').send({ model: 'model-name', stream });
    if (stream === false) {
      const res = await req.expect(200).expect('Content-Type', 'application/json; charset=utf-8');
      expect(res.body.status).toEqual('success');
    } else {
      const res = await req.expect(200).expect('transfer-encoding', 'chunked');
      const lines = res.text.split('\n');
      expect(lines.length).toEqual(3);
      expect(lines[0]).toEqual('{"status":"pulling manifest"}');
      expect(lines[1]).toEqual('{"status":"success"}');
      expect(lines[2]).toEqual('');
    }
  });

  test('/api/pull downloads model and returns success', async () => {
    expect(server.getListener()).toBeDefined();
    vi.mocked(catalogManager.getModelByName).mockReturnValue({
      id: 'modelId',
      name: 'model-name',
      description: 'a description',
      sha256: '123456',
    });
    vi.mocked(modelsManager.isModelOnDisk).mockReturnValue(false);
    vi.mocked(modelsManager.createDownloader).mockReturnValue({
      perform: async (_name: string) => {},
      onEvent: (listener: (e: ProgressEvent) => void) => {
        listener({
          status: 'progress',
          id: 'model-name',
          total: 100000,
          value: 100000,
        });
      },
    } as unknown as Downloader);
    const req = request(server.getListener()!).post('/api/pull').send({ model: 'model-name', stream });
    if (stream === false) {
      const res = await req.expect(200).expect('Content-Type', 'application/json; charset=utf-8');
      expect(res.body.status).toEqual('success');
    } else {
      const res = await req.expect(200).expect('transfer-encoding', 'chunked');
      const lines = res.text.split('\n');
      expect(lines.length).toEqual(4);
      expect(lines[0]).toEqual('{"status":"pulling manifest"}');
      expect(lines[1]).toEqual(
        '{"status":"pulling 123456","digest":"sha256:123456","total":100000,"completed":100000000}',
      );
      expect(lines[2]).toEqual('{"status":"success"}');
      expect(lines[3]).toEqual('');
    }
  });

  test('/api/pull should return an error if an error occurs during download', async () => {
    expect(server.getListener()).toBeDefined();
    vi.mocked(catalogManager.getModelByName).mockReturnValue({
      id: 'modelId',
      name: 'model-name',
      description: 'a description',
      sha256: '123456',
    });
    vi.mocked(modelsManager.isModelOnDisk).mockReturnValue(false);
    vi.mocked(modelsManager.createDownloader).mockReturnValue({
      perform: async (_name: string) => {
        await new Promise(resolve => setTimeout(resolve, 0)); // wait for random port to be set
        throw new Error('an error');
      },
      onEvent: (listener: (e: ProgressEvent) => void) => {
        listener({
          status: 'progress',
          id: 'model-name',
          total: 100000,
          value: 100000,
        });
      },
    } as unknown as Downloader);
    const req = request(server.getListener()!).post('/api/pull').send({ model: 'model-name', stream });
    if (stream === false) {
      const res = await req.expect(500).expect('Content-Type', 'application/json; charset=utf-8');
      expect(res.body.error).toEqual('Error: an error');
    } else {
      const res = await req.expect(200).expect('transfer-encoding', 'chunked');
      const lines = res.text.split('\n');
      expect(lines.length).toEqual(4);
      expect(lines[0]).toEqual('{"status":"pulling manifest"}');
      expect(lines[1]).toEqual(
        '{"status":"pulling 123456","digest":"sha256:123456","total":100000,"completed":100000000}',
      );
      expect(lines[2]).toEqual('{"error":"Error: an error"}');
      expect(lines[3]).toEqual('');
    }
  });
});

describe.each([undefined, true, false])('stream is %o', stream => {
  describe.each(['/api/chat', '/api/generate'])('%o endpoint', endpoint => {
    test('returns an error if the model is not known', async () => {
      expect(server.getListener()).toBeDefined();
      vi.mocked(catalogManager.getModelByName).mockImplementation(() => {
        throw new Error('model unknown');
      });
      const req = request(server.getListener()!).post(endpoint).send({ model: 'unknown-model-name', stream });
      if (stream === false) {
        const res = await req.expect(500).expect('Content-Type', 'application/json; charset=utf-8');
        expect(res.body.error).toEqual('chat: model "unknown-model-name" does not exist');
      } else {
        const res = await req.expect(200);
        const lines = res.text.split('\n');
        expect(lines.length).toEqual(2);
        expect(lines[0]).toEqual('{"error":"chat: model \\"unknown-model-name\\" does not exist"}');
        expect(lines[1]).toEqual('');
      }
    });

    test('returns an error if model is not downloaded', async () => {
      expect(server.getListener()).toBeDefined();
      vi.mocked(catalogManager.getModelByName).mockReturnValue({
        id: 'modelId',
        name: 'model-name',
        description: 'a description',
      });
      vi.mocked(modelsManager.isModelOnDisk).mockReturnValue(false);
      const req = request(server.getListener()!).post(endpoint).send({ model: 'model-name', stream });
      if (stream === false) {
        const res = await req.expect(500).expect('Content-Type', 'application/json; charset=utf-8');
        expect(res.body.error).toEqual('chat: model "model-name" not found, try pulling it first');
      } else {
        const res = await req.expect(200).expect('transfer-encoding', 'chunked');
        const lines = res.text.split('\n');
        expect(lines.length).toEqual(2);
        expect(lines[0]).toEqual('{"error":"chat: model \\"model-name\\" not found, try pulling it first"}');
        expect(lines[1]).toEqual('');
      }
    });
  });

  describe('the model is available', () => {
    const onHealthyContainerEventEmptyCallback = (): podmanDesktopApi.Disposable => {
      return {
        dispose: vi.fn(),
      };
    };

    const onHealthyContainerEventNonEmptyCallback = (
      fn: (e: ContainerHealthy) => void,
    ): podmanDesktopApi.Disposable => {
      setTimeout(
        () =>
          fn({
            id: 'container1',
          }),
        100,
      );
      return {
        dispose: vi.fn(),
      };
    };

    beforeEach(() => {
      expect(server.getListener()).toBeDefined();
      vi.mocked(catalogManager.getModelByName).mockReturnValue({
        id: 'modelId1',
        name: 'model-name',
        description: 'a description',
        file: {
          file: 'a-file-name',
          path: '/path/to/model-file',
        },
      });
      vi.mocked(modelsManager.isModelOnDisk).mockReturnValue(true);
    });

    describe('the service is initially not created', async () => {
      beforeEach(async () => {
        vi.mocked(inferenceManager.getServers).mockReturnValueOnce([]);
      });

      describe('the created service is immediately healthy', () => {
        beforeEach(() => {
          vi.mocked(inferenceManager.createInferenceServer).mockImplementation(async () => {
            vi.mocked(inferenceManager.getServers).mockReturnValueOnce([
              {
                models: [
                  {
                    id: 'modelId1',
                    name: 'model-name',
                    description: 'model 1',
                  },
                ],
                container: {
                  engineId: 'engine1',
                  containerId: 'container1',
                },
                status: 'running',
                health: {
                  Status: 'healthy',
                },
              } as unknown as InferenceServer,
            ]);
            vi.mocked(containerRegistry.onHealthyContainerEvent).mockImplementation(
              onHealthyContainerEventEmptyCallback,
            );
            return 'container1';
          });
        });

        test('/api/generate creates the service and returns that the model is loaded', async () => {
          const req = request(server.getListener()!).post('/api/generate').send({ model: 'model-name', stream });
          if (stream === false) {
            const res = await req.expect(200).expect('Content-Type', 'application/json; charset=utf-8');
            expect(res.body).toEqual({ model: 'model-name', response: '', done: true, done_reason: 'load' });
          } else {
            const res = await req.expect(200).expect('transfer-encoding', 'chunked');
            const lines = res.text.split('\n');
            expect(lines.length).toEqual(2);
            expect(lines[0]).toEqual('{"model":"model-name","response":"","done":true,"done_reason":"load"}');
            expect(lines[1]).toEqual('');
          }
          expect(containerRegistry.onHealthyContainerEvent).toHaveBeenCalledOnce();
          expect(inferenceManager.createInferenceServer).toHaveBeenCalledOnce();
        });
      });

      describe('the created service is eventually healthy', () => {
        beforeEach(() => {
          vi.mocked(inferenceManager.createInferenceServer).mockImplementation(async () => {
            vi.mocked(inferenceManager.getServers).mockReturnValueOnce([
              {
                models: [
                  {
                    id: 'modelId1',
                    name: 'model-name',
                    description: 'model 1',
                  },
                ],
                container: {
                  engineId: 'engine1',
                  containerId: 'container1',
                },
                status: 'starting',
              } as unknown as InferenceServer,
            ]);
            vi.mocked(containerRegistry.onHealthyContainerEvent).mockImplementation(
              onHealthyContainerEventNonEmptyCallback,
            );
            return 'container1';
          });
        });

        test('/api/generate creates the service and returns that the model is loaded', async () => {
          const req = request(server.getListener()!).post('/api/generate').send({ model: 'model-name', stream });
          if (stream === false) {
            const res = await req.expect(200).expect('Content-Type', 'application/json; charset=utf-8');
            expect(res.body).toEqual({ model: 'model-name', response: '', done: true, done_reason: 'load' });
          } else {
            const res = await req.expect(200).expect('transfer-encoding', 'chunked');
            const lines = res.text.split('\n');
            expect(lines.length).toEqual(2);
            expect(lines[0]).toEqual('{"model":"model-name","response":"","done":true,"done_reason":"load"}');
            expect(lines[1]).toEqual('');
          }
          expect(containerRegistry.onHealthyContainerEvent).toHaveBeenCalledOnce();
          expect(inferenceManager.createInferenceServer).toHaveBeenCalledOnce();
        });
      });
    });

    describe('the service is initially created but not started', async () => {
      beforeEach(async () => {
        vi.mocked(inferenceManager.getServers).mockReturnValueOnce([
          {
            models: [
              {
                id: 'modelId1',
                name: 'model-name',
                description: 'model 1',
              },
            ],
            container: {
              engineId: 'engine1',
              containerId: 'container1',
            },
            status: 'stopped',
          } as unknown as InferenceServer,
        ]);
      });

      describe('the started service is immediately healthy', () => {
        beforeEach(() => {
          vi.mocked(inferenceManager.startInferenceServer).mockImplementation(async () => {
            vi.mocked(inferenceManager.getServers).mockReturnValueOnce([
              {
                models: [
                  {
                    id: 'modelId1',
                    name: 'model-name',
                    description: 'model 1',
                  },
                ],
                container: {
                  engineId: 'engine1',
                  containerId: 'container1',
                },
                status: 'running',
                health: {
                  Status: 'healthy',
                },
              } as unknown as InferenceServer,
            ]);
            vi.mocked(containerRegistry.onHealthyContainerEvent).mockImplementation(
              onHealthyContainerEventEmptyCallback,
            );
          });
        });

        test('/api/generate starts the service and returns that the model is loaded', async () => {
          const req = request(server.getListener()!).post('/api/generate').send({ model: 'model-name', stream });
          if (stream === false) {
            const res = await req.expect(200).expect('Content-Type', 'application/json; charset=utf-8');
            expect(res.body).toEqual({ model: 'model-name', response: '', done: true, done_reason: 'load' });
          } else {
            const res = await req.expect(200).expect('transfer-encoding', 'chunked');
            const lines = res.text.split('\n');
            expect(lines.length).toEqual(2);
            expect(lines[0]).toEqual('{"model":"model-name","response":"","done":true,"done_reason":"load"}');
            expect(lines[1]).toEqual('');
          }
          expect(containerRegistry.onHealthyContainerEvent).toHaveBeenCalledOnce();
          expect(inferenceManager.startInferenceServer).toHaveBeenCalledOnce();
        });
      });

      describe('the started service is eventually healthy', () => {
        beforeEach(() => {
          vi.mocked(inferenceManager.startInferenceServer).mockImplementation(async () => {
            vi.mocked(inferenceManager.getServers).mockReturnValueOnce([
              {
                models: [
                  {
                    id: 'modelId1',
                    name: 'model-name',
                    description: 'model 1',
                  },
                ],
                container: {
                  engineId: 'engine1',
                  containerId: 'container1',
                },
                status: 'starting',
              } as unknown as InferenceServer,
            ]);
            vi.mocked(containerRegistry.onHealthyContainerEvent).mockImplementation(
              onHealthyContainerEventNonEmptyCallback,
            );
          });
        });

        test('/api/generate starts the service and returns that the model is loaded', async () => {
          const req = request(server.getListener()!).post('/api/generate').send({ model: 'model-name', stream });
          if (stream === false) {
            const res = await req.expect(200).expect('Content-Type', 'application/json; charset=utf-8');
            expect(res.body).toEqual({ model: 'model-name', response: '', done: true, done_reason: 'load' });
          } else {
            const res = await req.expect(200).expect('transfer-encoding', 'chunked');
            const lines = res.text.split('\n');
            expect(lines.length).toEqual(2);
            expect(lines[0]).toEqual('{"model":"model-name","response":"","done":true,"done_reason":"load"}');
            expect(lines[1]).toEqual('');
          }
          expect(containerRegistry.onHealthyContainerEvent).toHaveBeenCalledOnce();
          expect(inferenceManager.startInferenceServer).toHaveBeenCalledOnce();
        });
      });
    });

    describe('the service is running', async () => {
      beforeEach(async () => {
        vi.mocked(inferenceManager.getServers).mockReturnValue([
          {
            models: [
              {
                id: 'modelId1',
                name: 'model-name',
                description: 'model 1',
              },
            ],
            container: {
              engineId: 'engine1',
              containerId: 'container1',
            },
            status: 'running',
            health: {
              Status: 'healthy',
            },
            connection: {
              port: 8080,
            },
          } as unknown as InferenceServer,
        ]);
      });

      test('/api/generate returns that the model is loaded', async () => {
        const req = request(server.getListener()!).post('/api/generate').send({ model: 'model-name', stream });
        if (stream === false) {
          const res = await req.expect(200).expect('Content-Type', 'application/json; charset=utf-8');
          expect(res.body).toEqual({ model: 'model-name', response: '', done: true, done_reason: 'load' });
        } else {
          const res = await req.expect(200).expect('transfer-encoding', 'chunked');
          const lines = res.text.split('\n');
          expect(lines.length).toEqual(2);
          expect(lines[0]).toEqual('{"model":"model-name","response":"","done":true,"done_reason":"load"}');
          expect(lines[1]).toEqual('');
        }
      });

      describe.each([
        {
          endpoint: '/api/chat',
          query: {
            model: 'model-name',
            stream,
            messages: [
              {
                role: 'user',
                content: 'what is the question?',
              },
            ],
          },
          expectedNonStreamed: {
            model: 'model-name',
            message: { role: 'assistant', content: 'that is a good question' },
            done: true,
            done_reason: 'stop',
          },
          expectedStreamed: [
            '{"model":"model-name","message":{"role":"assistant","content":"that "},"done":false}',
            '{"model":"model-name","message":{"role":"assistant","content":"is "},"done":false}',
            '{"model":"model-name","message":{"role":"assistant","content":"a "},"done":false}',
            '{"model":"model-name","message":{"role":"assistant","content":"good "},"done":false}',
            '{"model":"model-name","message":{"role":"assistant","content":"question"},"done":false}',
            '{"model":"model-name","message":{"role":"assistant","content":"."},"done":true,"done_reason":"stop"}',
            '',
          ],
        },
        {
          endpoint: '/api/generate',
          query: { model: 'model-name', stream, prompt: 'what is the question?' },
          expectedNonStreamed: {
            model: 'model-name',
            response: 'that is a good question',
            done: true,
            done_reason: 'stop',
          },
          expectedStreamed: [
            '{"model":"model-name","response":"that ","done":false}',
            '{"model":"model-name","response":"is ","done":false}',
            '{"model":"model-name","response":"a ","done":false}',
            '{"model":"model-name","response":"good ","done":false}',
            '{"model":"model-name","response":"question","done":false}',
            '{"model":"model-name","response":".","done":true,"done_reason":"stop"}',
            '',
          ],
        },
      ])('%o endpoint', ({ endpoint, query, expectedNonStreamed, expectedStreamed }) => {
        test('calls the service and replies to the prompt', async () => {
          if (stream || stream === undefined) {
            const chunks = [
              {
                choices: [
                  {
                    delta: {
                      content: 'that ',
                    },
                  },
                ],
              },
              {
                choices: [
                  {
                    delta: {
                      content: 'is ',
                    },
                  },
                ],
              },
              {
                choices: [
                  {
                    delta: {
                      content: 'a ',
                    },
                  },
                ],
              },
              {
                choices: [
                  {
                    delta: {
                      content: 'good ',
                    },
                  },
                ],
              },
              {
                choices: [
                  {
                    delta: {
                      content: 'question',
                    },
                  },
                ],
              },
              {
                choices: [
                  {
                    delta: {
                      content: '.',
                    },
                    finish_reason: 'stop',
                  },
                ],
              },
            ] as ChatCompletionChunk[];
            const asyncIterator = (async function* (): AsyncGenerator<
              OpenAI.Chat.Completions.ChatCompletionChunk,
              void,
              unknown
            > {
              for (const chunk of chunks) {
                yield chunk;
              }
            })();
            const response = new Stream<ChatCompletionChunk>(() => asyncIterator, new AbortController());
            vi.mocked(OpenAI.prototype.chat.completions.create).mockResolvedValue(response);
          } else {
            vi.mocked(OpenAI.prototype.chat.completions.create).mockResolvedValue({
              id: 'id1',
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: 'that is a good question',
                  },
                },
              ],
            } as unknown as ChatCompletion);
          }
          const req = request(server.getListener()!).post(endpoint).send(query);
          if (stream === false) {
            const res = await req.expect(200).expect('Content-Type', 'application/json; charset=utf-8');
            expect(res.body).toEqual(expectedNonStreamed);
          } else {
            const res = await req.expect(200).expect('transfer-encoding', 'chunked');
            const lines = res.text.split('\n');
            expect(lines.length).toEqual(expectedStreamed.length);
            for (const [i, line] of lines.entries()) {
              expect(line).toEqual(expectedStreamed[i]);
            }
          }
        });
      });
    });
  });
});
