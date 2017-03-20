# Copyright 2014 The Chromium OS Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

export NACL_ARCH ?= pnacl
export TOOLCHAIN ?= pnacl

TOP_SRCDIR = $(CURDIR)/..
include $(TOP_SRCDIR)/third-party/settings.mk

ifndef WEBPORTS_PATH
export WEBPORTS_PATH = $(CURDIR)/webports
ifeq ($(wildcard $(WEBPORTS_PATH)/src),)
  $(error WEBPORTS_PATH is not set. Install webports and set WEBPORTS_PATH)
endif
endif

.PHONY: libarchive-fork
libarchive-fork:
	$(WEBPORTS_PATH)/src/bin/webports -f install libarchive-fork

.PHONY: polymer
polymer:
	cd polymer; `npm bin`/bower update -F

nacl_sdk: nacl_sdk/$(NACL_SDK_PEPPER_VERSION)
nacl_sdk/$(NACL_SDK_PEPPER_VERSION):
	mkdir -p nacl_sdk
	wget -c \
		-O nacl_sdk/naclsdk_linux-$(NACL_SDK_VERSION).tar.bz2 \
		https://storage.googleapis.com/nativeclient-mirror/nacl/nacl_sdk/$(NACL_SDK_VERSION)/naclsdk_linux.tar.bz2
	tar xf nacl_sdk/naclsdk_linux-$(NACL_SDK_VERSION).tar.bz2 -C nacl_sdk

GCLIENT ?= $(abspath $(CURDIR)/depot_tools/gclient)
webports:
	mkdir -p webports
	cd webports && \
	$(GCLIENT) config --unmanaged --name=src https://chromium.googlesource.com/webports.git && \
	$(GCLIENT) sync -r src@$(NACL_SDK_PEPPER_VERSION)

depot_tools:
	git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git

.PHONY: clean
clean:
	$(WEBPORTS_PATH)/src/bin/webports clean libarchive-fork
	rm -rf polymer/bower_components

.PHONY: all
all: libarchive-fork polymer
