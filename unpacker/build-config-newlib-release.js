// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Config options for NaCl release. See js/config.js.
 * @type {Object}
 */
var buildConfig = {
  /**
   * The path to the module .nmf file for NaCl.
   * @type {string}
   */
  BUILD_MODULE_PATH: 'module.nmf',

  /**
   * The mime type of the NaCl executable.
   * @type {string}
   */
  BUILD_MODULE_TYPE: 'application/x-nacl'
};
