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
import { vi, beforeEach, test, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import App from '/@/App.svelte';
import { getRouterState, rpcBrowser } from '/@/utils/client';
import { configuration } from '/@/stores/extensionConfiguration';
import { Messages } from '@shared/Messages';

vi.mock('tinro', () => ({
  router: {
    goto: vi.fn(),
    mode: {
      hash: vi.fn(),
    },
    location: {
      query: new Map(),
    },
  },
}));
// mock monaco
vi.mock('/@/lib/monaco-editor/MonacoEditor.svelte');

vi.mock('./stores/extensionConfiguration.ts', () => ({
  configuration: {
    subscribe: vi.fn(),
  },
}));

vi.mock('./utils/client', async () => ({
  studioClient: {
    getExtensionConfiguration: vi.fn(),
  },
  instructlabClient: {},
  rpcBrowser: {
    subscribe: vi.fn(),
  },
  getRouterState: vi.fn(),
  saveRouterState: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();

  vi.mocked(getRouterState).mockResolvedValue({ url: '/' });
  vi.mocked(rpcBrowser.subscribe).mockReturnValue({ unsubscribe: vi.fn() });
  vi.mocked(configuration.subscribe).mockReturnValue(vi.fn());
});

test('should subscribe to navigation update route on mount', async () => {
  render(App, {});

  await vi.waitFor(() => {
    expect(rpcBrowser.subscribe).toHaveBeenCalledWith(Messages.MSG_NAVIGATION_ROUTE_UPDATE, expect.any(Function));
  });
});
