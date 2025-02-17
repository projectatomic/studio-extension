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

import '@testing-library/jest-dom/vitest';
import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import StartInstructLabContainer from '/@/pages/instructlab/StartInstructLabContainer.svelte';
import { instructlabClient, studioClient } from '/@/utils/client';
import type { ContainerProviderConnectionInfo } from '@shared/src/models/IContainerConnectionInfo';
import { VMType } from '@shared/src/models/IPodman';
import userEvent from '@testing-library/user-event';
import * as tasks from '/@/stores/tasks';
import { writable } from 'svelte/store';

vi.mock('../../stores/tasks', async () => {
  return {
    tasks: vi.fn(),
  };
});

const getContainerConnectionInfoMock = vi.fn();

vi.mock('../../stores/containerProviderConnections', () => ({
  containerProviderConnections: {
    subscribe: (f: (msg: unknown) => void) => {
      f(getContainerConnectionInfoMock());
      return (): void => {};
    },
  },
}));

vi.mock('../../utils/client', async () => ({
  instructlabClient: {
    getInstructlabContainerId: vi.fn(),
    routeToInstructLabContainerTerminal: vi.fn().mockResolvedValue(undefined),
  },
  studioClient: {
    openURL: vi.fn().mockResolvedValue(true),
  },
  rpcBrowser: {
    subscribe: (): unknown => {
      return {
        unsubscribe: (): void => {},
      };
    },
  },
}));

const containerProviderConnection: ContainerProviderConnectionInfo = {
  name: 'Dummy container connection provider',
  status: 'started',
  type: 'podman',
  vmType: VMType.QEMU,
  providerId: 'podman',
};

beforeEach(() => {
  getContainerConnectionInfoMock.mockReturnValue([containerProviderConnection]);
  vi.mocked(tasks).tasks = writable([]);
});

test('start button should be displayed if no InstructLab container', async () => {
  render(StartInstructLabContainer);

  const startBtn = screen.getByTitle('Start InstructLab container');
  expect(startBtn).toBeDefined();
});

test('start button should be displayed and enabled', async () => {
  render(StartInstructLabContainer);

  const startBtn = screen.getByTitle('Start InstructLab container');
  expect(startBtn).toBeDefined();
  expect(startBtn).toBeEnabled();
});

test('open button should be displayed if no InstructLab container', async () => {
  vi.mocked(instructlabClient.getInstructlabContainerId).mockResolvedValue('containerId');
  render(StartInstructLabContainer);

  await vi.waitFor(() => {
    const openBtn = screen.getByTitle('Open InstructLab container');
    expect(openBtn).toBeDefined();
  });
});

test('click open button should redirect to InstructLab container', async () => {
  vi.mocked(instructlabClient.getInstructlabContainerId).mockResolvedValue('containerId');
  render(StartInstructLabContainer);

  const openBtn = await vi.waitFor(() => {
    const openBtn = screen.getByTitle('Open InstructLab container');
    expect(openBtn).toBeDefined();
    return openBtn;
  });

  await userEvent.click(openBtn);
  expect(instructlabClient.routeToInstructLabContainerTerminal).toHaveBeenCalledWith('containerId');
});

test('documentation button should be displayed and redirect to external link', async () => {
  render(StartInstructLabContainer);

  const docBtn = screen.getByTitle('Read documentation');
  expect(docBtn).toBeDefined();

  await userEvent.click(docBtn);
  expect(studioClient.openURL).toHaveBeenCalledWith('https://docs.instructlab.ai');
});
