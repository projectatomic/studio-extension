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
import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeAll, beforeEach, expect, test, vi } from 'vitest';
import type { ApplicationCatalog } from '@shared/src/models/IApplicationCatalog';
import * as catalogStore from '/@/stores/catalog';
import { readable } from 'svelte/store';
import Recipes from '/@/pages/Recipes.svelte';
import { studioClient } from '../utils/client';

vi.mock('/@/stores/catalog', async () => {
  return {
    catalog: vi.fn(),
  };
});

vi.mock('../utils/client', async () => ({
  studioClient: {
    filterRecipes: vi.fn(),
  },
}));

vi.mock('../stores/localRepositories', () => ({
  localRepositories: {
    subscribe: (f: (msg: unknown) => void) => {
      f([]);
      return (): void => {};
    },
  },
}));

const recipes = [
  {
    id: 'recipe1',
    name: 'Recipe 1',
    recommended: ['model1'],
    categories: [],
    description: 'Recipe 1',
    readme: '',
    repository: 'https://recipe-1',
  },
  {
    id: 'recipe2',
    name: 'Recipe 2',
    recommended: ['model2'],
    categories: ['dummy-category'],
    description: 'Recipe 2',
    readme: '',
    repository: 'https://recipe-2',
  },
];

const catalog: ApplicationCatalog = {
  recipes: recipes,
  models: [],
  categories: [
    {
      id: 'dummy-category',
      name: 'Dummy category',
    },
  ],
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

  vi.mocked(catalogStore).catalog = readable(catalog);
  vi.mocked(studioClient).filterRecipes.mockResolvedValue({
    result: recipes,
    filters: {},
    choices: {},
  });
});

test('recipe without category should be visible', async () => {
  render(Recipes);

  await vi.waitFor(() => {
    const text = screen.getAllByText('Recipe 1');
    expect(text.length).toBeGreaterThan(0);
  });
});

test('recipe with category should be visible', async () => {
  render(Recipes);

  await vi.waitFor(() => {
    const text = screen.getAllByText('Recipe 2');
    expect(text.length).toBeGreaterThan(0);
  });
});

test('filters returned in choices + all are displayed', async () => {
  vi.mocked(studioClient).filterRecipes.mockResolvedValue({
    result: recipes,
    filters: {},
    choices: {
      tools: [
        { name: 'tool1', count: 1 },
        { name: 'tool2', count: 2 },
      ],
      languages: [
        { name: 'lang1', count: 3 },
        { name: 'lang2', count: 4 },
      ],
      frameworks: [
        { name: 'fw1', count: 5 },
        { name: 'fw2', count: 6 },
      ],
    },
  });

  render(Recipes);

  await vi.waitFor(() => {
    const text = screen.getAllByText('Recipe 1');
    expect(text.length).toBeGreaterThan(0);
  });

  const tests = [
    { category: 'Tools', choices: ['all', 'tool1 (1)', 'tool2 (2)'] },
    { category: 'Frameworks', choices: ['all', 'fw1 (5)', 'fw2 (6)'] },
    { category: 'Languages', choices: ['all', 'lang1 (3)', 'lang2 (4)'] },
  ];

  for (const test of tests) {
    const dropdownLabel = screen.getByLabelText(test.category);
    expect(dropdownLabel).toBeInTheDocument();
    await fireEvent.click(dropdownLabel);

    await vi.waitFor(() => {
      for (const choice of test.choices) {
        const text = screen.getAllByText(choice);
        expect(text.length).toBeGreaterThan(0);
      }
    });
  }
});

test('filterRecipes is called with selected filters', async () => {
  vi.mocked(studioClient).filterRecipes.mockResolvedValue({
    result: recipes,
    filters: {},
    choices: {
      tools: [
        { name: 'tool1', count: 1 },
        { name: 'tool2', count: 2 },
      ],
      languages: [
        { name: 'lang1', count: 3 },
        { name: 'lang2', count: 4 },
      ],
      frameworks: [
        { name: 'fw1', count: 5 },
        { name: 'fw2', count: 6 },
      ],
    },
  });

  render(Recipes);

  await vi.waitFor(() => {
    const text = screen.getAllByText('Recipe 1');
    expect(text.length).toBeGreaterThan(0);
  });

  const selectedFilters = [
    { category: 'Tools', filter: 'tool1 (1)' },
    { category: 'Languages', filter: 'lang2 (4)' },
  ];

  for (const selectedFilter of selectedFilters) {
    const dropdownLabel = screen.getByLabelText(selectedFilter.category);
    expect(dropdownLabel).toBeInTheDocument();
    await fireEvent.click(dropdownLabel);

    await vi.waitFor(async () => {
      const text = screen.getByText(selectedFilter.filter);
      expect(text).toBeInTheDocument();
      await fireEvent.click(text);
    });
  }

  expect(studioClient.filterRecipes).toHaveBeenCalledWith({
    tools: ['tool1'],
    languages: ['lang2'],
  });
});
