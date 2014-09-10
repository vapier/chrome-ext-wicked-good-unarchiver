// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "volume.h"

#include <sstream>

#include "request.h"
#include "volume_reader_javascript_stream.h"

namespace {

const char kPathDelimiter[] = "/";
const int32_t kReadBufferSizeMax = 512 * 1024;  // 512 KB.

// Posts a file system error message.
inline void PostFileSystemError(const std::string& message,
                                const std::string& file_system_id,
                                const std::string& request_id,
                                pp::Instance* instance) {
  instance->PostMessage(
      request::CreateFileSystemError(message, file_system_id, request_id));
}

// size is int64_t and modification_time is time_t because this is how
// libarchive is going to pass them to us.
pp::VarDictionary CreateEntry(const std::string& name,
                              bool is_directory,
                              int64_t size,
                              time_t modification_time) {
  pp::VarDictionary entry_metadata;
  entry_metadata.Set("isDirectory", is_directory);
  entry_metadata.Set("name", name);
  // size is int64_t, unsupported by pp::Var
  std::stringstream ss_size;
  ss_size << size;
  entry_metadata.Set("size", ss_size.str());
  // mtime is time_t, unsupported by pp::Var
  std::stringstream ss_modification_time;
  ss_modification_time << modification_time;
  entry_metadata.Set("modificationTime", ss_modification_time.str());

  if (is_directory)
    entry_metadata.Set("entries", pp::VarDictionary());

  return entry_metadata;
}

void ConstructMetadata(const std::string& entry_path,
                       int64_t size,
                       bool is_directory,
                       time_t modification_time,
                       pp::VarDictionary* parent_metadata) {
  if (entry_path == "")
    return;

  pp::VarDictionary parent_entries =
      pp::VarDictionary(parent_metadata->Get("entries"));

  unsigned int position = entry_path.find(kPathDelimiter);
  pp::VarDictionary entry_metadata;
  std::string entry_name;

  if (position == std::string::npos) {  // The entry itself.
    entry_name = entry_path;
    entry_metadata =
        CreateEntry(entry_name, is_directory, size, modification_time);

    // Update directory information. Required as sometimes the directory itself
    // is returned after the files inside it.
    pp::Var old_entry_metadata_var = parent_entries.Get(entry_name);
    if (!old_entry_metadata_var.is_undefined()) {
      pp::VarDictionary old_entry_metadata =
          pp::VarDictionary(old_entry_metadata_var);
      PP_DCHECK(old_entry_metadata.Get("isDirectory").AsBool());
      entry_metadata.Set("entries", old_entry_metadata.Get("entries"));
    }
  } else {  // Get next parent on the way to the entry.
    entry_name = entry_path.substr(0, position);

    // Get next parent metadata. If none, create a new directory entry for it.
    // Some archives don't have directory information inside and for some the
    // information is returned later than the files inside it.
    pp::Var entry_metadata_var = parent_entries.Get(entry_name);
    if (entry_metadata_var.is_undefined())
      entry_metadata = CreateEntry(entry_name, true, 0, modification_time);
    else
      entry_metadata = pp::VarDictionary(parent_entries.Get(entry_name));

    // Continue to construct metadata for all directories on the path to the
    // to the entry and for the entry itself.
    std::string entry_path_without_next_parent = entry_path.substr(
        position + sizeof(kPathDelimiter) - 1 /* Last char is '\0'. */);

    ConstructMetadata(entry_path_without_next_parent,
                      size,
                      is_directory,
                      modification_time,
                      &entry_metadata);
  }

  // Recreate parent_metadata. This is necessary because pp::VarDictionary::Get
  // returns a Var, not a Var& or Var* to directly modify the result.
  parent_entries.Set(entry_name, entry_metadata);
  parent_metadata->Set("entries", parent_entries);
}

}  // namespace

// An internal implementation of JavaScriptRequestor.
class VolumeJavaScriptRequestor : public JavaScriptRequestor {
 public:
  explicit VolumeJavaScriptRequestor(Volume* volume) : volume_(volume) {}

