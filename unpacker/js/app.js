// Copyright 2014 The Chromium OS Authors. All rights reserved.
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
   * The default id for the NaCl module.
   * @type {string}
   * @const
   */
  DEFAULT_MODULE_ID: 'nacl_module',

  /**
   * Time in milliseconds before the notification about mounting is shown.
   * @type {number}
   * @const
   */
  MOUNTING_NOTIFICATION_DELAY: 1000,

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
   * A Promise used to postpone all calls to fileSystemProvider API after
   * onStartup event is processed. This Promise is used only after restarts
   * because onStartup event is fired only in this case scenario. By default
   * it successfully resolves (e.g. after onSuspend event or when installing
   * the extension).
   * @type {Promise}
   */
  onStartupPromise: Promise.resolve(),

  /**
   * The NaCl module containing the logic for decompressing archives.
   * @type {Object}
   */
  naclModule: null,

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
    if (!volume) {
      // The volume is gone, which can happen.
      console.info('No volume for: ' + fileSystemId + '.');
      return;
    }

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
      var decompressor = new Decompressor(app.naclModule, fileSystemId, file);
      var volume = new Volume(decompressor, entry);

      var onLoadVolumeSuccess = function() {
        var openedFiles = opt_openedFiles ? opt_openedFiles : {};
        if (Object.keys(openedFiles).length == 0) {
          fulfillVolumeLoad();
          return;
        }

        // Restore opened files on NaCl side.
        var openFilePromises = [];
        for (var openRequestId in openedFiles) {
          var options = openedFiles[openRequestId]
          openFilePromises.push(new Promise(function(resolve, reject) {
            volume.onOpenFileRequested(options, resolve, reject);
          }));
        }

        Promise.all(openFilePromises).then(fulfillVolumeLoad, rejectVolumeLoad);
      };
      app.volumes[fileSystemId] = volume;
      volume.initialize(onLoadVolumeSuccess, rejectVolumeLoad);
    });
  },

  /**
   * Restores a volume mounted previously to a suspend / restart. In case of
   * failure of the load promise for fileSystemId, the corresponding volume is
   * forcely unmounted.
   * @param {string} fileSystemId The file system id.
   * @return {Promise} A promise that restores state and loads volume.
   * @private
   */
  restoreSingleVolume_: function(fileSystemId) {
    return new Promise(function(fulfillVolumeLoad, rejectVolumeLoad) {
      // Load volume after restart / suspend page event.
      app.restoreVolumeState_(fileSystemId, function(entry, openedFiles) {
        app.loadVolume_(fileSystemId, entry, fulfillVolumeLoad,
                        rejectVolumeLoad, openedFiles);
      }, function(error) {
        // Force unmount in case restore failed. All resources related to the
        // volume will be cleanup from both memory and local storage.
        app.unmountVolume_(fileSystemId, true).then(function() {
          rejectVolumeLoad(error);
        }).catch(rejectVolumeLoad);
      });
    });
  },

  /**
   * Ensures a volume is loaded by returning its corresponding loaded promise
   * from app.volumeLoadedPromises. In case there is no such promise, then this
   * is a call after suspend / restart and a new volume loaded promise that
   * restores state is returned.
   * @param {string} fileSystemId The file system id.
   * @return {Promise} The loading volume promise.
   * @private
   */
  ensureVolumeLoaded_: function(fileSystemId) {
    return app.onStartupPromise.then(function() {
      return app.moduleLoadedPromise.then(function() {
        // In case there is no volume promise for fileSystemId then we received
        // a call after restart / suspend as load promises are created on
        // launched. In this case we will restore volume state from local
        // storage and create a new load promise.
        if (!app.volumeLoadedPromises[fileSystemId]) {
          app.volumeLoadedPromises[fileSystemId] =
              app.restoreSingleVolume_(fileSystemId);
        }

        return app.volumeLoadedPromises[fileSystemId];
      });
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
    return !!app.naclModule;
  },

  /**
   * Loads the NaCl module.
   * @param {string} pathToConfigureFile Path to the module's configuration
   *     file, which should be a .nmf file.
   * @param {string} mimeType The mime type for the NaCl executable.
   * @param {string=} opt_moduleId The NaCl module id. Necessary for testing
   *     purposes.
   */
  loadNaclModule: function(pathToConfigureFile, mimeType, opt_moduleId) {
    app.moduleLoadedPromise = new Promise(function(fulfill) {
      var moduleId = opt_moduleId ? opt_moduleId : app.DEFAULT_MODULE_ID;
      var elementDiv = document.createElement('div');

      // Promise fulfills only after NaCl module has been loaded.
      elementDiv.addEventListener('load', function() {
        app.naclModule = document.getElementById(moduleId);
        fulfill();
      }, true);

      elementDiv.addEventListener('message', app.handleMessage_, true);

      var elementEmbed = document.createElement('embed');
      elementEmbed.id = moduleId;
      elementEmbed.style.width = 0;
      elementEmbed.style.height = 0;
      elementEmbed.src = pathToConfigureFile;
      elementEmbed.type = mimeType;
      elementDiv.appendChild(elementEmbed);

      document.body.appendChild(elementDiv);
    });
  },

  /**
   * Unloads the NaCl module.
   */
  unloadNaclModule: function() {
    var naclModuleParentNode = app.naclModule.parentNode;
    naclModuleParentNode.parentNode.removeChild(naclModuleParentNode);
    app.naclModule = null;
    app.moduleLoadedPromise = null;
  },

  /**
   * Cleans up the resources for a volume, except for the local storage. If
   * necessary that can be done using app.removeState_.
   * @param {string} fileSystemId The file system id of the volume to clean.
   */
  cleanupVolume: function(fileSystemId) {
    app.naclModule.postMessage(
        request.createCloseVolumeRequest(fileSystemId));
    delete app.volumes[fileSystemId];
    delete app.volumeLoadedPromises[fileSystemId];  // Allow mount after clean.
  },

  /**
   * Unmounts a volume and removes any resources related to the volume from both
   * the extension and the local storage state.
   * @param {string} fileSystemId The file system id of the volume to unmount.
   * @param {boolean=} opt_forceUnmount True if unmount should be forced even if
   *     volume might be in use.
   * @return {Promise} A promise that fulfills if volume is unmounted or rejects
   *     with ProviderError in case of any errors.
   * @private
   */
  unmountVolume_: function(fileSystemId, opt_forceUnmount) {
    return new Promise(function(fulfill, reject) {
      var volume = app.volumes[fileSystemId];
      console.assert(!opt_forceUnmount && volume,
          'Unmount that is not forced must not be called for volumes that ' +
              'are not restored.');

      if (!opt_forceUnmount && volume.inUse()) {
        reject('IN_USE');
        return;
      }

      var options = {
        fileSystemId: fileSystemId
      };
      chrome.fileSystemProvider.unmount(options, function() {
        if (chrome.runtime.lastError) {
          console.error(
              'Unmount error: ' + chrome.runtime.lastError.message + '.');
          reject('FAILED');
          return;
        }

        // In case of forced unmount volume can be undefined due to not being
        // restored. An unmount that is not forced will be called only after
        // restoring state. In the case of forced unmount when volume is not
        // restored, we will not do a normal cleanup, but just remove the load
        // volume promise to allow further mounts.
        if (opt_forceUnmount)
          delete app.volumeLoadedPromises[fileSystemId];
        else
          app.cleanupVolume(fileSystemId);

        app.removeState_(fileSystemId);  // Remove volume from local storage.
        fulfill();
      });
    });
  },

  /**
   * Handles an unmount request received from File System Provider API.
   * @param {FileSystemProvider.unmountRequestedOptions} options Options for
   *     unmount event.
   * @param {function()} onSuccess Callback to execute on success.
   * @param {function(ProviderError)} onError Callback to execute on error.
   */
  onUnmountRequested: function(options, onSuccess, onError) {
    app.ensureVolumeLoaded_(options.fileSystemId).then(function() {
      return app.unmountVolume_(options.fileSystemId);
    }).then(onSuccess).catch(onError);
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
    app.ensureVolumeLoaded_(options.fileSystemId).then(function() {
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
    app.ensureVolumeLoaded_(options.fileSystemId).then(function() {
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
    app.ensureVolumeLoaded_(options.fileSystemId).then(function() {
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
    app.ensureVolumeLoaded_(options.fileSystemId).then(function() {
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
    app.ensureVolumeLoaded_(options.fileSystemId).then(function() {
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
        chrome.fileSystem.getDisplayPath(item.entry,
            function(entry, fileSystemId) {
              // If loading takes significant amount of time, then show a
              // notification about scanning in progress.
              var deferredNotificationTimer = setTimeout(function() {
                chrome.notifications.create(fileSystemId, {
                  type: 'basic',
                  iconUrl: chrome.runtime.getManifest().icons[128],
                  title: entry.name,
                  message: chrome.i18n.getMessage('mountingMessage'),
                }, function() {});
              }, app.MOUNTING_NOTIFICATION_DELAY);

              var onError = function(error) {
                clearTimeout(deferredNotificationTimer);
                chrome.notifications.create(fileSystemId, {
                  type: 'basic',
                  iconUrl: chrome.runtime.getManifest().icons[128],
                  title: entry.name,
                  message: chrome.i18n.getMessage(error == 'EXISTS' ?
                      'existsErrorMessage' : 'otherErrorMessage')
                }, function() {});
                if (opt_onError)
                  opt_onError(fileSystemId);
                // Cleanup volume resources in order to allow future attempts
                // to mount the volume.
                app.cleanupVolume(fileSystemId);
              };

              var onSuccess = function(fileSystemId, entry) {
                clearTimeout(deferredNotificationTimer);
                chrome.notifications.clear(fileSystemId, function() {});
                if (opt_onSuccess)
                  opt_onSuccess(fileSystemId);
              };

              if (app.volumeLoadedPromises[fileSystemId]) {
                onError('EXISTS', fileSystemId);
                return;
              }

              var loadPromise = new Promise(function(fulfill, reject) {
                app.loadVolume_(fileSystemId, entry, fulfill, reject);
              });

              loadPromise.then(function() {
                // Mount the volume and save its information in local storage
                // in order to be able to recover the metadata in case of
                // restarts, system crashes, etc.
                chrome.fileSystemProvider.mount(
                    {fileSystemId: fileSystemId, displayName: entry.name},
                    function() {
                      if (chrome.runtime.lastError) {
                        console.error('Mount error: ' +
                            chrome.runtime.lastError.message + '.');
                        onError('FAILED', fileSystemId);
                        return;
                      }
                      // Save state so in case of restarts we are able to correctly
                      // get the archive's metadata.
                      app.saveState_([fileSystemId]);
                      onSuccess(fileSystemId);
                    });
              }).catch(function(error) {
                onError(error.stack || error, fileSystemId);
                return Promise.reject(error);
              });

              app.volumeLoadedPromises[fileSystemId] = loadPromise;
            }.bind(null, item.entry));
      });
    }).catch(function(error) {
      console.error(error.stack || error);
    });
  },

  /**
   * Restores the state on a profile startup.
   */
  onStartup: function() {
    app.onStartupPromise = new Promise(function(fulfill, reject) {
      chrome.storage.local.get([app.STORAGE_KEY], function(result) {
        // Nothing to change.
        if (!result[app.STORAGE_KEY]) {
          fulfill();
          return;
        }

        // Remove files opened before the profile shutdown from the local
        // storage.
        for (var fileSystemId in result[app.STORAGE_KEY]) {
          result[app.STORAGE_KEY][fileSystemId].openedFiles = {};
        }

        chrome.storage.local.set(result, fulfill);
      });
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
