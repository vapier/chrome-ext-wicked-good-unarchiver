// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * Define information for the volumes to check.
 * @type {Array.<Object>}
 * @const
 */
var VOLUMES = [
  {
    fileSystemId: 'first_volume',
    file: 'file1',
    entry: {
      file: sinon.stub().callsArgWith(0, 'file1'),
      name: 'first_name'
    },
    entryId: 'entryId1'
  },
  {
    fileSystemId: 'second_volume',
    file: 'file2',
    entry: {
      file: sinon.stub().callsArgWith(0, 'file2'),
      name: 'second_name'
    },
    entryId: 'entryId2'
  }
];

/**
 * The volumes state to save and restore after suspend event, restarts,
 * crashes, etc.
 * @type {Object}
 * @const
 */
var VOLUMES_STATE = {};
VOLUMES_STATE[app.STORAGE_KEY] = {};
VOLUMES.forEach(function(volume) {
  VOLUMES_STATE[app.STORAGE_KEY][volume.fileSystemId] = {
    entryId: volume.entryId
  };
});

/**
 * Initializes Chrome APIs.
 */
function initChromeApis() {
  // Local storage API.
  chrome.storage = {
    local: {
      set: sinon.spy(),
      get: sinon.stub()
    }
  };
  chrome.storage.local.get.withArgs([app.STORAGE_KEY])
      .callsArgWith(1, VOLUMES_STATE);
  chrome.storage.local.get.throws(
      'Invalid argument for get.' /* Called if app.STORAGE_KEY is invalid. */);

  // File system API.
  chrome.fileSystem = {
    retainEntry: sinon.stub(),
    restoreEntry: sinon.stub(),
    getDisplayPath: sinon.stub()
  };

  VOLUMES.forEach(function(volume) {
    chrome.fileSystem.retainEntry.withArgs(volume.entry)
        .returns(volume.entryId);
    chrome.fileSystem.restoreEntry.withArgs(volume.entryId)
        .callsArgWith(1, volume.entry);
    chrome.fileSystem.getDisplayPath.withArgs(volume.entry)
        .callsArgWith(1, volume.fileSystemId);
  });
  chrome.fileSystem.retainEntry.throws('Invalid argument for retainEntry.');
  chrome.fileSystem.restoreEntry.throws('Invalid argument for restoreEntry.');
  chrome.fileSystem.getDisplayPath.throws('Invalid argument for displayPath.');

  // File system provider API.
  chrome.fileSystemProvider = {
    mount: sinon.stub(),
    unmount: sinon.stub()
  };
  VOLUMES.forEach(function(volume) {
    chrome.fileSystemProvider.mount
        .withArgs({fileSystemId: volume.fileSystemId,
                   displayName: volume.entry.name})
        .callsArg(1);
    chrome.fileSystemProvider.unmount
        .withArgs({fileSystemId: volume.fileSystemId})
        .callsArg(1);
  });
  chrome.fileSystemProvider.mount.throws('Invalid argument for mount.');
  chrome.fileSystemProvider.unmount.throws('Invalid argument for unmount.');
}

/**
 * Checks if restore was done correctly.
 * app.volumes should be empty before calling this function.
 * @param {Object} volumeInformation The information for the volume to check.
 */
