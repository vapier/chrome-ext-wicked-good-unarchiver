// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef JAVASCRIPT_MESSAGE_SENDER_H_
#define JAVASCRIPT_MESSAGE_SENDER_H_

#include <string>

// Creates and sends messages to JavaScript. Messages are send asynchronously.
class JavaScriptMessageSender {
 public:
  virtual ~JavaScriptMessageSender() {}

  virtual void SendFileSystemError(const std::string& file_system_id,
                                   const std::string& request_id,
                                   const std::string& message) = 0;

  virtual void SendFileChunkRequest(const std::string& file_system_id,
                                    const std::string& request_id,
                                    int64_t offset,
                                    size_t bytes_to_read) = 0;

  virtual void SendReadMetadataDone(const std::string& file_system_id,
                                    const std::string& request_id,
                                    const pp::VarDictionary& metadata) = 0;

  virtual void SendOpenFileDone(const std::string& file_system_id,
                                const std::string& request_id) = 0;

  virtual void SendCloseFileDone(const std::string& file_system_id,
                                 const std::string& request_id,
                                 const std::string& open_request_id) = 0;

  virtual void SendReadFileDone(const std::string& file_system_id,
                                const std::string& request_id,
                                const pp::VarArrayBuffer& array_buffer,
                                bool has_more_data) = 0;
};

#endif  // JAVASCRIPT_MESSAGE_SENDER_H_
