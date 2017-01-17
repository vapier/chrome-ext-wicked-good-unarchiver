// Copyright 2014 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * The main namespace for the extension.
 * @namespace
 */
unpacker.app = {
  /**
   * The key used by chrome.storage.local to save and restore the volumes state.
   * @const {string}
   */
  STORAGE_KEY: 'state',

  /**
   * The default id for the NaCl module.
   * @const {string}
   */
  DEFAULT_MODULE_ID: 'nacl_module',

  /**
   * Time in milliseconds before the notification about mounting is shown.
   * @const {number}
   */
  MOUNTING_NOTIFICATION_DELAY: 1000,

  /**
   * Multiple volumes can be opened at the same time.
   * @type {!Object<!unpacker.types.FileSystemId, !unpacker.Volume>}
   */
  volumes: {},

  /**
   * A map with promises of loading a volume's metadata from NaCl.
   * Any call from fileSystemProvider API should work only on valid metadata.
   * These promises ensure that the fileSystemProvider API calls wait for the
   * metatada load.
   * @type {!Object<!unpacker.types.FileSystemId, !Promise>}
   */
  volumeLoadedPromises: {},

  /**
   * A Promise used to postpone all calls to fileSystemProvider API after
   * the NaCl module loads.
   * @type {?Promise}
   */
  moduleLoadedPromise: null,

  /**
   * The NaCl module containing the logic for decompressing archives.
   * @type {?Object}
   */
  naclModule: null,

  /**
   * Function called on receiving a message from NaCl module. Registered by
   * common.js.
   * @param {!Object} message The message received from NaCl module.
   * @private
   */
  handleMessage_: function(message) {
    // Get mandatory fields in a message.
    var operation = message.data[unpacker.request.Key.OPERATION];
    console.assert(operation != undefined,  // Operation can be 0.
                   'No NaCl operation: ' + operation + '.');

    var fileSystemId = message.data[unpacker.request.Key.FILE_SYSTEM_ID];
    console.assert(fileSystemId, 'No NaCl file system id.');

    var requestId = message.data[unpacker.request.Key.REQUEST_ID];
    console.assert(!!requestId, 'No NaCl request id.');

    var volume = unpacker.app.volumes[fileSystemId];
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
   * @param {!Array<!unpacker.types.FileSystemId>} fileSystemIdsArray
   * @private
   */
  saveState_: function(fileSystemIdsArray) {
    chrome.storage.local.get([unpacker.app.STORAGE_KEY], function(result) {
      if (!result[unpacker.app.STORAGE_KEY])  // First save state call.
        result[unpacker.app.STORAGE_KEY] = {};

      // Overwrite state only for the volumes that have their file system id
      // present in the input array. Leave the rest of the volumes state
      // untouched.
      fileSystemIdsArray.forEach(function(fileSystemId) {
        var entryId = chrome.fileSystem.retainEntry(
            unpacker.app.volumes[fileSystemId].entry);
        result[unpacker.app.STORAGE_KEY][fileSystemId] = {
          entryId: entryId,
          passphrase: unpacker.app.volumes[fileSystemId]
                          .decompressor.passphraseManager.rememberedPassphrase
        };
      });

      chrome.storage.local.set(result);
    });
  },

  /**
   * Removes state from local storage for a single volume.
   * @param {!unpacker.types.FileSystemId} fileSystemId
   */
  removeState_: function(fileSystemId) {
    chrome.storage.local.get([unpacker.app.STORAGE_KEY], function(result) {
      console.assert(result[unpacker.app.STORAGE_KEY] &&
                         result[unpacker.app.STORAGE_KEY][fileSystemId],
                     'Should call removeState_ only for file systems that ',
                     'have previously called saveState_.');

      delete result[unpacker.app.STORAGE_KEY][fileSystemId];
      chrome.storage.local.set(result);
    });
  },

  /**
   * Restores archive's entry and opened files for the passed file system id.
   * @param {!unpacker.types.FileSystemId} fileSystemId
   * @return {!Promise<!Object>} Promise fulfilled with the entry and list of
   *     opened files.
   * @private
   */
  restoreVolumeState_: function(fileSystemId) {
    return new Promise(function(fulfill, reject) {
      chrome.storage.local.get([unpacker.app.STORAGE_KEY], function(result) {
        if (!result[unpacker.app.STORAGE_KEY]) {
          reject('FAILED');
          return;
        }

        var volumeState = result[unpacker.app.STORAGE_KEY][fileSystemId];
        if (!volumeState) {
          console.error('No state for: ' + fileSystemId + '.');
          reject('FAILED');
          return;
        }

        chrome.fileSystem.restoreEntry(volumeState.entryId, function(entry) {
          if (chrome.runtime.lastError) {
            console.error('Restore entry error for <', fileSystemId, '>: ' +
                          chrome.runtime.lastError.message);
            reject('FAILED');
            return;
          }
          fulfill({
            entry: entry,
            passphrase: volumeState.passphrase
          });
        });
      });
    });
  },

  /**
   * Creates a volume and loads its metadata from NaCl.
   * @param {!unpacker.types.FileSystemId} fileSystemId
   * @param {!Entry} entry The volume's archive entry.
   * @param {!Object<!unpacker.types.RequestId,
   *                 !unpacker.types.OpenFileRequestedOptions>}
   *     openedFiles Previously opened files before a suspend.
   * @param {string} passphrase Previously used passphrase before a suspend.
   * @return {!Promise} Promise fulfilled on success and rejected on failure.
   * @private
   */
  loadVolume_: function(fileSystemId, entry, openedFiles, passphrase) {
    return new Promise(function(fulfill, reject) {
      entry.file(function(file) {
        // File is a Blob object, so it's ok to construct the Decompressor
        // directly with it.
        var passphraseManager = new unpacker.PassphraseManager(passphrase);
        console.assert(unpacker.app.naclModule,
                       'The NaCL module should have already been defined.');
        var decompressor = new unpacker.Decompressor(
            /** @type {!Object} */ (unpacker.app.naclModule),
            fileSystemId, file, passphraseManager);
        var volume = new unpacker.Volume(decompressor, entry);

        var onLoadVolumeSuccess = function() {
          if (Object.keys(openedFiles).length == 0) {
            fulfill();
            return;
          }

          // Restore opened files on NaCl side.
          var openFilePromises = [];
          for (var key in openedFiles) {
            // 'key' is always a number but JS compiler complains that it is
            // a string.
            var openRequestId = Number(key);
            var options =
                /** @type {!unpacker.types.OpenFileRequestedOptions} */
                (openedFiles[openRequestId]);
            openFilePromises.push(new Promise(function(resolve, reject) {
              volume.onOpenFileRequested(options, resolve, reject);
            }));
          }

          Promise.all(openFilePromises).then(fulfill, reject);
        };

        unpacker.app.volumes[fileSystemId] = volume;
        volume.initialize(onLoadVolumeSuccess, reject);
      }, function(error) {
        reject('FAILED');
      });
    });
  },

  /**
   * Restores a volume mounted previously to a suspend / restart. In case of
   * failure of the load promise for fileSystemId, the corresponding volume is
   * forcely unmounted.
   * @param {!unpacker.types.FileSystemId} fileSystemId
   * @return {!Promise} A promise that restores state and loads volume.
   * @private
   */
  restoreSingleVolume_: function(fileSystemId) {
    // Load volume after restart / suspend page event.
    return unpacker.app.restoreVolumeState_(fileSystemId)
        .then(function(state) {
          return new Promise(function(fulfill, reject) {
            // Check if the file system is compatible with this version of the
            // ZIP unpacker.
            // TODO(mtomasz): Implement remounting instead of unmounting.
            chrome.fileSystemProvider.get(fileSystemId, function(fileSystem) {
              if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError.name);
                reject('FAILED');
                return;
              }
              if (!fileSystem || fileSystem.openedFilesLimit != 1) {
                console.error('No compatible mounted file system found.');
                reject('FAILED');
                return;
              }
              fulfill({state: state, fileSystem: fileSystem});
            });
          });
        })
        .then(function(stateWithFileSystem) {
          var openedFilesOptions = {};
          stateWithFileSystem.fileSystem.openedFiles.forEach(function(
              openedFile) {
            openedFilesOptions[openedFile.openRequestId] = {
              fileSystemId: fileSystemId,
              requestId: openedFile.openRequestId,
              mode: openedFile.mode,
              filePath: openedFile.filePath
            };
          });
          return unpacker.app.loadVolume_(
              fileSystemId, stateWithFileSystem.state.entry, openedFilesOptions,
              stateWithFileSystem.state.passphrase);
        })
        .catch(function(error) {
          console.error(error.stack || error);
          // Force unmount in case restore failed. All resources related to the
          // volume will be cleanup from both memory and local storage.
          // TODO(523195): Show a notification that the source file is gone.
          return unpacker.app.unmountVolume(fileSystemId, true)
              .then(function() { return Promise.reject('FAILED'); });
        });
  },

  /**
   * Ensures a volume is loaded by returning its corresponding loaded promise
   * from unpacker.app.volumeLoadedPromises. In case there is no such promise,
   * then this is a call after suspend / restart and a new volume loaded promise
   * that restores state is returned.
   * @param {!unpacker.types.FileSystemId} fileSystemId
   * @return {!Promise} The loading volume promise.
   * @private
   */
  ensureVolumeLoaded_: function(fileSystemId) {
    return unpacker.app.moduleLoadedPromise.then(function() {
      // In case there is no volume promise for fileSystemId then we
      // received a call after restart / suspend as load promises are
      // created on launched. In this case we will restore volume state
      // from local storage and create a new load promise.
      if (!unpacker.app.volumeLoadedPromises[fileSystemId]) {
        unpacker.app.volumeLoadedPromises[fileSystemId] =
            unpacker.app.restoreSingleVolume_(fileSystemId);
      }

      return unpacker.app.volumeLoadedPromises[fileSystemId];
    });
  },

  /**
   * @return {boolean} True if NaCl module is loaded.
   */
  naclModuleIsLoaded: function() { return !!unpacker.app.naclModule; },

  /**
   * Loads the NaCl module.
   * @param {string} pathToConfigureFile Path to the module's configuration
   *     file, which should be a .nmf file.
   * @param {string} mimeType The mime type for the NaCl executable.
   * @param {string=} opt_moduleId The NaCl module id. Necessary for testing
   *     purposes.
   */
  loadNaclModule: function(pathToConfigureFile, mimeType, opt_moduleId) {
    unpacker.app.moduleLoadedPromise = new Promise(function(fulfill) {
      var moduleId =
          opt_moduleId ? opt_moduleId : unpacker.app.DEFAULT_MODULE_ID;
      var elementDiv = document.createElement('div');

      // Promise fulfills only after NaCl module has been loaded.
      elementDiv.addEventListener('load', function() {
        unpacker.app.naclModule = document.getElementById(moduleId);
        fulfill();
      }, true);

      elementDiv.addEventListener('message', unpacker.app.handleMessage_, true);

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
    var naclModuleParentNode = unpacker.app.naclModule.parentNode;
    naclModuleParentNode.parentNode.removeChild(naclModuleParentNode);
    unpacker.app.naclModule = null;
    unpacker.app.moduleLoadedPromise = null;
  },

  /**
   * Cleans up the resources for a volume, except for the local storage. If
   * necessary that can be done using unpacker.app.removeState_.
   * @param {!unpacker.types.FileSystemId} fileSystemId
   */
  cleanupVolume: function(fileSystemId) {
    unpacker.app.naclModule.postMessage(
        unpacker.request.createCloseVolumeRequest(fileSystemId));
    delete unpacker.app.volumes[fileSystemId];
    // Allow mount after clean.
    delete unpacker.app.volumeLoadedPromises[fileSystemId];
  },

  /**
   * Unmounts a volume and removes any resources related to the volume from both
   * the extension and the local storage state.
   * @param {!unpacker.types.FileSystemId} fileSystemId
   * @param {boolean=} opt_forceUnmount True if unmount should be forced even if
   *     volume might be in use, or is not restored yet.
   * @return {!Promise} A promise that fulfills if volume is unmounted or
   *     rejects with ProviderError in case of any errors.
   */
  unmountVolume: function(fileSystemId, opt_forceUnmount) {
    return new Promise(function(fulfill, reject) {
      var volume = unpacker.app.volumes[fileSystemId];
      console.assert(volume || opt_forceUnmount,
                     'Unmount that is not forced must not be called for ',
                     'volumes that are not restored.');

      if (!opt_forceUnmount && volume.inUse()) {
        reject('IN_USE');
        return;
      }

      var options = {
        fileSystemId: fileSystemId
      };
      chrome.fileSystemProvider.unmount(options, function() {
        if (chrome.runtime.lastError) {
          console.error('Unmount error: ' + chrome.runtime.lastError.message +
              '.');
          reject('FAILED');
          return;
        }

        // In case of forced unmount volume can be undefined due to not being
        // restored. An unmount that is not forced will be called only after
        // restoring state. In the case of forced unmount when volume is not
        // restored, we will not do a normal cleanup, but just remove the load
        // volume promise to allow further mounts.
        if (opt_forceUnmount)
          delete unpacker.app.volumeLoadedPromises[fileSystemId];
        else
          unpacker.app.cleanupVolume(fileSystemId);

        // Remove volume from local storage.
        unpacker.app.removeState_(fileSystemId);
        fulfill();
      });
    });
  },

  /**
   * Handles an unmount request received from File System Provider API.
   * @param {!unpacker.types.UnmountRequestedOptions} options
   * @param {function()} onSuccess Callback to execute on success.
   * @param {function(!ProviderError)} onError Callback to execute on error.
   */
  onUnmountRequested: function(options, onSuccess, onError) {
    unpacker.app.ensureVolumeLoaded_(options.fileSystemId)
        .then(function() {
          return unpacker.app.unmountVolume(options.fileSystemId);
        })
        .then(onSuccess)
        .catch(/** @type {function(*)} */ (onError));
  },

  /**
   * Obtains metadata about a file system entry.
   * @param {!unpacker.types.GetMetadataRequestedOptions} options
   * @param {function(!EntryMetadata)} onSuccess Callback to execute on success.
   *     The parameter is the EntryMetadata obtained by this function.
   * @param {function(!ProviderError)} onError Callback to execute on error.
   */
  onGetMetadataRequested: function(options, onSuccess, onError) {
    unpacker.app.ensureVolumeLoaded_(options.fileSystemId)
        .then(function() {
          unpacker.app.volumes[options.fileSystemId].onGetMetadataRequested(
              options, onSuccess, onError);
        })
        .catch(/** @type {function(*)} */ (onError));
  },

  /**
   * Reads a directory entries.
   * @param {!unpacker.types.ReadDirectoryRequestedOptions} options
   * @param {function(!Array<!EntryMetadata>, boolean)} onSuccess Callback to
   *     execute on success. The first parameter is an array with directory
   *     entries. The second parameter is 'hasMore', and if it's set to true,
   *     then onSuccess must be called again with the next directory entries.
   * @param {function(!ProviderError)} onError Callback to execute on error.
   */
  onReadDirectoryRequested: function(options, onSuccess, onError) {
    unpacker.app.ensureVolumeLoaded_(options.fileSystemId)
        .then(function() {
          unpacker.app.volumes[options.fileSystemId].onReadDirectoryRequested(
              options, onSuccess, onError);
        })
        .catch(/** @type {function(*)} */ (onError));
  },

  /**
   * Opens a file for read or write.
   * @param {!unpacker.types.OpenFileRequestedOptions} options
   * @param {function()} onSuccess Callback to execute on success.
   * @param {function(!ProviderError)} onError Callback to execute on error.
   */
  onOpenFileRequested: function(options, onSuccess, onError) {
    unpacker.app.ensureVolumeLoaded_(options.fileSystemId)
        .then(function() {
          unpacker.app.volumes[options.fileSystemId].onOpenFileRequested(
              options, onSuccess, onError);
        })
        .catch(/** @type {function(*)} */ (onError));
  },

  /**
   * Closes a file identified by options.openRequestId.
   * @param {!unpacker.types.CloseFileRequestedOptions} options
   * @param {function()} onSuccess Callback to execute on success.
   * @param {function(!ProviderError)} onError Callback to execute on error.
   */
  onCloseFileRequested: function(options, onSuccess, onError) {
    unpacker.app.ensureVolumeLoaded_(options.fileSystemId)
        .then(function() {
          unpacker.app.volumes[options.fileSystemId].onCloseFileRequested(
              options, onSuccess, onError);
        })
        .catch(/** @type {function(*)} */ (onError));
  },

  /**
   * Reads the contents of a file identified by options.openRequestId.
   * @param {!unpacker.types.ReadFileRequestedOptions} options
   * @param {function(!ArrayBuffer, boolean)} onSuccess Callback to execute on
   *     success. The first parameter is the read data and the second parameter
   *     is 'hasMore'. If it's set to true, then onSuccess must be called again
   *     with the next data to read.
   * @param {function(!ProviderError)} onError Callback to execute on error.
   */
  onReadFileRequested: function(options, onSuccess, onError) {
    unpacker.app.ensureVolumeLoaded_(options.fileSystemId)
        .then(function() {
          unpacker.app.volumes[options.fileSystemId].onReadFileRequested(
              options, onSuccess, onError);
        })
        .catch(/** @type {function(*)} */ (onError));
  },

  /**
   * Creates a volume for every opened file with the extension or mime type
   * declared in the manifest file.
   * @param {!Object} launchData
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
    unpacker.app.moduleLoadedPromise
        .then(function() {
          launchData.items.forEach(function(item) {
            chrome.fileSystem.getDisplayPath(item.entry, function(
                                                             entry,
                                                             fileSystemId) {
              // If loading takes significant amount of time, then show a
              // notification about scanning in progress.
              var deferredNotificationTimer = setTimeout(function() {
                chrome.notifications.create(fileSystemId, {
                  type: 'basic',
                  iconUrl: chrome.runtime.getManifest().icons[128],
                  title: entry.name,
                  message: chrome.i18n.getMessage('mountingMessage'),
                }, function() {});
              }, unpacker.app.MOUNTING_NOTIFICATION_DELAY);

              var onError = function(error, fileSystemId) {
                clearTimeout(deferredNotificationTimer);
                console.error('Mount error: ' + error.message + '.');
                if (error.message === 'EXISTS') {
                  if (opt_onError)
                    opt_onError(fileSystemId);
                  return;
                }
                chrome.notifications.create(fileSystemId, {
                  type: 'basic',
                  iconUrl: chrome.runtime.getManifest().icons[128],
                  title: entry.name,
                  message: chrome.i18n.getMessage('otherErrorMessage')
                }, function() {});
                if (opt_onError)
                  opt_onError(fileSystemId);
                // Cleanup volume resources in order to allow future attempts
                // to mount the volume. The volume can't be cleaned up in
                // case of 'EXIST' because we should not clean the other
                // already mounted volume.
                unpacker.app.cleanupVolume(fileSystemId);
              };

              var onSuccess = function(fileSystemId) {
                clearTimeout(deferredNotificationTimer);
                chrome.notifications.clear(fileSystemId, function() {});
                if (opt_onSuccess)
                  opt_onSuccess(fileSystemId);
              };

              var loadPromise = unpacker.app.loadVolume_(
                  fileSystemId, entry, {}, '' /* passphrase */);
              loadPromise.then(function() {
                // Mount the volume and save its information in local storage
                // in order to be able to recover the metadata in case of
                // restarts, system crashes, etc.
                chrome.fileSystemProvider.mount({
                  fileSystemId: fileSystemId,
                  displayName: entry.name,
                  openedFilesLimit: 1
                },
                function() {
                  if (chrome.runtime.lastError) {
                    onError(chrome.runtime.lastError, fileSystemId);
                    return;
                  }
                  // Save state so in case of restarts we are able to correctly
                  // get the archive's metadata.
                  unpacker.app.saveState_([fileSystemId]);
                  onSuccess(fileSystemId);
                });
              }).catch(function(error) {
                onError(error.stack || error, fileSystemId);
                return Promise.reject(error);
              });

              unpacker.app.volumeLoadedPromises[fileSystemId] = loadPromise;
            }.bind(null, item.entry));
          });
        })
        .catch(function(error) { console.error(error.stack || error); });
  },

  /**
   * Saves the state before suspending the event page, so we can resume it
   * once new events arrive.
   */
  onSuspend: function() {
    unpacker.app.saveState_(Object.keys(unpacker.app.volumes));
  }
};
