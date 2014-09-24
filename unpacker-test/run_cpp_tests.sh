#!/bin/bash -e

# Copyright 2014 The Chromium Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

cd cpp

# Run Debug tests.
echo ""
echo "============================================="
echo "=============== Debug tests ================="
echo "============================================="
echo ""
make debug_tests_run || { exit 1; }

# Run Release tests.
echo "============================================="
echo "============== Release tests ================"
echo "============================================="
echo ""
make tests_run
