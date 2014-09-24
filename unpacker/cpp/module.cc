// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include <sstream>

#include "ppapi/cpp/instance.h"
#include "ppapi/cpp/instance_handle.h"
#include "ppapi/cpp/logging.h"
#include "ppapi/cpp/module.h"
#include "ppapi/cpp/var_dictionary.h"
#include "ppapi/utility/threading/lock.h"
#include "ppapi/utility/threading/simple_thread.h"

#include "request.h"
#include "volume.h"

namespace {

typedef std::map<std::string, Volume*>::const_iterator volume_iterator;

// An internal implementation of JavaScriptMessageSenderInterface. This class
// handles all communication from the module to the JavaScript code. Thread
// safety is ensured only for PNaCl, not NaCl. See crbug.com/412692 and
// crbug.com/413513.
class JavaScriptMessageSender : public JavaScriptMessageSenderInterface {
 public:
  // JavaScriptMessageSender does not own the instance pointer.
  explicit JavaScriptMessageSender(pp::Instance* instance)
      : instance_(instance) {}

  virtual void SendFileSystemError(const std::string& file_system_id,
                                   const std::string& request_id,
                                   const std::string& message) {
    JavaScriptPostMessage(
        request::CreateFileSystemError(file_system_id, request_id, message));
  }

  virtual void SendFileChunkRequest(const std::string& file_system_id,
                                    const std::string& request_id,
                                    int64_t offset,
                                    int64_t bytes_to_read) {
    PP_DCHECK(offset >= 0);
    PP_DCHECK(bytes_to_read > 0);
    JavaScriptPostMessage(request::CreateReadChunkRequest(
        file_system_id, request_id, offset, bytes_to_read));
  }

  virtual void SendReadMetadataDone(const std::string& file_system_id,
                                    const std::string& request_id,
                                    const pp::VarDictionary& metadata) {
    JavaScriptPostMessage(request::CreateReadMetadataDoneResponse(
        file_system_id, request_id, metadata));
  }

  virtual void SendOpenFileDone(const std::string& file_system_id,
                                const std::string& request_id) {
    JavaScriptPostMessage(
        request::CreateOpenFileDoneResponse(file_system_id, request_id));
  }

  virtual void SendCloseFileDone(const std::string& file_system_id,
                                 const std::string& request_id,
                                 const std::string& open_request_id) {
    JavaScriptPostMessage(request::CreateCloseFileDoneResponse(
        file_system_id, request_id, open_request_id));
  }

  virtual void SendReadFileDone(const std::string& file_system_id,
                                const std::string& request_id,
                                const pp::VarArrayBuffer& array_buffer,
                                bool has_more_data) {
    JavaScriptPostMessage(request::CreateReadFileDoneResponse(
        file_system_id, request_id, array_buffer, has_more_data));
  }

 private:
  // Posts a message to JavaScript. This is prone to races in case of using
  // NaCl instead of PNaCl. See crbug.com/413513.
  void JavaScriptPostMessage(const pp::VarDictionary& message) {
    instance_->PostMessage(message);
  }

  pp::Instance* instance_;
};

}  // namespace

// An instance for every "embed" in the web page. For this extension only one
// "embed" is necessary.
class NaclArchiveInstance : public pp::Instance {
 public:
  explicit NaclArchiveInstance(PP_Instance instance)
      : pp::Instance(instance),
        instance_handle_(instance),
        message_sender_(this) {}

  virtual ~NaclArchiveInstance() {
    for (volume_iterator iterator = volumes_.begin();
         iterator != volumes_.end();
         ++iterator) {
      delete iterator->second;
    }
  }

  // Handler for messages coming in from JS via postMessage().
  virtual void HandleMessage(const pp::Var& var_message) {
    PP_DCHECK(var_message.is_dictionary());
    pp::VarDictionary var_dict(var_message);

    PP_DCHECK(var_dict.Get(request::key::kOperation).is_int());
    int operation = var_dict.Get(request::key::kOperation).AsInt();

    PP_DCHECK(var_dict.Get(request::key::kFileSystemId).is_string());
    std::string file_system_id =
        var_dict.Get(request::key::kFileSystemId).AsString();

    PP_DCHECK(var_dict.Get(request::key::kRequestId).is_string());
    std::string request_id = var_dict.Get(request::key::kRequestId).AsString();

    // Process operation.
    switch (operation) {
      case request::READ_METADATA: {
        ReadMetadata(var_dict, file_system_id, request_id);
        break;
      }

      case request::READ_CHUNK_DONE:
        // No need to initialize volume as this is a response to READ_CHUNK
        // sent from NaCl.
        ReadChunkDone(var_dict, file_system_id, request_id);
        break;

      case request::READ_CHUNK_ERROR:
        // No need to initialize volume as this is a response to READ_CHUNK
        // sent from NaCl.
        ReadChunkError(file_system_id, request_id);
        break;

      case request::OPEN_FILE:
        OpenFile(var_dict, file_system_id, request_id);
        break;

      case request::CLOSE_FILE:
        CloseFile(var_dict, file_system_id, request_id);
        break;

      case request::READ_FILE:
        ReadFile(var_dict, file_system_id, request_id);
        break;

      case request::CLOSE_VOLUME: {
        volume_iterator iterator = volumes_.find(file_system_id);
        PP_DCHECK(iterator != volumes_.end());
        delete iterator->second;
        volumes_.erase(file_system_id);
        break;
      }

      default:
        PP_NOTREACHED();
    }
  }

