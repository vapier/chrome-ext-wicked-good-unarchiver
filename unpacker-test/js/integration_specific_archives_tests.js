// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * The expected metadata for small_rar.rar.
 * @type {Object}
 * @const
 */
var SMALL_RAR_METADATA = {
  entries: {
    dir: {
      entries: {
        file3: {
          isDirectory: false,
          modificationTime: new Date('2014-08-13T16:57:00.000Z'),
          name: 'file3',
          size: 56
        }
      },
      isDirectory: true,
      modificationTime: new Date('2014-08-13T16:57:00.000Z'),
      name: 'dir',
      size: 0
    },
    file1: {
      isDirectory: false,
      modificationTime: new Date('2014-08-13T16:55:54.000Z'),
      name: 'file1',
      size: 15
    },
    file2: {
      isDirectory: false,
      modificationTime: new Date('2014-08-13T16:56:14.000Z'),
      name: 'file2',
      size: 33
    }
  },
  isDirectory: true,
  modificationTime: new Date('1970-01-01T00:00:00.000Z'),
  name: '/',
  size: 0
};

/**
 * The expected metadata for small_zip.zip. Different from above when it comes
 * to Date objects (2014-08-13<T16> vs 2014-08-13<T07>).
 * @type {Object}
 * @const
 */
var SMALL_ZIP_METADATA = {
  entries: {
    dir: {
      entries: {
        file3: {
          isDirectory: false,
          modificationTime: new Date('2014-08-13T07:57:00.000Z'),
          name: 'file3',
          size: 56
        }
      },
      isDirectory: true,
      modificationTime: new Date('2014-08-13T07:57:00.000Z'),
      name: 'dir',
      size: 0
    },
    file1: {
      isDirectory: false,
      modificationTime: new Date('2014-08-13T07:55:54.000Z'),
      name: 'file1',
      size: 15
    },
    file2: {
      isDirectory: false,
      modificationTime: new Date('2014-08-13T07:56:14.000Z'),
      name: 'file2',
      size: 33
    }
  },
  isDirectory: true,
  modificationTime: new Date('1970-01-01T00:00:00.000Z'),
  name: '/',
  size: 0
};

/**
 * The small archive path prefix in 'test-files/' directory. Used to obtain the
 * expected files for read file requests. The small archive structure should be
 * identical to the metadata obtained from the archive.
 * @type {string}
 * @const
 */
var SMALL_ARCHIVE_PATH_PREFIX = 'small_archive';

/**
 * Tests if metadata is the same as expectedEntryMetadata. The function tests
 * recursively all the metadata by running the tests for all files in the
 * entries field of directories. It should be run from a Mocha 'it'.
 * @param {Object} entryMetadata The entry metadata to test.
 * @param {Object} expectedEntryMetadata The expected metadata.
 */
var testMetadata = function(entryMetadata, expectedEntryMetadata) {
  expect(entryMetadata.name).to.equal(expectedEntryMetadata.name);
  var name = entryMetadata.name;

  expect(entryMetadata.size, 'Invalid size for ' + name)
      .to.equal(expectedEntryMetadata.size);
  expect(entryMetadata.isDirectory, 'Invalid type for ' + name)
      .to.equal(expectedEntryMetadata.isDirectory);
  expect(entryMetadata.modificationTime, 'Invalid time for ' + name)
      .to.deep.equal(expectedEntryMetadata.modificationTime);

  if (entryMetadata.isDirectory) {
    expect(Object.keys(entryMetadata).length,
           'Invalid number of entries for ' + name)
        .to.equal(Object.keys(expectedEntryMetadata).length);

    for (var childEntryName in expectedEntryMetadata.entries) {
      expect(entryMetadata.entries[childEntryName],
             'Invalid entry in directory ' + name).to.not.be.undefined;
      testMetadata(entryMetadata.entries[childEntryName],
          expectedEntryMetadata.entries[childEntryName]);
    }
  }
};

/**
 * Tests read for a file in the archive. The file must be opened with
 * openRequestId before calling this function.
 * @param {string} fileSystemId The file system id.
 * @param {string} filePath The file path in the archive.
 * @param {number} openRequestId The open request id for the file to read.
 * @param {number} readRequestId The read request id.
 */
