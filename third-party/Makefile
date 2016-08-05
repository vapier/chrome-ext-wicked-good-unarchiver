# Copyright 2014 The Chromium OS Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

export NACL_ARCH ?= pnacl
export TOOLCHAIN ?= pnacl

ifndef WEBPORTS_PATH
  $(error WEBPORTS_PATH is not set. Install webports and set WEBPORTS_PATH)
endif

.PHONY: libarchive-fork
libarchive-fork:
	$(WEBPORTS_PATH)/src/bin/webports -f install libarchive-fork

.PHONY: polymer
polymer:
	cd polymer; `npm bin`/bower update -F

.PHONY: clean
clean:
	$(WEBPORTS_PATH)/src/bin/webports clean libarchive-fork
	rm -rf polymer/bower_components

.PHONY: all
all: libarchive-fork polymer
