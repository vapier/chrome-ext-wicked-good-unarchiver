#!/bin/bash -e

# Copyright 2014 The Chromium Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

cd ../unpacker/
make debug_for_tests
cd ../unpacker-test/
karma start