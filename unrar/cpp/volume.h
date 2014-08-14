// Copyright (c) 2012 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef VOLUME_H_
#define VOLUME_H_

#include "request.h"
#include "volume_archive.h"

#include "archive.h"
#include "ppapi/cpp/instance.h"
#include "ppapi/cpp/var_array_buffer.h"
#include "ppapi/utility/threading/simple_thread.h"
#include "ppapi/utility/completion_callback_factory.h"

class Volume {
 public:
  Volume(pp::Instance* instance, const std::string& file_system_id);

  virtual ~Volume();

  // Initializes the volume.
  bool Init();

  // Reads archive metadata using libarchive.
  void ReadMetadata(const std::string& request_id, int64_t archive_size);

  // Processes a successful archive chunk read from JavaScript.
  void ReadChunkDone(const std::string& request_id,
                     const pp::VarArrayBuffer& array_buffer);

  // Processes an invalid archive chunk read from JavaScript.
  void ReadChunkError(const std::string& request_id);

 private:
  // A callback helper for ReadMetadata.
  void ReadMetadataCallback(int32_t result,
                            const std::string& request_id,
                            int64_t archive_size);

  // Creates a new archive object for this volume.
  VolumeArchive* CreateVolumeArchive(const std::string& request_id,
                                     int64_t archive_size);

  // Cleanups any data related to a volume archive. Return value should be
  // checked only if post_cleanup_error is true. post_cleanup_error should be
  // false in case an error message was already sent to JavaScript.
  bool CleanupVolumeArchive(VolumeArchive* volume_archive,
                            bool post_cleanup_error);

  // A pp::Instance used to post messages back to JS code and construct the
  // worker thread.
  pp::Instance* instance_;

  // The file system id for this volume.
  std::string file_system_id_;

  // A worker for jobs that require blocking operations or a lot of processing
  // time. Those shouldn't be done on the main thread. The jobs submitted to
  // this thread are executed in order, so a new job must wait for the last job
  // to finish.
  // TODO(cmihail): Consider using multiple workers in case of many jobs to
  // improve execution speedup.
  pp::SimpleThread worker_;

  // Callback factory sued to submit jobs to worker_.
  pp::CompletionCallbackFactory<Volume> callback_factory_;

  // A map containing all reads in progress. First argument is a unique key per
  // reader and the second is the reader itself.
  std::map<std::string, VolumeArchive*> worker_reads_in_progress_;
};

#endif  /// VOLUME_H_
