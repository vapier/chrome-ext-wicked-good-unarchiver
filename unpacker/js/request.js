// Copyright 2014 The Chromium OS Authors. All rights reserved.
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
    LENGTH: 'length',  // Should be a string. Same reason as ARCHIVE_SIZE.
    INDEX: 'index',    // Should be a string. Same reason as ARCHIVE_SIZE.
    ENCODING: 'encoding',    // Should be a string.
    OPEN_REQUEST_ID: 'open_request_id',  // Should be a string, just like
                                         // REQUEST_ID.
    READ_FILE_DATA: 'read_file_data',  // Should be an ArrayBuffer.
    HAS_MORE_DATA: 'has_more_data',  // Should be a boolean.
    PASSPHRASE: 'passphrase',        // Should be a string.
  },

  /**
   * Defines request operations. These operation should be the same as the
   * operations on the NaCL side. FILE_SYSTEM_ID and REQUEST_ID are mandatory
   * for all requests.
   * @enum {number}
   */
  Operation: {
    READ_METADATA: 0,
    READ_METADATA_DONE: 1,
    READ_CHUNK: 2,
    READ_CHUNK_DONE: 3,
    READ_CHUNK_ERROR: 4,
    READ_PASSPHRASE: 5,
    READ_PASSPHRASE_DONE: 6,
    READ_PASSPHRASE_ERROR: 7,
    CLOSE_VOLUME: 8,
    OPEN_FILE: 9,
    OPEN_FILE_DONE: 10,
    CLOSE_FILE: 11,
    CLOSE_FILE_DONE: 12,
    READ_FILE: 13,
    READ_FILE_DONE: 14,
    FILE_SYSTEM_ERROR: -1
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
   * @param {string} encoding Default encoding for the archive.
   * @param {number} archiveSize The size of the archive for fileSystemId.
   * @return {Object} A read metadata request.
   */
  createReadMetadataRequest: function(fileSystemId, requestId, encoding,
                                      archiveSize) {
    var readMetadataRequest = request.createBasic_(
        request.Operation.READ_METADATA, fileSystemId, requestId);
    readMetadataRequest[request.Key.ENCODING] = encoding;
    readMetadataRequest[request.Key.ARCHIVE_SIZE] = archiveSize.toString();
    return readMetadataRequest;
  },

  /**
   * Creates a read chunk done response. This is a response to a READ_CHUNK
   * request from NaCl.
   * @param {string} fileSystemId The file system id.
   * @param {number} requestId The response key.
   * @param {ArrayBuffer} buffer A buffer containing the data that was read.
   * @param {number} readOffset The offset from where buffer starts. This is
   *     required for distinguishing multiple read chunk requests done in
   *     parallel for different offsets.
   * @return {Object} A read chunk done response.
   */
  createReadChunkDoneResponse: function(fileSystemId, requestId, buffer,
                                        readOffset) {
    var response = request.createBasic_(request.Operation.READ_CHUNK_DONE,
                                        fileSystemId, requestId);
    response[request.Key.CHUNK_BUFFER] = buffer;
    response[request.Key.OFFSET] = readOffset.toString();
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
   * Creates a read passphrase done response. This is a response to a
   * READ_PASSPHRASE request from NaCl.
   * @param {string} fileSystemId The file system id.
   * @param {number} requestId The response key.
   * @param {string} passphrase The passphrase.
   * @return {!Object} A read passphrase done response.
   */
  createReadPassphraseDoneResponse: function(
      fileSystemId, requestId, passphrase) {
    var response = request.createBasic_(request.Operation.READ_PASSPHRASE_DONE,
                                        fileSystemId, requestId);
    response[request.Key.PASSPHRASE] = passphrase;
    return response;
  },

  /**
   * Creates a read passphrase error response. This is a response to a
   * READ_PASSPHRASE request from NaCl in case of any errors in order for NaCl
   * to cleanup resources.
   * @param {string} fileSystemId The file system id.
   * @param {number} requestId The response key.
   * @return {!Object} A read passphrase error response.
   */
  createReadPassphraseErrorResponse: function(fileSystemId, requestId) {
    return request.createBasic_(request.Operation.READ_PASSPHRASE_ERROR,
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
  },

  /**
   * Creates an open file request.
   * @param {string} fileSystemId The file system id.
   * @param {number} index The index of the file in the header list.
   * @param {string} encoding Default encoding for the archive.
   * @param {string} archiveSize The size of the volume's archive.
   * @return {Object} An open file request.
   */
  createOpenFileRequest: function(fileSystemId, requestId, index, encoding,
                                  archiveSize) {
    var openFileRequest = request.createBasic_(request.Operation.OPEN_FILE,
                                               fileSystemId, requestId);
    openFileRequest[request.Key.INDEX] = index.toString();
    openFileRequest[request.Key.ENCODING] = encoding;
    openFileRequest[request.Key.ARCHIVE_SIZE] = archiveSize.toString();
    return openFileRequest;
  },

  /**
   * Creates a close file request.
   * @param {string} fileSystemId The file system id.
   * @param {number} requestId The request id.
   * @param {number} openRequestId The open request id.
   * @return {Object} A close file request.
   */
  createCloseFileRequest: function(fileSystemId, requestId, openRequestId) {
    var closeFileRequest = request.createBasic_(request.Operation.CLOSE_FILE,
                                                fileSystemId, requestId);
    closeFileRequest[request.Key.OPEN_REQUEST_ID] = openRequestId.toString();
    return closeFileRequest;
  },

  /**
   * Creates a read file request.
   * @param {string} fileSystemId The file system id.
   * @param {number} requestId The request id.
   * @param {number} openRequestId The open request id.
   * @param {number} offset The offset from where read is done.
   * @param {number} length The number of bytes required.
   * @return {Object} A read file request.
   */
  createReadFileRequest: function(fileSystemId, requestId, openRequestId,
                                  offset, length) {
    var readFileRequest = request.createBasic_(request.Operation.READ_FILE,
                                               fileSystemId, requestId);
    readFileRequest[request.Key.OPEN_REQUEST_ID] = openRequestId.toString();
    readFileRequest[request.Key.OFFSET] = offset.toString();
    readFileRequest[request.Key.LENGTH] = length.toString();
    return readFileRequest;
   }
};
