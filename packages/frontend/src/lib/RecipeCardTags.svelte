<script lang="ts">
import type { Recipe } from '@shared/src/models/IRecipe';
import Badge from './Badge.svelte';
import { onDestroy, onMount } from 'svelte';

interface Props {
  recipe: Recipe;
}

let { recipe }: Props = $props();

const useCases = ['natural-language-processing', 'audio', 'computer-vision'];
const languages = ['java', 'javascript', 'python'];
const frameworks = ['langchain', 'langchain4j', 'quarkus', 'react', 'streamlit', 'vectordb'];
const tools = ['none', 'llama-cpp', 'whisper-cpp'];

const tags: string[] = [
  ...recipe.categories,
  ...(recipe.backend !== undefined ? [recipe.backend] : []),
  ...(recipe.frameworks ?? []),
  ...(recipe.languages ?? []),
];

// gap-2 = 8px
const padding = 8;
let expanded: boolean = $state(false);
let toggleButton: HTMLDivElement | undefined = $state();
let visibleTags: string[] = $state(tags);
let divTags: HTMLDivElement[] = $state([]);
let recipeCardWidth: number = $state(0);

function determineBackgroundColor(tag: string): string {
  if (useCases.includes(tag)) {
    return 'bg-purple-200';
  } else if (languages.includes(tag)) {
    return 'bg-green-200';
  } else if (frameworks.includes(tag)) {
    return 'bg-amber-100';
  } else if (tools.includes(tag)) {
    return 'bg-sky-200';
  }
  return 'bg-purple-200';
}

function determineTextColor(tag: string): string {
  if (useCases.includes(tag)) {
    return 'text-dustypurple-900';
  } else if (languages.includes(tag)) {
    return 'text-green-900';
  } else if (frameworks.includes(tag)) {
    return 'text-amber-700';
  } else if (tools.includes(tag)) {
    return 'text-sky-900';
  }
  return 'text-dustypurple-900';
}

function updateContent(tag: string): string {
  let updatedTag = tag;
  if (tag === 'natural-language-processing' || tag === 'computer-vision') {
    updatedTag = tag.replaceAll('-', ' ');
  }

  // Make first character uppercase only on use cases and languages
  if (frameworks.includes(updatedTag) || tools.includes(updatedTag)) {
    return updatedTag;
  }

  return updatedTag.replace(/\b\w/g, char => char.toUpperCase());
}

function updateVisibleTags(): void {
  if (expanded) {
    visibleTags = tags;
    return;
  }

  if (!toggleButton) {
    return;
  }

  if (tags.length !== visibleTags.length) {
    toggleButton.classList.remove('hidden');
  }

  removeHiddenFromTags();

  // default value is button for toggle
  let totalWidth = padding + toggleButton.clientWidth;
  visibleTags = [];
  for (let i = 0; i < tags.length; i++) {
    const tag = divTags[i];
    const tagWidth = tag.clientWidth + padding;

    if (totalWidth + tagWidth >= recipeCardWidth) {
      addHiddenToTags(tags[i]);
      return;
    } else {
      totalWidth += tagWidth;
      visibleTags.push(tags[i]);
    }
  }

  if (tags.length === visibleTags.length) {
    toggleButton.classList.add('hidden');
  }
}

// Adds hidden class to all tags after afterTag
function addHiddenToTags(afterTag: string): void {
  let isAfterTag = false;
  for (let i = 0; i < tags.length; i++) {
    const divTag = divTags[i];
    if (isAfterTag) {
      divTag.classList.add('hidden');
    } else if (tags[i] === afterTag) {
      divTag.classList.add('hidden');
      isAfterTag = true;
    }
  }
}

// Remove the hidden class from all the tags (this will result in div element having clientWidth)
function removeHiddenFromTags(): void {
  divTags.forEach(tag => {
    tag.classList.remove('hidden');
  });
  visibleTags = tags;
}

onMount((): void => {
  updateVisibleTags();
  window.addEventListener('resize', updateVisibleTags);
});

onDestroy((): void => window.removeEventListener('resize', updateVisibleTags));

function toggleExpanded(): void {
  removeHiddenFromTags();
  expanded = !expanded;
  updateVisibleTags();
}
</script>

<div
  bind:clientWidth={recipeCardWidth}
  class="w-full flex flex-row gap-2 py-2"
  class:overflow-hidden={!expanded}
  class:flex-wrap={expanded}>
  {#each tags as tag, i}
    <div bind:this={divTags[i]}>
      <Badge
        backgroundColor={determineBackgroundColor(tag)}
        textColor={determineTextColor(tag)}
        content={updateContent(tag)} />
    </div>
  {/each}

  <div bind:this={toggleButton}>
    <button onclick={toggleExpanded}>
      <Badge
        backgroundColor="bg-transparent"
        textColor="text-dustypurple-900"
        content={expanded ? 'Show less' : `+${tags.length - visibleTags.length} more`} />
    </button>
  </div>
</div>
