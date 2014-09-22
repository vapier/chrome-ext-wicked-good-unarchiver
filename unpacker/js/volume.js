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
 * @param {Entry} entry The entry corresponding to the volume's archive.
 * @param {Object.<number, string>=} opt_openedFiles Previously opened files
 *     before suspend or restart.
 */
function Volume(decompressor, entry, opt_openedFiles) {
  /**
   * Used for restoring the opened file entry after resuming the event page.
   * @type {Entry}
   */
  this.entry = entry;

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

  /**
   * A map with currently opened files. The key is a requestId value from the
   * openFileRequested event and the value is the open file options.
   * @type {Object.<number, fileSystemProvider.OpenFileRequestedOptions>}
   */
  this.openedFiles = opt_openedFiles ? opt_openedFiles : {};

  /**
   * The default read metadata request id. -1 is ok as the request ids used by
   * flleSystemProvider are greater than 0.
   * @type {number}
   */
  this.DEFAULT_READ_METADATA_REQUEST_ID = -1;
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
  return this.decompressor.hasRequestsInProgress() ||
         Object.keys(this.openedFiles).length > 0;
};

/**
 * Initializes the volume by reading its metadata.
 * @param {function()} onSuccess Callback to execute on success.
 * @param {function(ProviderError)} onError Callback to execute on error.
 */
Volume.prototype.initialize = function(onSuccess, onError) {
  var requestId = this.DEFAULT_READ_METADATA_REQUEST_ID;
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
 * @param {function(EntryMetadata)} onSuccess Callback to execute on success.
 * @param {function(ProviderError)} onError Callback to execute on error.
 */
Volume.prototype.onGetMetadataRequested = function(options, onSuccess,
                                                   onError) {
  console.assert(this.isReady(), 'Metadata must be loaded.');
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
 * @param {function(Array.<EntryMetadata>, boolean)} onSuccess Callback to
 *     execute on success.
 * @param {function(ProviderError)} onError Callback to execute on error.
 */
Volume.prototype.onReadDirectoryRequested = function(options, onSuccess,
                                                     onError) {
  console.assert(this.isReady(), 'Metadata must be loaded.');
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
 * @param {function()} onSuccess Callback to execute on success.
 * @param {function(ProviderError)} onError Callback to execute on error.
 */
Volume.prototype.onOpenFileRequested = function(options, onSuccess, onError) {
  console.assert(this.isReady(), 'Metadata must be loaded.');
  if (options.mode != 'READ' || options.create) {
    onError('INVALID_OPERATION');
    return;
  }

  if (!this.getEntryMetadata_(options.filePath)) {
    onError('NOT_FOUND');
    return;
  }

  this.decompressor.openFile(options.requestId, options.filePath, function() {
    this.openedFiles[options.requestId] = options;
    onSuccess();
  }.bind(this), onError);
};

/**
 * Closes a file identified by options.openRequestId.
 * @param {fileSystemProvider.CloseFileRequestedOptions} options Options for
 *     closing a file.
 * @param {function()} onSuccess Callback to execute on success.
 * @param {function(ProviderError)} onError Callback to execute on error.
 */
Volume.prototype.onCloseFileRequested = function(options, onSuccess, onError) {
  console.assert(this.isReady(), 'Metadata must be loaded.');
  var openRequestId = options.openRequestId;
  var openOptions = this.openedFiles[openRequestId];
  if (!openOptions) {
    onError('INVALID_OPERATION');
    return;
  }

  this.decompressor.closeFile(options.requestId, openRequestId, function() {
    delete this.openedFiles[openRequestId];
    onSuccess();
  }.bind(this), onError);
};

/**
 * Reads the contents of a file identified by options.openRequestId.
 * @param {fileSystemProvider.ReadFileRequestedOptions} options Options for
 *     reading a file's contents.
 * @param {function(ArrayBuffer, boolean)} onSuccess Callback to execute on
 *     success.
 * @param {function(ProviderError)} onError Callback to execute on error.
 */
Volume.prototype.onReadFileRequested = function(options, onSuccess, onError) {
  console.assert(this.isReady(), 'Metadata must be loaded.');
  var openOptions = this.openedFiles[options.openRequestId];
  if (!openOptions) {
    onError('INVALID_OPERATION');
    return;
  }

  var offset = options.offset;
  var length = options.length;
  // Offset and length should be validated by the API.
  console.assert(offset >= 0, 'Offset should be >= 0.');
  console.assert(length >= 0, 'Length should be >= 0.');

  var fileSize = this.getEntryMetadata_(openOptions.filePath).size;
  if (offset >= fileSize || length == 0) {  // No more data.
    onSuccess(new ArrayBuffer(0), false /* Last call. */);
    return;
  }
  length = Math.min(length, fileSize - offset);

  this.decompressor.readFile(options.requestId, options.openRequestId,
                             offset, length, onSuccess, onError);
};

/**
 * Gets the metadata for an entry based on its path.
 * @param {string} entryPath The full path to the entry.
 * @return {Object} the correspondent metadata.
 * @private
 */
Volume.prototype.getEntryMetadata_ = function(entryPath) {
  var pathArray = entryPath.split('/');

  // Remove empty strings resulted after split. As paths start with '/' we will
  // have an empty string at the beginning of pathArray and possible an
  // empty string at the end for directories (e.g. /path/to/dir/). The code
  // assumes entryPath cannot have consecutive '/'.
  pathArray.splice(0, 1);

  if (pathArray.length > 0) {  // In case of 0 this is root directory.
    var lastIndex = pathArray.length - 1;
    if (pathArray[lastIndex] == '')
      pathArray.splice(lastIndex);
  }

  // Get the actual metadata by iterating through every directory metadata
  // on the path to the entry.
  var entryMetadata = this.metadata;
  for (var i = 0, limit = pathArray.length; i < limit; i++) {
    if (!entryMetadata ||
        !entryMetadata.isDirectory && i != limit - 1 /* Parent directory. */)
      return null;
    entryMetadata = entryMetadata.entries[pathArray[i]];
  }

  return entryMetadata;
};
