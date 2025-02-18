#
# Copyright (C) 2024 Red Hat, Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
# SPDX-License-Identifier: Apache-2.0

FROM scratch as builder
COPY packages/backend/dist/ /extension/dist
COPY packages/backend/package.json /extension/
COPY packages/backend/media/ /extension/media
COPY LICENSE /extension/
COPY packages/backend/icon.png /extension/
COPY README.md /extension/
COPY api/openapi.yaml /extension/api/

FROM scratch

LABEL org.opencontainers.image.title="AI Lab" \
        org.opencontainers.image.description="AI Lab" \
        org.opencontainers.image.vendor="Red Hat" \
        io.podman-desktop.api.version=">= 1.17.0"

COPY --from=builder /extension /extension
