// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef VOLUME_READER_H_
#define VOLUME_READER_H_

#include <string>

#include "archive.h"

// Defines a reader for archive volumes. This class is used by libarchive
// for custom reads: https://github.com/libarchive/libarchive/wiki/Examples
class VolumeReader {
 public:
  virtual ~VolumeReader() {}

  // Opens the reader. Use return values like ARCHIVE_OK or ARCHIVE_FATAL
  // specific to libarchive.
  virtual int Open() = 0;

  // Tries to read bytes_to_read from the archive. The result will be stored at
  // *destination_buffer, which is the address of a buffer handled by
  // VolumeReaderJavaScriptStream. *destination_buffer must be available until
  // the next VolumeReader:Read call or until VolumeReader is destructed.
  // The operation must be synchronous (libarchive requirement), so it
  // should NOT be done on the main thread.
  // Returns the actual number of read bytes.
  virtual ssize_t Read(size_t bytes_to_read,
                       const void** destination_buffer) = 0;

  // Tries to skyp bytes_to_skip number of bytes. Returns the actual number of
  // skipped bytes or 0 if none were skipped.
  virtual int64_t Skip(int64_t bytes_to_skip) = 0;

  // Tries to seek to offset from whence. Returns the resulting offset location
  // or ARCHIVE_FATAL in case of errors. Similar to
  // http://www.cplusplus.com/reference/cstdio/fseek/
  virtual int64_t Seek(int64_t offset, int whence) = 0;

  // Closes the reader. Use return values like ARCHIVE_OK or ARCHIVE_FATAL
  // specific to libarchive.
  virtual int Close() = 0;
};

#endif  // VOLUME_READER_H_
