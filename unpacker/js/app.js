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
   * Multiple volumes can be opened at the same time. The key is the
   * fileSystemId and the value is a Volume object.
   * @type {Object.<string, Volume>}
   */
  volumes: {},

  /**
   * A map with promises of loading a volume's metadata from NaCl where the key
   * is the file system id. Any call from fileSystemProvider API should work
   * only on valid metadata. These promises ensure that the fileSystemProvider
   * API calls wait for the metatada load.
   * @type {Object.<string, Promise>}
   */
  volumeLoadedPromises: {},

  /**
   * A Promise used to postpone all calls to fileSystemProvider API after
   * the NaCl module loads.
   * @type {Promise}
   */
  moduleLoadedPromise: null,

  /**
   * The NaCl module containing the logic for decompressing archives.
   * @type {Object}
   * @private
   */
  naclModule_: null,

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
   * @param {Array.<string>} fileSystemIdsArray An array with the file system
   *     ids for which the state is saved.
   * @private
   */
  saveState_: function(fileSystemIdsArray) {
    chrome.storage.local.get([app.STORAGE_KEY], function(result) {
      if (!result[app.STORAGE_KEY])  // First save state call.
        result[app.STORAGE_KEY] = {};

      // Overwrite state only for the volumes that have their file system id
      // present in the input array. Leave the rest of the volumes state
      // untouched.
      fileSystemIdsArray.forEach(function(fileSystemId) {
        var entryId =
            chrome.fileSystem.retainEntry(app.volumes[fileSystemId].entry);
        result[app.STORAGE_KEY][fileSystemId] = {
          entryId: entryId,
          openedFiles: app.volumes[fileSystemId].openedFiles
        };
      });

      chrome.storage.local.set(result);
    });
  },

  /**
   * Removes state from local storage for a single volume.
   * @param {string} fileSystemId The file system id of the volume for which
   *     state is removed.
   */
  removeState_: function(fileSystemId) {
    chrome.storage.local.get([app.STORAGE_KEY], function(result) {
      console.assert(
          result[app.STORAGE_KEY] && result[app.STORAGE_KEY][fileSystemId],
          'Should call removeState_ only for file systems that have ' +
          'previously called saveState_.');

      delete result[app.STORAGE_KEY][fileSystemId];
      chrome.storage.local.set(result);
    });
  },

  /**
   * Restores archive's entry and opened files for the passed file system id.
   * @param {string} fileSystemId The file system id.
   * @param {function(Entry, Object.<number, string>)} onSuccessRestore Callback
   *     to execute on success. The first parameter is the volume's archive
   *     entry, while the second is the opened files before suspend event.
   * @param {function(ProviderError)} onErrorRestore Callback to execute on
   *     error.
   * @private
   */
  restoreVolumeState_: function(fileSystemId, onSuccessRestore,
                                onErrorRestore) {
    chrome.storage.local.get([app.STORAGE_KEY], function(result) {
      if (!result[app.STORAGE_KEY]) {
        onErrorRestore('FAILED');
        return;
      }

      var volumeState = result[app.STORAGE_KEY][fileSystemId];
      if (!volumeState) {
        console.error('No state for: ' + fileSystemId + '.');
        onErrorRestore('FAILED');
        return;
      }

      chrome.fileSystem.restoreEntry(volumeState.entryId, function(entry) {
        if (chrome.runtime.lastError) {
          console.error('Restore entry error for <' + fileSystemId + '>: ' +
                        chrome.runtime.lastError.message);
          onErrorRestore('FAILED');
          return;
        }

        onSuccessRestore(entry, volumeState.openedFiles);
      });
    });
  },

  /**
   * Creates a volume and loads its metadata from NaCl.
   * @param {string} fileSystemId The file system id.
   * @param {Entry} entry The volume's archive entry.
   * @param {function()} fulfillVolumeLoad The promise fulfill calback.
   * @param {function(ProviderError)} rejectVolumeLoad The promise reject
   *     callback.
   * @param {Object.<number, string>} opt_openedFiles Previously opened files
   *     before suspend.
   * @private
   */
  loadVolume_: function(fileSystemId, entry, fulfillVolumeLoad,
                        rejectVolumeLoad, opt_openedFiles) {
    entry.file(function(file) {
      // File is a Blob object, so it's ok to construct the Decompressor
      // directly with it.
      var volume =
          new Volume(new Decompressor(app.naclModule_, fileSystemId, file),
                     entry, opt_openedFiles);

      app.volumes[fileSystemId] = volume;
      // Read metadata from NaCl.
      var onReadMetadataSuccess = function() {
        opt_openedFiles = opt_openedFiles ? opt_openedFiles : {};
        if (Object.keys(opt_openedFiles).length == 0) {
          fulfillVolumeLoad();
          return;
        }

        // Restore opened files on NaCl side.
        // TODO(cmihail): Implement this feature after integration tests are
        // finished.
        rejectVolumeLoad('INVALID_OPERATION');
      };

      volume.readMetadata(onReadMetadataSuccess, rejectVolumeLoad);
    });
  },

  /**
   * Creates a promise to load a volume.
   * @param {string} fileSystemId The file system id of the volume to create.
   * @param {Entry=} entry The entry corresponding to the volume's archive. In
   *     case this parameter is not supplied than entry must be restored from
   *     volume state. This happens in case of restarts and suspends.
   * @return {Promise} The load volume promise.
   * @private
   */
  createVolumeLoadedPromise_: function(fileSystemId, opt_entry) {
    return new Promise(function(fulfillVolumeLoad, rejectVolumeLoad) {
      if (opt_entry) {  // Load volume on launch.
        app.loadVolume_(
            fileSystemId, opt_entry, fulfillVolumeLoad, rejectVolumeLoad);
        return;
      }

      // Load volume after restart / suspend page event.
      app.restoreVolumeState_(fileSystemId, function(entry, openedFiles) {
        app.loadVolume_(fileSystemId, entry, fulfillVolumeLoad,
                        rejectVolumeLoad, openedFiles);
      }, function(error) {
        // Force unmount in case restore failed. All resources related to the
        // volume will be cleanup from both memory and local storage.
        app.onUnmountRequested({fileSystemId: fileSystemId}, function() {
          rejectVolumeLoad(error);
        }, rejectVolumeLoad, true /* Force unmount. */);
      });
    });
  },

  /**
   * Restores a volume mounted previously to a suspend / restart.
   * @param {string} fileSystemId The file system id.
   * @return {Promise} A promise that restores state. The promise is rejected
   *     with ProviderError.
   * @private
   */
  restoreSingleVolume_: function(fileSystemId) {
    return app.moduleLoadedPromise.then(function() {
      if (!app.volumeLoadedPromises[fileSystemId]) {
        app.volumeLoadedPromises[fileSystemId] =
            app.createVolumeLoadedPromise_(fileSystemId /* No entry, so force
                                                           restore. */);
      }

      return app.volumeLoadedPromises[fileSystemId];
    }).catch(function(error) {
      console.error(error.stack || error);
      // Promise normally would reject with ProviderError, but in case of
      // error.stack we have a programmer error. In this case is ok to return
      // anything as this scenario shouldn't happen.
      return Promise.reject(error);
    });
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
   */
  loadNaclModule: function(pathToConfigureFile, mimeType) {
    app.moduleLoadedPromise = new Promise(function(fulfill) {
      var elementDiv = document.createElement('div');

      // Promise fulfills only after NaCl module has been loaded.
      elementDiv.addEventListener('load', function() {
        app.naclModule_ = document.getElementById('nacl_module');
        fulfill();
      }, true);

      elementDiv.addEventListener('message', app.handleMessage_, true);

      var elementEmbed = document.createElement('embed');
      elementEmbed.id = 'nacl_module';
      elementEmbed.style.width = 0;
      elementEmbed.style.height = 0;
      elementEmbed.src = pathToConfigureFile;
      elementEmbed.type = mimeType;
      elementDiv.appendChild(elementEmbed);

      document.body.appendChild(elementDiv);
    });
  },

  /**
   * Cleans up the resources for a volume, except for the local storage. If
   * necessary that can be done using app.removeState_.
   * @param {string} fileSystemId The file system id of the volume to clean.
   */
  cleanupVolume: function(fileSystemId) {
    app.naclModule_.postMessage(
        request.createCloseVolumeRequest(fileSystemId));
    delete app.volumes[fileSystemId];
    delete app.volumeLoadedPromises[fileSystemId];  // Allow mount after clean.
  },

  /**
   * Unmounts a volume and removes any resources related to the volume from both
   * the extension and the local storage state.
   * @param {fileSystemProvider.UnmountRequestedOptions} options Options for
   *     unmount event.
   * @param {function()} onSuccess Callback to execute on success.
   * @param {function(ProviderError)} onError Callback to execute on error.
   * @param {boolean=} opt_forceUnmount True if unmount should be forced even if
   *     volume might be in use.
   */
  onUnmountRequested: function(options, onSuccess, onError, opt_forceUnmount) {
    var fileSystemId = options.fileSystemId;
    if (!opt_forceUnmount && app.volumes[fileSystemId].inUse()) {
      onError('IN_USE');
      return;
    }

    chrome.fileSystemProvider.unmount({fileSystemId: fileSystemId}, function() {
      app.cleanupVolume(fileSystemId);
      app.removeState_(fileSystemId);  // Remove volume from local storage.
      onSuccess();
    }, function(unmountError) {
      console.error('Unmount error: ' + unmountError + '.');
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
    app.restoreSingleVolume_(options.fileSystemId).then(function() {
      app.volumes[options.fileSystemId].onGetMetadataRequested(
          options, onSuccess, onError);
    }).catch(onError);
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
    app.restoreSingleVolume_(options.fileSystemId).then(function() {
      app.volumes[options.fileSystemId].onReadDirectoryRequested(
          options, onSuccess, onError);
    }).catch(onError);
  },

  /**
   * Opens a file for read or write.
   * @param {fileSystemProvider.OpenFileRequestedOptions} options Options for
   *     opening a file.
   * @param {function()} onSuccess Callback to execute on success.
   * @param {function(ProviderError)} onError Callback to execute on error.
   */
  onOpenFileRequested: function(options, onSuccess, onError) {
    app.restoreSingleVolume_(options.fileSystemId).then(function() {
      app.volumes[options.fileSystemId].onOpenFileRequested(
          options, onSuccess, onError);
    }).catch(onError);
  },

  /**
   * Closes a file identified by options.openRequestId.
   * @param {fileSystemProvider.CloseFileRequestedOptions} options Options for
   *     closing a file.
   * @param {function()} onSuccess Callback to execute on success.
   * @param {function(ProviderError)} onError Callback to execute on error.
   */
  onCloseFileRequested: function(options, onSuccess, onError) {
    app.restoreSingleVolume_(options.fileSystemId).then(function() {
      app.volumes[options.fileSystemId].onCloseFileRequested(
          options, onSuccess, onError);
    }).catch(onError);
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
    app.restoreSingleVolume_(options.fileSystemId).then(function() {
      app.volumes[options.fileSystemId].onReadFileRequested(
          options, onSuccess, onError);
    }).catch(onError);
  },

  /**
   * Creates a volume for every opened file with the extension or mime type
   * declared in the manifest file.
   * @param {Object} launchData The data passed on launch.
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
    app.moduleLoadedPromise.then(function() {
      launchData.items.forEach(function(item) {
        chrome.fileSystem.getDisplayPath(item.entry, function(fileSystemId) {
          if (app.volumeLoadedPromises[fileSystemId]) {
            console.warn('Volume is loading or already loaded.');
            return;
          }

          var promise = app.createVolumeLoadedPromise_(
              fileSystemId, item.entry).then(function() {
            // Mount the volume and save its information in local storage
            // in order to be able to recover the metadata in case of
            // restarts, system crashes, etc.
            chrome.fileSystemProvider.mount(
                {fileSystemId: fileSystemId, displayName: item.entry.name},
                function() {
                  // Save state so in case of restarts we are able to correctly
                  // get the archive's metadata.
                  app.saveState_([fileSystemId]);
                  if (opt_onSuccess)
                    opt_onSuccess(fileSystemId);
                },
                function() {
                  console.error('Failed to mount: ' + fileSystemId + '.');
                  if (opt_onError)
                    opt_onError(fileSystemId);
                  // Cleanup volume resources in order to allow future attempts
                  // to mount the volume.
                  app.cleanupVolume(fileSystemId);
                });
          }).catch(function(error) {
            console.error(error.stack || error);
            if (opt_onError)
              opt_onError(fileSystemId);
            app.cleanupVolume(fileSystemId);
            return Promise.reject(error);
          });

          app.volumeLoadedPromises[fileSystemId] = promise;
        });
      });
    }).catch(function(error) {
      console.error(error.stack || error);
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

      // Remove files opened before the profile shutdown from the local
      // storage.
      for (var fileSystemId in result[app.STORAGE_KEY]) {
        result[app.STORAGE_KEY][fileSystemId].openedFiles = {};
      }

      chrome.storage.local.set(result);
    });
  },

  /**
   * Saves the state before suspending the event page, so we can resume it
   * once new events arrive.
   */
  onSuspend: function() {
    app.saveState_(Object.keys(app.volumes));
  }
};
