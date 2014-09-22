// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef VOLUME_ARCHIVE_H_
#define VOLUME_ARCHIVE_H_

#include <string>

#include "volume_reader.h"

// Defines a wrapper for operations executed on an archive. API is not meant
// to be thread safe and its methods shouldn't be called in parallel.
// Represents a view of a physical archive. A physical archive can have multiple
// instances of VolumeArchive in order to handle every request from
// fileSystemProvider API independently from other requests.
class VolumeArchive {
 public:
  // VolumeReader should be allocated with new and the memory handling should be
  // done by the implementation of VolumeArchive.
  VolumeArchive(const std::string& request_id, VolumeReader* reader)
      : request_id_(request_id), reader_(reader) {}

  virtual ~VolumeArchive() {}

  // Initializes VolumeArchive. Should be called only once.
  // In case of any errors call VolumeArchive::Cleanup and the error message can
  // be obtained with VolumeArchive::error_message().
  virtual bool Init() = 0;

  // Gets the next header. If path_name is set to NULL, then there are no more
  // available headers. Returns true if reading next header was successful.
  // In case of failure the error message can be obtained with
  // VolumeArchive::error_message().
  virtual bool GetNextHeader(const char** path_name,
                             int64_t* size,
                             bool* is_directory,
                             time_t* modification_time) = 0;

  // Gets data from offset to offset + length for the file reached with
  // VolumeArchive::GetNextHeader. The data is stored in an internal buffer
  // in the implementation of VolumeArchive and it will be returned
  // via *buffer parameter to avoid an extra copy. *buffer is owned by
  // VolumeArchive.
  //
  // Supports file seek by using the offset parameter. In case offset is less
  // then last VolumeArchive::ReadData offset, then the read will be restarted
  // from the beginning of the archive.
  //
  // For improving perfomance use VolumeArchive::MaybeDecompressAhead. Using
  // VolumeArchive::MaybeDecompressAhead is not mandatory, but without it
  // performance will suffer.
  //
  // The API assumes offset >= 0 and length > 0. length can be as big as
  // possible, but its up to the implementation to avoid big memory usage.
  // It can return up to length bytes of data, however 0 is returned only in
  // case of EOF.
  //
  // Returns the actual number of read bytes. The API ensures that *buffer will
  // have available as many bytes as returned. In case of failure, returns a
  // negative value and the error message can be obtained with
  // VolumeArchive::error_message().
  virtual int64_t ReadData(int64_t offset,
                           int64_t length,
                           const char** buffer) = 0;

  // Decompress ahead in case there are no more available bytes in the internal
  // buffer.
  virtual void MaybeDecompressAhead() = 0;

  // Cleans all resources. Should be called only once. Returns true if
  // successful. In case of failure the error message can be obtained with
  // VolumeArchive::error_message().
  virtual bool Cleanup() = 0;

  std::string request_id() const { return request_id_; }
  VolumeReader* reader() const { return reader_; }
  std::string error_message() const { return error_message_; }

 protected:
  // Cleans up the reader. Can be called multiple times, but once called reader
  // cannot be reinitialized.
  void CleanupReader() {
    delete reader_;
    reader_ = NULL;
  }

  void set_error_message(const std::string& error_message) {
    error_message_ = error_message;
  }

 private:
  std::string request_id_;  // The request id for which the VolumeArchive was
                            // created.
  VolumeReader* reader_;    // The reader that actually reads the archive data.
  std::string error_message_;  // An error message set in case of any errors.
};

#endif  // VOLUME_ARCHIVE_H_
