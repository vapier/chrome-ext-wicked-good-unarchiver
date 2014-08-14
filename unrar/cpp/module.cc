// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "request.h"
#include "volume.h"

#include <sstream>

#include "ppapi/cpp/instance.h"
#include "ppapi/cpp/logging.h"
#include "ppapi/cpp/module.h"
#include "ppapi/cpp/var_dictionary.h"

// An instance for every "embed" in the web page. For this extension only one
// "embed" is necessary.
class NaclArchiveInstance : public pp::Instance {
 public:
  explicit NaclArchiveInstance(PP_Instance instance) : pp::Instance(instance) {}
  virtual ~NaclArchiveInstance() {
    for (std::map<std::string, Volume*>::iterator iterator = volumes_.begin();
         iterator != volumes_.end(); iterator++) {
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
        Volume* volume = CreateOrGetVolume(file_system_id, request_id);
        if (volume) {
          PP_DCHECK(var_dict.Get(request::key::kArchiveSize).is_string());
          std::stringstream ss_archive_size(
              var_dict.Get(request::key::kArchiveSize).AsString());
          int64_t archive_size;
          ss_archive_size >> archive_size;
          volume->ReadMetadata(request_id, archive_size);
        }
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

      case request::CLOSE_VOLUME: {
        std::map<std::string, Volume*>::iterator it =
            volumes_.find(file_system_id);
        if (it != volumes_.end()) {
          delete it->second;
          volumes_.erase(file_system_id);
        }
        break;
      }

      default:
        PostMessage(request::CreateFileSystemError(
            "Invalid operation key", file_system_id, request_id));
    }
  }

 private:
  // Gets the corresponding volume for file_system_id or create a new volume
  // if none. In case of any volume creation problems, an error message is sent
  // back to JavaScript and NULL is returned.
  Volume* CreateOrGetVolume(const std::string& file_system_id,
                            const std::string& request_id) {
    std::map<std::string, Volume*>::iterator it = volumes_.find(file_system_id);
    if (it != volumes_.end()) {
      return it->second;
    }

    Volume* volume = new Volume(this, file_system_id);
    if (!volume->Init()) {
      PostMessage(request::CreateFileSystemError(
          "Could not create a volume for: " + file_system_id,
          file_system_id,
          request_id));
      delete volume;
      return NULL;
    }

    volumes_[file_system_id] = volume;
    return volume;
  }

  void ReadChunkDone(const pp::VarDictionary& var_dict,
                     const std::string& file_system_id,
                     const std::string& request_id) {
    PP_DCHECK(var_dict.Get(request::key::kChunkBuffer).is_array_buffer());
    pp::VarArrayBuffer array_buffer(var_dict.Get(request::key::kChunkBuffer));

    std::map<std::string, Volume*>::iterator it = volumes_.find(file_system_id);
    if (it != volumes_.end()) {
      it->second->ReadChunkDone(request_id, array_buffer);
    } else {
      PostMessage(request::CreateFileSystemError(
          "No Volume for this file system", file_system_id, request_id));
    }
  }

  void ReadChunkError(const std::string& file_system_id,
                      const std::string& request_id) {
    std::map<std::string, Volume*>::iterator it = volumes_.find(file_system_id);
    if (it != volumes_.end()) {
      it->second->ReadChunkError(request_id);
    } else {
      PostMessage(request::CreateFileSystemError(
          "No Volume for this file system", file_system_id, request_id));
    }
  }

  // A map that holds for every opened archive its instance. The key is the file
  // system id of the archive.
  std::map<std::string, Volume*> volumes_;
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
