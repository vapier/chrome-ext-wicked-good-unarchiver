// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef HEADER_CACHE_H
#define HEADER_CACHE_H

#include <map>

#include "archive_entry.h"  // For int64_t when building for NaCl.

namespace header_cache_config {

// The maximum size of data per header saved in the cache.
const int64_t kMaximumHeaderBufferSize = 512;  // in bytes.

// The maximum number of cache entries that HeaderCache can store.
// Any call to HeaderCache::AddHeader after adding kMaximumNumberOfCacheEntries
// of cache entries will be ignored. It is better to store in the cache the
// headers that are added in the beginning as those are probably the headers
// that are going to be required every time the same archive is opened and
// processed again. Headers at the end of the archive will not be required that
// often.
//
// Assumes the archive file never changes as long as the archive is mounted.
// In case of unmounting the archive, the HeaderCache should be reconstructed.
//
// Can store up to 250 MB of headers data (see kMaximumHeaderBufferSize).
const size_t kMaximumNumberOfCacheEntries = 500 * 1000;  // 500.000 CacheEntry.

}  // header_cache_config

// Cache for archive headers. Used to improve performance for operations
// run in parellel on multiple files stored in the same archive.
// HeaderCache is NOT thread safe. All operations should be done from the same
// thread.
class HeaderCache {
 public:
  virtual ~HeaderCache();

  // Stores in cache up to header_buffer_size from header_buffer, starting from
  // offset. The implementation can save all header_buffer_size bytes or
  // less to save memory. header_buffer_size must be > 0 and offset >= 0.
  //
  // Overwrite operation is not supported. In case the cache has a CacheEntry
  // for offset, then it will ignore the next AddHeader call.
  // TODO(cmihail): In case of supporting WRITE operation inside the archive
  // then overwrite should be permitted. But as we support only READ operation,
  // overwritting doesn't make sense.
  void AddHeader(int64_t offset,
                 const char* header_buffer,
                 int64_t header_buffer_size);

  // Gets the stored header data for offset. It is possible to return less bytes
  // then header_buffer_size parameter received when calling
  // HeaderCache::AddHeader.
  //
  // Returns the internal buffer for the cached header data or NULL if cache
  // doesn't have an entry for offset. *cached_buffer_size parameter will
  // contain the internal buffer size.
  //
  // The returned data is available until HeaderCache object is destructed.
  const char* GetHeader(int64_t offset, int64_t* cached_buffer_size) const;

 private:
  // A private class for storing header cache entries.
  class CacheEntry;

  // A map with the header cache entries. The key is the offset from where the
  // header cache entry data starts and the value is the CacheEntry itself.
  std::map<int64_t, CacheEntry*> cache_;
};

#endif  // HEADER_CACHE_H
