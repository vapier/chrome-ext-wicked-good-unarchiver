// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "volume_archive.h"

#include "archive_entry.h"
#include "volume_reader_javascript_stream.h"

namespace {

const size_t kChunkSize = 512 * 1024;  // 512 KB

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
  // Archive data is skipped automatically by next call to
  // archive_read_next_header.
  struct archive_entry* entry;
  switch (archive_read_next_header(archive_, &entry)) {
    case ARCHIVE_EOF:
      *pathname = NULL;  // End of archive.
      return true;
    case ARCHIVE_OK:
      *pathname = archive_entry_pathname(entry);
      *size = archive_entry_size(entry);
      *modification_time = archive_entry_mtime(entry);
      *is_directory = S_ISDIR(archive_entry_filetype(entry));
      return true;
    default:
      error_message_ = ArchiveError(
          volume_archive_errors::kArchiveNextHeaderErrorPrefix, archive_);
      return false;
  }
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
