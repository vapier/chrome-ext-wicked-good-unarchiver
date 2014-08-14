// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

describe('Unrar extension', function() {
  before(function(done) {
    expect(app.naclModuleIsLoaded()).to.be.false;

    // "base/" prefix is required because Karma prefixes every file path with
    // "base/" before serving it. No need for loading on DOMContentLoaded as the
    // DOM was already loaded by karma before tests are run.
    app.loadNaclModule('base/newlib/Debug/module.nmf',
                       'application/x-nacl',
                       function() {
      expect(app.naclModuleIsLoaded()).to.be.true;
      done();
    });
  });

  describe('should retrieve fake metadata', function() {
    var metadata = null;

    before(function(done) {
      app.loadVolume('mockFs', 'not_necessary', 'not_necessary', function() {
        metadata = app.volumes['mockFs'].metadata;
        done();
      }, function() {
        // Force failure, first 2 parameters don't matter.
        assert.fail(undefined, undefined, 'Could not load metadata');
        done();
      });
    });

    it('that is valid', function() {
      expect(metadata).to.not.be.null;
    });

    it('that has name "/"', function() {
      expect(metadata.name).to.equal('/');
    });

    it('that is a dictionary', function() {
      expect(metadata.isDirectory).to.be.true;
    });

    it('that has size 0', function() {
      expect(metadata.size).to.equal(0);
    });

    it('that has modificationTime as a Date object', function() {
      expect(metadata.modificationTime).to.be.a('Date');
    });

    it('that has 3 entries', function() {
      expect(Object.keys(metadata.entries).length).to.equal(3);
    });
  });

  // TODO(cmihail): Test saveState / restoreState / onSuspend, etc using spies.
});
