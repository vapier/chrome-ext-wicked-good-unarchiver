// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

describe('On calling', function() {
  describe('request.createReadMetadataRequest should create a request',
           function() {
    var readMetadataRequest;
    beforeEach(function() {
      readMetadataRequest = request.createReadMetadataRequest('id', 10);
    });

    it('with READ_METADATA as operation', function() {
      expect(readMetadataRequest[request.Key.OPERATION])
          .to.equal(request.Operation.READ_METADATA);
    });

    it('with correct file system id', function() {
      expect(readMetadataRequest[request.Key.FILE_SYSTEM_ID]).to.equal('id');
    });

    it('with correct request id', function() {
      expect(readMetadataRequest[request.Key.REQUEST_ID]).to.equal('10');
    });
  });
});
