// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "volume_reader_javascript_stream.h"

#include <algorithm>

#include "archive.h"
#include "ppapi/cpp/logging.h"

#include "request.h"

VolumeReaderJavaScriptStream::VolumeReaderJavaScriptStream(
    const std::string& request_id,
    int64_t archive_size,
    JavaScriptRequestor* const requestor) : request_id_(request_id),
                                            archive_size_(archive_size),
                                            requestor_(requestor),
                                            available_data_(false),
                                            read_error_(false),
                                            offset_(0) {
  pthread_mutex_init(&available_data_lock_, NULL);
  pthread_cond_init(&available_data_cond_, NULL);
}

VolumeReaderJavaScriptStream::~VolumeReaderJavaScriptStream() {
  pthread_mutex_destroy(&available_data_lock_);
  pthread_cond_destroy(&available_data_cond_);
};

void VolumeReaderJavaScriptStream::SetBufferAndSignal(
    const pp::VarArrayBuffer& array_buffer) {
  // Copies buffer locally so libarchive has the buffer in memory when working
  // with it. No need for lock guarding as VolumeReaderJavaScriptStream::Read
  // made the request so at this moment it's not using the buffer.
  array_buffer_ = array_buffer;

  // Signal VolumeReaderJavaScriptStream::Read to continue execution.
  pthread_mutex_lock(&available_data_lock_);
  available_data_ = true;  // Data is available.
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

  // Ask for more data from JavaScript.
  available_data_ = false;
  requestor_->RequestFileChunk(request_id_, offset_, bytes_to_read);

  // Wait for data from JavaScript.
  pthread_mutex_lock(&available_data_lock_);
  while (!available_data_) {
    if (read_error_) {
      pthread_mutex_unlock(&available_data_lock_);
      return ARCHIVE_FATAL;
    }
    pthread_cond_wait(&available_data_cond_, &available_data_lock_);
  }
  pthread_mutex_unlock(&available_data_lock_);

  // Make data available for libarchive custom read.
  *destination_buffer = array_buffer_.Map();
  ssize_t bytes_read = array_buffer_.ByteLength();
  offset_ += bytes_read;

  return bytes_read;
}

int64_t VolumeReaderJavaScriptStream::Seek(int64_t offset, int whence) {
  switch (whence) {
    case SEEK_SET:
      offset_ = offset;
      return offset_;
    case SEEK_CUR:
      offset_ += offset;
      return offset_;
    case SEEK_END:
      offset_ = archive_size_ + offset;
      return offset_;
    default:
      PP_DCHECK(false);  // Should never get here.
      return ARCHIVE_FATAL;
  }
}

int64_t VolumeReaderJavaScriptStream::Skip(int64_t bytes_to_skip) {
  offset_ += bytes_to_skip;
  return bytes_to_skip;
}

// Nothing to do here as file is handled on JavaScript side.
int VolumeReaderJavaScriptStream::Close() {
  return ARCHIVE_OK;
}
