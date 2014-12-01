// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef VOLUME_H_
#define VOLUME_H_

#include <pthread.h>

#include "archive.h"
#include "ppapi/cpp/instance_handle.h"
#include "ppapi/cpp/var_array_buffer.h"
#include "ppapi/cpp/var_dictionary.h"
#include "ppapi/utility/threading/lock.h"
#include "ppapi/utility/threading/simple_thread.h"
#include "ppapi/utility/completion_callback_factory.h"

#include "javascript_requestor_interface.h"
#include "javascript_message_sender_interface.h"
#include "volume_archive.h"

// A factory that creates VolumeArchive(s). Useful for testing.
class VolumeArchiveFactoryInterface {
 public:
  virtual ~VolumeArchiveFactoryInterface() {}

  // Creates a new VolumeArchive. Returns NULL if failed.
  virtual VolumeArchive* Create(const std::string& request_id,
                                VolumeReader* reader) = 0;
};

// A factory that creates VolumeReader(s). Useful for testing.
class VolumeReaderFactoryInterface {
 public:
  virtual ~VolumeReaderFactoryInterface() {}

  // Creates a new VolumeReader. Returns NULL if failed.
  // Passes VolumeReader ownership to the implementation of
  // VolumeArchiveInterfaceInterface.
  virtual VolumeReader* Create(const std::string& request_id,
                               int64_t archive_size) = 0;
};

// Handles all operations like reading metadata and reading files from a single
// Volume.
class Volume {
 public:
  Volume(const pp::InstanceHandle& instance_handle /* Used for workers. */,
         const std::string& file_system_id,
         JavaScriptMessageSenderInterface* message_sender);

  // Used by tests to create custom VolumeArchive and VolumeReader objects.
  // VolumeArchiveFactory and VolumeReaderFactory should be allocated with new
  // and the ownership will be passed to Volume on constructing it.
  Volume(const pp::InstanceHandle& instance_handle /* Used for workers. */,
         const std::string& file_system_id,
         JavaScriptMessageSenderInterface* message_sender,
         VolumeArchiveFactoryInterface* volume_archive_factory,
         VolumeReaderFactoryInterface* volume_reader_factory);

  virtual ~Volume();

  // Initializes the volume.
  bool Init();

  // Reads archive metadata using libarchive.
  void ReadMetadata(const std::string& request_id,
                    const std::string& encoding,
                    int64_t archive_size);

  // Processes a successful archive chunk read from JavaScript. Read offset
  // represents the offset from where the data contained in array_buffer starts.
  void ReadChunkDone(const std::string& request_id,
                     const pp::VarArrayBuffer& array_buffer,
                     int64_t read_offset);

  // Processes an invalid archive chunk read from JavaScript.
  void ReadChunkError(const std::string& request_id);

  // Opens a file.
  void OpenFile(const std::string& request_id,
                const std::string& file_path,
                const std::string& encoding,
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

  JavaScriptMessageSenderInterface* message_sender() { return message_sender_; }
  JavaScriptRequestorInterface* requestor() { return requestor_; }
  std::string file_system_id() { return file_system_id_; }

 private:
  // Encapsulates arguments to OpenFileCallback, as NewCallback supports binding
  // up to three arguments, while here we have four.
  struct OpenFileArgs;

  // A callback helper for ReadMetadata.
  void ReadMetadataCallback(int32_t result,
                            const std::string& request_id,
                            const std::string& encoding,
                            int64_t archive_size);

  // A calback helper for OpenFile.
  void OpenFileCallback(int32_t result,
                        const OpenFileArgs& args);

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
                                     const std::string& encoding,
                                     int64_t archive_size);

  // Cleanups any data related to a volume archive. Return value should be
  // checked only if post_cleanup_error is true. post_cleanup_error should be
  // false in case an error message was already sent to JavaScript.
  // Must be called in the worker_.
  bool CleanupVolumeArchive(VolumeArchive* volume_archive,
                            bool post_cleanup_error);

  // Gets the VolumeArchive from worker_reads_in_progress_ map based on
  // request_id. In case there is no key with request_id in the map then returns
  // NULL. Can be called from both worker_ and the main thread. Operations with
  // volume_archive that don't execute in worker_ must be guarded by acquiring
  // worker_reads_in_progress_lock_ before calling GetVolumeArchive and
  // releasing it only after not using the VolumeArchive anymore.
  VolumeArchive* GetVolumeArchive(const std::string& request_id);

  // The file system id for this volume.
  std::string file_system_id_;

  // An object that sends messages to JavaScript.
  JavaScriptMessageSenderInterface* message_sender_;

  // A worker for jobs that require blocking operations or a lot of processing
  // time. Those shouldn't be done on the main thread. The jobs submitted to
  // this thread are executed in order, so a new job must wait for the last job
  // to finish.
  // TODO(cmihail): Consider using multiple workers in case of many jobs to
  // improve execution speedup. In case multiple workers are added
  // synchronization between workers might be needed.
  pp::SimpleThread worker_;

  // Callback factory used to submit jobs to worker_.
  // See "Detailed Description" Note at:
  // https://developer.chrome.com/native-client/
  //     pepper_dev/cpp/classpp_1_1_completion_callback_factory
  //
  // As a minus this would require ugly synchronization between the main thread
  // and the function that is executed on worker_ construction. Current
  // implementation is simimlar to examples in $NACL_SDK_ROOT and according to
  // https://chromiumcodereview.appspot.com/lint_patch/issue10790078_24001_25013
  // it should be safe (see TODO(dmichael)). That's because both worker_ and
  // callback_factory_ will be alive during the life of Volume and deleting a
  // Volume is permitted only if there are no requests in progress on
  // JavaScript side (this means no Callbacks in progress).
  pp::CompletionCallbackFactory<Volume> callback_factory_;

  // A map containing all reads in progress. First argument is a unique key per
  // reader and the second is the reader itself. The map must be guarded as
  // Volume::ReadChunkDone / Volume::ReadChunkError can be called after removing
  // their correspondent VolumeArchive from the map due to receiving the
  // response to read ahead from JavaScript after a CloseFile event.
  std::map<std::string, VolumeArchive*> worker_reads_in_progress_;
  pp::Lock worker_reads_in_progress_lock_;  // A lock for guarding above map.

  // A requestor for making calls to JavaScript.
  JavaScriptRequestorInterface* requestor_;

  // A factory for creating VolumeArchive.
  VolumeArchiveFactoryInterface* volume_archive_factory_;

  // A factory for creating VolumeReader.
  VolumeReaderFactoryInterface* volume_reader_factory_;
};

#endif  /// VOLUME_H_
