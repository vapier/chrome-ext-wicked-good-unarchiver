// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * Checks if restore was done correctly.
 * app.volumes should be empty before calling this function.
 * @param {Object} volumeInformation The information for the volume to check.
 */
var restoreCheck = function(volumeInformation) {
  var fileSystemId = volumeInformation.fileSystemId;
  var suffix = 'for <' + fileSystemId + '>';

  // Call onGetMetatadaRequested, which should restore the volume state. Restore
  // should work even in case of multiple requests that don't wait for the end
  // of the previous requests.
  describe('and then calls onGetMetadataRequested ' + suffix + ' several times',
           function() {
    var rootMetadataResult;
    var promiseError;

    beforeEach(function(done) {
      expect(app.volumes[fileSystemId]).to.be.undefined;

      var createGetMetadataRequestPromise = function(requestId) {
        return new Promise(function(fulfill, reject) {
          var options = {
            fileSystemId: fileSystemId,
            requestId: requestId,
            entryPath: '/'  // Ask for root metadata.
          };

          app.onGetMetadataRequested(options, function(entryMetadata) {
            fulfill(entryMetadata);
          }, function(error) {
            reject('app.onGetMetadataRequested error: ' + error);
          });
        });
      };

      var promises = [
        createGetMetadataRequestPromise(1),
        createGetMetadataRequestPromise(2),
        createGetMetadataRequestPromise(3),
        createGetMetadataRequestPromise(4)
      ];

      Promise.all(promises).then(function(result) {
        rootMetadataResult = result;
        done();
      }, function(error) {
        promiseError = error;
        done();
      });
    });

    it('should not throw an error', function() {
      if (promiseError)
        console.error(promiseError.stack || promiseError);
      expect(promiseError).to.be.undefined;
    });

    it('should load the volume', function() {
      expect(app.volumes[fileSystemId]).to.not.be.undefined;
    });

    it('should return correct metadata for all calls', function() {
      // rootMetadataResult is undefined only if Promise.all doesn't
      // successfully fulfill.
      expect(rootMetadataResult).to.not.be.undefined;
      rootMetadataResult.forEach(function(rootMetadata) {
        expect(rootMetadata).to.equal(app.volumes[fileSystemId].metadata);
      });
    });

    it('should call chrome.storage.local.get only once', function() {
      // In case this is called multiple times then restore calls weren't
      // chained. This holds only for restore calls made to the same file
      // system.
      expect(chrome.storage.local.get.calledOnce).to.be.true;
    });
  });

  // Call onReadDirectoryRequested, which should restore the volume state.
  describe('and then calls onReadDirectoryRequested ' + suffix, function() {
    var directoryEntries;
    beforeEach(function(done) {
      expect(app.volumes[fileSystemId]).to.be.undefined;

      var options = {
        fileSystemId: fileSystemId,
        requestId: 1,
        directoryPath: '/'  // Ask for root directory entries.
      };

      app.onReadDirectoryRequested(options, function(entries) {
        directoryEntries = entries;
        done();
      }, function() {
        // Force failure, first 2 parameters don't matter.
        assert.fail(undefined, undefined, 'Could not read directory.');
        done();
      });
    });

    it('should load the volume', function() {
      expect(app.volumes[fileSystemId]).to.not.be.undefined;
    });

    it('should return 3 directory entries', function() {
      expect(directoryEntries.length).to.equal(3);
    });

    it('should call chrome.storage.local.get only once', function() {
      expect(chrome.storage.local.get.calledOnce).to.be.true;
    });
  });

  // TODO(cmihail): Add tests for onOpenFileRequested, onCloseFileRequested,
  // onReadFileRequested once they are implemented.
};

/**
 * Checks if a volume was loaded correctly.
 * @param {Object} volumeInformation The information for the volume to check.
 */
var volumeLoadCheck = function(volumeInformation) {
  describe('that loads volume <' + volumeInformation.fileSystemId + '>',
           function() {
    var metadata;

    beforeEach(function() {
      metadata = app.volumes[volumeInformation.fileSystemId].metadata;
    });

    it('should get valid metadata', function() {
      expect(metadata).to.not.be.null;
    });

    it('that has name "/"', function() {
      expect(metadata.name).to.equal('/');
    });

    it('that is a dictionary', function() {
      expect(metadata.isDirectory).to.be.true;
    });

    it('that has size 0', function() {
      expect(metadata.size).to.equal(0);
    });

    it('that has modificationTime as a Date object', function() {
      expect(metadata.modificationTime).to.be.a('Date');
    });

    it('that has 3 entries', function() {
      expect(Object.keys(metadata.entries).length).to.equal(3);
    });
  });
};

/**
 * Checks if unmount was successful.
 * @param {Object} volumeInformation The information for the volume to check.
 */
