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

  # Disable pthread detection.  The toolchain includes the headers, but we
  # don't actually link it (nor need it), so we end up with link failures.
  export ac_cv_header_pthread_h=no

  local args=(
    # Disable programs we don't care about to save time.
    --disable-bsdtar
    --disable-bsdcat
    --disable-bsdcpio

    # We use OpenSSL for crypto support.
    --without-nettle

    # Disable compression libs we don't use in case they were built and
    # installed in the NaCl toolchain for other projects.
    --without-lzmadec

    # Enable compression libs we use.
    --with-bz2lib
    --with-lzma
    --with-lz4
    --with-lzo2
    --with-zstd

    # Temporary xml2 support cannot be added because the patch used in
    # ports/libarchve doesn't apply correctly here due. The reason is that
    # configure file is not present on gihub repository and is created
    # after AutogenStep.
    # TODO(mtomasz): Remove this once nacl.patch is applied correctly.
    --without-xml2
  )
  EXTRA_CONFIGURE_ARGS="${args[*]}"

  NACLPORTS_CPPFLAGS+=" -Dtimezone=_timezone -D_NSIG=0 -D_PATH_TTY=0"

  DefaultConfigureStep
}
