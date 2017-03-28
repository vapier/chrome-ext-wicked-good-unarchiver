// Copyright 2014 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * Defines the protocol used to communicate between JS and NaCL.
 * This should be consistent with cpp/request.h.
 * @namespace
 */
unpacker.request = {
  /**
   * Defines request ids. Every key should be unique and the same as the keys
   * on the NaCL side.
   * @enum {string}
   */
  Key: {
    // Mandatory keys for all requests.
    OPERATION: 'operation',  // Should be a unpacker.request.Operation.
    FILE_SYSTEM_ID: 'file_system_id',  // Should be a string.
    REQUEST_ID: 'request_id',          // Should be a string.

    // Optional keys depending on request operation.
    ERROR: 'error',                // Should be a string.
    METADATA: 'metadata',          // Should be a dictionary.
    ARCHIVE_SIZE: 'archive_size',  // Should be a string as only int is
                                   // supported by pp::Var on C++.
    CHUNK_BUFFER: 'chunk_buffer',  // Should be an ArrayBuffer.
    OFFSET: 'offset',      // Should be a string. Same reason as ARCHIVE_SIZE.
    LENGTH: 'length',      // Should be a string. Same reason as ARCHIVE_SIZE.
    INDEX: 'index',        // Should be a string. Same reason as ARCHIVE_SIZE.
    ENCODING: 'encoding',  // Should be a string.
    OPEN_REQUEST_ID: 'open_request_id',  // Should be a string, just like
                                         // REQUEST_ID.
    READ_FILE_DATA: 'read_file_data',    // Should be an ArrayBuffer.
    HAS_MORE_DATA: 'has_more_data',      // Should be a boolean.
    PASSPHRASE: 'passphrase',            // Should be a string.
    SRC_FILE: 'src_file',                // Should be a string.
    SRC_LINE: 'src_line',                // Should be a int.
    SRC_FUNC: 'src_func',                // Should be a string.
    MESSAGE: 'message',                  // Should be a string.
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
    CONSOLE_LOG: 15,
    CONSOLE_DEBUG: 16,
    FILE_SYSTEM_ERROR: -1
  },

  /**
   * Creates a basic request with mandatory fields.
   * @param {!unpacker.request.Operation} operation
   * @param {!unpacker.types.FileSystemId} fileSystemId
   * @param {!unpacker.types.RequestId} requestId The request id. Should be
   *     unique only per file system.
   * @private
   * @return {!Object} A new request with mandatory fields.
   */
  createBasic_: function(operation, fileSystemId, requestId) {
    var basicRequest = {};
    basicRequest[unpacker.request.Key.OPERATION] = operation;
    basicRequest[unpacker.request.Key.FILE_SYSTEM_ID] = fileSystemId;
    basicRequest[unpacker.request.Key.REQUEST_ID] = requestId.toString();
    return basicRequest;
  },

  /**
   * Creates a read metadata request.
   * @param {!unpacker.types.FileSystemId} fileSystemId
   * @param {!unpacker.types.RequestId} requestId
   * @param {string} encoding Default encoding for the archive.
   * @param {number} archiveSize The size of the archive for fileSystemId.
   * @return {!Object} A read metadata request.
   */
  createReadMetadataRequest: function(fileSystemId, requestId, encoding,
                                      archiveSize) {
    var readMetadataRequest = unpacker.request.createBasic_(
        unpacker.request.Operation.READ_METADATA, fileSystemId, requestId);
    readMetadataRequest[unpacker.request.Key.ENCODING] = encoding;
    readMetadataRequest[unpacker.request.Key.ARCHIVE_SIZE] =
        archiveSize.toString();
    return readMetadataRequest;
  },

  /**
   * Creates a read chunk done response. This is a response to a READ_CHUNK
   * request from NaCl.
   * @param {!unpacker.types.FileSystemId} fileSystemId
   * @param {!unpacker.types.RequestId} requestId
   * @param {!ArrayBuffer} buffer A buffer containing the data that was read.
   * @param {number} readOffset The offset from where buffer starts. This is
   *     required for distinguishing multiple read chunk requests done in
   *     parallel for different offsets.
   * @return {!Object} A read chunk done response.
   */
  createReadChunkDoneResponse: function(fileSystemId, requestId, buffer,
                                        readOffset) {
    var response = unpacker.request.createBasic_(
        unpacker.request.Operation.READ_CHUNK_DONE, fileSystemId, requestId);
    response[unpacker.request.Key.CHUNK_BUFFER] = buffer;
    response[unpacker.request.Key.OFFSET] = readOffset.toString();
    return response;
  },

  /**
   * Creates a read chunk error response. This is a response to a READ_CHUNK
   * request from NaCl in case of any errors in order for NaCl to cleanup
   * resources.
   * @param {!unpacker.types.FileSystemId} fileSystemId
   * @param {!unpacker.types.RequestId} requestId
   * @return {!Object} A read chunk error response.
   */
  createReadChunkErrorResponse: function(fileSystemId, requestId) {
    return unpacker.request.createBasic_(
        unpacker.request.Operation.READ_CHUNK_ERROR, fileSystemId, requestId);
  },

  /**
   * Creates a read passphrase done response. This is a response to a
   * READ_PASSPHRASE request from NaCl.
   * @param {!unpacker.types.FileSystemId} fileSystemId
   * @param {!unpacker.types.RequestId} requestId
   * @param {string} passphrase The passphrase.
   * @return {!Object} A read passphrase done response.
   */
  createReadPassphraseDoneResponse: function(fileSystemId, requestId,
                                             passphrase) {
    var response = unpacker.request.createBasic_(
        unpacker.request.Operation.READ_PASSPHRASE_DONE, fileSystemId,
        requestId);
    response[unpacker.request.Key.PASSPHRASE] = passphrase;
    return response;
  },

  /**
   * Creates a read passphrase error response. This is a response to a
   * READ_PASSPHRASE request from NaCl in case of any errors in order for NaCl
   * to cleanup resources.
   * @param {!unpacker.types.FileSystemId} fileSystemId
   * @param {!unpacker.types.RequestId} requestId
   * @return {!Object} A read passphrase error response.
   */
  createReadPassphraseErrorResponse: function(fileSystemId, requestId) {
    return unpacker.request.createBasic_(
        unpacker.request.Operation.READ_PASSPHRASE_ERROR, fileSystemId,
        requestId);
  },

  /**
   * Creates a request to close a volume related to a fileSystemId.
   * Can be called after any request.
   * @param {!unpacker.types.FileSystemId} fileSystemId
   * @return {!Object} A close volume request.
   */
  createCloseVolumeRequest: function(fileSystemId) {
    return unpacker.request.createBasic_(
        unpacker.request.Operation.CLOSE_VOLUME, fileSystemId, -1);
  },

  /**
   * Creates an open file request.
   * @param {!unpacker.types.FileSystemId} fileSystemId
   * @param {number} index The index of the file in the header list.
   * @param {string} encoding Default encoding for the archive.
   * @param {number} archiveSize The size of the volume's archive.
   * @return {!Object} An open file request.
   */
  createOpenFileRequest: function(fileSystemId, requestId, index, encoding,
                                  archiveSize) {
    var openFileRequest = unpacker.request.createBasic_(
        unpacker.request.Operation.OPEN_FILE, fileSystemId, requestId);
    openFileRequest[unpacker.request.Key.INDEX] = index.toString();
    openFileRequest[unpacker.request.Key.ENCODING] = encoding;
    openFileRequest[unpacker.request.Key.ARCHIVE_SIZE] = archiveSize.toString();
    return openFileRequest;
  },

  /**
   * Creates a close file request.
   * @param {!unpacker.types.FileSystemId} fileSystemId
   * @param {!unpacker.types.RequestId} requestId
   * @param {!unpacker.types.RequestId} openRequestId
   * @return {!Object} A close file request.
   */
  createCloseFileRequest: function(fileSystemId, requestId, openRequestId) {
    var closeFileRequest = unpacker.request.createBasic_(
        unpacker.request.Operation.CLOSE_FILE, fileSystemId, requestId);
    closeFileRequest[unpacker.request.Key.OPEN_REQUEST_ID] =
        openRequestId.toString();
    return closeFileRequest;
  },

  /**
   * Creates a read file request.
   * @param {!unpacker.types.FileSystemId} fileSystemId
   * @param {!unpacker.types.RequestId} requestId
   * @param {!unpacker.types.RequestId} openRequestId
   * @param {number} offset The offset from where read is done.
   * @param {number} length The number of bytes required.
   * @return {!Object} A read file request.
   */
  createReadFileRequest: function(fileSystemId, requestId, openRequestId,
                                  offset, length) {
    var readFileRequest = unpacker.request.createBasic_(
        unpacker.request.Operation.READ_FILE, fileSystemId, requestId);
    readFileRequest[unpacker.request.Key.OPEN_REQUEST_ID] =
        openRequestId.toString();
    readFileRequest[unpacker.request.Key.OFFSET] = offset.toString();
    readFileRequest[unpacker.request.Key.LENGTH] = length.toString();
    return readFileRequest;
  }
};
