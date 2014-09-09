// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "volume_archive_libarchive.h"

#include <algorithm>
#include <cerrno>

#include "archive_entry.h"
#include "ppapi/cpp/logging.h"

namespace {

std::string ArchiveError(const std::string& message, archive* archive_object) {
  return message + archive_error_string(archive_object);
}

// Sets the libarchive internal error to a VolumeReader related error.
// archive_error_string function must work on valid strings, but in case of
// errors in the custom functions, libarchive API assumes the error is set by
// us. If we don't set it, we will get a Segmentation Fault because
// archive_error_string will work on invalid memory.
void SetLibarchiveErrorToVolumeReaderError(archive* archive_object) {
  archive_set_error(archive_object,
                    EIO /* I/O error. */,
                    "%s" /* Format string similar to printf. */,
                    volume_archive_constants::kVolumeReaderError);
}

ssize_t CustomArchiveRead(archive* archive_object,
                          void* client_data,
                          const void** buffer) {
  VolumeArchiveLibarchive* volume_archive =
      static_cast<VolumeArchiveLibarchive*>(client_data);

  ssize_t result =
      volume_archive->reader()->Read(volume_archive->reader_data_size(),
                                     buffer);
  if (result == ARCHIVE_FATAL)
    SetLibarchiveErrorToVolumeReaderError(archive_object);
  return result;
}

int64_t CustomArchiveSkip(archive* archive_object,
                          void* client_data,
                          int64_t request) {
  VolumeArchiveLibarchive* volume_archive =
      static_cast<VolumeArchiveLibarchive*>(client_data);
  // VolumeReader::Skip returns 0 in case of failure and CustomArchiveRead is
  // used instead, so there is no need to check for VolumeReader error.
  return volume_archive->reader()->Skip(request);
}

int64_t CustomArchiveSeek(archive* archive_object,
                          void* client_data,
                          int64_t offset,
                          int whence) {
  VolumeArchiveLibarchive* volume_archive =
      static_cast<VolumeArchiveLibarchive*>(client_data);

  int64_t result = volume_archive->reader()->Seek(offset, whence);
  if (result == ARCHIVE_FATAL)
    SetLibarchiveErrorToVolumeReaderError(archive_object);
  return result;
}

int CustomArchiveClose(archive* archive_object, void* client_data) {
  VolumeArchiveLibarchive* volume_archive =
      static_cast<VolumeArchiveLibarchive*>(client_data);

  int result = volume_archive->reader()->Close();
  if (result == ARCHIVE_FATAL)
    SetLibarchiveErrorToVolumeReaderError(archive_object);
  return result;
}

}  // namespace

VolumeArchiveLibarchive::VolumeArchiveLibarchive(const std::string& request_id,
                                                 VolumeReader* reader)
    : VolumeArchive(request_id, reader),
      // Reader size is volume_archive_constants::kHeaderChunkSize
      // because at first archive headers are read.
      reader_data_size_(volume_archive_constants::kHeaderChunkSize),
      archive_(NULL),
      current_archive_entry_(NULL),
      last_read_data_offset_(0) {
}

VolumeArchiveLibarchive::~VolumeArchiveLibarchive() {
  Cleanup();
}

bool VolumeArchiveLibarchive::Init() {
  archive_ = archive_read_new();
  if (!archive_) {
    set_error_message(volume_archive_constants::kArchiveReadNewError);
    return false;
  }

  // TODO(cmihail): Once the bug mentioned at
  // https://code.google.com/p/libarchive/issues/detail?id=262 is resolved
  // add RAR file handler to manifest.json.
  if (archive_read_support_format_rar(archive_) != ARCHIVE_OK ||
      archive_read_support_format_zip(archive_) != ARCHIVE_OK) {
    set_error_message(ArchiveError(
        volume_archive_constants::kArchiveSupportErrorPrefix, archive_));
    return false;
  }

  // Set callbacks for processing the archive's data and open the archive.
  // The callback data is the VolumeArchive itself.
  int ok = ARCHIVE_OK;
  if (archive_read_set_read_callback(archive_, CustomArchiveRead) != ok ||
      archive_read_set_skip_callback(archive_, CustomArchiveSkip) != ok ||
      archive_read_set_seek_callback(archive_, CustomArchiveSeek) != ok ||
      archive_read_set_close_callback(archive_, CustomArchiveClose) != ok ||
      archive_read_set_callback_data(archive_, this) != ok ||
      archive_read_open1(archive_) != ok) {
    set_error_message(ArchiveError(
        volume_archive_constants::kArchiveOpenErrorPrefix, archive_));
    return false;
  }

  return true;
}

bool VolumeArchiveLibarchive::GetNextHeader(const char** pathname,
                                            int64_t* size,
                                            bool* is_directory,
                                            time_t* modification_time) {
  // Reset VolumeReader data size so CustomArchiveRead doesn't require big
  // chunks for headers.
  reader_data_size_ = volume_archive_constants::kHeaderChunkSize;

  // Reset to 0 for new VolumeArchive::ReadData operation.
  last_read_data_offset_ = 0;

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
      set_error_message(ArchiveError(
          volume_archive_constants::kArchiveNextHeaderErrorPrefix, archive_));
      return false;
  }
}

