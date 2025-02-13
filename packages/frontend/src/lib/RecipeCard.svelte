<script lang="ts">
import type { Recipe } from '@shared/src/models/IRecipe';
import { router } from 'tinro';
import { faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons';
import Fa from 'svelte-fa';
import { localRepositories } from '../stores/localRepositories';
import { findLocalRepositoryByRecipeId } from '/@/utils/localRepositoriesUtils';
import type { LocalRepository } from '@shared/src/models/ILocalRepository';
import RecipeStatus from '/@/lib/RecipeStatus.svelte';
import RecipeCardTags from './RecipeCardTags.svelte';

export let recipe: Recipe;

let localPath: LocalRepository | undefined = undefined;
$: localPath = findLocalRepositoryByRecipeId($localRepositories, recipe.id);

function handleClick(): void {
  router.goto(`/recipe/${recipe.id}`);
}
</script>

<div class="no-underline">
  <div
    class="bg-[var(--pd-content-card-bg)] hover:bg-[var(--pd-content-card-hover-bg)] grow p-4 h-full rounded-md flex-nowrap flex flex-col"
    role="region"
    aria-label={recipe.name}>
    <!-- body -->
    <div class="flex flex-col grow">
      <div class="flex flex-row text-base">
        <!-- left column -->
        <div class="flex flex-col">
          <span class="text-[var(--pd-content-card-header-text)]" aria-label="{recipe.name} name">{recipe.name}</span>
          <span class="text-sm text-[var(--pd-content-card-text)]" aria-label="{recipe.name} description"
            >{recipe.description}</span>
        </div>

        <!-- right column -->
        <div>
          <RecipeStatus recipe={recipe} localRepository={localPath} />
        </div>
      </div>

      <!-- tags -->
      <div class="flex flex-row gap-2 py-2 items-center">
        <RecipeCardTags recipe={recipe} />
      </div>
    </div>

    <!-- footer -->
    <div class="flex flex-row">
      <!-- version -->
      <div class="grow text-[var(--pd-content-card-text)] opacity-50 whitespace-nowrap overflow-x-hidden text-ellipsis">
        {#if recipe.ref}
          <span aria-label="{recipe.name} ref">{recipe.ref}</span>
        {/if}
      </div>

      <!-- more details -->
      <button on:click={handleClick}>
        <div class="flex flex-row items-center text-[var(--pd-link)]">
          <Fa class="mr-2" icon={faArrowUpRightFromSquare} />
          <span> More details </span>
        </div>
      </button>
    </div>
  </div>
</div>