  virtual void RequestFileChunk(const std::string& request_id,
                                int64_t offset,
                                size_t bytes_to_read) {
    volume_->instance()->PostMessage(request::CreateReadChunkRequest(
        volume_->file_system_id(), request_id, offset, bytes_to_read));
  }

 private:
  Volume* volume_;
};

Volume::Volume(pp::Instance* instance, const std::string& file_system_id)
    : instance_(instance),
      file_system_id_(file_system_id),
      worker_(instance),
      callback_factory_(this) {
  requestor_ = new VolumeJavaScriptRequestor(this);
}

Volume::~Volume() {
  worker_.Join();

  typedef std::map<std::string, VolumeArchive*>::iterator iterator_type;
  for (iterator_type iterator = worker_reads_in_progress_.begin();
       iterator != worker_reads_in_progress_.end();
       ++iterator) {
    // No need to call CleanupVolumeArchive as it will erase elements from map.
    // The map will be freed anyway because Volume is deconstructed.
    iterator->second->Cleanup();
    delete iterator->second;
  }

  delete requestor_;
}

bool Volume::Init() {
  return worker_.Start();
}

void Volume::ReadMetadata(const std::string& request_id, int64_t archive_size) {
  worker_.message_loop().PostWork(callback_factory_.NewCallback(
      &Volume::ReadMetadataCallback, request_id, archive_size));
}

void Volume::OpenFile(const std::string& request_id,
                      const std::string& file_path,
                      int64_t archive_size) {
  worker_.message_loop().PostWork(callback_factory_.NewCallback(
      &Volume::OpenFileCallback, request_id, file_path, archive_size));
}

void Volume::CloseFile(const std::string& request_id,
                       const std::string& open_request_id) {
  // Though close file could be executed on main thread, we send it to worker_
  // in order to ensure thread safety.
  worker_.message_loop().PostWork(callback_factory_.NewCallback(
      &Volume::CloseFileCallback, request_id, open_request_id));
}

void Volume::ReadFile(const std::string& request_id,
                      const pp::VarDictionary& dictionary) {
  worker_.message_loop().PostWork(callback_factory_.NewCallback(
      &Volume::ReadFileCallback, request_id, dictionary));
}

void Volume::ReadChunkDone(const std::string& request_id,
                           const pp::VarArrayBuffer& array_buffer,
                           int64_t read_offset) {
  // It is possible that the corresponing VolumeArchive was removed from map
  // before receiving the chunk. This can happen for ReadAhead responses
  // received after a CloseFile event. This is a common scenario for archives
  // in archives where VolumeReaderJavaScriptStream makes ReadAhead calls that
  // might not be used.
  worker_reads_in_progress_lock_.Acquire();
  VolumeArchive* volume_archive = GetVolumeArchive(request_id);
  if (!volume_archive) {
    worker_reads_in_progress_lock_.Release();
    return;
  }

  // ReadChunkDone should be called only for VolumeReaderJavaScriptStream.
  VolumeReaderJavaScriptStream* volume_reader =
      static_cast<VolumeReaderJavaScriptStream*>(volume_archive->reader());

  volume_reader->SetBufferAndSignal(array_buffer, read_offset);
  worker_reads_in_progress_lock_.Release();
}

void Volume::ReadChunkError(const std::string& request_id) {
  worker_reads_in_progress_lock_.Acquire();
  VolumeArchive* volume_archive = GetVolumeArchive(request_id);
  if (!volume_archive) {
    worker_reads_in_progress_lock_.Release();
    return;
  }

  // ReadChunkError should be called only for VolumeReaderJavaScriptStream.
  VolumeReaderJavaScriptStream* volume_reader =
      static_cast<VolumeReaderJavaScriptStream*>(volume_archive->reader());

  volume_reader->ReadErrorSignal();
  // Resource cleanup will be done by the blocked thread as the error will
  // be forward to libarchive once that thread unblocks. Due to how libarchive
  // works, both the JavaScript read error and libarchive errors will be
  // processed similarly, so it's better to leave the error handle to the
  // other thread.
  worker_reads_in_progress_lock_.Release();
}

