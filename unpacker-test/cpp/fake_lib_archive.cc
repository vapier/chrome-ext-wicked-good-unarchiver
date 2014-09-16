// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "fake_lib_archive.h"

#include <algorithm>
#include <cstring>

#include "archive_entry.h"
#include "gtest/gtest.h"
#include "ppapi/cpp/logging.h"

// Define fake libarchive API functions. Tests are not linked with libarchive
// library in order to control the flow of the API functions inside the unit
// tests.

// Define libarchive structures. libarchive headers only declare them,
// but do not define it.
struct archive {
  // Used by archive_read_data to know how many bytes were read from
  // lib_archive_variables::kArchiveData during last call.
  size_t data_offset;
};

struct archive_entry {
  // Content not needed.
};

namespace {

// The archive returned by archive_read_new in case of success.
archive test_archive;
archive_entry test_archive_entry;

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
bool fail_archive_read_free = false;

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

archive* archive_read_new() {
  test_archive.data_offset = 0;  // Reset data_offset.
  return lib_archive_variables::fail_archive_read_new ? NULL : &test_archive;
}

const char* archive_error_string(archive* archive_object) {
  return lib_archive_variables::kArchiveError;
}

void archive_set_error(struct archive *, int error_code, const char *fmt, ...) {
  // Nothing to do.
}

int archive_read_support_format_rar(archive* archive_object) {
  return lib_archive_variables::fail_archive_rar_support ? ARCHIVE_FATAL
                                                         : ARCHIVE_OK;
}

int archive_read_support_format_zip(archive* archive_object) {
  return lib_archive_variables::fail_archive_zip_support ? ARCHIVE_FATAL
                                                         : ARCHIVE_OK;
}

int archive_read_set_read_callback(archive* archive_object,
                                   archive_read_callback* client_reader) {
  return lib_archive_variables::fail_archive_set_read_callback ? ARCHIVE_FATAL
                                                               : ARCHIVE_OK;
}

int archive_read_set_skip_callback(archive* archive_object,
                                   archive_skip_callback* client_skipper) {
  return lib_archive_variables::fail_archive_set_skip_callback ? ARCHIVE_FATAL
                                                               : ARCHIVE_OK;
}

int archive_read_set_seek_callback(archive* archive_object,
                                   archive_seek_callback* client_seeker) {
  return lib_archive_variables::fail_archive_set_seek_callback ? ARCHIVE_FATAL
                                                               : ARCHIVE_OK;
}

int archive_read_set_close_callback(archive* archive_object,
                                    archive_close_callback* client_closer) {
  return lib_archive_variables::fail_archive_set_close_callback ? ARCHIVE_FATAL
                                                                : ARCHIVE_OK;
}

int archive_read_set_callback_data(archive* archive_object, void* client_data) {
  return lib_archive_variables::fail_archive_set_callback_data ? ARCHIVE_FATAL
                                                               : ARCHIVE_OK;
}

int archive_read_open1(archive* archive_object) {
  return lib_archive_variables::fail_archive_read_open ? ARCHIVE_FATAL
                                                       : ARCHIVE_OK;
}

int archive_read_next_header(archive* archive_object,
                             archive_entry** entry) {
  *entry = &test_archive_entry;
  return lib_archive_variables::archive_read_next_header_return_value;
}

const char* archive_entry_pathname(archive_entry* entry) {
  return lib_archive_variables::kPathName;
}

int64_t archive_entry_size(archive_entry* entry) {
  return lib_archive_variables::kSize;
}

time_t archive_entry_mtime(archive_entry* entry) {
  return lib_archive_variables::kModificationTime;
}

mode_t archive_entry_filetype(archive_entry* entry) {
  return lib_archive_variables::archive_entry_filetype_return_value;
}

int archive_read_free(archive* archive_object) {
  return lib_archive_variables::fail_archive_read_free ? ARCHIVE_FATAL
                                                       : ARCHIVE_OK;
}

// To force failure pass length >= kArchiveReadDataErrorThreshold.
ssize_t archive_read_data(archive* archive_object,
                          void* buffer,
                          size_t length) {
  if (length >= lib_archive_variables::kArchiveReadDataErrorThreshold)
    return ARCHIVE_FATAL;

  size_t archive_data_size = sizeof(lib_archive_variables::kArchiveData);
  PP_DCHECK(archive_data_size >= archive_object->data_offset);

  size_t read_bytes =
      std::min(archive_data_size - archive_object->data_offset, length);
  PP_DCHECK(archive_data_size >= read_bytes);

  // Copy data content.
  const char* source =
      lib_archive_variables::kArchiveData + archive_object->data_offset;
  PP_DCHECK(archive_data_size >= archive_object->data_offset + read_bytes);
  memcpy(buffer, source, read_bytes);

  archive_object->data_offset += read_bytes;
  return read_bytes;
}