var restoreCheck = function(volumeInformation) {
  var fileSystemId = volumeInformation.fileSystemId;
  var suffix = 'for <' + volumeInformation.fileSystemId + '>';

  // Call onGetMetatadaRequested, which should restore the volume state.
  describe('and then calls onGetMetadataRequested ' + suffix, function() {
    var rootMetadata;
    beforeEach(function(done) {
      expect(app.volumes[fileSystemId]).to.be.undefined;

      var options = {
        fileSystemId: fileSystemId,
        entryPath: '/',  // Ask for root metadata.
        requestId: 1
      };

      app.onGetMetadataRequested(options, function(entryMetadata) {
        rootMetadata = entryMetadata;
        done();
      }, function() {
        // Force failure, first 2 parameters don't matter.
        assert.fail(undefined, undefined, 'Could not get entry metadata.');
        done();
      });
    });

    it('should load the volume', function() {
      expect(app.volumes[fileSystemId]).to.not.be.undefined;
    });

    it('should return correct entry metadata', function() {
      expect(rootMetadata).to.equal(app.volumes[fileSystemId].metadata);
    });
  });

  // Call onReadDirectoryRequested, which should restore the volume state.
  describe('and then calls onReadDirectoryRequested ' + suffix, function() {
    var directoryEntries;
    beforeEach(function(done) {
      expect(app.volumes[fileSystemId]).to.be.undefined;

      var options = {
        fileSystemId: fileSystemId,
        directoryPath: '/',  // Ask for root directory entries.
        requestId: 1
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
  });

  // TODO(cmihail): Add tests for onOpenFileRequested, onCloseFileRequested,
  // onReadFileRequested once they are implemented.
};

/**
 * Checks if a volume was loaded correctly.
 * @param {Object} volumeInformation The information for the volume to check.
 */
var volumeLoadCheck = function(volumeInformation) {
  describe('for volume <' + volumeInformation.fileSystemId + '>', function() {
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
  describe('and unmounts volume <' + fileSystemId + '>', function() {
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
      // First calls were onLaunched. The calls are + VOLUMES.length - 1
      // because retainEntry is called for every volume except the one that
      // was umounted.
      expect(chrome.fileSystem.retainEntry.callCount)
          .to.equal(VOLUMES.length * VOLUMES.length + VOLUMES.length - 1);
    });

    it('should store the volumes state again for state save', function() {
      // First calls were onLaunched.
      expect(chrome.storage.local.set.callCount)
          .to.equal(VOLUMES.length + 1);
    });
  });
};

// Run tests.
describe('Unrar extension', function() {
  before(function(done) {
    expect(app.naclModuleIsLoaded()).to.be.false;

    // "base/" prefix is required because Karma prefixes every file path with
    // "base/" before serving it. No need for loading on DOMContentLoaded as the
    // DOM was already loaded by karma before tests are run.
    app.loadNaclModule('base/newlib/Debug/module.nmf',
                       'application/x-nacl',
                       function() {
      expect(app.naclModuleIsLoaded()).to.be.true;
      done();
    });
  });

  describe('that loads fake data', function() {
    beforeEach(function(done) {
      initChromeApis();  // Called on beforeEach() in order for spies and stubs
                         // to reset registered number of calls to methods.

      var launchData = {items: []};
      VOLUMES.forEach(function(volume) {
        launchData.items.push({entry: volume.entry});
      });

      var successfulVolumeLoads = 0;
      app.onLaunched(launchData, function(fileSystemId) {
        successfulVolumeLoads++;
        if (successfulVolumeLoads == VOLUMES.length)
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
      app.volumes = {};  // Clear volumes.
    });

    // Check if volumes were correctly loaded.
    VOLUMES.forEach(function(volume) {
      volumeLoadCheck(volume);
    });

    // Test state save.
    describe('should save state in case of restarts, crashes, etc', function() {
      it('by calling retainEntry with the volume\'s entry', function() {
        // retainEntry is called square times because saveState is
        // reexecuted for every volume load.
        expect(chrome.fileSystem.retainEntry.callCount)
            .to.equal(VOLUMES.length * VOLUMES.length);
        VOLUMES.forEach(function(volume) {
          expect(chrome.fileSystem.retainEntry.calledWith(volume.entry)).
              to.be.true;
        });
      });

      it('by storing the volumes state', function() {
        expect(chrome.storage.local.set.callCount)
            .to.equal(VOLUMES.length);
        expect(chrome.storage.local.set.calledWith(VOLUMES_STATE)).to.be.true;
      });
    });

    // Test restore after suspend page event.
    describe('and then suspends the page', function() {
      beforeEach(function() {
        app.onSuspend();  // This gets called before suspend.
        app.volumes = {};  // Removes all volumes from memory.
        // No need to remove NaCl. The reason is that we have to load NaCl
        // manually by ourself anyway (in real scenarios the browser does it),
        // so this will only take extra time without really testing anything.
      });

      it('should call retainEntry again', function() {
        // First calls were onLaunched. The calls are + VOLUMES.length because
        // retainEntry is called for every volume.
        expect(chrome.fileSystem.retainEntry.callCount)
            .to.equal(VOLUMES.length * VOLUMES.length + VOLUMES.length);
      });

      it('should store the volumes state again', function() {
        // First calls were onLaunched.
        expect(chrome.storage.local.set.callCount)
            .to.equal(VOLUMES.length + 1);
      });

      // Check if restore was successful.
      VOLUMES.forEach(function(volume) {
        restoreCheck(volume);
      });
    });

    // Test restore after restarts, crashes, etc.
    describe('and then restarts', function() {
      beforeEach(function() {
        app.volumes = {};  // Removes all volumes from memory.
        app.onStartup();  // This gets called after restart.
      });

      // Check if restore was successful.
      VOLUMES.forEach(function(volume) {
        restoreCheck(volume);
      });
    });

    // Check unmount.
    VOLUMES.forEach(function(volume) {
      unmountCheck(volume);
    });
  });
});
