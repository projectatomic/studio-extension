/**********************************************************************
 * Copyright (C) 2025 Red Hat, Inc.
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
import { screen, render } from '@testing-library/svelte';
import { beforeAll, expect, test, vi } from 'vitest';
import RecipeCardTags from './RecipeCardTags.svelte';
import userEvent from '@testing-library/user-event';

const recipe = {
  id: 'recipe1',
  name: 'recipe1',
  description: 'description',
  repository: 'repository',
  readme: 'readme',
  categories: ['natural-language-processing', 'audio'],
  languages: ['java', 'python'],
  frameworks: ['langchain', 'vectordb'],
  backend: 'whisper-cpp',
};

class ResizeObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

beforeAll(() => {
  Object.defineProperty(window, 'ResizeObserver', { value: ResizeObserver });
});

test('Should render tags', () => {
  render(RecipeCardTags, { recipe: recipe });

  const category1 = screen.getByText('Natural Language Processing');
  expect(category1).toBeVisible();

  const category2 = screen.getByText('Audio');
  expect(category2).toBeVisible();

  const language1 = screen.getByText('Java');
  expect(language1).toBeVisible();

  const language2 = screen.getByText('Python');
  expect(language2).toBeVisible();

  const framework1 = screen.getByText('langchain');
  expect(framework1).toBeVisible();

  const framework2 = screen.getByText('vectordb');
  expect(framework2).toBeVisible();

  const backend = screen.getByText('whisper-cpp');
  expect(backend).toBeVisible();
});

test('Button should be visible with "+ X more"', () => {
  render(RecipeCardTags, { recipe: recipe });

  const button = screen.getByRole('button');
  expect(button).toBeVisible();
  expect(button).toHaveTextContent('more');
});

test('Clicking on button should show all the tags', async () => {
  render(RecipeCardTags, { recipe: recipe });

  const button = screen.getByRole('button');
  expect(button).toBeVisible();
  expect(button).toHaveTextContent('more');

  // Clicking on the button
  await userEvent.click(button);
  expect(button).toHaveTextContent('Show less');
});
