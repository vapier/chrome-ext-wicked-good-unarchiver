// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * Multiple volumes can be opened at the same time. The key is the
 * fileSystemId, which is the same as the file's displayPath.
 * The value is a Volume object.
 * @type {Object.<string, Volume>}
 */
var volumes = {};

/**
 * The NaCL module containing the logic for decompressing archives.
 * @type {Object}
 */
var naclModule = null;

/** Function called on NaCL module's load. Registered by common.js. */
function moduleDidLoad() {
  // TODO(cmihail): Once common.js is removed load the naclModule manually.
  naclModule = common.naclModule;
}

/**
 * Function called on receiving a message from NaCL module. Registered by
 * common.js.
 * @param {Object} message The message received from NaCL module.
 */
function handleMessage(message) {
  // Get mandatory fields in a message.
  var operation = message.data[request.Key.OPERATION];
  console.assert(operation != undefined,  // Operation can be 0.
                 'No NaCL operation: ' + operation + '.');

  // Handle general errors unrelated to a volume.
  if (operation == request.Operation.ERROR) {
    console.error(message.data[request.Key.ERROR]);
    return;
  }

  var fileSystemId = message.data[request.Key.FILE_SYSTEM_ID];
  console.assert(fileSystemId, 'No NaCL file system id');

  var requestId = message.data[request.Key.REQUEST_ID];
  console.assert(!isNaN(requestId), 'No NaCL request id');

  var volume = volumes[fileSystemId];
  console.assert(volume, 'No volume for: ' + fileSystemId + '.');

  volume.decompressor.processMessage(message.data, operation,
                                     Number(requestId));
}

/**
 * Unmounts a volume and updates the local storage state.
 * @param {fileSystemProvider.UnmountRequestedOptions} options Options for
 *     unmount event.
 * @param {function} onSuccess Callback to execute on success.
 * @param {function} onError Callback to execute on error.
 */
function onUnmountRequested(options, onSuccess, onError) {
  chrome.fileSystemProvider.unmount({
      fileSystemId: options.fileSystemId},
      function() {
        delete volumes[options.fileSystemId];
        saveState();  // Remove volume from local storage state.
        onSuccess();
      },
      function() {
        onError('FAILED');
      });
}

/**
 * Obtains metadata about a file system entry.
 * @param {fileSystemProvider.GetMetadataRequestedOptions} options Options for
 *     getting the metadata of an entry.
 * @param {function} onSuccess Callback to execute on success.
 * @param {function} onError Callback to execute on error.
 */
function onGetMetadataRequested(options, onSuccess, onError) {
  restoreState(options.fileSystemId, options.requestId, function() {
    volumes[options.fileSystemId].onGetMetadataRequested(
        options, onSuccess, onError);
  }, onError);
}

/**
 * Reads a directory entries.
 * @param {fileSystemProvider.ReadDirectoryRequestedOptions>} options Options
 *     for reading the contents of a directory.
 * @param {function} onSuccess Callback to execute on success.
 * @param {function} onError Callback to execute on error.
 */
function onReadDirectoryRequested(options, onSuccess, onError) {
  restoreState(options.fileSystemId, options.requestId, function() {
    volumes[options.fileSystemId].onReadDirectoryRequested(
        options, onSuccess, onError);
  }, onError);
}

/**
 * Opens a file for read or write.
 * @param {fileSystemProvider.OpenFileRequestedOptions} options Options for
 *     opening a file.
 * @param {function} onSuccess Callback to execute on success.
 * @param {function} onError Callback to execute on error.
 */
function onOpenFileRequested(options, onSuccess, onError) {
  restoreState(options.fileSystemId, options.requestId, function() {
    volumes[options.fileSystemId].onOpenFileRequested(
        options, onSuccess, onError);
  }, onError);
}

/**
 * Closes a file identified by options.openRequestId.
 * @param {fileSystemProvider.CloseFileRequestedOptions} options Options for
 *     closing a file.
 * @param {function} onSuccess Callback to execute on success.
 * @param {function} onError Callback to execute on error.
 */
function onCloseFileRequested(options, onSuccess, onError) {
  restoreState(options.fileSystemId, options.requestId, function() {
    volumes[options.fileSystemId].onCloseFileRequested(
        options, onSuccess, onError);
  }, onError);
}

/**
 * Reads the contents of a file identified by options.openRequestId.
 * @param {fileSystemProvider.ReadFileRequestedOptions} options Options for
 *     reading a file's contents.
 * @param {function} onSuccess Callback to execute on success.
 * @param {function} onError Callback to execute on error.
 */
