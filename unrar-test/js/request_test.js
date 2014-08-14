// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * @type {string}
 * @const
 */
var FILE_SYSTEM_ID = 'id';

/**
 * @type {number}
 * @const
 */
var REQUEST_ID = 10;

/**
 * @type {number}
 * @const
 */
var ARCHIVE_SIZE = 5000;

/**
 * @type {ArrayBuffer}
 * @const
 */
var CHUNK_BUFFER = new ArrayBuffer(5);

/**
 * @type {string}
 * @const
 */
var CLOSE_VOLUME_REQUEST_ID = '-1';

describe('On calling', function() {
  describe('request.createReadMetadataRequest should create a request',
           function() {
    var readMetadataRequest;
    beforeEach(function() {
      readMetadataRequest = request.createReadMetadataRequest(
          FILE_SYSTEM_ID, REQUEST_ID, ARCHIVE_SIZE);
    });

    it('with READ_METADATA as operation', function() {
      expect(readMetadataRequest[request.Key.OPERATION])
          .to.equal(request.Operation.READ_METADATA);
    });

    it('with correct file system id', function() {
      expect(readMetadataRequest[request.Key.FILE_SYSTEM_ID])
          .to.equal(FILE_SYSTEM_ID);
    });

    it('with correct request id', function() {
      expect(readMetadataRequest[request.Key.REQUEST_ID])
          .to.equal(REQUEST_ID.toString());
    });

    it('with correct archive size', function() {
      expect(readMetadataRequest[request.Key.ARCHIVE_SIZE])
          .to.equal(ARCHIVE_SIZE.toString());
    });
  });

  describe('request.createReadChunkDoneResponse should create a response',
           function() {
    var readChunkDoneReponse;
    beforeEach(function() {
      readChunkDoneReponse = request.createReadChunkDoneResponse(
          FILE_SYSTEM_ID, REQUEST_ID, CHUNK_BUFFER);
    });

    it('with READ_CHUNK_DONE as operation', function() {
      expect(readChunkDoneReponse[request.Key.OPERATION])
          .to.equal(request.Operation.READ_CHUNK_DONE);
    });

    it('with correct file system id', function() {
      expect(readChunkDoneReponse[request.Key.FILE_SYSTEM_ID])
          .to.equal(FILE_SYSTEM_ID);
    });

    it('with correct request id', function() {
      expect(readChunkDoneReponse[request.Key.REQUEST_ID])
          .to.equal(REQUEST_ID.toString());
    });

    it('with correct chunk buffer', function() {
      expect(readChunkDoneReponse[request.Key.CHUNK_BUFFER])
          .to.equal(CHUNK_BUFFER);
    });
  });

  describe('request.createReadChunkErrorResponse should create a response',
           function() {
    var readChunkErrorReponse;
    beforeEach(function() {
      readChunkErrorReponse = request.createReadChunkErrorResponse(
          FILE_SYSTEM_ID, REQUEST_ID, CHUNK_BUFFER);
    });

    it('with READ_CHUNK_ERROR as operation', function() {
      expect(readChunkErrorReponse[request.Key.OPERATION])
          .to.equal(request.Operation.READ_CHUNK_ERROR);
    });

    it('with correct file system id', function() {
      expect(readChunkErrorReponse[request.Key.FILE_SYSTEM_ID])
          .to.equal(FILE_SYSTEM_ID);
    });

    it('with correct request id', function() {
      expect(readChunkErrorReponse[request.Key.REQUEST_ID])
          .to.equal(REQUEST_ID.toString());
    });
  });

  describe('request.createCloseVolumeRequest should create a request',
           function() {
    var closeVolumeRequest;
    beforeEach(function() {
      closeVolumeRequest = request.createCloseVolumeRequest(FILE_SYSTEM_ID);
    });

    it('with CLOSE_VOLUME as operation', function() {
      expect(closeVolumeRequest[request.Key.OPERATION])
          .to.equal(request.Operation.CLOSE_VOLUME);
    });

    it('with correct file system id', function() {
      expect(closeVolumeRequest[request.Key.FILE_SYSTEM_ID])
          .to.equal(FILE_SYSTEM_ID);
    });

    it('with correct request id', function() {
      expect(closeVolumeRequest[request.Key.REQUEST_ID])
          .to.equal(CLOSE_VOLUME_REQUEST_ID);
    });
  });
});
