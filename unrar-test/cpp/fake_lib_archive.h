// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// This file contains the common variables shared between the fake
// implementation of the libarchive API and the other test files.

#ifndef FAKE_LIB_ARCHIVE_H_
#define FAKE_LIB_ARCHIVE_H_

#include <climits>

#include "archive.h"

// Variables used by libarchive in tests.
namespace lib_archive_variables {

const char kArchiveError[] = "An archive error.";
const char kPathName[] = "path/to/file";  // Archives contain paths
                                          // without root "/".
const int64_t kSize = LLONG_MAX - 50;     // Bigger than int32_t.
const time_t kModificationTime = 500;

// Bool variables used to force failure responses for libarchive API.
// By default all should be set to false.
extern bool fail_archive_read_new;
extern bool fail_archive_rar_support;
extern bool fail_archive_zip_support;
extern bool fail_archive_set_read_callback;
extern bool fail_archive_set_skip_callback;
extern bool fail_archive_set_seek_callback;
extern bool fail_archive_set_close_callback;
extern bool fail_archive_set_callback_data;
extern bool fail_archive_read_open;
extern bool fail_archive_read_free;

// Return value for archive_read_next_header.
// By default it should be set to ARCHIVE_OK.
extern int archive_read_next_header_return_value;

// Return value for archive_entry_filetype.
// By default it should be set to regular file.
extern mode_t archive_entry_filetype_return_value;

// Resets all variables to default values.
void ResetVariables();

}  // namespace lib_archive_variables

#endif  // FAKE_LIB_ARCHIVE_H_
