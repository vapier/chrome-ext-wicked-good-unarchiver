// Copyright 2014 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

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
var initPromise = tests_helper.init([
  {
    name: 'small_zip.zip',
    afterOnLaunchTests: function() {
      smallArchiveCheck('small_zip.zip', SMALL_ZIP_METADATA, false, null);
    },
    afterSuspendTests: function() {
      smallArchiveCheck('small_zip.zip', SMALL_ZIP_METADATA, true, null);
      smallArchiveCheckAfterSuspend('small_zip.zip');
    },
    afterRestartTests: function() {
      smallArchiveCheckAfterRestart('small_zip.zip');
      smallArchiveCheck('small_zip.zip', SMALL_ZIP_METADATA, true, null);
    }
  },
  {
    name: 'encrypted.zip',
    afterOnLaunchTests: function() {
      // TODO(mtomasz): Add tests for clicking the Cancel button in the
      // passphrase dialog.
      smallArchiveCheck(
          'encrypted.zip', SMALL_ZIP_METADATA, false, ENCRYPTED_ZIP_PASSPHRASE);
    },
    afterSuspendTests: function() {
      smallArchiveCheck(
          'encrypted.zip', SMALL_ZIP_METADATA, true, ENCRYPTED_ZIP_PASSPHRASE);
      smallArchiveCheckAfterSuspend('encrypted.zip');
    },
    afterRestartTests: function() {
      smallArchiveCheckAfterRestart('encrypted.zip');
      smallArchiveCheck(
          'encrypted.zip', SMALL_ZIP_METADATA, true, ENCRYPTED_ZIP_PASSPHRASE);
    }
  }
]);

/**
 * Runs the integration tests.
 * @param {string} describeMessage The integration tests describe message.
 * @param {string} moduleNmfFilePath The path to the NaCl / PNaCl module nmf
 *     file.
 * @param {string} moduleMimeType The type of the module, which can be either
 *     NaCl or PNaCl.
 * @param {string} moduleId The module id. It shold be unique per every
 *     integration tests run. The id is used to test if the correct module is
 *     loaded while running the tests.
 */
