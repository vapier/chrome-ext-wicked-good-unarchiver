// Copyright 2014 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview
 * @suppress {globalThis|missingProperties}
 */

window.onload = function() {
  const elements = document.querySelectorAll('[i18n]');
  elements.forEach((ele) => {
    const msgid = ele.getAttribute('i18n');
    const msg = chrome.i18n.getMessage(msgid);
    if (ele.type === 'button')
      ele.value = msg;
    else
      ele.innerText = msg;
  });

  const acceptButton = document.querySelector('input#acceptButton');
  acceptButton.addEventListener('click', (e) => window.close());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'Escape')
      acceptButton.click();
  });


  // Show the window once ready. Not available for tests.
  if (chrome.app && chrome.app.window)
    chrome.app.window.current().show();
};
