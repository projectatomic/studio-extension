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
import { vi, test, expect, beforeEach, beforeAll } from 'vitest';
import { screen, render } from '@testing-library/svelte';
import { findLocalRepositoryByRecipeId } from '/@/utils/localRepositoriesUtils';
import RecipeCard from './RecipeCard.svelte';
import { writable, type Writable } from 'svelte/store';
import type { LocalRepository } from '@shared/src/models/ILocalRepository';
import { localRepositories } from '../stores/localRepositories';

vi.mock('/@/utils/localRepositoriesUtils', () => ({
  findLocalRepositoryByRecipeId: vi.fn(),
}));

vi.mock('../stores/localRepositories', () => ({
  localRepositories: {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  },
}));

vi.mock('../utils/client', async () => {
  return {
    studioClient: {},
  };
});

const mockLocalRepositories: Writable<LocalRepository[]> = writable([]);

const recipe = {
  id: 'recipe 1',
  name: 'Recipe 1',
  readme: 'readme 1',
  categories: [],
  recommended: ['model1', 'model2'],
  description: 'description 1',
  repository: 'repo 1',
};

class ResizeObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

beforeAll(() => {
  Object.defineProperty(window, 'ResizeObserver', { value: ResizeObserver });
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(localRepositories).subscribe.mockImplementation(run => mockLocalRepositories.subscribe(run));
});

test('recipe name and description', async () => {
  // eslint-disable-next-line sonarjs/publicly-writable-directories
  vi.mocked(findLocalRepositoryByRecipeId).mockReturnValue({ path: 'recipe1', sourcePath: '/tmp/recipe1', labels: {} });
  render(RecipeCard, {
    recipe,
  });

  const name = screen.queryByLabelText('Recipe 1 name');
  expect(name).toBeInTheDocument();

  const description = screen.queryByLabelText('Recipe 1 description');
  expect(description).toBeInTheDocument();

  const reference = screen.queryByLabelText('Recipe 1 ref');
  expect(reference).not.toBeInTheDocument();
});

test('recipe name, description and reference', async () => {
  // eslint-disable-next-line sonarjs/publicly-writable-directories
  vi.mocked(findLocalRepositoryByRecipeId).mockReturnValue({ path: 'recipe1', sourcePath: '/tmp/recipe1', labels: {} });
  render(RecipeCard, {
    recipe: { ...recipe, ref: 'myref' },
  });

  const name = screen.queryByLabelText('Recipe 1 name');
  expect(name).toBeInTheDocument();

  const description = screen.queryByLabelText('Recipe 1 description');
  expect(description).toBeInTheDocument();

  const reference = screen.queryByLabelText('Recipe 1 ref');
  expect(reference).toBeInTheDocument();
});
