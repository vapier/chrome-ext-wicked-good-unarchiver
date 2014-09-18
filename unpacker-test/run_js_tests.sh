#!/bin/bash -e

# Copyright 2014 The Chromium Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

# In case tests fail without a JavaScript error take also a look at these files.
# NaCl module crash message is shown only in the JavaScript console within the
# browser, and PP_DCHECK and other NaCl errors will appear only here.
# Messages are appended to the logs and it's up to the tester to remove them.
export NACL_EXE_STDOUT=`pwd`/nacl.stdout
export NACL_EXE_STDERR=`pwd`/nacl.stderr

cd ../unpacker/
# Build both Release and Debug executables for integration tests.
make && make debug_for_tests || { exit 1; }  # In case any make fails, exit.
cd ../unpacker-test/
karma start
