# Copyright 2014 The Chromium OS Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

export NACL_ARCH ?= pnacl
export TOOLCHAIN ?= pnacl

ifndef NACLPORTS_PATH
  $(error NACLPORTS_PATH is not set. Install naclports and set NACLPORTS_PATH)
endif

.PHONY: libarchive-fork
libarchive-fork:
	$(NACLPORTS_PATH)/src/bin/naclports -f install libarchive-fork

.PHONY: polymer
polymer:
	cd polymer; `npm bin`/bower update -F

.PHONY: clean
clean:
	$(NACLPORTS_PATH)/src/bin/naclports clean libarchive-fork
	rm -rf polymer/bower_components

.PHONY: all
all: libarchive-fork polymer
