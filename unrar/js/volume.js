// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * Converts a c/c++ time_t variable to Date.
 * @param {number} timestamp A c/c++ time_t variable.
 * @return {Date}
 */
function DateFromTimeT(timestamp) {
  return new Date(1000 * timestamp);
}

/**
 * Corrects metadata entries fields in order for them to be sent to Files.app.
 * This function runs recursively for every entry in a directory.
 * @param {Object} entryMetadata The metadata to correct.
 */
function correctMetadata(entryMetadata) {
  entryMetadata.size = parseInt(entryMetadata.size);
  entryMetadata.modificationTime =
      DateFromTimeT(entryMetadata.modificationTime);
  if (entryMetadata.isDirectory) {
    console.assert(entryMetadata.entries,
        'The field "entries" is mandatory for dictionaries.');
    for (var entry in entryMetadata.entries) {
      correctMetadata(entryMetadata.entries[entry]);
    }
  }
}

/**
 * Defines a volume object that contains information about archives' contents
 * and performs operations on these contents.
 * @constructor
 * @param {Decompressor} decompressor The decompressor used to obtain data from
 *     archives.
 * @param {string} fileSystemId The file system id of the volume.
 * @param {Entry} entry The entry corresponding to the volume's archive.
 */
function Volume(decompressor, fileSystemId, entry) {
  /**
   * Used for restoring the opened file entry after resuming the event page.
   * @type {Entry}
   */
  this.entry = entry;

  /** @type {string} */
  this.fileSystemId = fileSystemId;

  /**
   * The decompressor used to obtain data from archives.
   * @type {Decompressor}
   */
  this.decompressor = decompressor;

  /**
   * The volume's metadata. The key is the full path to the file on this volume.
   * For more details see
   * https://developer.chrome.com/apps/fileSystemProvider#type-EntryMetadata
   * @type {Object.<string, EntryMetadata>}
   */
  this.metadata = null;
}

/**
 * @return {boolean} True if volume is ready to be used.
 */
Volume.prototype.isReady = function() {
  return !!this.metadata;
};

/**
 * @return {boolean} True if volume is in use.
 */
Volume.prototype.inUse = function() {
  return this.decompressor.hasRequestsInProgress();
};

/**
 * Reads the metadata of the volume. A single call is sufficient.
 * @param {function} onSuccess Callback to execute on success.
 * @param {function} onError Callback to execute on error.
 * @param {number=} opt_requestId Request id is optional for the case of
 *     mounting the volume. Should NOT be used for other case scenarios as
 *     this function doesn't ensure a unique requestId with every call.
 */
Volume.prototype.readMetadata = function(onSuccess, onError, opt_requestId) {
  // -1 is ok as usually the request_ids used by flleSystemProvider are greater
  // than 0.
  var requestId = opt_requestId ? opt_requestId : -1;
  this.decompressor.readMetadata(requestId, function(metadata) {
    // Make a deep copy of metadata.
    this.metadata = JSON.parse(JSON.stringify(metadata));
    correctMetadata(this.metadata);

    onSuccess();
  }.bind(this), onError);
};

/**
 * Obtains the metadata for a single entry in the archive. Assumes metadata is
 * loaded.
 * @param {fileSystemProvider.GetMetadataRequestedOptions} options Options for
 *     getting the metadata of an entry.
 * @param {function} onSuccess Callback to execute on success.
 * @param {function} onError Callback to execute on error.
 */
Volume.prototype.onGetMetadataRequested = function(options, onSuccess,
                                                   onError) {
  var entryMetadata = this.getEntryMetadata_(options.entryPath);
  if (!entryMetadata)
    onError('NOT_FOUND');
  else
    onSuccess(entryMetadata);
};

/**
 * Reads a directory contents from metadata. Assumes metadata is loaded.
 * @param {fileSystemProvider.ReadDirectoryRequestedOptions>} options Options
 *     for reading the contents of a directory.
 * @param {function} onSuccess Callback to execute on success.
 * @param {function} onError Callback to execute on error.
 */
Volume.prototype.onReadDirectoryRequested = function(options, onSuccess,
                                                     onError) {
  var directoryMetadata = this.getEntryMetadata_(options.directoryPath);
  if (!directoryMetadata) {
    onError('NOT_FOUND');
    return;
  }
  if (!directoryMetadata.isDirectory) {
    onError('NOT_A_DIRECTORY');
    return;
  }

  // Convert dictionary entries to an array.
  var entries = [];
  for (var entry in directoryMetadata.entries) {
    entries.push(directoryMetadata.entries[entry]);
  }

  onSuccess(entries, false /* Last call. */);
};

/**
 * Opens a file for read or write.
 * @param {fileSystemProvider.OpenFileRequestedOptions} options Options for
 *     opening a file.
 * @param {function} onSuccess Callback to execute on success.
 * @param {function} onError Callback to execute on error.
 */
Volume.prototype.onOpenFileRequested = function(options, onSuccess, onError) {
  // TODO(cmihail): Implement.
  onError('INVALID_OPERATION');
};

/**
 * Closes a file identified by options.openRequestId.
 * @param {fileSystemProvider.CloseFileRequestedOptions} options Options for
 *     closing a file.
 * @param {function} onSuccess Callback to execute on success.
 * @param {function} onError Callback to execute on error.
 */
Volume.prototype.onCloseFileRequested = function(options, onSuccess, onError) {
  // TODO(cmihail): Implement.
  onError('INVALID_OPERATION');
};

/**
 * Reads the contents of a file identified by options.openRequestId.
 * @param {fileSystemProvider.ReadFileRequestedOptions} options Options for
 *     reading a file's contents.
 * @param {function} onSuccess Callback to execute on success.
 * @param {function} onError Callback to execute on error.
 */
Volume.prototype.onReadFileRequested = function(options, onSuccess, onError) {
  // TODO(cmihail): Implement.
  onError('INVALID_OPERATION');
};

/**
 * Gets the metadata for an entry based on its path.
 * @param {string} entryPath The full path to the entry.
 * @return {Object} the correspondent metadata.
 * @private
 */
Volume.prototype.getEntryMetadata_ = function(entryPath) {
  var entryPathSplit = entryPath.split('/');

  // Remove empty strings resulted after split.
  var pathArray = [];
  entryPathSplit.forEach(function(entry) {
    if (entry != '')
      pathArray.push(entry);
  });

  // Get the actual metadata by iterating through every directory metadata
  // on the path to the entry.
  var entryMetadata = this.metadata;
  pathArray.forEach(function(entry) {
    if (!entryMetadata.isDirectory && i != limit - 1 /* Parent directory. */)
      return null;
    entryMetadata = entryMetadata.entries[entry];
  });

  return entryMetadata;
};
