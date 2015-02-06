// Copyright 2014 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

// Event called on opening a file with the extension or mime type
// declared in the manifest file.
chrome.app.runtime.onLaunched.addListener(app.onLaunched);

// Event called on a profile startup.
chrome.runtime.onStartup.addListener(app.onStartup);

// Save the state before suspending the event page, so we can resume it
// once new events arrive.
chrome.runtime.onSuspend.addListener(app.onSuspend);

chrome.fileSystemProvider.onUnmountRequested.addListener(
    app.onUnmountRequested);
chrome.fileSystemProvider.onGetMetadataRequested.addListener(
    app.onGetMetadataRequested);
chrome.fileSystemProvider.onReadDirectoryRequested.addListener(
    app.onReadDirectoryRequested);
chrome.fileSystemProvider.onOpenFileRequested.addListener(
    app.onOpenFileRequested);
chrome.fileSystemProvider.onCloseFileRequested.addListener(
    app.onCloseFileRequested);
chrome.fileSystemProvider.onReadFileRequested.addListener(
    app.onReadFileRequested);

// Load the PNaCl module.
app.loadNaclModule('module.nmf', 'application/x-pnacl');
