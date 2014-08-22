// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef VOLUME_READER_JAVSCRIPT_STREAM_H_
#define VOLUME_READER_JAVSCRIPT_STREAM_H_

#include <pthread.h>

#include "archive.h"
#include "ppapi/cpp/var_array_buffer.h"

#include "javascript_requestor.h"
#include "volume_reader.h"

class VolumeReaderJavaScriptStream : public VolumeReader {
 public:
  VolumeReaderJavaScriptStream(const std::string& request_id,
                               int64_t archive_size,
                               JavaScriptRequestor* requestor);

  virtual ~VolumeReaderJavaScriptStream();

  // Sets the internal array buffer used for reads and signal the blocked
  // VolumeReaderJavaScriptStream::Read to continue execution. SHOULD be done in
  // a different thread from VolumeReaderJavaScriptStream::Read method.
  void SetBufferAndSignal(const pp::VarArrayBuffer& array_buffer);

  // Signal the blocked VolumeReaderJavaScriptStream::Read to continue execution
  // and return an error code. SHOULD be called from a different thread than
  // VolumeReaderJavaScriptStream::Read.
  void ReadErrorSignal();

  // See volume_reader.h for description.
  virtual int Open();

  // See volume_reader.h for description. This method blocks on
  // available_data_cond_. SetBufferAndSignal should unblock it from
  // another thread.
  virtual ssize_t Read(size_t bytes_to_read, const void** destination_buffer);

  // See volume_reader.h for description.
  virtual int64_t Skip(int64_t bytes_to_skip);

  // See volume_reader.h for description.
  virtual int64_t Seek(int64_t offset, int whence);

  // See volume_reader.h for description.
  virtual int Close();

  int64_t offset() const { return offset_; }

 private:
  std::string request_id_;  // The request id for which the reader was created.
  int64_t archive_size_;    // The archive size.
  JavaScriptRequestor* requestor_;  // A requestor that makes calls to
                                    // JavaScript to obtain file chunks.

  pp::VarArrayBuffer array_buffer_;  // The actual data used by libarchive.
  bool available_data_;  // Used by mutex / cond to synchronize with JavaScript.
  bool read_error_;  // Used to mark a read error from JavaScript and unblock.
  pthread_mutex_t available_data_lock_;
  pthread_cond_t available_data_cond_;

  int64_t offset_;  // The offset inside the volume.
};

#endif  // VOLUME_READER_JAVSCRIPT_STREAM_H_
