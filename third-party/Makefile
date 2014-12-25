# Copyright 2014 The Chromium OS Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

export NACL_ARCH ?= pnacl
export TOOLCHAIN ?= pnacl

ifndef NACLPORTS_PATH
  $(error NACLPORTS_PATH is not set. Install naclports and set NACLPORTS_PATH)
endif

.PHONY: uninstall
uninstall:
	$(NACLPORTS_PATH)/src/bin/naclports uninstall libarchive-fork

.PHONY: clean
clean:
	$(NACLPORTS_PATH)/src/bin/naclports clean libarchive-fork

.PHONY: install
install:
	$(NACLPORTS_PATH)/src/bin/naclports -f install libarchive-fork
