// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "volume_reader_javascript_stream.h"

#include <algorithm>
#include <limits>

#include "archive.h"
#include "ppapi/cpp/logging.h"

#include "request.h"

namespace {

// The minimum number of bytes that read ahead will request.
// TODO(cmihail): Do benchmarks for choosing a better value.
size_t kReadAheadLengthThreshold = 10 * 1024;  // 10 KB.

}  //  namespace

VolumeReaderJavaScriptStream::VolumeReaderJavaScriptStream(
    const std::string& request_id,
    int64_t archive_size,
    JavaScriptRequestor* const requestor)
    : request_id_(request_id),
      archive_size_(archive_size),
      requestor_(requestor),
      available_data_(false),
      read_error_(false),
      offset_(0),
      read_ahead_array_buffer_ptr_(&first_array_buffer_) {
  pthread_mutex_init(&available_data_lock_, NULL);
  pthread_cond_init(&available_data_cond_, NULL);

  // Dummy Map the second buffer as first buffer is used for read ahead by
  // read_ahead_array_buffer_ptr_. This operation is required in order for Unmap
  // to correctly work in the destructor and VolumeReaderJavaScriptStream::Read.
  second_array_buffer_.Map();

  // Read ahead first chunk.
  ReadAhead(kReadAheadLengthThreshold);
}

VolumeReaderJavaScriptStream::~VolumeReaderJavaScriptStream() {
  pthread_mutex_destroy(&available_data_lock_);
  pthread_cond_destroy(&available_data_cond_);

  // Unmap last mapped buffer. This is the other buffer to
  // read_ahead_array_buffer_ptr_ as read_ahead_array_buffer_ptr_ must be
  // available for SetBufferAndSignal to overwrite.
  if (read_ahead_array_buffer_ptr_ != &first_array_buffer_)
    first_array_buffer_.Unmap();
  else
    second_array_buffer_.Unmap();
};

void VolumeReaderJavaScriptStream::SetBufferAndSignal(
    const pp::VarArrayBuffer& array_buffer,
    int64_t read_offset) {
  if (read_offset != offset_)  // Ignore read ahead in case offset was changed
                               // using Skip or Seek.
    return;

  // Signal VolumeReaderJavaScriptStream::Read to continue execution. Copies
  // buffer locally so libarchive has the buffer in memory when working with it.
  pthread_mutex_lock(&available_data_lock_);

  *read_ahead_array_buffer_ptr_ = array_buffer;  // Copy operation.
  available_data_ = true;                        // Data is available.

  pthread_cond_signal(&available_data_cond_);
  pthread_mutex_unlock(&available_data_lock_);
}

void VolumeReaderJavaScriptStream::ReadErrorSignal() {
  // Signal VolumeReaderJavaScriptStream::Read to continue execution.
  pthread_mutex_lock(&available_data_lock_);
  read_error_ = true;  // Read error from JavaScript.
  pthread_cond_signal(&available_data_cond_);
  pthread_mutex_unlock(&available_data_lock_);
}

// Nothing to do here as file is handled on JavaScript side.
int VolumeReaderJavaScriptStream::Open() {
  return ARCHIVE_OK;
}

