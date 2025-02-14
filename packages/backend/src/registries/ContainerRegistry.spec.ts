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
import { beforeAll, expect, test, vi } from 'vitest';
import { ContainerRegistry } from './ContainerRegistry';
import { type ContainerJSONEvent, EventEmitter } from '@podman-desktop/api';
import { TestEventEmitter } from '../tests/utils';

const mocks = vi.hoisted(() => ({
  onEventMock: vi.fn(),
  DisposableCreateMock: vi.fn(),
}));

vi.mock('@podman-desktop/api', async () => {
  return {
    EventEmitter: vi.fn(),
    Disposable: {
      create: mocks.DisposableCreateMock,
    },
    containerEngine: {
      onEvent: mocks.onEventMock,
    },
  };
});

beforeAll(() => {
  vi.mocked(EventEmitter).mockImplementation(() => new TestEventEmitter() as unknown as EventEmitter<unknown>);
});

test('ContainerRegistry init', () => {
  const registry = new ContainerRegistry();
  registry.init();

  expect(mocks.onEventMock).toHaveBeenCalledOnce();
});

test('ContainerRegistry subscribe', () => {
  // Get the callback created by the ContainerRegistry
  let callback: ((event: ContainerJSONEvent) => void) | undefined;
  mocks.onEventMock.mockImplementation((method: (event: ContainerJSONEvent) => void) => {
    callback = method;
  });

  // Create the ContainerRegistry and init
  const registry = new ContainerRegistry();
  registry.init();

  // Let's create a dummy subscriber
  let subscribedStatus: undefined | string = undefined;
  registry.subscribe('random', (status: string) => {
    subscribedStatus = status;
  });

  if (!callback) throw new Error('undefined callback');

  // Generate a fake event
  callback({
    status: 'die',
    id: 'random',
    type: 'container',
  });

  expect(subscribedStatus).toBe('die');
  expect(mocks.DisposableCreateMock).toHaveBeenCalledOnce();
});

test('ContainerRegistry unsubscribe all if container remove', () => {
  // Get the callback created by the ContainerRegistry
  let callback: ((event: ContainerJSONEvent) => void) | undefined;
  mocks.onEventMock.mockImplementation((method: (event: ContainerJSONEvent) => void) => {
    callback = method;
  });

  // Create the ContainerRegistry and init
  const registry = new ContainerRegistry();
  registry.init();

  // Let's create a dummy subscriber
  const subscribeMock = vi.fn();
  registry.subscribe('random', subscribeMock);

  if (!callback) throw new Error('undefined callback');

  // Generate a remove event
  callback({ status: 'remove', id: 'random', type: 'container' });

  // Call it a second time
  callback({ status: 'remove', id: 'random', type: 'container' });

  // Our subscriber should only have been called once, the first, after it should have been removed.
  expect(subscribeMock).toHaveBeenCalledOnce();
});

test('ContainerRegistry subscriber disposed should not be called', () => {
  // Get the callback created by the ContainerRegistry
  let callback: ((event: ContainerJSONEvent) => void) | undefined;
  mocks.onEventMock.mockImplementation((method: (event: ContainerJSONEvent) => void) => {
    callback = method;
  });

  mocks.DisposableCreateMock.mockImplementation(callback => ({
    dispose: (): void => callback(),
  }));

  // Create the ContainerRegistry and init
  const registry = new ContainerRegistry();
  registry.init();

  // Let's create a dummy subscriber
  const subscribeMock = vi.fn();
  const disposable = registry.subscribe('random', subscribeMock);
  disposable.dispose();

  if (!callback) throw new Error('undefined callback');

  // Generate a random event
  callback({ status: 'die', id: 'random', type: 'container' });

  // never should have been called
  expect(subscribeMock).toHaveBeenCalledTimes(0);
});

test('ContainerRegistry should fire ContainerStart when container start', () => {
  // Get the callback created by the ContainerRegistry
  let callback: ((event: ContainerJSONEvent) => void) | undefined;
  mocks.onEventMock.mockImplementation((method: (event: ContainerJSONEvent) => void) => {
    callback = method;
  });

  // Create the ContainerRegistry and init
  const registry = new ContainerRegistry();
  registry.init();

  const startListenerMock = vi.fn();
  registry.onStartContainerEvent(startListenerMock);

  if (!callback) throw new Error('undefined callback');

  // Generate a remove event
  callback({ status: 'remove', id: 'random', type: 'container' });

  expect(startListenerMock).not.toHaveBeenCalled();

  // Call it a second time
  callback({ status: 'start', id: 'random', type: 'container' });

  // Our subscriber should only have been called once, the first, after it should have been removed.
  expect(startListenerMock).toHaveBeenCalledOnce();
});

test('ContainerRegistry should fire ContainerStop when container stop', () => {
  // Get the callback created by the ContainerRegistry
  let callback: ((event: ContainerJSONEvent) => void) | undefined;
  mocks.onEventMock.mockImplementation((method: (event: ContainerJSONEvent) => void) => {
    callback = method;
  });

  // Create the ContainerRegistry and init
  const registry = new ContainerRegistry();
  registry.init();

  const stopListenerMock = vi.fn();
  registry.onStopContainerEvent(stopListenerMock);

  if (!callback) throw new Error('undefined callback');

  // Generate a remove event
  callback({ status: 'remove', id: 'random', type: 'container' });

  expect(stopListenerMock).not.toHaveBeenCalled();

  // Call it a second time
  callback({ status: 'start', id: 'random', type: 'container' });

  // Our subscriber should only have been called once, the first, after it should have been removed.
  expect(stopListenerMock).not.toHaveBeenCalled();

  callback({ status: 'die', id: 'random', type: 'container' });

  // Our subscriber should only have been called once, the first, after it should have been removed.
  expect(stopListenerMock).toHaveBeenCalledOnce();
});
