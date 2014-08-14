// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * The main namespace for the extension.
 */
var app = {
  /**
   * The key used by chrome.storage.local to save and restore the volumes state.
   * @type {string}
   * @const
   */
  STORAGE_KEY: 'state',

  /**
   *
   * Multiple volumes can be opened at the same time. The key is the
   * fileSystemId, which is the same as the file's displayPath.
   * The value is a Volume object.
   * @type {Object.<string, Volume>}
   */
  volumes: {},

  /**
   * The NaCl module containing the logic for decompressing archives.
   * @type {Object}
   */
  naclModule_: null,

  /**
   * Function called on NaCl module's load. Registered by common.js.
   * @private
   */
  moduleDidLoad_: function() {
    app.naclModule_ = document.getElementById('nacl_module');
  },

  /**
   * Function called on receiving a message from NaCl module. Registered by
   * common.js.
   * @param {Object} message The message received from NaCl module.
   * @private
   */
  handleMessage_: function(message) {
    // Get mandatory fields in a message.
    var operation = message.data[request.Key.OPERATION];
    console.assert(operation != undefined,  // Operation can be 0.
        'No NaCl operation: ' + operation + '.');

    // Handle general errors unrelated to a volume.
    if (operation == request.Operation.ERROR) {
      console.error(message.data[request.Key.ERROR]);
      return;
    }

    var fileSystemId = message.data[request.Key.FILE_SYSTEM_ID];
    console.assert(fileSystemId, 'No NaCl file system id.');

    var requestId = message.data[request.Key.REQUEST_ID];
    console.assert(!isNaN(requestId), 'No NaCl request id.');

    var volume = app.volumes[fileSystemId];
    console.assert(volume, 'No volume for: ' + fileSystemId + '.');

    volume.decompressor.processMessage(message.data, operation,
                                       Number(requestId));
  },

  /**
   * Saves state in case of restarts, event page suspend, crashes, etc.
   * @private
   */
  saveState_: function() {
    var state = {};
    for (var volumeId in app.volumes) {
      var entryId = chrome.fileSystem.retainEntry(app.volumes[volumeId].entry);
      state[volumeId] = {
        entryId: entryId
      };
    }

    var toStore = {};
    toStore[app.STORAGE_KEY] = state;
    chrome.storage.local.set(toStore);
  },

  /**
   * Restores metadata for the passed file system id.
   * @param {string} fileSystemId The file system id.
   * @param {number} requestId The request id.
   * @param {function()} onSuccess Callback to execute on success.
   * @param {function(ProviderError)} onError Callback to execute on error.
   * @private
   */
  restoreState_: function(fileSystemId, requestId, onSuccess, onError) {
    // Check if metadata for the given file system is alread in memory.
    var volume = app.volumes[fileSystemId];
    if (volume) {
      if (volume.isReady())
        onSuccess();
      else
        onError('FAILED');
      return;
    }

    chrome.storage.local.get([app.STORAGE_KEY], function(result) {
      if (!app.naclModuleIsLoaded() || !result[app.STORAGE_KEY]) {
        onError('FAILED');
        return;
      }

      chrome.fileSystem.restoreEntry(
          result[app.STORAGE_KEY][fileSystemId].entryId,
          function(entry) {
            entry.file(function(file) {
              app.loadVolume_(fileSystemId, entry, file, onSuccess, onError,
                              requestId);
            });
          });
    });
  },

  /**
   * Creates a volume and loads its metadata.
   * @param {string} fileSystemId The file system id of the volume to create.
   * @param {Entry} entry The entry corresponding to the volume's archive.
   * @param {File} file The file corresponding to entry.
   * @param {function()} onSuccess Callback to execute on successful loading.
   * @param {function(ProviderError)} onError Callback to execute on error.
   * @param {number=} opt_requestId An optional request id. First load doesn't
   *     require a request id, but any subsequent loads after suspends or
   *     restarts should use the request id of the operation that called
   *     restoreState_.
   * @private
   */
  loadVolume_: function(fileSystemId, entry, file, onSuccess, onError,
                       opt_requestId) {
    // Operation already in progress. We must do the check here due to
    // asynchronous calls.
    if (app.volumes[fileSystemId]) {
      onError('FAILED');
      return;
    }
    app.volumes[fileSystemId] =
        new Volume(new Decompressor(app.naclModule_, fileSystemId),
                   fileSystemId, entry, file);
    app.volumes[fileSystemId].readMetadata(onSuccess, onError, opt_requestId);
  },

  /**
   * @return {boolean} True if NaCl module is loaded.
   */
  naclModuleIsLoaded: function() {
    return !!app.naclModule_;
  },

  /**
   * Loads the NaCl module.
   * @param {string} pathToConfigureFile Path to the module's configuration
   *     file, which should be a .nmf file.
   * @param {string} mimeType The type of the NaCl executable (e.g. .nexe or
   *     .pexe).
   * @param {function()=} opt_onModuleLoad Optional callback to execute on NaCl
   *     module load.
   */
  loadNaclModule: function(pathToConfigureFile, mimeType, opt_onModuleLoad) {
    var elementDiv = document.createElement('div');
    elementDiv.addEventListener('load', app.moduleDidLoad_, true);
    elementDiv.addEventListener('message', app.handleMessage_, true);
    if (opt_onModuleLoad)
      elementDiv.addEventListener('load', opt_onModuleLoad, true);

    var elementEmbed = document.createElement('embed');
    elementEmbed.id = 'nacl_module';
    elementEmbed.style.width = 0;
    elementEmbed.style.height = 0;
    elementEmbed.src = pathToConfigureFile;
    elementEmbed.type = mimeType;
    elementDiv.appendChild(elementEmbed);

    document.body.appendChild(elementDiv);
  },

  /**
   * Unmounts a volume and updates the local storage state.
   * @param {fileSystemProvider.UnmountRequestedOptions} options Options for
   *     unmount event.
   * @param {function()} onSuccess Callback to execute on success.
   * @param {function(ProviderError)} onError Callback to execute on error.
   */
  onUnmountRequested: function(options, onSuccess, onError) {
    chrome.fileSystemProvider.unmount({fileSystemId: options.fileSystemId},
      function() {
        delete app.volumes[options.fileSystemId];
        app.saveState_();  // Remove volume from local storage state.
        onSuccess();
      },
      function() {
        onError('FAILED');
      });
  },

  /**
   * Obtains metadata about a file system entry.
   * @param {fileSystemProvider.GetMetadataRequestedOptions} options Options for
   *     getting the metadata of an entry.
   * @param {function(EntryMetadata)} onSuccess Callback to execute on success.
   *     The parameter is the EntryMetadata obtained by this function.
   * @param {function(ProviderError)} onError Callback to execute on error.
   */
  onGetMetadataRequested: function(options, onSuccess, onError) {
    app.restoreState_(options.fileSystemId, options.requestId, function() {
      app.volumes[options.fileSystemId].onGetMetadataRequested(
          options, onSuccess, onError);
    }, onError);
  },

  /**
   * Reads a directory entries.
   * @param {fileSystemProvider.ReadDirectoryRequestedOptions>} options Options
   *     for reading the contents of a directory.
   * @param {function(Array.<EntryMetadata>, boolean)} onSuccess Callback to
   *     execute on success. The first parameter is an array with directory
   *     entries. The second parameter is 'hasMore', and if it's set to true,
   *     then onSuccess must be called again with the next directory entries.
   * @param {function(ProviderError)} onError Callback to execute on error.
   */
  onReadDirectoryRequested: function(options, onSuccess, onError) {
    app.restoreState_(options.fileSystemId, options.requestId, function() {
      app.volumes[options.fileSystemId].onReadDirectoryRequested(
          options, onSuccess, onError);
    }, onError);
  },

  /**
   * Opens a file for read or write.
   * @param {fileSystemProvider.OpenFileRequestedOptions} options Options for
   *     opening a file.
   * @param {function()} onSuccess Callback to execute on success.
   * @param {function(ProviderError)} onError Callback to execute on error.
   */
  onOpenFileRequested: function(options, onSuccess, onError) {
    app.restoreState_(options.fileSystemId, options.requestId, function() {
      app.volumes[options.fileSystemId].onOpenFileRequested(
          options, onSuccess, onError);
    }, onError);
  },

  /**
   * Closes a file identified by options.openRequestId.
   * @param {fileSystemProvider.CloseFileRequestedOptions} options Options for
   *     closing a file.
   * @param {function()} onSuccess Callback to execute on success.
   * @param {function(ProviderError)} onError Callback to execute on error.
   */
  onCloseFileRequested: function(options, onSuccess, onError) {
    app.restoreState_(options.fileSystemId, options.requestId, function() {
      app.volumes[options.fileSystemId].onCloseFileRequested(
          options, onSuccess, onError);
    }, onError);
  },

  /**
   * Reads the contents of a file identified by options.openRequestId.
   * @param {fileSystemProvider.ReadFileRequestedOptions} options Options for
   *     reading a file's contents.
   * @param {function(ArrayBuffer, boolean)} onSuccess Callback to execute on
   *     success. The first parameter is the read data and the second parameter
   *     is 'hasMore'. If it's set to true, then onSuccess must be called again
   *     with the next data to read.
   * @param {function(ProviderError)} onError Callback to execute on error.
   */
  onReadFileRequested: function(options, onSuccess, onError) {
    app.restoreState_(options.fileSystemId, options.requestId, function() {
      app.volumes[options.fileSystemId].onReadFileRequested(
          options, onSuccess, onError);
    });
  },

  /**
   * Creates a volume for every opened file with the extension or mime type
   * declared in the manifest file.
   * @param {Object} launchData The data pased on launch.
   * @param {function(string)=} opt_onSuccess Callback to execute in case a
   *     volume was loaded successfully. Has one parameter, which is the file
   *     system id of the loaded volume. Can be called multiple times, depending
   *     on how many volumes must be loaded.
   * @param {function(string)=} opt_onError Callback to execute in case of
   *     failure when loading a volume. Has one parameter, which is the file
   *     system id of the volume that failed to load. Can be called multiple
   *     times, depending on how many volumes must be loaded.
   */
  onLaunched: function(launchData, opt_onSuccess, opt_onError) {
    if (!app.naclModuleIsLoaded()) {
      console.warn('Module not loaded yet.');
      return;
    }

    launchData.items.forEach(function(item) {
      chrome.fileSystem.getDisplayPath(item.entry, function(displayPath) {
        item.entry.file(function(file) {
          app.loadVolume_(displayPath, item.entry, file, function() {
            // Mount the volume and save its information in local storage
            // in order to be able to recover the metadata in case of
            // restarts, system crashes, etc.
            chrome.fileSystemProvider.mount(
                {fileSystemId: displayPath, displayName: item.entry.name},
                function() {
                  app.saveState_();
                  if (opt_onSuccess)
                    opt_onSuccess(displayPath);
                },
                function() {
                  console.error('Failed to mount.');
                  if (opt_onError)
                    opt_onError(displayPath);
                });
          }, function(error) {
            console.error('Unable to read metadata: ' + error + '.');
            if (opt_onError)
              opt_onError(displayPath);
          });
        });
      });
    });
  },

  /**
   * Restores the state on a profile startup.
   */
  onStartup: function() {
    chrome.storage.local.get([app.STORAGE_KEY], function(result) {
      // Nothing to change.
      if (!result[app.STORAGE_KEY])
        return;

      // TODO(cmihail): Nothing to do for now, but will require logic for
      // removing opened files information from state.
    });
  },

  /**
   * Saves the state before suspending the event page, so we can resume it
   * once new events arrive.
   */
  onSuspend: function() {
    app.saveState_();
  }
};
