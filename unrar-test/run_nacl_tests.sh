#!/bin/bash -e

# Copyright 2014 The Chromium Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

cd cpp
make  # Catch compile errors.
make run 2> /dev/null  # Ignore any output except for tests.
                       # Compile erros are checked above.
