// Copyright 2014 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Config options for PNaCl release. See js/config.js.
 * @type {Object}
 */
var buildConfig = {
  /**
   * The path to the module .nmf file for PNaCl.
   * @type {string}
   */
  BUILD_MODULE_PATH: 'module.nmf',

  /**
   * The mime type of the PNaCl executable.
   * @type {string}
   */
  BUILD_MODULE_TYPE: 'application/x-pnacl'
};
