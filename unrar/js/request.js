// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * Defines the protocol used to communicate between JS and NaCL.
 * This should be consistent with cpp/request.h.
 */
var request = {
  /**
   * Defines request ids. Every key should be unique and the same as the keys
   * on the NaCL side.
   * @enum {string}
   */
  Key: {
    // Mandatory keys for all requests.
    OPERATION: 'operation',  // Should be a request.Operation.
    FILE_SYSTEM_ID: 'file_system_id',  // Should be a string.
    REQUEST_ID: 'request_id',  // Should be a string.

    // Optional keys depending on request operation.
    ERROR: 'error',  // Should be a string.
    METADATA: 'metadata',  // Should be a dictionary.
    ARCHIVE_SIZE: 'archive_size',  // Should be a string as only int is
                                   // supported by pp::Var on C++.
    CHUNK_BUFFER: 'chunk_buffer',  // Should be an ArrayBuffer.
    OFFSET: 'offset',  // Should be a string. Same reason as ARCHIVE_SIZE.
    LENGTH: 'length'  // Should be a number. No need to read chunks > 4GB.
  },

  /**
   * Defines request operations. These operation should be the same as the
   * operations on the NaCL side.
   * @enum {number}
   */
  Operation: {
    READ_METADATA: 0,
    READ_METADATA_DONE: 1,
    READ_CHUNK: 2,
    READ_CHUNK_DONE: 3,
    READ_CHUNK_ERROR: 4,
    CLOSE_VOLUME: 5,
    FILE_SYSTEM_ERROR: -1  // Errors specific to a file system. Requires
                           // FILE_SYSTEM_ID and MESSAGE_ID.
  },

  /**
   * Creates a basic request with mandatory fields.
   * @param {request.Operation} operation The operation of the request.
   * @param {string} fileSystemId The file system id.
   * @param {number} requestId The request id. Should be unique only per file
   *     system.
   * @private
   * @return {Object} A new request with mandatory fields.
   */
  createBasic_: function(operation, fileSystemId, requestId) {
    var basicRequest = {};
    basicRequest[request.Key.OPERATION] = operation;
    basicRequest[request.Key.FILE_SYSTEM_ID] = fileSystemId;
    basicRequest[request.Key.REQUEST_ID] = requestId.toString();
    return basicRequest;
  },

  /**
   * Creates a read metadata request.
   * @param {string} fileSystemId The file system id.
   * @param {number} requestId The request id.
   * @param {number} ArchiveSize The size of the archive for fileSystemId.
   * @return {Object} A read metadata request.
   */
  createReadMetadataRequest: function(fileSystemId, requestId, archiveSize) {
    var readMetadataRequest = request.createBasic_(
        request.Operation.READ_METADATA, fileSystemId, requestId);
    readMetadataRequest[request.Key.ARCHIVE_SIZE] = archiveSize.toString();
    return readMetadataRequest;
  },

  /**
   * Creates a read chunk done response. This is a response to a READ_CHUNK
   * request from NaCl.
   * @param {string} fileSystemId The file system id.
   * @param {number} requestId The response key.
   * @param {ArrayBuffer} buffer A buffer containing the data that was read.
   * @return {Object} A read chunk done response.
   */
  createReadChunkDoneResponse: function(fileSystemId, requestId, buffer) {
    var response = request.createBasic_(request.Operation.READ_CHUNK_DONE,
                                        fileSystemId, requestId);
    response[request.Key.CHUNK_BUFFER] = buffer;
    return response;
  },

  /**
   * Creates a read chunk error response. This is a response to a READ_CHUNK
   * request from NaCl in case of any errors in order for NaCl to cleanup
   * resources.
   * @param {string} fileSystemId The file system id.
   * @param {number} requestId The response key.
   * @return {Object} A read chunk error response.
   */
  createReadChunkErrorResponse: function(fileSystemId, requestId) {
    return request.createBasic_(request.Operation.READ_CHUNK_ERROR,
                                fileSystemId, requestId);
  },

  /**
   * Creates a request to close a volume related to a fileSystemId.
   * Can be called after any request.
   * @param {string} fileSystemId The file system id.
   * @return {Object} A close volume request.
   */
  createCloseVolumeRequest: function(fileSystemId) {
    return request.createBasic_(request.Operation.CLOSE_VOLUME,
                                fileSystemId, -1);
  }
};
