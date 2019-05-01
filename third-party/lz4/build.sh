# Copyright 2016 The Native Client Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

# Workaround for https://bugs.chromium.org/p/nativeclient/issues/detail?id=3205
if [ "${NACL_ARCH}" = "arm" ]; then
  NACLPORTS_CFLAGS+=" -mfpu=vfp"
fi

ConfigureStep() {
  SRC_DIR=${SRC_DIR}/cmake_unofficial ConfigureStep_CMake
}

BuildStep() {
  DefaultBuildStep
}