void Volume::ReadMetadataCallback(int32_t /*result*/,
                                  const std::string& request_id,
                                  int64_t archive_size) {
  VolumeArchive* volume_archive = CreateVolumeArchive(request_id, archive_size);
  if (!volume_archive)
    return;

  // Read and construct metadata.
  pp::VarDictionary root_metadata = CreateEntry(kPathDelimiter, true, 0, 0);

  const char* path_name;
  int64_t size;
  bool is_directory;
  time_t modification_time;
  for (;;) {
    if (!volume_archive->GetNextHeader(
            &path_name, &size, &is_directory, &modification_time)) {
      PostFileSystemError(volume_archive->error_message(),
                          file_system_id_,
                          request_id,
                          instance_);
      CleanupVolumeArchive(volume_archive, false);
      return;
    }

    if (!path_name)  // End of archive.
      break;

    ConstructMetadata(
        path_name, size, is_directory, modification_time, &root_metadata);
  }

  // Free resources. In case of an error post a message, as this would be the
  // first error message to post.
  if (!CleanupVolumeArchive(volume_archive, true))
    return;

  // Send metadata back to JS.
  instance_->PostMessage(request::CreateReadMetadataDoneResponse(
      file_system_id_, request_id, root_metadata));
}

void Volume::OpenFileCallback(int32_t /*result*/,
                              const std::string& request_id,
                              const std::string& file_path,
                              int64_t archive_size) {
  VolumeArchive* volume_archive = CreateVolumeArchive(request_id, archive_size);
  if (!volume_archive)
    return;

  const char* path_name = NULL;
  int64_t size = 0;
  bool is_directory = false;
  time_t modification_time = 0;
  for (;;) {
    if (!volume_archive->GetNextHeader(
            &path_name, &size, &is_directory, &modification_time)) {
      PostFileSystemError(volume_archive->error_message(),
                          file_system_id_,
                          request_id,
                          instance_);
      CleanupVolumeArchive(volume_archive, false);
      return;
    }

    if (!path_name) {
      PostFileSystemError("File not found in archive: " + file_path + ".",
                          file_system_id_,
                          request_id,
                          instance_);
      return;
    }

    if (file_path.compare(std::string(kPathDelimiter) + path_name) == 0)
      break;  // File reached. Data should be obtained by calling
              // VolumeArchive::ReadData.
  }

  // Send successful opened file response to NaCl.
  instance_->PostMessage(
      request::CreateOpenFileDoneResponse(file_system_id_, request_id));
}

void Volume::CloseFileCallback(int32_t /*result*/,
                               const std::string& request_id,
                               const std::string& open_request_id) {
  // Obtain the VolumeArchive for the opened file using open_request_id.
  // The volume should have been created using Volume::OpenFile.
  // No need for guarding the call as this is done on the same thread as the one
  // allowed to call CleanupVolumeArchive.
  VolumeArchive* volume_archive = GetVolumeArchive(open_request_id);
  PP_DCHECK(volume_archive);  // Close file should be called only for
                              // opened files that have a corresponding
                              // VolumeArchive.

  if (!CleanupVolumeArchive(volume_archive, false)) {
    // Error send using request_id, not open_request_id.
    PostFileSystemError(volume_archive->error_message(),
                        file_system_id_,
                        request_id,
                        instance_);
    return;
  }

  instance_->PostMessage(request::CreateCloseFileDoneResponse(
      file_system_id_, request_id, open_request_id));
}

