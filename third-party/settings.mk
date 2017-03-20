# Copyright 2017 The Chromium OS Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

ifndef TOP_SRCDIR
$(error Makefile needs to set TOP_SRCDIR)
endif

NACL_SDK_VERSION = 49.0.2623.112
NACL_SDK_PEPPER_VERSION = pepper_$(firstword $(subst ., ,$(NACL_SDK_VERSION)))
NACL_SDK_ROOT ?= $(TOP_SRCDIR)/third-party/nacl_sdk/$(NACL_SDK_PEPPER_VERSION)
export NACL_SDK_ROOT