var unmountCheck = function(volumeInformation) {
  var fileSystemId = volumeInformation.fileSystemId;
  describe('that unmounts volume <' + fileSystemId + '>', function() {
    var onSuccessSpy;

    beforeEach(function() {
      expect(app.volumes[fileSystemId]).to.not.be.undefined;

      onSuccessSpy = sinon.spy();
      var options = {
        fileSystemId: fileSystemId
      };
      app.onUnmountRequested(options, onSuccessSpy, function() {
        // Force failure, first 2 parameters don't matter.
        assert.fail(undefined, undefined, 'Could not umount volume.');
      });
    });

    it('should remove volume from app.volumes', function() {
      expect(app.volumes[fileSystemId]).to.be.undefined;
    });

    it('should call onSuccessSpy', function() {
      expect(onSuccessSpy.calledOnce).to.be.true;
    });

    it('should call retainEntry again for state save', function() {
      var length = tests_helper.volumesInformation.length;
      // First calls were onLaunched. The calls are '+ length - 1' because
      // retainEntry is called for every volume except the one that was
      // umounted.
      expect(chrome.fileSystem.retainEntry.callCount)
          .to.equal(length * length + length - 1);
    });

    it('should store the volumes state again for state save', function() {
      // First calls were onLaunched.
      expect(chrome.storage.local.set.callCount)
          .to.equal(tests_helper.volumesInformation.length + 1);
    });
  });
};

/**
 * Simulates extension unload in case of suspend or restarts by clearing
 * 'app' members. No need to remove the NaCl module. The reason is that we have
 * to load the NaCl module manually by ourself anyway (in real scenarios the
 * browser does it), so this will only take extra time without really testing
 * anything.
 */
var unloadExtension = function() {
  for (var fileSystemId in app.volumes) {
    app.cleanupVolume(fileSystemId);
  }
  expect(Object.keys(app.volumes).length).to.equal(0);
  expect(Object.keys(app.volumeLoadedPromises).length).to.equal(0);
};

// Init helper.
// TODO(cmihail): Add tests for files inside small_rar.rar and small_zip.zip.
var initPromise = tests_helper.init(['small_rar.rar', 'small_zip.zip']);

// Run tests.
describe('Unpacker extension', function() {
  var successfulTestsHelperInit = false;

  before(function(done) {
    expect(app.naclModuleIsLoaded()).to.be.false;

    app.loadNaclModule(tests_helper.MODULE_NMF_FILE_PATH,
                       tests_helper.MODULE_MIME_TYPE, function() {
      expect(app.naclModuleIsLoaded()).to.be.true;

      initPromise.then(function() {
        successfulTestsHelperInit = true;
        done();
      }).catch(function(error) {
        console.error(error.stack || error);
        done();
      });
    });
  });

  beforeEach(function(done) {
    expect(successfulTestsHelperInit).to.be.true;

    // Called on beforeEach() in order for spies and stubs to reset registered
    // number of calls to methods.
    tests_helper.initChromeApis();

    var launchData = {items: []};
    tests_helper.volumesInformation.forEach(function(volume) {
      launchData.items.push({entry: volume.entry});
    });

    var successfulVolumeLoads = 0;
    app.onLaunched(launchData, function(fileSystemId) {
      successfulVolumeLoads++;
      if (successfulVolumeLoads == tests_helper.volumesInformation.length)
        done();
    }, function(fileSystemId) {
      // Force failure, first 2 parameters don't matter.
      assert.fail(undefined, undefined,
          'Could not load volume <' + fileSystemId + '>.');
      done();  // No need to wait for the other volumes as normally
               // we shouldn't get an error.
    });
  });

  afterEach(function() {
    unloadExtension();
  });

  // Check if volumes were correctly loaded.
  tests_helper.volumesInformation.forEach(function(volume) {
    volumeLoadCheck(volume);
  });

  // Test state save.
  describe('should save state in case of restarts or crashes', function() {
    it('by calling retainEntry with the volume\'s entry', function() {
      // retainEntry is called square times because saveState is
      // reexecuted for every volume load.
      expect(chrome.fileSystem.retainEntry.callCount)
          .to.equal(tests_helper.volumesInformation.length *
              tests_helper.volumesInformation.length);
      tests_helper.volumesInformation.forEach(function(volume) {
        expect(chrome.fileSystem.retainEntry.calledWith(volume.entry)).
            to.be.true;
      });
    });

    it('by storing the volumes state', function() {
      expect(chrome.storage.local.set.callCount)
          .to.equal(tests_helper.volumesInformation.length);
      expect(chrome.storage.local.set.calledWith(tests_helper.volumesState))
          .to.be.true;
    });
  });

  // Test restore after suspend page event.
  describe('that receives a suspend page event', function() {
    beforeEach(function() {
      app.onSuspend();  // This gets called before suspend.
      unloadExtension();
    });

    it('should call retainEntry again', function() {
      var length = tests_helper.volumesInformation.length;
      // First calls were onLaunched. The calls are '+ length' because
      // retainEntry is called for every volume.
      expect(chrome.fileSystem.retainEntry.callCount)
          .to.equal(length * length + length);
    });

    it('should store the volumes state again', function() {
      // First calls were onLaunched.
      expect(chrome.storage.local.set.callCount)
          .to.equal(tests_helper.volumesInformation.length + 1);
    });

    // Check if restore was successful.
    tests_helper.volumesInformation.forEach(function(volume) {
      restoreCheck(volume);
    });
  });

  // Test restore after restarts, crashes, etc.
  describe('that is restarted', function() {
    beforeEach(function() {
      unloadExtension();
      app.onStartup();  // This gets called after restart.

      // Reset spies and stubs.
      tests_helper.initChromeApis();
    });

    // Check if restore was successful.
    tests_helper.volumesInformation.forEach(function(volume) {
      restoreCheck(volume);
    });
  });

  // Check unmount.
  tests_helper.volumesInformation.forEach(function(volume) {
    unmountCheck(volume);
  });
});
