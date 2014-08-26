// Copyright (c) 2012 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "request.h"
#include "volume.h"
#include "volume_reader_javascript_stream.h"

#include <sstream>

namespace {

const char PATH_DELIMITER[] = "/";

// Posts a file system error message.
inline void PostFileSystemError(const std::string& message,
                                const std::string& file_system_id,
                                const std::string& request_id,
                                pp::Instance* instance) {
  instance->PostMessage(
      request::CreateFileSystemError(message, file_system_id, request_id));
}

// Gets the JavaScript VolumeReader. In case of any error, sends an error
// message to JavaScript and returns NULL.
VolumeReaderJavaScriptStream* GetJavaScriptVolumeReader(
    const std::string& file_system_id,
    const std::string& request_id,
    std::map<std::string, VolumeArchive*>* worker_reads_in_progress,
    pp::Instance* instance) {
  // TODO(cmihail): This map should be lock guarded, or use a thread safe map.
  // For now is ok as only READ_METADATA is supported and it will never go
  // into races. But once extracting files is added the code becomes prone to
  // races.
  std::map<std::string, VolumeArchive*>::iterator it =
      worker_reads_in_progress->find(request_id);

  if (it != worker_reads_in_progress->end()) {
    return static_cast<VolumeReaderJavaScriptStream*>(it->second->reader());
  } else {
    PostFileSystemError("No VolumeReader for <" + request_id + ">",
                        file_system_id,
                        request_id,
                        instance);
    return NULL;
  }
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

  unsigned int position = entry_path.find(PATH_DELIMITER);
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
        position + sizeof(PATH_DELIMITER) - 1 /* Last char is '\0'. */);

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

Volume::Volume(pp::Instance* instance, const std::string& file_system_id)
    : instance_(instance),
      file_system_id_(file_system_id),
      worker_(instance),
      callback_factory_(this) {
}

Volume::~Volume() {
  worker_.Join();
  typedef std::map<std::string, VolumeArchive*>::iterator iterator_type;
  for (iterator_type iterator = worker_reads_in_progress_.begin();
       iterator != worker_reads_in_progress_.end();
       iterator++) {
    // No need to call CleanupVolumeArchive as it will erase elements from map.
    // The map will be freed anyway because Volume is deconstructed.
    iterator->second->Cleanup();
    delete iterator->second;
  }
}

bool Volume::Init() {
  return worker_.Start();
}

void Volume::ReadMetadata(const std::string& request_id, int64_t archive_size) {
  worker_.message_loop().PostWork(callback_factory_.NewCallback(
      &Volume::ReadMetadataCallback, request_id, archive_size));
}
void Volume::ReadChunkDone(const std::string& request_id,
                           const pp::VarArrayBuffer& array_buffer) {
  VolumeReaderJavaScriptStream* volume_reader = GetJavaScriptVolumeReader(
      file_system_id_, request_id, &worker_reads_in_progress_, instance_);
  if (!volume_reader)
    return;

  volume_reader->SetBufferAndSignal(array_buffer);
}

void Volume::ReadChunkError(const std::string& request_id) {
  VolumeReaderJavaScriptStream* volume_reader = GetJavaScriptVolumeReader(
      file_system_id_, request_id, &worker_reads_in_progress_, instance_);
  if (!volume_reader)
    return;

  volume_reader->ReadErrorSignal();
  // Resource cleanup will be done by the blocked thread as the error will
  // be forward to libarchive once that thread unblocks. Due to how libarchive
  // works, both the JavaScript read error and libarchive errors will be
  // processed similarly, so it's better to leave the error handle to the
  // other thread.
}

void Volume::ReadMetadataCallback(int32_t /*result*/,
                                  const std::string& request_id,
                                  int64_t archive_size) {
  VolumeArchive* volume_archive = CreateVolumeArchive(request_id, archive_size);
  if (!volume_archive)
    return;

  // Read and construct metadata.
  pp::VarDictionary root_metadata = CreateEntry(PATH_DELIMITER, true, 0, 0);

  const char* pathname;
  int64_t size;
  bool is_directory;
  time_t modification_time;
  for (;;) {
    if (!volume_archive->GetNextHeader(
            &pathname, &size, &is_directory, &modification_time)) {
      PostFileSystemError(volume_archive->error_message(),
                          file_system_id_,
                          request_id,
                          instance_);
      CleanupVolumeArchive(volume_archive, false);
      return;
    }

    if (!pathname)  // End of archive.
      break;

    ConstructMetadata(
        pathname, size, is_directory, modification_time, &root_metadata);
  }

  // Free resources. In case of an error post a message, as this would be the
  // first error message to post.
  if (!CleanupVolumeArchive(volume_archive, true))
    return;

  // Send metadata back to JS.
  instance_->PostMessage(request::CreateReadMetadataDoneResponse(
      file_system_id_, request_id, root_metadata));
}

VolumeArchive* Volume::CreateVolumeArchive(const std::string& request_id,
                                           int64_t archive_size) {
  VolumeReader* reader = new VolumeReaderJavaScriptStream(
      file_system_id_, request_id, archive_size, instance_);
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
  worker_reads_in_progress_.insert(
      std::pair<std::string, VolumeArchive*>(request_id, volume_archive));

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
  worker_reads_in_progress_.erase(volume_archive->request_id());

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