bool VolumeArchiveLibarchive::ReadData(int64_t offset,
                                       int32_t length,
                                       char* buffer) {
  // TODO(cmihail): As an optimization consider using archive_read_data_block
  // which avoids extra copying in case offset != last_read_data_offset_.
  // The logic will be more complicated because archive_read_data_block offset
  // will not be aligned with the offset of the read request from JavaScript.

  PP_DCHECK(length > 0);              // Length must be at least 1.
  PP_DCHECK(current_archive_entry_);  // Check that GetNextHeader was called at
                                      // least once. In case it wasn't, this is
                                      // a programmer error.

  // Request with offset smaller than last read offset.
  if (offset < last_read_data_offset_) {
    std::string file_path_name(archive_entry_pathname(current_archive_entry_));

    // Cleanup old archive. Don't delete VolumeReader as it will be reused.
    if (archive_read_free(archive_) != ARCHIVE_OK) {
      set_error_message(ArchiveError(
          volume_archive_constants::kArchiveReadDataErrorPrefix, archive_));
      return false;
    }
    reader()->Seek(0, SEEK_SET);  // Reset reader.

    // Reinitialize archive.
    if (!Init())
      return false;

    // Reach file data by iterating through
    // VolumeArchiveLibarchive::GetNextHeader.
    const char* path_name = NULL;
    int64_t file_size = 0;
    bool is_directory = false;
    time_t modification_time = 0;
    for (;;) {
      if (!GetNextHeader(
              &path_name, &file_size, &is_directory, &modification_time))
        return false;
      if (!path_name) {
        set_error_message(volume_archive_constants::kFileNotFound);
        return false;
      }

      if (file_path_name == std::string(path_name))
        break;  // File reached.
    }
    // Data offset was already reset to 0 by
    // VolumeArchiveLibarchive::GetNextHeader.
  }

  // Request with offset greater than last read offset. Skip not needed bytes.
  // Because files are compressed, seeking is not possible, so all of the bytes
  // until the requested position must be unpacked.
  ssize_t size = -1;
  while (offset > last_read_data_offset_) {
    // ReadData will call CustomArchiveRead when calling archive_read_data. Read
    // should not request more bytes than possibly needed, so we request either
    // offset - last_read_data_offset_, kMaximumDataChunkSize in case the former
    // is too big or kMinimumDataChunkSize in case its too small and we might
    // end up with too many IPCs.
    reader_data_size_ = std::max(
        std::min(offset - last_read_data_offset_,
                 volume_archive_constants::kMaximumDataChunkSize),
        volume_archive_constants::kMinimumDataChunkSize);

    // No need for an offset in dummy_buffer as it will be ignored anyway.
    size =
        archive_read_data(archive_,
                          dummy_buffer_,
                          std::min(offset - last_read_data_offset_,
                                   volume_archive_constants::kDummyBufferSize));
    if (size < 0) {  // Error.
      set_error_message(ArchiveError(
          volume_archive_constants::kArchiveReadDataErrorPrefix, archive_));
      return false;
    }
    last_read_data_offset_ += size;
  }

  // ReadData will call CustomArchiveRead when calling archive_read_data. The
  // read should be done with a value similar to length, which is the requested
  // number of bytes, or kMaximumDataChunkSize / kMinimumDataChunkSize
  // in case length is too big or too small.
  reader_data_size_ =
      std::max(std::min(static_cast<int64_t>(length),
                        volume_archive_constants::kMaximumDataChunkSize),
               volume_archive_constants::kMinimumDataChunkSize);

  // Perform  the actual copy.
  int32_t buffer_offset = 0;  // Not file offset, so it's ok to be int32_t.
                              // A read cannot be greater than length, which is
                              // int32_t. Having more than 4GB in memory for a
                              // single read is not possible.
  do {
    size = archive_read_data(archive_, buffer + buffer_offset, length);
    if (size < 0) {  // Error.
      set_error_message(ArchiveError(
          volume_archive_constants::kArchiveReadDataErrorPrefix, archive_));
      return false;
    }
    buffer_offset += size;
    length -= size;
  } while (length > 0 && size != 0);  // There is still data to read.

  last_read_data_offset_ += buffer_offset;
  return true;
}

bool VolumeArchiveLibarchive::Cleanup() {
  bool returnValue = true;
  if (archive_ && archive_read_free(archive_) != ARCHIVE_OK) {
    set_error_message(ArchiveError(
        volume_archive_constants::kArchiveReadFreeErrorPrefix, archive_));
    returnValue = false;  // Cleanup should release all resources even
                          // in case of failures.
  }
  archive_ = NULL;

  CleanupReader();

  return returnValue;
}
