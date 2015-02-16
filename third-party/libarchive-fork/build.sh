#!/bin/bash
# Copyright 2014 The Chromium OS Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

AutogenStep() {
  ChangeDir ${SRC_DIR}
  export MAKE_LIBARCHIVE_RELEASE="1"
  ./build/autogen.sh
  cd -
}

ConfigureStep() {
  AutogenStep

  EXTRA_CONFIGURE_ARGS="--disable-bsdtar --disable-bsdcpio --without-nettle"

  # Temporary xml2 support cannot be added because the patch used in
  # ports/libarchve doesn't apply correctly here due. The reason is that
  # configure file is not present on gihub repository and is created
  # after AutogenStep.
  # # TODO(mtomasz): Remove this once nacl.patch is applied correctly.
  EXTRA_CONFIGURE_ARGS+=" --without-xml2"

  NACLPORTS_CPPFLAGS+=" -Dtimezone=_timezone -D_NSIG=0 -D_PATH_TTY=0"

  DefaultConfigureStep
}
