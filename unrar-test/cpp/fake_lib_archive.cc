// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "fake_lib_archive.h"

#include "archive_entry.h"

// Define fake libarchive API functions. Tests are not linked with libarchive
// library in order to control the flow of the API functions inside the unit
// tests.

// Define libarchive structure for archives. libarchive headers only declare
// it, but do not define it.
struct archive {
  // Content is not important.
};

namespace {

// The archive returned by archive_read_new in case of success.
struct archive test_archive;

}  // namespace

// Initialize the variables from lib_archive_variables namespace defined in
// fake_lib_archive.h.
namespace lib_archive_variables {

// By default libarchive API functions will return success.
bool fail_archive_read_new = false;
bool fail_archive_rar_support = false;
bool fail_archive_zip_support = false;
bool fail_archive_set_read_callback = false;
bool fail_archive_set_skip_callback = false;
bool fail_archive_set_seek_callback = false;
bool fail_archive_set_close_callback = false;
bool fail_archive_set_callback_data = false;
bool fail_archive_read_open = false;
bool fail_archive_read_free= false;

int archive_read_next_header_return_value = ARCHIVE_OK;

mode_t archive_entry_filetype_return_value = S_IFREG;  // Regular file.

void ResetVariables() {
  fail_archive_read_new = false;
  fail_archive_rar_support = false;
  fail_archive_zip_support = false;
  fail_archive_set_read_callback = false;
  fail_archive_set_skip_callback = false;
  fail_archive_set_seek_callback = false;
  fail_archive_set_close_callback = false;
  fail_archive_set_callback_data = false;
  fail_archive_read_open = false;
  fail_archive_read_free = false;

  archive_read_next_header_return_value = ARCHIVE_OK;
  archive_entry_filetype_return_value = S_IFREG;
}

}  // namespace lib_archive_variables

struct archive* archive_read_new() {
  return lib_archive_variables::fail_archive_read_new ? NULL : &test_archive;
}

const char* archive_error_string(struct archive* archive) {
  return lib_archive_variables::kArchiveError;
}

int archive_read_support_format_rar(struct archive* archive) {
  return lib_archive_variables::fail_archive_rar_support ? ARCHIVE_FATAL
                                                         : ARCHIVE_OK;
}

int archive_read_support_format_zip(struct archive* archive) {
  return lib_archive_variables::fail_archive_zip_support ? ARCHIVE_FATAL
                                                         : ARCHIVE_OK;
}

int archive_read_set_read_callback(struct archive* archive,
                                   archive_read_callback* client_reader) {
  return lib_archive_variables::fail_archive_set_read_callback ? ARCHIVE_FATAL
                                                               : ARCHIVE_OK;
}

int archive_read_set_skip_callback(struct archive* archive,
                                   archive_skip_callback* client_skipper) {
  return lib_archive_variables::fail_archive_set_skip_callback ? ARCHIVE_FATAL
                                                               : ARCHIVE_OK;
}

int archive_read_set_seek_callback(struct archive* archive,
                                   archive_seek_callback* client_seeker) {
  return lib_archive_variables::fail_archive_set_seek_callback ? ARCHIVE_FATAL
                                                               : ARCHIVE_OK;
}

int archive_read_set_close_callback(struct archive* archive,
                                    archive_close_callback* client_closer) {
  return lib_archive_variables::fail_archive_set_close_callback ? ARCHIVE_FATAL
                                                                : ARCHIVE_OK;
}

int archive_read_set_callback_data(struct archive* archive, void* client_data) {
  return lib_archive_variables::fail_archive_set_callback_data ? ARCHIVE_FATAL
                                                               : ARCHIVE_OK;
}

int archive_read_open1(struct archive* archive) {
  return lib_archive_variables::fail_archive_read_open ? ARCHIVE_FATAL
                                                       : ARCHIVE_OK;
}

int archive_read_next_header(struct archive* archive,
                             struct archive_entry** entry) {
  return lib_archive_variables::archive_read_next_header_return_value;
}

const char* archive_entry_pathname(struct archive_entry* entry) {
  return lib_archive_variables::kPathName;
}

int64_t archive_entry_size(struct archive_entry* entry) {
  return lib_archive_variables::kSize;
}

time_t archive_entry_mtime(struct archive_entry* entry) {
  return lib_archive_variables::kModificationTime;
}

mode_t archive_entry_filetype(struct archive_entry* entry) {
  return lib_archive_variables::archive_entry_filetype_return_value;
}

int archive_read_free(struct archive* archive) {
  return lib_archive_variables::fail_archive_read_free ? ARCHIVE_FATAL
                                                       : ARCHIVE_OK;
}
