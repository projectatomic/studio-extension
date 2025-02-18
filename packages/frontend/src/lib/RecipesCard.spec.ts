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
import { render, screen } from '@testing-library/svelte';
import { beforeAll, expect, test, vi } from 'vitest';
import RecipesCard from '/@/lib/RecipesCard.svelte';

vi.mock('../utils/client', async () => ({
  studioClient: {},
}));

vi.mock('../stores/localRepositories', () => ({
  localRepositories: {
    subscribe: (f: (msg: unknown) => void) => {
      f([]);
      return (): void => {};
    },
  },
}));

class ResizeObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

beforeAll(() => {
  Object.defineProperty(window, 'ResizeObserver', { value: ResizeObserver });
});

test('recipes card without recipes should display empty message', async () => {
  render(RecipesCard, {
    recipes: [],
    category: {
      id: 'dummy-category',
      name: 'Dummy category',
    },
  });

  const message = screen.getByText('There is no recipe in this category for now ! Come back later');
  expect(message).toBeDefined();
});

test('recipes card with recipes should display them', async () => {
  render(RecipesCard, {
    recipes: [
      {
        id: 'recipe1',
        name: 'Recipe 1',
        models: ['model1'],
        categories: [],
        description: 'Recipe 1',
        readme: '',
        repository: 'https://recipe-1',
      },
    ],
    category: {
      id: 'dummy-category',
      name: 'Dummy category',
    },
  });

  const text = screen.getAllByText('Recipe 1');
  expect(text.length).toBeGreaterThan(0);
});
