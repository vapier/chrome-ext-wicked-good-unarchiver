// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

describe('On calling', function() {
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
   * @type {string}
   * @const
   */
  var ENCODING = "CP1250";

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
   * @type {number}
   * @const
   */
  var CHUNK_OFFSET = 150;

  /**
   * @type {string}
   * @const
   */
  var CLOSE_VOLUME_REQUEST_ID = '-1';

  /**
   * @type {string}
   * @const
   */
  var FILE_PATH = '/path/to/file';

  /**
   * @type {number}
   * @const
   */
  var OPEN_REQUEST_ID = 7;

  /**
   * @type {number}
   * @const
   */
  var OFFSET = 50;

  /**
   * @type {number}
   * @const
   */
  var LENGTH = 200;

  describe('request.createReadMetadataRequest should create a request',
           function() {
    var readMetadataRequest;
    beforeEach(function() {
      readMetadataRequest = request.createReadMetadataRequest(
          FILE_SYSTEM_ID, REQUEST_ID, ENCODING, ARCHIVE_SIZE);
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

    it('with correct encoding', function() {
      expect(readMetadataRequest[request.Key.ENCODING]).to.equal(ENCODING);
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
          FILE_SYSTEM_ID, REQUEST_ID, CHUNK_BUFFER, CHUNK_OFFSET);
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

    it('with correct chunk offset', function() {
      expect(readChunkDoneReponse[request.Key.OFFSET])
          .to.equal(CHUNK_OFFSET.toString());
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

  describe('request.createOpenFileRequest should create a request', function() {
    var openFileRequest;
    beforeEach(function() {
      openFileRequest = request.createOpenFileRequest(
          FILE_SYSTEM_ID, REQUEST_ID, FILE_PATH, ENCODING, ARCHIVE_SIZE);
    });

    it('with OPEN_FILE as operation', function() {
      expect(openFileRequest[request.Key.OPERATION])
          .to.equal(request.Operation.OPEN_FILE);
    });

    it('with correct file system id', function() {
      expect(openFileRequest[request.Key.FILE_SYSTEM_ID])
          .to.equal(FILE_SYSTEM_ID);
    });

    it('with correct request id', function() {
      expect(openFileRequest[request.Key.REQUEST_ID])
          .to.equal(REQUEST_ID.toString());
    });

    it('with correct file path', function() {
      expect(openFileRequest[request.Key.FILE_PATH]).to.equal(FILE_PATH);
    });

    it('with correct encoding', function() {
      expect(openFileRequest[request.Key.ENCODING]).to.equal(ENCODING);
    });

    it('with correct archive size', function() {
      expect(openFileRequest[request.Key.ARCHIVE_SIZE])
          .to.equal(ARCHIVE_SIZE.toString());
    });
  });

  describe('request.createCloseFileRequest should create a request',
      function() {
    var closeFileRequest;
    beforeEach(function() {
      closeFileRequest = request.createCloseFileRequest(
          FILE_SYSTEM_ID, REQUEST_ID, OPEN_REQUEST_ID);
    });

    it('with CLOSE_FILE as operation', function() {
      expect(closeFileRequest[request.Key.OPERATION])
          .to.equal(request.Operation.CLOSE_FILE);
    });

    it('with correct file system id', function() {
      expect(closeFileRequest[request.Key.FILE_SYSTEM_ID])
          .to.equal(FILE_SYSTEM_ID);
    });

    it('with correct request id', function() {
      expect(closeFileRequest[request.Key.REQUEST_ID])
          .to.equal(REQUEST_ID.toString());
    });

    it('with correct open request id', function() {
      expect(closeFileRequest[request.Key.OPEN_REQUEST_ID])
          .to.equal(OPEN_REQUEST_ID.toString());
    });
  });

  describe('request.createReadFileRequest should create a request', function() {
    var readFileRequest;
    beforeEach(function() {
      readFileRequest = request.createReadFileRequest(
          FILE_SYSTEM_ID, REQUEST_ID, OPEN_REQUEST_ID, OFFSET, LENGTH);
    });

    it('with READ_FILE as operation', function() {
      expect(readFileRequest[request.Key.OPERATION])
          .to.equal(request.Operation.READ_FILE);
    });

    it('with correct file system id', function() {
      expect(readFileRequest[request.Key.FILE_SYSTEM_ID])
          .to.equal(FILE_SYSTEM_ID);
    });

    it('with correct request id', function() {
      expect(readFileRequest[request.Key.REQUEST_ID])
          .to.equal(REQUEST_ID.toString());
    });

    it('with correct open request id', function() {
      expect(readFileRequest[request.Key.OPEN_REQUEST_ID])
          .to.equal(OPEN_REQUEST_ID.toString());
    });

    it('with correct offset', function() {
      expect(readFileRequest[request.Key.OFFSET]).to.equal(OFFSET.toString());
    });

    it('with correct length', function() {
      expect(readFileRequest[request.Key.LENGTH]).to.equal(LENGTH.toString());
    });
  });
});
