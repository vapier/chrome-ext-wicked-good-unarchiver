// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

describe('Decompressor', function() {
  /**
   * @type {string}
   * @const
   */
  var FILE_SYSTEM_ID = 'fileSystemId';

  /**
   * @type {number}
   * @const
   */
  var REQUEST_ID = 10;

  /**
   * @type {Blob}
   * @const
   */
  var BLOB = new Blob([new Uint8Array(100)],
                      {type: 'application/octet-stream'});

  var naclModule;
  var decompressor;
  var blobContents;
  var onSuccessSpy;
  var onErrorSpy;

  beforeEach(function(done) {
    naclModule = {postMessage: sinon.spy()};
    decompressor = new Decompressor(naclModule, FILE_SYSTEM_ID, BLOB);
    onSuccessSpy = sinon.spy();
    onErrorSpy = sinon.spy();

    // Load BLOB contents.
    var reader = new FileReader();
    reader.onload = function(event) {
      blobContents = event.target.result;
      done();
    };
    reader.readAsArrayBuffer(BLOB);
  });

  it('should not have any requests in progress if no method was called',
      function() {
    expect(Object.keys(decompressor.requestsInProgress).length).to.equal(0);
  });

  describe('that reads metadata', function() {
    beforeEach(function() {
      decompressor.readMetadata(REQUEST_ID, onSuccessSpy, onErrorSpy);
    });

    it('should add a new request in progress', function() {
      expect(decompressor.requestsInProgress[REQUEST_ID]).to.not.be.undefined;
    });

    it('should call naclModule.postMessage once', function() {
      expect(naclModule.postMessage.calledOnce).to.be.true;
    });

    it('should call naclModule.postMessage with read metadata request',
        function() {
      var readMetadataRequest = request.createReadMetadataRequest(
          FILE_SYSTEM_ID, REQUEST_ID, BLOB.size);
      expect(naclModule.postMessage.calledWith(readMetadataRequest)).to.be.true;
    });

    // Test READ_METADATA_DONE.
    describe('and receives a processMessage with READ_METADATA_DONE',
             function() {
      var data = {};
      beforeEach(function() {
        data[request.Key.METADATA] = 'metadata';  // Not important.
        decompressor.processMessage(data,
                                    request.Operation.READ_METADATA_DONE,
                                    REQUEST_ID);
      });

      it('should call onSuccess with the metadata', function() {
        expect(onSuccessSpy.calledWith(data[request.Key.METADATA])).to.be.true;
      });

      it('should not call onError', function() {
        expect(onErrorSpy.called).to.be.false;
      });

      it('should remove the request in progress', function() {
        expect(decompressor.requestsInProgress[REQUEST_ID]).to.be.undefined;
      });
    });

    // Test READ_CHUNK.
    describe('and receives a processMessage with READ_CHUNK', function() {
      var data = {};

      describe('that has length < file.size - offset', function() {
        it('should call naclModule.postMessage with READ_CHUNK_DONE response',
            function(done) {
          var expectedResponse = request.createReadChunkDoneResponse(
              FILE_SYSTEM_ID, REQUEST_ID, blobContents);
          data[request.Key.OFFSET] = '0';  // Received as string from NaCl.
          data[request.Key.LENGTH] = BLOB.size / 2;

          naclModule.postMessage = function(response) {
            expect(response).to.deep.equal(expectedResponse);
            done();
          };
          decompressor.processMessage(data, request.Operation.READ_CHUNK,
                                      REQUEST_ID);
        });
      });

      describe('that length > file.size - offset', function() {
        it('should call naclModule.postMessage with READ_CHUNK_DONE response',
            function(done) {
          var expectedResponse = request.createReadChunkDoneResponse(
              FILE_SYSTEM_ID, REQUEST_ID, blobContents);
          data[request.Key.OFFSET] = '0';  // Received as string from NaCl.
          data[request.Key.LENGTH] = BLOB.size * 2;

          naclModule.postMessage = function(response) {
            expect(response).to.deep.equal(expectedResponse);
            done();
          };
          decompressor.processMessage(data, request.Operation.READ_CHUNK,
                                      REQUEST_ID);
        });
      });
    });

    // Test FILE_SYSTEM_ERROR.
    describe('and receives a processMessage with FILE_SYSTEM_ERROR',
             function() {
      beforeEach(function() {
        var data = {};
        data[request.Key.ERROR] = 'Expected error at reading metadata.';
        decompressor.processMessage(data,
                                    request.Operation.FILE_SYSTEM_ERROR,
                                    REQUEST_ID);
      });

      it('should not call onSuccess', function() {
        expect(onSuccessSpy.called).to.be.false;
      });

      it('should call onError with FAILED', function() {
        expect(onErrorSpy.calledWith('FAILED')).to.be.true;
      });

      it('should remove the request in progress', function() {
        expect(decompressor.requestsInProgress[REQUEST_ID]).to.be.undefined;
      });
    });
  });
});
