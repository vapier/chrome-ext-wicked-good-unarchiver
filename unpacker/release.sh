#!/bin/bash -e

# Copyright 2014 The Chromium Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

# Set the build toolchain. Defaults to pnacl, but can be supplied as the first
# argument to the bash script.
if [ "$#" -eq 1 ]; then
  TOOLCHAIN=$1  # pnacl or newlib.
else
  TOOLCHAIN=pnacl
fi

if [[ $TOOLCHAIN != "pnacl" && $TOOLCHAIN != "newlib" ]]; then
  echo "Expected toolchain to be one of [newlib, pnacl], not $TOOLCHAIN."
  exit 1
fi

# The directory that will contain the release extension code for Chrome store.
RELEASE_DIR=unpacker-release

# Remove old directory and create a new one.
if [ -d $RELEASE_DIR ]; then
  rm -r $RELEASE_DIR
fi
mkdir $RELEASE_DIR

# Build extension binaries and copy files to $RELEASE_DIR.
make VALID_TOOLCHAINS=$TOOLCHAIN
cp -r js $RELEASE_DIR/js
cp manifest.json $RELEASE_DIR/
cp $TOOLCHAIN/Release/module.nmf $RELEASE_DIR/

# Copy either the PNaCl binary to $RELEASE_DIR or the NaCl binaries.
if [ $TOOLCHAIN == "pnacl" ]; then
  cp $TOOLCHAIN/Release/module.pexe $RELEASE_DIR/
else
  cp $TOOLCHAIN/Release/module_arm.nexe $TOOLCHAIN/Release/module_x86_32.nexe \
     $TOOLCHAIN/Release/module_x86_64.nexe $RELEASE_DIR/
fi

# Overwrite js/config.js with the config options for $TOOLCHAIN.
if [ $TOOLCHAIN == "pnacl" ]; then
  cp build-config-pnacl-release.js $RELEASE_DIR/js/build-config.js
else
  cp build-config-newlib-release.js $RELEASE_DIR/js/build-config.js
fi
