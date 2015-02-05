// Copyright 2014 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

Polymer({
  i18n: function(name) {
    return chrome.i18n.getMessage(name);
  },

  cancel: function() {
    window.close();
  },

  accept: function() {
    window.onPassphraseSuccess(this.$.input.value, this.$.remember.checked);
    window.close();
  },

  ready: function() {
    document.addEventListener('keydown', function(event) {
      if (event.keyCode == 13)  // Enter
        this.$.acceptButton.click();

      if (event.keyCode == 27)  // Escape
        this.$.cancelButton.click();
    }.bind(this));

    chrome.app.window.current().show();
  }
});
