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

import type { InstructlabAPI } from '@shared/src/InstructlabAPI';
import type { InstructlabManager } from './managers/instructlab/instructlabManager';
import type { InstructlabSession } from '@shared/src/models/instructlab/IInstructlabSession';
import type { InstructlabContainerConfiguration } from '@shared/src/models/instructlab/IInstructlabContainerConfiguration';
import { navigation } from '@podman-desktop/api';

export class InstructlabApiImpl implements InstructlabAPI {
  constructor(private instructlabManager: InstructlabManager) {}

  async getIsntructlabSessions(): Promise<InstructlabSession[]> {
    return this.instructlabManager.getSessions();
  }

  requestCreateInstructlabContainer(config: InstructlabContainerConfiguration): Promise<void> {
    return this.instructlabManager.requestCreateInstructlabContainer(config);
  }

  routeToInstructLabContainerTerminal(containerId: string): Promise<void> {
    return navigation.navigateToContainerTerminal(containerId);
  }

  getInstructlabContainerId(): Promise<string | undefined> {
    return this.instructlabManager.getInstructLabContainer();
  }
}
