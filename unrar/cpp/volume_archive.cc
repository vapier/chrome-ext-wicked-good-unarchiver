// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "volume_archive.h"
#include "volume_reader_javascript_stream.h"

#include "archive_entry.h"

static const size_t kChunkSize = 512 * 1024;  // 512 KB

static inline std::string ArchiveError(const std::string& message,
                                       struct archive* archive) {
  return message + ": " + archive_error_string(archive);
}

static ssize_t CustomArchiveRead(struct archive* archive,
                                 void* client_data,
                                 const void** buffer) {
  VolumeReader* reader_ = static_cast<VolumeReader*>(client_data);
  return reader_->Read(kChunkSize, buffer);
}

static int64_t CustomArchiveSkip(struct archive* archive,
                                 void* client_data,
                                 int64_t request) {
  VolumeReader* reader_ = static_cast<VolumeReader*>(client_data);
  return reader_->Skip(request);
}

static int64_t CustomArchiveSeek(struct archive* archive,
                                 void* client_data,
                                 int64_t offset,
                                 int whence) {
  VolumeReader* reader_ = static_cast<VolumeReader*>(client_data);
  return reader_->Seek(offset, whence);
}

static int CustomArchiveClose(struct archive* a, void* client_data) {
  VolumeReader* reader_ = static_cast<VolumeReader*>(client_data);
  return reader_->Close();
}

bool VolumeArchive::Init() {
  archive_ = archive_read_new();
  if (!archive_) {
    error_message_ = "Could not allocate archive";
    return false;
  }

  if (archive_read_support_format_rar(archive_) != ARCHIVE_OK ||
      archive_read_support_format_zip(archive_) != ARCHIVE_OK) {
    error_message_ = ArchiveError("Error at support rar/zip format", archive_);
    return false;
  }

  // Set callbacks for processing the archive's data.
  archive_read_set_read_callback(archive_, CustomArchiveRead);
  archive_read_set_skip_callback(archive_, CustomArchiveSkip);
  archive_read_set_seek_callback(archive_, CustomArchiveSeek);
  archive_read_set_close_callback(archive_, CustomArchiveClose);
  archive_read_set_callback_data(archive_, reader_);

  if (archive_read_open1(archive_) != ARCHIVE_OK) {
    error_message_ = ArchiveError("Error at open archive", archive_);
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
      error_message_ =
          ArchiveError("Error at reading next header for metadata", archive_);
      return false;
  }
}

bool VolumeArchive::Cleanup() {
  bool returnValue = true;
  if (archive_ && archive_read_free(archive_) != ARCHIVE_OK) {
    error_message_ = ArchiveError("Error at archive free", archive_);
    returnValue = false;  // Cleanup should release all resources even
                          // in case of failures.
  }

  delete reader_;
  return returnValue;
}
