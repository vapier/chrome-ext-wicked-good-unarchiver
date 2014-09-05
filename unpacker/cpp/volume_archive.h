// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef VOLUME_ARCHIVE_H_
#define VOLUME_ARCHIVE_H_

#include <string>

#include "archive.h"
#include "ppapi/cpp/instance.h"

#include "volume_reader.h"

// A namespace with constants used by VolumeArchive.
namespace volume_archive_constants {

const char kArchiveReadNewError[] = "Could not allocate archive.";
const char kFileNotFound[] = "File not found for read data request.";
const char kArchiveSupportErrorPrefix[] = "Error at support rar/zip format: ";
const char kArchiveOpenErrorPrefix[] = "Error at open archive: ";
const char kArchiveNextHeaderErrorPrefix[] =
    "Error at reading next header for metadata: ";
const char kArchiveReadDataErrorPrefix[] = "Error at reading data: ";
const char kArchiveReadFreeErrorPrefix[] = "Error at archive free: ";

// Size of the buffer used to skip unnecessary data.
const int64_t kDummyBufferSize = 512 * 1024;

}  // namespace volume_archive_errors

// Defines a wrapper for libarchive operations. Operations are not thread safe
// and they shouldn't be done in parallel.
class VolumeArchive {
 public:
  // VolumeReader should be allocated with new and the memory handling should be
  // done by VolumeArchive.
  VolumeArchive(const std::string& request_id, VolumeReader* reader);

  virtual ~VolumeArchive();

  // Initializes VolumeArchive. Should be called only once.
  // In case of any errors call VolumeArchive::Cleanup and the error message can
  // be obtained with VolumeArchive::error_message().
  bool Init();

  // Gets the next header. If pathn_ame is set to NULL, then there are no more
  // available headers. Returns true if reading next header was successful.
  // In case of failure the error message can be obtained with
  // VolumeArchive::error_message().
  bool GetNextHeader(const char** path_name,
                     int64_t* size,
                     bool* is_directory,
                     time_t* modification_time);

  // Gets data from offset to offset + length for the file reached with
  // VolumeArchive::GetNextHeader. The data should be stored starting from
  // *buffer. In case offset is less then last VolumeArchive::ReadData
  // offset, then the read will be done from the start of the archive.
  // The API assumes offset is valid. JavaScript shouldn't make requests with
  // offset greater than data size.
  // Returns true if reading was successful for all the required number of
  // bytes. Length must be greater than 0.
  // In case of failure the error message can be obtained with
  // VolumeArchive::error_message().
  bool ReadData(int64_t offset, int32_t length, char* buffer);

  // Cleans all resources. Should be called only once. Returns true if
  // successful. In case of failure the error message can be obtained with
  // VolumeArchive::error_message().
  bool Cleanup();

  std::string request_id() const {
    return request_id_;
  };
  VolumeReader* reader() const { return reader_; }
  std::string error_message() const { return error_message_; }

 private:
  std::string request_id_;   // The request id for which the VolumeArchive was
                             // created.
  VolumeReader* reader_;     // The reader that actually reads the archive data.
  archive* archive_;  // The libarchive correspondent archive object.
  std::string error_message_;  // An error message set in case of any errors.

  // The last reached entry with VolumeArchive::GetNextHeader.
  archive_entry* current_archive_entry_;

  // The data offset, which will be offset + length after last read
  // operation, where offset and length are method parameters for
  // VolumeArchive::ReadData. Data offset is used to improve performance for
  // consecutive calls to VolumeArchive::ReadData. Intead of starting the read
  // from beginning for every VolumeArchive::ReadData, the next call will start
  // from last_read_data_offset_ in case the offset parameter of
  // VolumeArchive::ReadData has the same value as last_read_data_offset_.
  // This avoids decompressing again the bytes at the begninning of the file,
  // which is the average case scenario. But in case the offset parameter is
  // different than last_read_data_offset_, then dummy_buffer_ will be used to
  // ignore unused bytes.
  int64_t last_read_data_offset_;

  // Dummy buffer for unused data read using VolumeArchive::ReadData. Sometimes
  // VolumeArchive::ReadData can require reading from offsets different from
  // last_read_data_offset_. In this case some bytes must be skipped.
  // Because seeking is not possible inside compressed files, the bytes will
  // be discarded using this buffer.
  char dummy_buffer_[volume_archive_constants::kDummyBufferSize];
};

#endif  // VOLUME_ARCHIVE_H_