var testReadFile = function(fileSystemId, filePath, openRequestId,
                            readRequestId) {
  var expectedBuffer;

  beforeEach(function(done) {
    var promise = tests_helper.getAndReadFileBlobPromise(
        SMALL_ARCHIVE_PATH_PREFIX + filePath);

    promise.then(function(buffer) {
      expectedBuffer = buffer;
      done();
    }).catch(tests_helper.forceFailure);
  });

  it('should read the whole file', function(done) {
    var offset = 0;
    var length = Math.floor(expectedBuffer.length / 2);
    var left_length;
    var promise = tests_helper.createReadFilePromise(
        fileSystemId, readRequestId, openRequestId, offset, length);

    promise.then(function(receivedBuffer) {
      // It is possible tha receivedBuffer.length is different from length.
      // This scenario is plausible in case length is really big, but we
      // requested a small chunk so we should receive the same amount of
      // data.
      expect(receivedBuffer.length).to.equal(length);
      expect(receivedBuffer).to.deep.equal(
          expectedBuffer.subarray(offset, offset + length));

      // Get the last chunk of data.
      offset += length;
      left_length = expectedBuffer.length - receivedBuffer.length;
      return tests_helper.createReadFilePromise(
          fileSystemId, readRequestId, openRequestId, offset, left_length);
    }).then(function(receivedBuffer) {
      expect(receivedBuffer.length).to.equal(left_length);
      expect(receivedBuffer).to.deep.equal(
          expectedBuffer.subarray(offset, offset + left_length));
      done();
    }).catch(tests_helper.forceFailure);
  });

  it('should read middle chunk from file', function(done) {
    var offset = Math.floor(expectedBuffer.length / 4);
    var length = Math.floor(expectedBuffer.length / 2);
    var promise = tests_helper.createReadFilePromise(
        fileSystemId, readRequestId, openRequestId, offset, length);

    promise.then(function(receivedBuffer) {
      expect(receivedBuffer.length).to.equal(length);
      expect(receivedBuffer).to.deep.equal(
          expectedBuffer.subarray(offset, offset + length));
      done();
    }).catch(tests_helper.forceFailure);
  });
};

/**
 * Tests open, read and close for a file in the archive.
 * @param {string} fileSystemId The file system id.
 * @param {Object} expectedMetadata The volume's expected metadata.
 * @param {string} filePath The file path in the archive.
 * @param {number} openRequestId The open request id.
 * @param {number} readRequestId The read request id.
 * @param {number} closeRequestId The close request id.
 */
var testOpenReadClose = function(fileSystemId, expectedMetadata, filePath,
                                 openRequestId, readRequestId, closeRequestId) {
  // Test onOpenFileRequested.
  describe('and then opens file <' + filePath + '> for <' + fileSystemId + '>',
           function() {
    beforeEach(function(done) {
      var options = {
        fileSystemId: fileSystemId,
        mode: 'READ',
        create: false,
        filePath: filePath,
        requestId: openRequestId
      };

      app.onOpenFileRequested(options, done, tests_helper.forceFailure);
    });

    it('should load the volume metadata', function() {
      testMetadata(app.volumes[fileSystemId].metadata, expectedMetadata);
    });

    // Test read file operation.
    describe('to read file contents of ' + filePath, function() {
      testReadFile(fileSystemId, filePath, openRequestId, readRequestId);
    });

    // Clean resources.
    afterEach(function(done) {
      var options = {
        fileSystemId: fileSystemId,
        requestId: closeRequestId,
        openRequestId: openRequestId
      };

      app.onCloseFileRequested(options, done, tests_helper.forceFailure);
    });
  });
};

/**
 * Checks if volume was loaded correctly and its operations are successful.
 * @param {string} fileSystemId The file system id.
 * @param {Object} expectedMetadata The volume's expected metadata.
 * @param {boolean} restore True if this is a request after restoring state.
 */
