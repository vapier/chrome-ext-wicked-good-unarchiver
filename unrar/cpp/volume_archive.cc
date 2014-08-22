// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "volume_archive.h"

#include <algorithm>

#include "archive_entry.h"

#include "volume_reader_javascript_stream.h"

namespace {

const size_t kChunkSize = 512 * 1024;  // 512 KB
const int64_t kDummyBufferSize = kChunkSize;

inline std::string ArchiveError(const std::string& message,
                                struct archive* archive) {
  return message + archive_error_string(archive);
}

ssize_t CustomArchiveRead(struct archive* archive,
                          void* client_data,
                          const void** buffer) {
  VolumeReader* reader_ = static_cast<VolumeReader*>(client_data);
  return reader_->Read(kChunkSize, buffer);
}

int64_t CustomArchiveSkip(struct archive* archive,
                          void* client_data,
                          int64_t request) {
  VolumeReader* reader_ = static_cast<VolumeReader*>(client_data);
  return reader_->Skip(request);
}

int64_t CustomArchiveSeek(struct archive* archive,
                          void* client_data,
                          int64_t offset,
                          int whence) {
  VolumeReader* reader_ = static_cast<VolumeReader*>(client_data);
  return reader_->Seek(offset, whence);
}

int CustomArchiveClose(struct archive* a, void* client_data) {
  VolumeReader* reader_ = static_cast<VolumeReader*>(client_data);
  return reader_->Close();
}

}  // namespace

VolumeArchive::VolumeArchive(const std::string& request_id,
                             VolumeReader* reader)
    : request_id_(request_id), reader_(reader), archive_(NULL) {
}

VolumeArchive::~VolumeArchive() {
  Cleanup();
}

bool VolumeArchive::Init() {
  archive_ = archive_read_new();
  if (!archive_) {
    error_message_ = volume_archive_errors::kArchiveReadNewError;
    return false;
  }

  if (archive_read_support_format_rar(archive_) != ARCHIVE_OK ||
      archive_read_support_format_zip(archive_) != ARCHIVE_OK) {
    error_message_ = ArchiveError(
        volume_archive_errors::kArchiveSupportErrorPrefix, archive_);
    return false;
  }

  // Set callbacks for processing the archive's data and open the archive.
  int ok = ARCHIVE_OK;
  if (archive_read_set_read_callback(archive_, CustomArchiveRead) != ok ||
      archive_read_set_skip_callback(archive_, CustomArchiveSkip) != ok ||
      archive_read_set_seek_callback(archive_, CustomArchiveSeek) != ok ||
      archive_read_set_close_callback(archive_, CustomArchiveClose) != ok ||
      archive_read_set_callback_data(archive_, reader_) != ok ||
      archive_read_open1(archive_) != ok) {
    error_message_ =
        ArchiveError(volume_archive_errors::kArchiveOpenErrorPrefix, archive_);
    return false;
  }

  return true;
}

bool VolumeArchive::GetNextHeader(const char** pathname,
                                  int64_t* size,
                                  bool* is_directory,
                                  time_t* modification_time) {
  // Reset to 0 for new VolumeArchive::ReadData operation.
  data_offset_ = 0;

  // Archive data is skipped automatically by next call to
  // archive_read_next_header.
  switch (archive_read_next_header(archive_, &current_archive_entry_)) {
    case ARCHIVE_EOF:
      *pathname = NULL;  // End of archive.
      return true;
    case ARCHIVE_OK:
      *pathname = archive_entry_pathname(current_archive_entry_);
      *size = archive_entry_size(current_archive_entry_);
      *modification_time = archive_entry_mtime(current_archive_entry_);
      *is_directory = S_ISDIR(archive_entry_filetype(current_archive_entry_));
      return true;
    default:
      error_message_ = ArchiveError(
          volume_archive_errors::kArchiveNextHeaderErrorPrefix, archive_);
      return false;
  }
}

bool VolumeArchive::ReadData(int64_t offset, int32_t length, char* buffer) {
  // TODO(cmihail): As an optimization consider using archive_read_data_block
  // which avoids extra copying in case offset != data_offset_. The logic will
  // be more complicated because archive_read_data_block offset will not be
  // aligned with the offset of the read request from JavaScript.

  // Request with offset smaller than last read offset.
  if (offset < data_offset_) {
    std::string file_pathname(archive_entry_pathname(current_archive_entry_));

    // Cleanup old archive.
    if (archive_read_free(archive_) != ARCHIVE_OK) {
      error_message_ = ArchiveError("Error at archive free", archive_);
      return false;
    }

    // Reinitialize archive.
    if (!Init())
      return false;

    // Reach file data by iterating through VolumeArchive::GetNextHeader.
    const char* path_name;
    int64_t file_size;
    bool is_directory;
    time_t modification_time;
    for (;;) {
      if (!GetNextHeader(
              &path_name, &file_size, &is_directory, &modification_time))
        return false;
      if (!path_name) {
        PP_DCHECK(false);  // Should never get here. JavaScript should require
                           // the extraction of a valid file or never make the
                           // call if file_path is invalid.
        break;
      }

      if (file_pathname.compare(path_name) == 0)
        break;  // File reached.
    }
    // Data offset was already reset to 0 by VolumeArchive::GetNextHeader.
  }

  // Request with offset greater than last read offset.
  char dummy_buffer[kDummyBufferSize];
  ssize_t size;
  while (offset > data_offset_) {
    // No need for an offset in dummy_buffer as it will be ignored anyway.
    size = archive_read_data(archive_,
                             dummy_buffer,
                             std::min(offset - data_offset_, kDummyBufferSize));
    if (size < 0) {  // Error.
      error_message_ = ArchiveError("Error at reading data", archive_);
      return false;
    }
    data_offset_ += size;
  }

  // Perform actual copy.
  int32_t buffer_offset = 0;  // Not file offset, so it's ok to be int32_t.
  do {
    size = archive_read_data(archive_, buffer + buffer_offset, length);

    if (size < 0) {  // Error.
      error_message_ = ArchiveError("Error at reading data", archive_);
      return false;
    }
    buffer_offset += size;
  } while (buffer_offset < length && size != 0);  // End of block / file.

  data_offset_ += buffer_offset;
  return true;
}

bool VolumeArchive::Cleanup() {
  bool returnValue = true;
  if (archive_ && archive_read_free(archive_) != ARCHIVE_OK) {
    error_message_ = ArchiveError(
        volume_archive_errors::kArchiveReadFreeErrorPrefix, archive_);
    returnValue = false;  // Cleanup should release all resources even
                          // in case of failures.
  }
  archive_ = NULL;

  delete reader_;
  reader_ = NULL;

  return returnValue;
}
