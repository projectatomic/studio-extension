import type { LocalRepository } from '@shared/src/models/ILocalRepository';

export const findLocalRepositoryByRecipeId = (
  store: LocalRepository[],
  recipeId: string,
): LocalRepository | undefined => {
  return store.find(local => !!local.labels && 'recipe-id' in local.labels && local.labels['recipe-id'] === recipeId);
};
