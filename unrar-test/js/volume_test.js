// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

describe('Volume', function() {
  /**
   * Fake metadata used to test volume's methods.
   * @type {Object.<string, Object>}
   */
  var METADATA = {
    name: '/',
    size: 0,
    isDirectory: true,
    modificationTime: 3000 /* In seconds. */,
    entries: {
      'file': {name: 'file', size: 50, isDirectory: false,
               modificationTime: 20000 /* In seconds. */},
      'dir': {name: 'dir', size: 0, isDirectory: true,
              modificationTime: 12000 /* In seconds. */,
              entries: {}}
    }
  };

  var volume;
  var decompressor;
  var onReadMetadataSuccessSpy;
  var onReadMetadataErrorSpy;

  beforeEach(function() {
    volume = null;
    decompressor = {};
    onReadMetadataSuccessSpy = sinon.spy();
    onReadMetadataErrorSpy = sinon.spy();

    volume = new Volume(decompressor, 'fileSystemId', 'entry');
  });

  it('should have null metadata before calling readMetadata', function() {
    expect(volume.metadata).to.be.null;
  });

  /**
   * General tests for Volume. This should behave the same for both readMetadata
   * without requestId and with requestId.
   * @param {string} describeMessage The base describe message for the tests.
   * @param {number} expectedRequestId The request id expected by
   *     decompressor.readMetadata.
   * @param {number=} opt_requestId The request id for readMetadata.
   */
  var volumeTests = function(describeMessage, expectedRequestId,
                             opt_requestId) {
    describe(describeMessage, function() {
      // Invalid metadata.
      describe('that reads invalid metadata', function() {
        beforeEach(function() {
          decompressor.readMetadata = function(requestId, onSuccess, onError) {
            expect(requestId).to.equal(expectedRequestId);
            onError();
          };
          volume.readMetadata(onReadMetadataSuccessSpy, onReadMetadataErrorSpy,
                              opt_requestId);
        });

        it('should not call onSuccess for volume.readMetadata', function() {
          expect(onReadMetadataSuccessSpy.called).to.be.false;
        });

        it('should call onError for volume.readMetadata', function() {
          expect(onReadMetadataErrorSpy.calledOnce).to.be.true;
        });
      });

      // Valid metadata.
      describe('that reads correct metadata', function() {
        beforeEach(function() {
          decompressor.readMetadata = function(requestId, onSuccess, onError) {
            expect(requestId).to.equal(expectedRequestId);
            onSuccess(METADATA);
          };
          volume.readMetadata(onReadMetadataSuccessSpy, onReadMetadataErrorSpy,
                              opt_requestId);
        });

        it('should call onSuccess for volume.readMetadata', function() {
          expect(onReadMetadataSuccessSpy.calledOnce).to.be.true;
        });

        it('should not call onError for volume.readMetadata', function() {
          expect(onReadMetadataErrorSpy.called).to.be.false;
        });

        it('should be ready to use', function() {
          expect(volume.isReady()).to.be.true;
        });

        it('should have METADATA.length entries', function() {
          expect(Object.keys(volume.metadata).length)
              .to.equal(Object.keys(METADATA).length);
        });

        // Test root directory.
        describe('which should be the root entry', function() {
          it('that is valid', function() {
            expect(volume.metadata).to.not.be.undefined;
          });

          it('that is a directory', function() {
            expect(volume.metadata.isDirectory).to.be.true;
          });

          it('that has correct size', function() {
            expect(volume.metadata.size).to.equal(METADATA.size);
          });

          it('that has correct number of ms for modification time', function() {
            expect(volume.metadata.modificationTime.getTime()).
                to.equal(METADATA.modificationTime * 1000);
          });
        });

        // Test file entry.
        describe('should have a file entry', function() {
          it('that is valid', function() {
            expect(volume.metadata.entries['file']).to.not.be.undefined;
          });

          it('that is not a directory', function() {
            expect(volume.metadata.entries['file'].isDirectory).to.be.false;
          });

          it('that has correct size', function() {
            expect(volume.metadata.entries['file'].size)
                .to.equal(METADATA.entries['file'].size);
          });

          it('that has correct number of ms for modification time', function() {
            expect(volume.metadata.entries['file'].modificationTime.getTime()).
                to.equal(METADATA.entries['file'].modificationTime * 1000);
          });
        });

        // Test onGetMetadataRequested.
        describe('and calls onGetMetadataRequested', function() {
          var onSuccessSpy;
          var onErrorSpy;
          beforeEach(function() {
            onSuccessSpy = sinon.spy();
            onErrorSpy = sinon.spy();
          });

          describe('with invalid entryPath', function() {
            beforeEach(function() {
              var options = {entryPath: 'invalid'};
              volume.onGetMetadataRequested(options, onSuccessSpy, onErrorSpy);
            });

            it('should not call onSuccess', function() {
              expect(onSuccessSpy.called).to.be.false;
            });

            it('should call onError with NOT_FOUND', function() {
              expect(onErrorSpy.calledWith('NOT_FOUND')).to.be.true;
            });
          });

          describe('with valid entryPath', function() {
            beforeEach(function() {
              var options = {entryPath: '/file'};
              volume.onGetMetadataRequested(options, onSuccessSpy, onErrorSpy);
            });

            it('should not call onError', function() {
              expect(onErrorSpy.called).to.be.false;
            });

            it('should call onSuccess with the entry metadata', function() {
              expect(onSuccessSpy.calledWith(volume.metadata.entries['file']))
                  .to.be.true;
            });
          });
        });

        // Test onReadDirectoryRequested.
        describe('and calls onReadDirectoryRequested', function() {
          var onSuccessSpy;
          var onErrorSpy;
          beforeEach(function() {
            onSuccessSpy = sinon.spy();
            onErrorSpy = sinon.spy();
          });

          describe('with invalid directoryPath', function() {
            beforeEach(function() {
              var options = {directoryPath: 'invalid'};
              volume.onReadDirectoryRequested(options, onSuccessSpy,
                                              onErrorSpy);
            });

            it('should not call onSuccess', function() {
              expect(onSuccessSpy.called).to.be.false;
            });

            it('should call onError with NOT_FOUND', function() {
              expect(onErrorSpy.calledWith('NOT_FOUND')).to.be.true;
            });
          });

          describe('with a file that is not a directory', function() {
            beforeEach(function() {
              var options = {directoryPath: '/file'};
              volume.onReadDirectoryRequested(options, onSuccessSpy,
                                              onErrorSpy);
            });

            it('should not call onSuccess', function() {
              expect(onSuccessSpy.called).to.be.false;
            });

            it('should call onError with NOT_A_DIRECTORY', function() {
              expect(onErrorSpy.calledWith('NOT_A_DIRECTORY')).to.be.true;
            });
          });

          describe('with a valid directory', function() {
            beforeEach(function() {
              var options = {directoryPath: '/'};
              volume.onReadDirectoryRequested(options, onSuccessSpy,
                                              onErrorSpy);
            });

            it('should not call onError', function() {
              expect(onErrorSpy.called).to.be.false;
            });

            it('should call onSuccess with the directory entries', function() {
              var entries = [
                volume.metadata.entries['file'],
                volume.metadata.entries['dir']
              ];
              expect(onSuccessSpy.calledWith(entries, false)).to.be.true;
            });
          });
        });

        // Test onOpenFileRequested.
        describe('and calls onOpenFileRequested', function() {
          var onSuccessSpy;
          var onErrorSpy;
          beforeEach(function() {
            onSuccessSpy = sinon.spy();
            onErrorSpy = sinon.spy();
            volume.onOpenFileRequested({}, onSuccessSpy, onErrorSpy);
          });

          it('should not call onSuccess', function() {
            expect(onSuccessSpy.called).to.be.false;
          });

          it('should call onError with INVALID_OPERATION', function() {
            expect(onErrorSpy.calledWith('INVALID_OPERATION')).to.be.true;
          });
        });

        // Test onCloseFileRequested.
        describe('and calls onCloseFileRequested', function() {
          var onSuccessSpy;
          var onErrorSpy;
          beforeEach(function() {
            onSuccessSpy = sinon.spy();
            onErrorSpy = sinon.spy();
            volume.onCloseFileRequested({}, onSuccessSpy, onErrorSpy);
          });

          it('should not call onSuccess', function() {
            expect(onSuccessSpy.called).to.be.false;
          });

          it('should call onError with INVALID_OPERATION', function() {
            expect(onErrorSpy.calledWith('INVALID_OPERATION')).to.be.true;
          });
        });

        // Test onReadFileRequested.
        describe('and calls onReadFileRequested', function() {
          var onSuccessSpy;
          var onErrorSpy;
          beforeEach(function() {
            onSuccessSpy = sinon.spy();
            onErrorSpy = sinon.spy();
            volume.onReadFileRequested({}, onSuccessSpy, onErrorSpy);
          });

          it('should not call onSuccess', function() {
            expect(onSuccessSpy.called).to.be.false;
          });

          it('should call onError with INVALID_OPERATION', function() {
            expect(onErrorSpy.calledWith('INVALID_OPERATION')).to.be.true;
          });
        });
      });
  });
  };

  // Test readMetadata for volume's that were just mounted.
  volumeTests('with NO requestId', -1);

  // Test readMetadata for volume's that are created after onSuspend, restart or
  // crashes.
  volumeTests('with requestId (after suspend, restart, etc)', 1, 1);
});
