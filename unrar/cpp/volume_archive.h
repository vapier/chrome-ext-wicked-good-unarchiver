// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef VOLUME_ARCHIVE_H_
#define VOLUME_ARCHIVE_H_

#include <string>

#include "archive.h"
#include "ppapi/cpp/instance.h"
#include "volume_reader.h"

// Error messages specific to VolumeArchive.
namespace volume_archive_errors {

const char kArchiveReadNewError[] = "Could not allocate archive.";
const char kArchiveSupportErrorPrefix[] = "Error at support rar/zip format: ";
const char kArchiveOpenErrorPrefix[] = "Error at open archive: ";
const char kArchiveNextHeaderErrorPrefix[] =
    "Error at reading next header for metadata: ";
const char kArchiveReadFreeErrorPrefix[] = "Error at archive free: ";

}  // namespace volume_archive_errors

// Defines a wrapper for libarchive operations.
class VolumeArchive {
 public:
  // VolumeReader should be allocated with new and the memory handling should be
  // done by VolumeArchive.
  VolumeArchive(const std::string& request_id, VolumeReader* reader);

  virtual ~VolumeArchive();

  // Initializes VolumeArchive. Should be called only once.
  // In case of any errors call VolumeArchive::Cleanup.
  bool Init();

  // Gets the next header. If pathname is set to NULL, then there are no more
  // available headers.
  bool GetNextHeader(const char** pathname,
                     int64_t* size,
                     bool* is_directory,
                     time_t* modification_time);

  // Cleans all resources. Should be called only once.
  bool Cleanup();

  std::string request_id() { return request_id_; };
  VolumeReader* reader() { return reader_; }
  std::string error_message() { return error_message_; }

 private:
  std::string request_id_;   // The request id for which the VolumeArchive was
                             // created.
  VolumeReader* reader_;     // The reader that actually reads the archive data.
  struct archive* archive_;  // The libarchive correspondent archive struct.
  std::string error_message_;  // An error message set in case of any errors.
};

#endif  // VOLUME_ARCHIVE_H_