var integration_tests = function(describeMessage, moduleNmfFilePath,
                                 moduleMimeType, moduleId) {
  describe(describeMessage, function() {
    before(function(done) {
      // Modify the default timeout until Karma kills the test and marks it as
      // failed in order to give enough time to the browser to load the PNaCl
      // module. First load requires more than the default 2000 ms timeout, but
      // next loads will be faster due to caching in user-data-dir.
      // Timeout is set per every before, beforeEach, it, afterEach, so there is
      // no need to restore it.
      this.timeout(15000 /* milliseconds */);

      // Cannot use 'after' because 'after' gets executed after all 'before'
      // even though 'before' is in another 'describe'. But 'before' gets
      // correctly executed for every 'describe'. So below workaround solves
      // this problem.
      if (app.naclModuleIsLoaded())
        app.unloadNaclModule();
      expect(app.naclModuleIsLoaded()).to.be.false;

      // Load the module.
      app.loadNaclModule(moduleNmfFilePath, moduleMimeType, moduleId);

      Promise.all([initPromise, app.moduleLoadedPromise]).then(function() {
        // In case below is not printed probably 5000 ms for this.timeout wasn't
        // enough for PNaCl to load during first time run.
        console.debug('Initialization and module loading for <' +
                      moduleNmfFilePath + '> finished.');
        done();
      }).catch(tests_helper.forceFailure);
    });

    beforeEach(function(done) {
      expect(app.naclModuleIsLoaded()).to.be.true;
      // In case below is false then 'before' wasn't executed correctly for
      // different runs of the integration tests.
      expect(app.naclModule.id).to.equal(moduleId);

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
        tests_helper.forceFailure(
            'Could not load volume <' + fileSystemId + '>.');
      });
    });

    afterEach(function() {
      unloadExtension();
    });

    // Check if volumes were correctly loaded.
    tests_helper.volumesInformation.forEach(function(volumeInformation) {
      describe('that launches <' + volumeInformation.fileSystemId + '>',
          function() {
            volumeInformation.afterOnLaunchTests();
          });
    });

    // Test state save.
    describe('should save state in case of restarts or crashes', function() {
      it('by calling retainEntry with the volume\'s entry', function() {
        expect(chrome.fileSystem.retainEntry.callCount)
            .to.equal(tests_helper.volumesInformation.length);
        tests_helper.volumesInformation.forEach(function(volume) {
          expect(chrome.fileSystem.retainEntry.calledWith(volume.entry)).
              to.be.true;
        });
      });

      it('by storing the volumes state', function() {
        tests_helper.volumesInformation.forEach(function(volumeInformation) {
          var fileSystemId = volumeInformation.fileSystemId;
          expect(tests_helper.localStorageState[app.STORAGE_KEY][fileSystemId])
              .to.not.be.undefined;
        });
        expect(chrome.storage.local.set.called).to.be.true;
      });
    });

    // Test restore after suspend page event.
    describe('that receives a suspend page event', function() {
      beforeEach(function() {
        // Reinitialize spies in order to register only the calls after suspend
        // and not before it.
        tests_helper.initChromeApis();

        app.onSuspend();  // This gets called before suspend.
        unloadExtension();

        // Set the opened files before suspend. Used to test correct restoring
        // after suspend.
        tests_helper.volumesInformation.forEach(function(volumeInformation) {
          var fileSystemId = volumeInformation.fileSystemId;
          tests_helper.localStorageState[app.STORAGE_KEY][fileSystemId]
              .openedFiles = getOpenedFilesBeforeSuspend(fileSystemId);
        });
      });

      it('should call retainEntry again for all mounted volumes', function() {
        expect(chrome.fileSystem.retainEntry.callCount)
            .to.equal(tests_helper.volumesInformation.length);
      });

      it('should store the volumes state for all mounted volumes', function() {
        tests_helper.volumesInformation.forEach(function(volumeInformation) {
          var fileSystemId = volumeInformation.fileSystemId;
          expect(tests_helper.localStorageState[app.STORAGE_KEY][fileSystemId])
              .to.not.be.undefined;
        });
        expect(chrome.storage.local.set.called).to.be.true;
      });

      // Check if restore was successful.
      tests_helper.volumesInformation.forEach(function(volumeInformation) {
        volumeInformation.afterSuspendTests();
      });
    });

    // Test restore after restarts, crashes, etc.
    describe('that is restarted', function() {
      beforeEach(function() {
        // Set the opened files before restart. Used to test correct restoring
        // after restart.
        tests_helper.volumesInformation.forEach(function(volumeInformation) {
          var fileSystemId = volumeInformation.fileSystemId;
          tests_helper.localStorageState[app.STORAGE_KEY][fileSystemId]
              .openedFiles = getOpenedFilesBeforeSuspend(fileSystemId);
        });

        unloadExtension();
        app.onStartup();  // This gets called after restart.

        // Reset spies and stubs.
        tests_helper.initChromeApis();
      });

      // Check if restore was successful.
      tests_helper.volumesInformation.forEach(function(volumeInformation) {
        volumeInformation.afterRestartTests();
      });
    });

    // Check unmount.
    tests_helper.volumesInformation.forEach(function(volumeInformation) {
      var fileSystemId = volumeInformation.fileSystemId;

      describe('that unmounts volume <' + fileSystemId + '>', function() {
        beforeEach(function(done) {
          // Reinitialize spies in order to register only the calls after
          // suspend and not before it.
          tests_helper.initChromeApis();

          expect(app.volumes[fileSystemId]).to.not.be.undefined;
          expect(tests_helper.localStorageState[app.STORAGE_KEY][fileSystemId])
              .to.not.be.undefined;

          app.onUnmountRequested({fileSystemId: fileSystemId}, function() {
            done();
          }, tests_helper.forceFailure);
        });

        it('should remove volume from app.volumes', function() {
          expect(app.volumes[fileSystemId]).to.be.undefined;
        });

        it('should not call retainEntry', function() {
          expect(chrome.fileSystem.retainEntry.called).to.be.false;
        });

        it('should remove volume from local storage', function() {
          expect(tests_helper.localStorageState[app.STORAGE_KEY][fileSystemId])
              .to.be.undefined;
          expect(chrome.storage.local.set.called).to.be.true;
        });
      });
    });
  });
};

// Run the tests for the Debug executables.
integration_tests('Debug unpacker extension',
                  tests_helper.MODULE_DEBUG_NMF_FILE_PATH,
                  tests_helper.MODULE_MIME_TYPE,
                  'debug_module');

// Run the tests for the Release executables.
integration_tests('Release unpacker extension',
                  tests_helper.MODULE_RELEASE_NMF_FILE_PATH,
                  tests_helper.MODULE_MIME_TYPE,
                  'release_module');
