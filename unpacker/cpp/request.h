// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef REQUEST_H_
#define REQUEST_H_

#include "ppapi/cpp/var_array_buffer.h"
#include "ppapi/cpp/var_dictionary.h"

// Defines the protocol messsage used to communicate between JS and NaCL.
// This should be consistent with js/request.h.
namespace request {

// Defines requests keys. Every key should be unique and the same as the keys
// on the JS side.
namespace key {

// Mandatory keys for all requests.
const char kOperation[] = "operation";  // Should be a request::Operation.
const char kFileSystemId[] = "file_system_id";  // Should be a string.
const char kRequestId[] = "request_id";         // Should be a string.

// Optional keys depending on request operation.
const char kError[] = "error";        // Should be a string.
const char kMetadata[] = "metadata";  // Should be a pp:VarDictionary.
const char kArchiveSize[] =
    "archive_size";  // Should be a string as int64_t is not support by pp::Var.
const char kChunkBuffer[] = "chunk_buffer";  // Should be a pp::VarArrayBuffer.
const char kOffset[] = "offset";       // Should be a string as int64_t is not
                                       // supported by pp::Var.
const char kLength[] = "length";       // Should be an int.
const char kFilePath[] = "file_path";  // Should be a string.
const char kEncoding[] = "encoding";   // Should be a string.
const char kOpenRequestId[] = "open_request_id";  // Should be a string, just
                                                  // like kRequestId.
const char kReadFileData[] = "read_file_data";    // Should be a
                                                  // pp::VarArrayBuffer.
const char kHasMoreData[] = "has_more_data";      // Should be a bool.

}  // namespace key

// Defines request operations. These operations should be the same as the
// operations on the JavaScript side.
enum Operation {
  READ_METADATA = 0,
  READ_METADATA_DONE = 1,
  READ_CHUNK = 2,
  READ_CHUNK_DONE = 3,
  READ_CHUNK_ERROR = 4,
  CLOSE_VOLUME = 5,
  OPEN_FILE = 6,
  OPEN_FILE_DONE = 7,
  CLOSE_FILE = 8,
  CLOSE_FILE_DONE = 9,
  READ_FILE = 10,
  READ_FILE_DONE = 11,
  FILE_SYSTEM_ERROR = -1,  // Errors specific to a file system.
};

// Creates a response to READ_METADATA request.
pp::VarDictionary CreateReadMetadataDoneResponse(
    const std::string& file_system_id,
    const std::string& request_id,
    const pp::VarDictionary& metadata);

// Creates a request for a file chunk from JavaScript.
pp::VarDictionary CreateReadChunkRequest(const std::string& file_system_id,
                                         const std::string& request_id,
                                         int64_t offset,
                                         int64_t length);

// Creates a response to OPEN_FILE request.
pp::VarDictionary CreateOpenFileDoneResponse(const std::string& file_system_id,
                                             const std::string& request_id);

// Creates a response to CLOSE_FILE request.
pp::VarDictionary CreateCloseFileDoneResponse(
    const std::string& file_system_id,
    const std::string& request_id,
    const std::string& open_request_id);

// Creates a response to READ_FILE request.
pp::VarDictionary CreateReadFileDoneResponse(
    const std::string& file_system_id,
    const std::string& request_id,
    const pp::VarArrayBuffer& array_buffer,
    bool has_more_data);

// Creates a file system error.
pp::VarDictionary CreateFileSystemError(const std::string& file_system_id,
                                        const std::string& request_id,
                                        const std::string& error);

// Obtains a int64_t from a string value inside dictionary based on a
// request::Key.
int64_t GetInt64FromString(const pp::VarDictionary& dictionary,
                           const std::string& request_key);

}  // namespace request

#endif  // REQUEST_H_