var smallArchiveCheck = function(fileSystemId, expectedMetadata, restore) {
  var suffix = 'for <' + fileSystemId + '>';

  beforeEach(function() {
    // In case of restore the volume object shouldn't be in memory.
    if (restore)
      expect(app.volumes[fileSystemId]).to.be.undefined;
  });

  // Test onGetMetatadaRequested.
  describe('and then calls onGetMetadataRequested ' + suffix, function() {
    var createGetMetadataRequestPromise = function(requestId, entryPath) {
      var options = {
        fileSystemId: fileSystemId,
        requestId: requestId,
        entryPath: entryPath
      };
      return new Promise(function(fulfill, reject) {
        app.onGetMetadataRequested(options, fulfill, reject);
      });
    };

    var rootMetadataResult;

    beforeEach(function(done) {
      var promises = [
        createGetMetadataRequestPromise(1, '/'),
        createGetMetadataRequestPromise(2, '/'),
        createGetMetadataRequestPromise(3, '/'),
        createGetMetadataRequestPromise(4, '/')
      ];

      Promise.all(promises).then(function(result) {
        rootMetadataResult = result;
        done();
      }, tests_helper.forceFailure);
    });


    it('should load the volume metadata', function() {
      testMetadata(app.volumes[fileSystemId].metadata, expectedMetadata);
    });

    it('should return correct metadata for all calls', function() {
      // rootMetadataResult is undefined only if Promise.all doesn't
      // successfully fulfill.
      expect(rootMetadataResult).to.not.be.undefined;
      rootMetadataResult.forEach(function(rootMetadata) {
        expect(rootMetadata).to.equal(app.volumes[fileSystemId].metadata);
      });
    });
  });

  // Test onReadDirectoryRequested.
  describe('and then calls onReadDirectoryRequested ' + suffix, function() {
    var directoryEntries;

    beforeEach(function(done) {
      var options = {
        fileSystemId: fileSystemId,
        requestId: 1,
        directoryPath: '/'  // Ask for root directory entries.
      };

      app.onReadDirectoryRequested(options, function(entries) {
        directoryEntries = entries;
        done();
      }, tests_helper.forceFailure);
    });

    it('should load the volume metadata', function() {
      testMetadata(app.volumes[fileSystemId].metadata, expectedMetadata);
    });

    it('should load return the correct entries', function() {
      var expectedDirectoryEntries = [];  // For root directory entries.
      for (var entry in expectedMetadata.entries) {
        expectedDirectoryEntries.push(expectedMetadata.entries[entry]);
      }
      expect(directoryEntries).to.deep.equal(expectedDirectoryEntries);
    });
  });

  testOpenReadClose(fileSystemId, expectedMetadata, '/file1', 7, 8, 5);
  testOpenReadClose(fileSystemId, expectedMetadata, '/file2', 13, 16, 17);
  testOpenReadClose(fileSystemId, expectedMetadata, '/dir/file3', 21, 24 , 25);
};

/**
 * Gets the map of opened files before suspend. Used to test correct restore
 * after receiving a fileSystemProvider API call after suspend page event.
 * The key is the open request id and the value is the open request options.
 * @param {string} fileSystemId The file system id.
 * @return {Object.<number, fileSystemProvider.OpenFileRequestedOptions>}
 */
var getOpenedFilesBeforeSuspend = function(fileSystemId) {
  return {
    30: /* requestId */ {
      fileSystemId: fileSystemId,
      mode: 'READ',
      create: false,
      requestId: 30,
      filePath: '/file1'
    },
    40: /* requestId */ {
      fileSystemId: fileSystemId,
      mode: 'READ',
      create: false,
      requestId: 40,
      filePath: '/file2'
    }
  };
};

/**
 * Tests read and close file operations after suspend page event for files that
 * were opened but not closed before suspending.
 * @param {string} fileSystemId The file system id.
 */
var smallArchiveCheckAfterSuspend = function(fileSystemId) {
  var openedFilesBeforeSuspend =
      getOpenedFilesBeforeSuspend(fileSystemId);

  for (var openRequestId in openedFilesBeforeSuspend) {
    var openOptions = openedFilesBeforeSuspend[openRequestId];
    var describeMessage =
        'for <' + fileSystemId + '> and then reads contents of file <' +
        openOptions.filePath + '> ' + 'opened before suspend page event,';

    describe(describeMessage, function() {
      // Test read file.
      testReadFile(fileSystemId, openOptions.filePath, openRequestId,
                   openRequestId + 1);

      // Clean resources.
      afterEach(function(done) {
        var options = {
          fileSystemId: fileSystemId,
          requestId: openRequestId + 2,
          openRequestId: openRequestId
        };

        app.onCloseFileRequested(options, done, tests_helper.forceFailure);
      });
    });
  }
};

/**
 * Tests read and close file operations after restart for files that were opened
 * but not closed before restart. The requests should fail because after restart
 * volume's opened files are cleared.
 * @param {string} fileSystemId The file system id.
 */
var smallArchiveCheckAfterRestart = function(fileSystemId) {
  var openedFilesBeforeSuspend =
      getOpenedFilesBeforeSuspend(fileSystemId);

  for (var openRequestId in openedFilesBeforeSuspend) {
    var openOptions = openedFilesBeforeSuspend[openRequestId];

    describe('for <' + fileSystemId + '>', function() {
      it('and then tries to read contents of a previous opened file must fail',
          function(done) {
        var options = {
          fileSystemId: fileSystemId,
          requestId: openRequestId + 1,
          openRequestId: openRequestId,
          offset: 0,
          length: 10
        };

        app.onReadFileRequested(options, tests_helper.forceFailure,
            function(error) {
          setTimeout(function() {
            expect(error).to.equal('INVALID_OPERATION');
            done();
          });
        });
      });

      it('and then tries to close a previous opened file must fail',
          function(done) {
        var options = {
          fileSystemId: fileSystemId,
          requestId: openRequestId + 2,
          openRequestId: openRequestId
        };

        app.onCloseFileRequested(options, tests_helper.forceFailure,
            function(error) {
          setTimeout(function() {
            expect(error).to.equal('INVALID_OPERATION');
            done();
          });
        });
      });
    });
  }
};