void Volume::ReadFileCallback(int32_t /*result*/,
                              const std::string& request_id,
                              const pp::VarDictionary& dictionary) {
  std::string open_request_id(
      dictionary.Get(request::key::kOpenRequestId).AsString());
  int64_t offset =
      request::GetInt64FromString(dictionary, request::key::kOffset);
  int32_t length(dictionary.Get(request::key::kLength).AsInt());

  // Get the correspondent VolumeArchive to the opened file. Any errors
  // should be send to JavaScript using request_id, NOT open_request_id.
  // No need for guarding the call as this is done on the same thread as the one
  // allowed to call CleanupVolumeArchive.
  VolumeArchive* volume_archive =
      GetVolumeArchive(open_request_id /* The opened file request id. */);
  PP_DCHECK(volume_archive);  // Read file should be called only for
                              // opened files that have a corresponding
                              // VolumeArchive.

  // Decompress data and send it to JavaScript. In case length is too big, we
  // will send multiple chunks with limit kReadBufferSizeMax per chunk in
  // order to avoid out of memory issues.
  while (length > 0) {
    int32_t buffer_size;
    bool has_more_data;
    if (length > kReadBufferSizeMax) {
      has_more_data = true;
      buffer_size = kReadBufferSizeMax;
    } else {
      has_more_data = false;
      buffer_size = length;
    }

    // Read decompressed data.
    pp::VarArrayBuffer array_buffer(buffer_size);
    char* array_buffer_data = static_cast<char*>(array_buffer.Map());

    if (!volume_archive->ReadData(offset, buffer_size, array_buffer_data)) {
      // Error messages should be sent to the read request (request_id), not
      // open request (open_request_id), as the last one has finished and this
      // is a read file.
      PostFileSystemError(volume_archive->error_message(),
                          file_system_id_,
                          request_id,
                          instance_);
      // Should not cleanup VolumeArchive as Volume::CloseFile will be called in
      // case of failure.
      array_buffer.Unmap();
      return;
    }
    array_buffer.Unmap();

    // Send response back to ReadFile request.
    instance_->PostMessage(request::CreateReadFileDoneResponse(
        file_system_id_, request_id, array_buffer, has_more_data));

    length -= buffer_size;
    offset += buffer_size;
  }
}

VolumeArchive* Volume::CreateVolumeArchive(const std::string& request_id,
                                           int64_t archive_size) {
  VolumeReader* reader =
      new VolumeReaderJavaScriptStream(request_id, archive_size, requestor_);
  if (reader->Open() != ARCHIVE_OK) {
    // TODO(cmihail): In case we have another VolumeReader implementation we
    // could use that as a backup. e.g. If we have both FileIO and JavaScript
    // stream, one of them can be the backup used here.
    PostFileSystemError(
        "Couldn't open volume reader", file_system_id_, request_id, instance_);
    delete reader;
    return NULL;
  }

  // Pass VolumeReader ownership to VolumeArchive.
  VolumeArchive* volume_archive = new VolumeArchive(request_id, reader);
  // VolumeArchive::Init() will call READ_CHUNK for getting archive headers.
  worker_reads_in_progress_lock_.Acquire();
  worker_reads_in_progress_.insert(
      std::pair<std::string, VolumeArchive*>(request_id, volume_archive));
  worker_reads_in_progress_lock_.Release();

  if (!volume_archive->Init()) {
    PostFileSystemError(volume_archive->error_message(),
                        file_system_id_,
                        request_id,
                        instance_);
    CleanupVolumeArchive(volume_archive, false);
    return NULL;
  }
  return volume_archive;
}

bool Volume::CleanupVolumeArchive(VolumeArchive* volume_archive,
                                  bool post_cleanup_error) {
  bool returnValue = true;

  worker_reads_in_progress_lock_.Acquire();
  // Erase sould be called only for a VolumeArchive that has a corresponding
  // valid request id.
  PP_DCHECK(worker_reads_in_progress_.find(volume_archive->request_id()) !=
            worker_reads_in_progress_.end());
  worker_reads_in_progress_.erase(volume_archive->request_id());
  worker_reads_in_progress_lock_.Release();

  if (!volume_archive->Cleanup() && post_cleanup_error) {
    PostFileSystemError(volume_archive->error_message(),
                        file_system_id_,
                        volume_archive->request_id(),
                        instance_);
    returnValue = false;
  }

  delete volume_archive;

  return returnValue;
}

// If not executing in worker_ thread, before calling GetVolumeArchive, acquire
// worker_reads_in_progress_lock_. Release the lock only after finishing using
// VolumeArchive and any of its members as CleanupVolumeArchive can delete it
// in the worker_ in parallel and lead to bugs.
VolumeArchive* Volume::GetVolumeArchive(const std::string& request_id) {
  std::map<std::string, VolumeArchive*>::iterator it =
      worker_reads_in_progress_.find(request_id);

  if (it == worker_reads_in_progress_.end())
    return NULL;
  return it->second;
}
