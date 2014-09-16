// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef VOLUME_ARCHIVE_LIBARCHIVE_H
#define VOLUME_ARCHIVE_LIBARCHIVE_H

#include <string>

#include "archive.h"

#include "volume_archive.h"

// A namespace with constants used by VolumeArchiveLibarchive.
namespace volume_archive_constants {

const char kArchiveReadNewError[] = "Could not allocate archive.";
const char kFileNotFound[] = "File not found for read data request.";
const char kVolumeReaderError[] = "VolumeReader failed to retrieve data.";
const char kArchiveSupportErrorPrefix[] = "Error at support rar/zip format: ";
const char kArchiveOpenErrorPrefix[] = "Error at open archive: ";
const char kArchiveNextHeaderErrorPrefix[] =
    "Error at reading next header for metadata: ";
const char kArchiveReadDataErrorPrefix[] = "Error at reading data: ";
const char kArchiveReadFreeErrorPrefix[] = "Error at archive free: ";

// Size of the buffer used to skip unnecessary data.
const int64_t kDummyBufferSize = 512 * 1024;

}  // namespace volume_archive_constants

// Defines an implementation of VolumeArchive that wraps all libarchive
// operations.
class VolumeArchiveLibarchive : public VolumeArchive {
 public:
  // VolumeReader should be allocated with new and the memory handling should be
  // done by VolumeArchiveLibarchive.
  VolumeArchiveLibarchive(const std::string& request_id, VolumeReader* reader);

  virtual ~VolumeArchiveLibarchive();

  // See volume_archive_interface.h.
  virtual bool Init();

  // See volume_archive_interface.h.
  virtual bool GetNextHeader(const char** path_name,
                             int64_t* size,
                             bool* is_directory,
                             time_t* modification_time);

  // See volume_archive_interface.h.
  virtual bool ReadData(int64_t offset, int32_t length, char* buffer);

  // See volume_archive_interface.h.
  virtual bool Cleanup();

 private:
  // The libarchive correspondent archive object.
  archive* archive_;

  // The last reached entry with VolumeArchiveLibarchive::GetNextHeader.
  archive_entry* current_archive_entry_;

  // The data offset, which will be offset + length after last read
  // operation, where offset and length are method parameters for
  // VolumeArchiveLibarchive::ReadData. Data offset is used to improve
  // performance for consecutive calls to VolumeArchiveLibarchive::ReadData.
  //
  // Intead of starting the read from the beginning for every
  // VolumeArchiveLibarchive::ReadData, the next call will start
  // from last_read_data_offset_ in case the offset parameter of
  // VolumeArchiveLibarchive::ReadData has the same value as
  // last_read_data_offset_. This avoids decompressing again the bytes at
  // the begninning of the file, which is the average case scenario.
  // But in case the offset parameter is different than last_read_data_offset_,
  // then dummy_buffer_ will be used to ignore unused bytes.
  int64_t last_read_data_offset_;

  // Dummy buffer for unused data read using VolumeArchiveLibarchive::ReadData.
  // Sometimes VolumeArchiveLibarchive::ReadData can require reading from
  // offsets different from last_read_data_offset_. In this case some bytes
  // must be skipped. Because seeking is not possible inside compressed files,
  // the bytes will be discarded using this buffer.
  char dummy_buffer_[volume_archive_constants::kDummyBufferSize];
};

#endif  // VOLUME_ARCHIVE_LIBARCHIVE_H