 private:
  // Reads the metadata for the corresponding volume for file_system_id. This
  // should be called only once and before any other operation like OpenFile,
  // ReadFile, etc.
  // Reading metadata or opening a file could work even if the Volume exists
  // or not, but as the JavaScript code doesn't use this feature there is no
  // reason to allow it. If the logic on JavaScript changes then this can be
  // updated. But in current design if we read metadata for an existing Volume,
  // then there is a programmer error on JavaScript side.
  void ReadMetadata(const pp::VarDictionary& var_dict,
                    const std::string& file_system_id,
                    const std::string& request_id) {
    // Should not call ReadMetadata for a Volume already present in NaCl.
    PP_DCHECK(volumes_.find(file_system_id) == volumes_.end());

    Volume* volume =
        new Volume(instance_handle_, file_system_id, &message_sender_);
    if (!volume->Init()) {
      message_sender_.SendFileSystemError(
          file_system_id,
          request_id,
          "Could not create a volume for: " + file_system_id + ".");
      delete volume;
      return;
    }
    volumes_[file_system_id] = volume;

    PP_DCHECK(var_dict.Get(request::key::kArchiveSize).is_string());
    volume->ReadMetadata(
        request_id,
        request::GetInt64FromString(var_dict, request::key::kArchiveSize));
  }

  void ReadChunkDone(const pp::VarDictionary& var_dict,
                     const std::string& file_system_id,
                     const std::string& request_id) {
    PP_DCHECK(var_dict.Get(request::key::kChunkBuffer).is_array_buffer());
    pp::VarArrayBuffer array_buffer(var_dict.Get(request::key::kChunkBuffer));

    PP_DCHECK(var_dict.Get(request::key::kOffset).is_string());
    int64_t read_offset =
        request::GetInt64FromString(var_dict, request::key::kOffset);

    volume_iterator iterator = volumes_.find(file_system_id);
    // Volume was unmounted so ignore the read chunk operation.
    // Possible scenario for read ahead.
    if (iterator == volumes_.end())
      return;
    iterator->second->ReadChunkDone(request_id, array_buffer, read_offset);
  }

  void ReadChunkError(const std::string& file_system_id,
                      const std::string& request_id) {
    volume_iterator iterator = volumes_.find(file_system_id);
    // Volume was unmounted so ignore the read chunk operation.
    // Possible scenario for read ahead.
    if (iterator == volumes_.end())
      return;
    iterator->second->ReadChunkError(request_id);
  }

  void OpenFile(const pp::VarDictionary& var_dict,
                const std::string& file_system_id,
                const std::string& request_id) {
    PP_DCHECK(var_dict.Get(request::key::kFilePath).is_string());
    std::string file_path(var_dict.Get(request::key::kFilePath).AsString());

    PP_DCHECK(var_dict.Get(request::key::kArchiveSize).is_string());
    int64_t archive_size =
        request::GetInt64FromString(var_dict, request::key::kArchiveSize);

    volume_iterator iterator = volumes_.find(file_system_id);
    PP_DCHECK(iterator != volumes_.end());  // Should call OpenFile after
                                            // ReadMetadata.
    iterator->second->OpenFile(request_id, file_path, archive_size);
  }

  void CloseFile(const pp::VarDictionary& var_dict,
                 const std::string& file_system_id,
                 const std::string& request_id) {
    PP_DCHECK(var_dict.Get(request::key::kOpenRequestId).is_string());
    std::string open_request_id(
        var_dict.Get(request::key::kOpenRequestId).AsString());

    volume_iterator iterator = volumes_.find(file_system_id);
    PP_DCHECK(iterator !=
              volumes_.end());  // Should call CloseFile after OpenFile.

    iterator->second->CloseFile(request_id, open_request_id);
  }

  void ReadFile(const pp::VarDictionary& var_dict,
                const std::string& file_system_id,
                const std::string& request_id) {
    PP_DCHECK(var_dict.Get(request::key::kOpenRequestId).is_string());
    PP_DCHECK(var_dict.Get(request::key::kOffset).is_string());
    PP_DCHECK(var_dict.Get(request::key::kLength).is_string());

    volume_iterator iterator = volumes_.find(file_system_id);
    PP_DCHECK(iterator !=
              volumes_.end());  // Should call ReadFile after OpenFile.

    // Passing the entire dictionary because pp::CompletionCallbackFactory
    // cannot create callbacks with more than 3 parameters. Here we need 4:
    // request_id, open_request_id, offset and length.
    iterator->second->ReadFile(request_id, var_dict);
  }

  // A map that holds for every opened archive its instance. The key is the file
  // system id of the archive.
  std::map<std::string, Volume*> volumes_;

  // An pp::InstanceHandle used to create pp::SimpleThread in Volume.
  pp::InstanceHandle instance_handle_;

  // An object used to send messages to JavaScript.
  JavaScriptMessageSender message_sender_;
};

// The Module class. The browser calls the CreateInstance() method to create
// an instance of your NaCl module on the web page. The browser creates a new
// instance for each <embed> tag with type="application/x-pnacl" or
// type="application/x-nacl".
class NaclArchiveModule : public pp::Module {
 public:
  NaclArchiveModule() : pp::Module() {}
  virtual ~NaclArchiveModule() {}

  // Create and return a NaclArchiveInstance object.
  // @param[in] instance The browser-side instance.
  // @return the plugin-side instance.
  virtual pp::Instance* CreateInstance(PP_Instance instance) {
    return new NaclArchiveInstance(instance);
  }
};

namespace pp {

// Factory function called by the browser when the module is first loaded.
// The browser keeps a singleton of this module.  It calls the
// CreateInstance() method on the object you return to make instances.  There
// is one instance per <embed> tag on the page.  This is the main binding
// point for your NaCl module with the browser.
Module* CreateModule() {
  return new NaclArchiveModule();
}

}  // namespace pp
