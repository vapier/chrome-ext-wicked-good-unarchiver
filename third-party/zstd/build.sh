# Copyright 2019 The Native Client Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

EXTRA_CMAKE_ARGS="
  -DZSTD_MULTITHREAD_SUPPORT=OFF \
  -DZSTD_BUILD_PROGRAMS=OFF \
  -DZSTD_BUILD_SHARED=OFF \
  -DZSTD_BUILD_STATIC=ON \
"

ConfigureStep() {
  SRC_DIR=${SRC_DIR}/build/cmake ConfigureStep_CMake
}

BuildStep() {
  DefaultBuildStep
}
