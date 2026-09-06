/**
 * Default project repository singleton.
 *
 * Backed by localStorage. This module is safe to import in the browser.
 * For tests, create an independent repository with a memory adapter.
 */

import { createLocalStorageAdapter } from './storage';
import { createProjectRepository } from './repository';

/** Default localStorage-backed repository. */
export const projectRepository = createProjectRepository(
  createLocalStorageAdapter()
);
