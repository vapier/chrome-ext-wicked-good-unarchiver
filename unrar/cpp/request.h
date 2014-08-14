// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef REQUEST_H_
#define REQUEST_H_

#include "ppapi/cpp/var_dictionary.h"

// Defines the protocol messsage used to communicate between JS and NaCL.
// This should be consistent with js/request.h.
namespace request {

// Defines requests keys. Every key should be unique and the same as the keys
// on the JS side.
namespace key {

// Mandatory keys for all requests.
const char* const kOperation = "operation";  // Should be a request::Operation.
const char* const kFileSystemId = "file_system_id";  // Should be a string.
const char* const kRequestId = "request_id";  // Should be a string.

// Optional keys depending on request operation.
const char* const kError = "error";  // Should be a string.
const char* const kMetadata = "metadata";   // Should be a pp:VarDictionary.
const char* const kArchiveSize =
    "archive_size";  // Should be a string as int64_t is not support by pp::Var.
const char* const kChunkBuffer = "chunk_buffer";  // Should be a
                                                  // pp::VarArrayBuffer.
const char* const kOffset = "offset";  // Should be a string as int64_t is not
                                       // supported by pp::Var.
const char* const kLength = "length";  // Should be an int.

}  // namespace key

// Defines request operations. These operations should be the same as the
// operations on the JS side.
enum Operation {
  READ_METADATA = 0,
  READ_METADATA_DONE = 1,
  READ_CHUNK = 2,
  READ_CHUNK_DONE = 3,
  READ_CHUNK_ERROR = 4,
  CLOSE_VOLUME = 5,
  FILE_SYSTEM_ERROR = -1,  // Errors specific to a file system.
};

// Creates a response to kReadMetadata request.
pp::VarDictionary CreateReadMetadataDoneResponse(
    const std::string& file_system_id,
    const std::string& request_id,
    const pp::VarDictionary& metadata);

// Creates a request for a file chunk from JavaScript.
pp::VarDictionary CreateReadChunkRequest(const std::string& file_system_id,
                                         const std::string& request_id,
                                         int64_t offset,
                                         int32_t length);

// Creates a file system error.
pp::VarDictionary CreateFileSystemError(const std::string& error,
                                        const std::string& file_system_id,
                                        const std::string& request_id);

}  // namespace request

#endif  // REQUEST_H_
