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

import { Publisher } from './Publisher';
import type { Webview } from '@podman-desktop/api';
import {
  ApplicationStateError,
  ApplicationStateErrorType,
  type ApplicationStateErrorDetails,
} from '@shared/src/models/IError';
import type { Messages } from '@shared/Messages';

/**
 * Base class for managing state with persistence and error handling
 */
export abstract class StateManager<T> extends Publisher<T> {
  constructor(webview: Webview, channel: Messages, stateGetter: () => T) {
    super(webview, channel, stateGetter);
  }

  /**
   * Persists the current state and notifies subscribers
   * @throws {ApplicationStateError} if persistence fails
   */
  protected async persistState(): Promise<void> {
    try {
      await this.notify();
    } catch (err: unknown) {
      const details: ApplicationStateErrorDetails = {
        operation: 'persist',
        timestamp: Date.now(),
      };
      throw new ApplicationStateError(ApplicationStateErrorType.PERSISTENCE_ERROR, 'Failed to persist state', {
        originalError: err,
        details,
      });
    }
  }

  /**
   * Loads persisted state
   * @throws {ApplicationStateError} if loading fails
   */
  protected async loadPersistedState(): Promise<void> {
    try {
      await this.refresh();
    } catch (err: unknown) {
      const details: ApplicationStateErrorDetails = {
        operation: 'load',
        timestamp: Date.now(),
      };
      throw new ApplicationStateError(ApplicationStateErrorType.LOAD_ERROR, 'Failed to load persisted state', {
        originalError: err,
        details,
      });
    }
  }

  /**
   * Refreshes the current state
   * Should be implemented by derived classes
   */
  protected abstract refresh(): Promise<void>;
}