ssize_t VolumeReaderJavaScriptStream::Read(size_t bytes_to_read,
                                           const void** destination_buffer) {
  // No more data, so signal end of reading.
  if (offset_ >= archive_size_)
    return 0;

  // Lock only if no available data. Though available data can be set from true
  // to false when calling ReadAhead, this is safe because ReadAhead is always
  // called from the same thread as Read, Seek and Skip are called only by
  // libarchive that works in its own worker_. If libarchive would be handled
  // in multiple threads than this is not safe anymore and must be updated.
  if (!available_data_) {
    // Wait for data from JavaScript.
    pthread_mutex_lock(&available_data_lock_);
    while (!available_data_) {  // Check again available data as first call was
                                // was done outside guarded zone.
      if (read_error_) {
        pthread_mutex_unlock(&available_data_lock_);
        return ARCHIVE_FATAL;
      }
      pthread_cond_wait(&available_data_cond_, &available_data_lock_);
    }
    pthread_mutex_unlock(&available_data_lock_);
  }

  // Make data available for libarchive custom read.
  *destination_buffer = read_ahead_array_buffer_ptr_->Map();
  ssize_t bytes_read =
      std::min(read_ahead_array_buffer_ptr_->ByteLength(), bytes_to_read);

  offset_ += bytes_read;

  // Ask for more data from JavaScript in the other buffer. This is the only
  // time when we switch buffers. The reason is that libarchive must
  // always work on valid data and that data must be available until next
  // VolumeReaderJavaScriptStream::Read call. All other calls to ReadAhead
  // should overwrite the old data as they were requested from Seek or Skip,
  // which means that the data read ahead will not be used here as it starts
  // from a diffferent offset.
  read_ahead_array_buffer_ptr_ =
      read_ahead_array_buffer_ptr_ != &first_array_buffer_
          ? &first_array_buffer_
          : &second_array_buffer_;

  // Unmap old buffer. Only Read and constructor can Map the buffers so Read and
  // destructor should be the one to Unmap them. This will work because it is
  // called before ReadAhead which is the only method that overwrites the
  // buffer. The constructor should also Map a default pp::VarArrayBuffer and
  // destructor Unmap the last used array buffer (which is the other buffer than
  // read_ahead_array_buffer_ptr_). Unfortunately it's not clear from the
  // API description if this call is done automatically on pp::VarArrayBuffer
  // destructor.
  read_ahead_array_buffer_ptr_->Unmap();

  // Read ahead should be performed with a length similar to current read.
  ReadAhead(bytes_to_read);

  return bytes_read;
}

int64_t VolumeReaderJavaScriptStream::Seek(int64_t offset, int whence) {
  int64_t new_offset = offset_;
  switch (whence) {
    case SEEK_SET:
      new_offset = offset;
      break;
    case SEEK_CUR:
      new_offset += offset;
      break;
    case SEEK_END:
      new_offset = archive_size_ + offset;
      break;
    default:
      PP_DCHECK(false);  // Should never get here.
      return ARCHIVE_FATAL;
  }
  if (new_offset < 0 || new_offset > archive_size_)
    return ARCHIVE_FATAL;

  offset_ = new_offset;

  // As seek changes the next read offset position it's better to restart read
  // ahead length.
  ReadAhead(kReadAheadLengthThreshold);
  return offset_;
}

int64_t VolumeReaderJavaScriptStream::Skip(int64_t bytes_to_skip) {
  // Invalid bytes_to_skip. This "if" can be triggered for corrupted archives.
  // We return 0 instead of ARCHIVE_FATAL in order for libarchive to use normal
  // Read and return the correct error. In case we return ARCHIVE_FATAL here
  // then libarchive just stops without telling us why it wasn't able to
  // process the archive.
  if (archive_size_ - offset_ < bytes_to_skip || bytes_to_skip < 0)
    return 0;

  offset_ += bytes_to_skip;

  // As skip changes the next read offset position it's better to restart read
  // ahead length.
  ReadAhead(kReadAheadLengthThreshold);
  return bytes_to_skip;
}

// Nothing to do here as file is handled on JavaScript side.
int VolumeReaderJavaScriptStream::Close() {
  return ARCHIVE_OK;
}

void VolumeReaderJavaScriptStream::ReadAhead(size_t read_ahead_length) {
  // Read ahead next chunk only if not at the end of archive.
  if (archive_size_ <= offset_)
    return;

  size_t bytes_to_read =
      std::min(static_cast<int64_t>(read_ahead_length),
               archive_size_ - offset_ /* Positive check above. */);

  available_data_ = false;
  requestor_->RequestFileChunk(request_id_, offset_, bytes_to_read);
}