function onReadFileRequested(options, onSuccess, onError) {
  restoreState(options.fileSystemId, options.requestId, function() {
    volumes[options.fileSystemId].onReadFileRequested(
        options, onSuccess, onError);
  });
}

/** Saves state in case of restarts, event page suspend, crashes, etc. */
function saveState() {
  var state = {};
  for (var volumeId in volumes) {
    var entryId = chrome.fileSystem.retainEntry(volumes[volumeId].entry);
    state[volumeId] = {
      entryId: entryId
    };
  }
  chrome.storage.local.set({state: state});
}

/**
 * Creates a volume and loads its metadata.
 * @param {string} fileSystemId The file system id of the volume to create.
 * @param {Entry} entry The entry corresponding to the volume's archive.
 * @param {File} file The file corresponding to entry.
 * @param {function} onSuccess Callback to execute on successful loading.
 * @param {function} onError Callback to execute on error.
 * @param {number=} opt_requestId An optional request id. First load doesn't
 *     require a request id, but any subsequent loads after suspends or restarts
 *     should use the request id of the operation that called restoreState.
 */
function loadVolume(fileSystemId, entry, file, onSuccess, onError,
                    opt_requestId) {
  // Operation already in progress. We must do the check here due to
  // asynchronous calls.
  if (volumes[fileSystemId]) {
    onError('FAILED');
    return;
  }

  volumes[fileSystemId] = new Volume(new Decompressor(naclModule, fileSystemId),
                                     fileSystemId, entry, file);
  volumes[fileSystemId].readMetadata(onSuccess, onError, opt_requestId);
}

/**
 * Restores metadata for the passed file system id.
 * @param {string} fileSystemId The file system id.
 * @param {number} requestId The request id.
 * @param {function} onSuccess Callback to execute on success.
 * @param {function} onError Callback to execute on error.
 */
function restoreState(fileSystemId, requestId, onSuccess, onError) {
  // Check if metadata for the given file system is alread in memory.
  var volume = volumes[fileSystemId];
  if (volume) {
    if (volume.isReady())
      onSuccess();
    else
      onError('FAILED');
    return;
  }

  chrome.storage.local.get(['state'], function(result) {
    // NaCL module not loaded yet.
    if (!naclModule) {
      onError('FAILED');
      return;
    }

    chrome.fileSystem.restoreEntry(result.state[fileSystemId].entryId,
      function(entry) {
        entry.file(function(file) {
          loadVolume(fileSystemId, entry, file, onSuccess, onError, requestId);
        });
      });
  });
}

// Event called on opening a file with the extension or mime type
// declared in the manifest file.
chrome.app.runtime.onLaunched.addListener(function(event) {
  if (!naclModule) {
    console.log('Module not loaded yet.');
    return;
  }

  event.items.forEach(function(item) {
    chrome.fileSystem.getDisplayPath(item.entry, function(displayPath) {
      item.entry.file(function(file) {
        loadVolume(displayPath, item.entry, file, function() {
          // Mount the volume and save its information in local storage
          // in order to be able to recover the metadata in case of
          // restarts, system crashes, etc.
          chrome.fileSystemProvider.mount(
              {fileSystemId: displayPath, displayName: item.entry.name},
              function() { saveState(); },
              function() { console.error('Failed to mount.'); });
        }, function(error) {
          console.log('Unable to read metadata: ' + error + '.');
        });
      });
    });
  });
});

// Event called on a profile startup.
chrome.runtime.onStartup.addListener(function() {
  chrome.storage.local.get(['state'], function(result) {
    // Nothing to change.
    if (!result.state)
      return;

    // TODO(cmihail): Nothing to do for now, but will require logic for removing
    // opened files information from state.
  });
});

// Save the state before suspending the event page, so we can resume it
// once new events arrive.
chrome.runtime.onSuspend.addListener(function() {
  saveState();
});

chrome.fileSystemProvider.onUnmountRequested.addListener(
    onUnmountRequested);
chrome.fileSystemProvider.onGetMetadataRequested.addListener(
    onGetMetadataRequested);
chrome.fileSystemProvider.onReadDirectoryRequested.addListener(
    onReadDirectoryRequested);
chrome.fileSystemProvider.onOpenFileRequested.addListener(
    onOpenFileRequested);
chrome.fileSystemProvider.onCloseFileRequested.addListener(
    onCloseFileRequested);
chrome.fileSystemProvider.onReadFileRequested.addListener(
    onReadFileRequested);
