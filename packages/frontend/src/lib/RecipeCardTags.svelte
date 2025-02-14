<script lang="ts">
import type { Recipe } from '@shared/src/models/IRecipe';
import Badge from './Badge.svelte';
import { onMount } from 'svelte';

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

let expanded: boolean = $state(false);
let togleButtonWidth: number = $state(0);
let visibleTags: string[] = $state(tags);
let allTags: HTMLDivElement[] = [];
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
};

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
};

function updateContent(tag: string): string {
    let updatedTag = tag;
    if (tag === 'natural-language-processing' || tag === 'computer-vision') {
        updatedTag = tag.replaceAll("-", " ");
    } 

    // Make first character uppercase only on use cases and languages
    if (frameworks.includes(updatedTag) || tools.includes(updatedTag)) {
        return updatedTag;
    }

    return updatedTag.replace(/\b\w/g, char => char.toUpperCase());
}

// gap-2 = 8px
const padding = 8; 

async function updateVisibleTags() {
    if (expanded) {
        visibleTags = tags;
        return;
    }
    
    // default value is button for toggle
    let totalWidth = padding + togleButtonWidth;
    visibleTags = [];

    for (let i = 0; i < tags.length; i++) {
        const tagWidth = allTags[i].clientWidth + padding;
        if (totalWidth + tagWidth >= recipeCardWidth) {
            break;
        }
        console.log(tags[i], totalWidth, recipeCardWidth)
        totalWidth += tagWidth;
        visibleTags.push(tags[i]);
    }
}

function handleResize() {
    if (!expanded) {
        updateVisibleTags();
    }
}

onMount(() => {
    updateVisibleTags();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
});
</script>

<div bind:clientWidth={recipeCardWidth} 
    class="w-full flex flex-row gap-2" 
    class:overflow-hidden={!expanded} 
    class:flex-wrap={expanded}>
    {#each tags as tag, i}
        <div 
            bind:this={allTags[i]} 
            class:hidden={!expanded && visibleTags.includes(tag)}>
                <Badge backgroundColor={determineBackgroundColor(tag)} textColor={determineTextColor(tag)} content={updateContent(tag)} />
        </div>
    {/each}
    
    {#if tags.length > visibleTags.length}
        <div bind:clientWidth={togleButtonWidth}>
            <button onclick={() => (expanded = !expanded)}>
                <Badge backgroundColor="bg-transparent" textColor="text-dustypurple-900"
                    content={expanded ? "Show less" : `+${tags.length - visibleTags.length} more`} />
            </button>
        </div>
    {/if}
</div>

    