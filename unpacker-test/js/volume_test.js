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

  /**
   * A fake entry. Will be used outside for restore purposes.
   * @type {Entry}
   * @const
   */
  var ENTRY = null;

  /**
   * @type {number}
   * @const
   */
  var METADATA_REQUEST_ID = 1;

  /**
   * @type {number}
   * @const
   */
  var OPEN_REQUEST_ID = 2;

  /**
   * @type {number}
   * @const
   */
  var READ_REQUEST_ID = 3;

  /**
   * @type {number}
   * @const
   */
  var CLOSE_REQUEST_ID = 4;

  /**
   * In case a volume is created without a request id parameter, then this will
   * be the default request id used for reading metadata.
   * @type {number}
   * @const
   */
  var EXPECTED_DEFAULT_READ_METADATA_REQUEST_ID = -1;

  var volume;
  var decompressor;
  var onReadMetadataSuccessSpy;
  var onReadMetadataErrorSpy;

  beforeEach(function() {
    volume = null;
    decompressor = {
      readMetadata: sinon.stub(),
      openFile: sinon.stub(),
      closeFile: sinon.stub(),
      readFile: sinon.stub()
    };

    onReadMetadataSuccessSpy = sinon.spy();
    onReadMetadataErrorSpy = sinon.spy();

    volume = new Volume(decompressor, ENTRY);
  });

  it('should have null metadata before calling readMetadata', function() {
    expect(volume.metadata).to.be.null;
  });

  it('should have correct entry', function() {
    expect(volume.entry).to.equal(ENTRY);
  });

  it('should have empty openedFiles member', function() {
    expect(Object.keys(volume.openedFiles).length).to.equal(0);
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
          decompressor.readMetadata.withArgs(expectedRequestId).callsArg(2);
          volume.readMetadata(onReadMetadataSuccessSpy, onReadMetadataErrorSpy,
                              opt_requestId);
        });

        it('should not call onSuccess for volume.readMetadata', function() {
          expect(onReadMetadataSuccessSpy.called).to.be.false;
        });

        it('should call onError for volume.readMetadata', function() {
          expect(onReadMetadataErrorSpy.calledOnce).to.be.true;
        });
      });  // Invalid metatada.

      // Valid metadata.
      describe('that reads correct metadata', function() {
        beforeEach(function() {
          decompressor.readMetadata.withArgs(expectedRequestId)
              .callsArgWith(1, METADATA);
          decompressor.readMetadata.throws(
              'Unexpected argument for readMetadata.');
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
        });  // Test root directory.

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
        });  // Test file entry.

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
        });  // Test onGetMetadataRequested.

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
        });  // Test onReadDirectoryRequested.

        // Test onOpenFileRequested.
        describe('and calls onOpenFileRequested', function() {
          var onSuccessSpy;
          var onErrorSpy;
          beforeEach(function() {
            onSuccessSpy = sinon.spy();
            onErrorSpy = sinon.spy();
          });

          describe('with invalid options.mode', function() {
            beforeEach(function() {
              var options = {mode: 'invalid', create: false, filePath: '/file'};
              volume.onOpenFileRequested(options, onSuccessSpy, onErrorSpy);
            });

            it('should not call onSuccess', function() {
              expect(onSuccessSpy.called).to.be.false;
            });

            it('should call onError with INVALID_OPERATION', function() {
              expect(onErrorSpy.calledWith('INVALID_OPERATION')).to.be.true;
            });
          });

          describe('with options.create as true', function() {
            beforeEach(function() {
              var options = {mode: 'READ', create: true, filePath: '/file'};
              volume.onOpenFileRequested(options, onSuccessSpy, onErrorSpy);
            });

            it('should not call onSuccess', function() {
              expect(onSuccessSpy.called).to.be.false;
            });

            it('should call onError with INVALID_OPERATION', function() {
              expect(onErrorSpy.calledWith('INVALID_OPERATION')).to.be.true;
            });
          });

          describe('with invalid filePath', function() {
            beforeEach(function() {
              var options = {mode: 'READ', create: false, filePath: '/invalid'};
              volume.onOpenFileRequested(options, onSuccessSpy, onErrorSpy);
            });

            it('should not call onSuccess', function() {
              expect(onSuccessSpy.called).to.be.false;
            });

            it('should call onError with INVALID_OPERATION', function() {
              expect(onErrorSpy.calledWith('INVALID_OPERATION')).to.be.true;
            });
          });

          describe('with valid options', function() {
            var options;
            beforeEach(function() {
              options = {
                mode: 'READ',
                create: false,
                requestId: OPEN_REQUEST_ID,
                filePath: '/file'
              };
              decompressor.openFile.withArgs(
                  options.requestId, options.filePath).callsArg(2);

              expect(volume.openedFiles[options.requestId]).to.be.undefined;
              volume.onOpenFileRequested(options, onSuccessSpy, onErrorSpy);
            });

            it('should not call onError', function() {
              expect(onErrorSpy.called).to.be.false;
            });

            it('should call onSuccess', function() {
              expect(onSuccessSpy.called).to.be.true;
            });

            it('should add open operation options to openedFiles', function() {
              expect(volume.openedFiles[options.requestId]).to.equal(options);
            });

            // Test onCloseFileRequested.
            describe('and calls onCloseFileRequested', function() {
              var onSuccessSpy;
              var onErrorSpy;
              beforeEach(function() {
                onSuccessSpy = sinon.spy();
                onErrorSpy = sinon.spy();
              });

              describe('with invalid openRequestId', function() {
                beforeEach(function() {
                  var options = {
                    requestId: CLOSE_REQUEST_ID,
                    openRequestId: -1
                  };
                  volume.onCloseFileRequested(options, onSuccessSpy,
                                              onErrorSpy);
                });

                it('should call onError', function() {
                  expect(onErrorSpy.called).to.be.true;
                });

                it('should not call onSuccess', function() {
                  expect(onSuccessSpy.called).to.be.false;
                });
              });

              describe('with valid openRequestId', function() {
                beforeEach(function() {
                  onSuccessSpy = sinon.spy();
                  onErrorSpy = sinon.spy();
                  var options = {
                    requestId: CLOSE_REQUEST_ID,
                    openRequestId: OPEN_REQUEST_ID
                  };
                  decompressor.closeFile.withArgs(
                      options.requestId, options.openRequestId).callsArg(2);

                  volume.onCloseFileRequested(options, onSuccessSpy,
                                              onErrorSpy);
                });

                it('should not call onError', function() {
                  expect(onErrorSpy.called).to.be.false;
                });

                it('should call onSuccess', function() {
                  expect(onSuccessSpy.called).to.be.true;
                });

                it('should remove open operation options from openedFiles',
                    function() {
                  expect(volume.openedFiles[options.requestId]).to.be.undefined;
                });
              });
            });   // Test onCloseFileRequested.

            // Test onReadFileRequested.
            describe('and calls onReadFileRequested', function() {
              var onSuccessSpy;
              var onErrorSpy;
              beforeEach(function() {
                onSuccessSpy = sinon.spy();
                onErrorSpy = sinon.spy();
              });

              describe('with invalid openRequestId', function() {
                beforeEach(function() {
                  var options = {
                    requestId: READ_REQUEST_ID,
                    openRequestId: -1,
                    offset: 20,
                    length: 50
                  };
                  volume.onReadFileRequested(options, onSuccessSpy, onErrorSpy);
                });

                it('should call onError', function() {
                  expect(onErrorSpy.called).to.be.true;
                });

                it('should not call onSuccess', function() {
                  expect(onSuccessSpy.called).to.be.false;
                });
              });

              describe('with length 0', function() {
                beforeEach(function() {
                  var options = {
                    requestId: READ_REQUEST_ID,
                    openRequestId: OPEN_REQUEST_ID,
                    offset: 0,
                    length: 0  // <= 0 is invalid.
                  };
                  volume.onReadFileRequested(options, onSuccessSpy, onErrorSpy);
                });

                it('should not call onError', function() {
                  expect(onErrorSpy.called).to.be.false;
                });

                it('should call onSuccess', function() {
                  expect(onSuccessSpy.called).to.be.true;
                });

                it('should call onSuccess with empty buffer and no more data',
                    function() {
                  expect(onSuccessSpy.calledWith(new ArrayBuffer(0),
                                                 false /* No more data. */))
                      .to.be.true;
                });
              });

              describe('with offset = file size', function() {
                beforeEach(function() {
                  var options = {
                    requestId: READ_REQUEST_ID,
                    openRequestId: OPEN_REQUEST_ID,
                    offset: METADATA.entries['file'].size,
                    length: METADATA.entries['file'].size / 2
                  };
                  decompressor.readFile.withArgs(
                      options.requestId, options.openRequestId, options.offset,
                      options.length).callsArg(4);

                  volume.onReadFileRequested(options, onSuccessSpy, onErrorSpy);
                });

                it('should not call onError', function() {
                  expect(onErrorSpy.called).to.be.false;
                });

                it('should call onSuccess with empty buffer and no more data',
                    function() {
                  expect(onSuccessSpy.calledWith(new ArrayBuffer(0),
                                                 false /* No more data. */))
                      .to.be.true;
                });
              });

              describe('with offset > file size', function() {
                beforeEach(function() {
                  var options = {
                    requestId: READ_REQUEST_ID,
                    openRequestId: OPEN_REQUEST_ID,
                    offset: METADATA.entries['file'].size * 2,
                    length: METADATA.entries['file'].size / 2
                  };
                  decompressor.readFile.withArgs(
                      options.requestId, options.openRequestId, options.offset,
                      options.length).callsArg(4);

                  volume.onReadFileRequested(options, onSuccessSpy, onErrorSpy);
                });

                it('should not call onError', function() {
                  expect(onErrorSpy.called).to.be.false;
                });

                it('should call onSuccess with empty buffer and no more data',
                    function() {
                  expect(onSuccessSpy.calledWith(new ArrayBuffer(0),
                                                 false /* No more data. */))
                      .to.be.true;
                });
              });

              describe('with offset 0 and length less than file size',
                  function() {
                beforeEach(function() {
                  var options = {
                    requestId: READ_REQUEST_ID,
                    openRequestId: OPEN_REQUEST_ID,
                    offset: 0,
                    length: 1
                  };
                  decompressor.readFile.withArgs(
                      options.requestId, options.openRequestId, options.offset,
                      options.length).callsArg(4);

                  volume.onReadFileRequested(options, onSuccessSpy, onErrorSpy);
                });

                it('should not call onError', function() {
                  expect(onErrorSpy.called).to.be.false;
                });

                it('should call onSuccess', function() {
                  expect(onSuccessSpy.called).to.be.true;
                });
              });

              describe('with offset 0 and length bigger than file size',
                  function() {
                beforeEach(function() {
                  var options = {
                    requestId: READ_REQUEST_ID,
                    openRequestId: OPEN_REQUEST_ID,
                    offset: 0,
                    length: METADATA.entries['file'].size * 2
                  };
                  decompressor.readFile.withArgs(
                      options.requestId, options.openRequestId, options.offset,
                      METADATA.entries['file'].size /* Max permitted length. */)
                      .callsArg(4);

                  volume.onReadFileRequested(options, onSuccessSpy, onErrorSpy);
                });

                it('should not call onError', function() {
                  expect(onErrorSpy.called).to.be.false;
                });

                it('should call onSuccess', function() {
                  expect(onSuccessSpy.called).to.be.true;
                });
              });
            });  // Test onReadFileRequested.
          });  // With valid options.
        });  // Test onOpenFileRequested.

        // Test onCloseFileRequested.
        describe('and calls onCloseFileRequested before onOpenFileRequested',
            function() {
          var onSuccessSpy;
          var onErrorSpy;
          beforeEach(function() {
            onSuccessSpy = sinon.spy();
            onErrorSpy = sinon.spy();
            var options = {
              requestId: CLOSE_REQUEST_ID,
              openRequestId: OPEN_REQUEST_ID
            };
            volume.onCloseFileRequested(options, onSuccessSpy, onErrorSpy);
          });

          it('should not call onSuccess', function() {
            expect(onSuccessSpy.called).to.be.false;
          });

          it('should call onError with INVALID_OPERATION', function() {
            expect(onErrorSpy.calledWith('INVALID_OPERATION')).to.be.true;
          });
        });  // Test onCloseFileRequested.

        // Test onReadFileRequested.
        describe('and calls onReadFileRequested', function() {
          var onSuccessSpy;
          var onErrorSpy;
          beforeEach(function() {
            onSuccessSpy = sinon.spy();
            onErrorSpy = sinon.spy();
            var options = {
              requestId: READ_REQUEST_ID,
              openRequestId: OPEN_REQUEST_ID
            };
            volume.onReadFileRequested(options, onSuccessSpy, onErrorSpy);
          });

          it('should not call onSuccess', function() {
            expect(onSuccessSpy.called).to.be.false;
          });

          it('should call the decompressor with correct request', function() {
            expect(onErrorSpy.calledWith('INVALID_OPERATION')).to.be.true;
          });
        });  // Test onReadFileRequested.
      }); // Valid metadata.
    });
  };  // End of volumeTests.

  // Test readMetadata for volume's that were just mounted.
  volumeTests('with NO requestId', EXPECTED_DEFAULT_READ_METADATA_REQUEST_ID);

  // Test readMetadata for volume's that are created after onSuspend, restart or
  // crashes.
  volumeTests('with requestId (after suspend, restart, etc)',
              METADATA_REQUEST_ID, METADATA_REQUEST_ID);
});
