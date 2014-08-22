// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef VOLUME_H_
#define VOLUME_H_

#include "archive.h"
#include "ppapi/cpp/instance.h"
#include "ppapi/cpp/var_array_buffer.h"
#include "ppapi/cpp/var_dictionary.h"
#include "ppapi/utility/threading/simple_thread.h"
#include "ppapi/utility/completion_callback_factory.h"

#include "javascript_requestor.h"
#include "request.h"
#include "volume_archive.h"

class Volume {
 public:
  // TODO(cmihail): Eliminate circular dependency to pp::Instance and add unit
  // tests for Volume.
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

  // Opens a file.
  void OpenFile(const std::string& request_id,
                const std::string& file_path,
                int64_t archive_size);

  // Closes a file.
  void CloseFile(const std::string& request_id,
                 const std::string& open_request_id);

  // Reads a file contents from offset to offset + length. dictionary
  // should contain the open_request_id, the offset and the length with
  // the keys as defined in "request" namespace, and they should have
  // valid types. The reason for not passing them directly is that
  // pp::CompletionCallbackFactory can create a callback with a maximum of
  // 3 parameters, not 4 as needed here (including request_id).
  void ReadFile(const std::string& request_id,
                const pp::VarDictionary& dictionary);

  pp::Instance* instance() const { return instance_; }
  std::string file_system_id() const { return file_system_id_; }

 private:
  // A callback helper for ReadMetadata.
  void ReadMetadataCallback(int32_t result,
                            const std::string& request_id,
                            int64_t archive_size);

  // A calback helper for OpenFile.
  void OpenFileCallback(int32_t result,
                        const std::string& request_id,
                        const std::string& file_path,
                        int64_t archive_size);

  // A callback helper for CloseFile.
  void CloseFileCallback(int32_t result,
                         const std::string& request_id,
                         const std::string& open_request_id);

  // A calback helper for ReadFile.
  void ReadFileCallback(int32_t result,
                        const std::string& request_id,
                        const pp::VarDictionary& dictionary);

  // Creates a new archive object for this volume.
  VolumeArchive* CreateVolumeArchive(const std::string& request_id,
                                     int64_t archive_size);

  // Cleanups any data related to a volume archive. Return value should be
  // checked only if post_cleanup_error is true. post_cleanup_error should be
  // false in case an error message was already sent to JavaScript.
  bool CleanupVolumeArchive(VolumeArchive* volume_archive,
                            bool post_cleanup_error);

  // Gets the VolumeArchive from worker_reads_in_progress_ map based on
  // request_id. Assumes that the VolumeArchive is already present in the map.
  // If it's not present, then this is a programmer error.
  VolumeArchive* GetVolumeArchive(const std::string& request_id);

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
  // improve execution speedup. In case multiple workers are added
  // synchronization between workers might be needed.
  pp::SimpleThread worker_;

  // Callback factory sued to submit jobs to worker_.
  pp::CompletionCallbackFactory<Volume> callback_factory_;

  // A map containing all reads in progress. First argument is a unique key per
  // reader and the second is the reader itself. The map doesn't need to be
  // guarded even if we use 2 threads. The reason is that the single operations
  // that happen on the main thread are Volume::ReadChunkDone and
  // Volume::ReadChunkDone, while the other operations post work to worker_.
  // The only moment when Volume::ReadChunkDone and Volume::ReadChunkError are
  // called is when they are used to unblock worker_ that waits for response
  // from JavaScript. So worker_ and main thread cannot have races in current
  // implementation.
  std::map<std::string, VolumeArchive*> worker_reads_in_progress_;

  // A requestor for making calls to JavaScript.
  JavaScriptRequestor* requestor_;
};

#endif  /// VOLUME_H_
