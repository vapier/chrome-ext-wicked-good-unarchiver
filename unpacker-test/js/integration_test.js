// Copyright 2014 The Chromium Authors. All rights reserved.
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
    name: 'small_rar.rar',
    afterOnLaunchTests: function() {
      smallArchiveCheck('small_rar.rar', SMALL_RAR_METADATA, false);
    },
    afterSuspendTests: function() {
      smallArchiveCheck('small_rar.rar', SMALL_RAR_METADATA, true);
    },
    afterRestartTests: function() {
      smallArchiveCheck('small_rar.rar', SMALL_RAR_METADATA, true);
    }
  },
  {
    name: 'small_zip.zip',
    afterOnLaunchTests: function() {
      smallArchiveCheck('small_zip.zip', SMALL_ZIP_METADATA, false);
    },
    afterSuspendTests: function() {
      smallArchiveCheck('small_zip.zip', SMALL_ZIP_METADATA, true);
    },
    afterRestartTests: function() {
      smallArchiveCheck('small_zip.zip', SMALL_ZIP_METADATA, true);
    }
  }
]);

// Run tests.
describe('Unpacker extension', function() {
  before(function(done) {
    expect(app.naclModuleIsLoaded()).to.be.false;

    app.loadNaclModule(tests_helper.MODULE_NMF_FILE_PATH,
                       tests_helper.MODULE_MIME_TYPE);
    Promise.all([initPromise, app.moduleLoadedPromise]).then(function() {
      done();
    }).catch(tests_helper.forceFailure);
  });

  beforeEach(function(done) {
    expect(app.naclModuleIsLoaded()).to.be.true;

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
      forceFailure('Could not load volume <' + fileSystemId + '>.');
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
      var onSuccessSpy;

      beforeEach(function() {
        // Reinitialize spies in order to register only the calls after suspend
        // and not before it.
        tests_helper.initChromeApis();

        expect(app.volumes[fileSystemId]).to.not.be.undefined;
        expect(tests_helper.localStorageState[app.STORAGE_KEY][fileSystemId])
            .to.not.be.undefined;

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
