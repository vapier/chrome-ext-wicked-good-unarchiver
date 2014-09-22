// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "header_cache.h"

#include <algorithm>
#include <cstring>

#include "ppapi/cpp/logging.h"

// A class that defines a cache entry for HeaderCache. Necessary as every cache
// entry has a pointer to the start of the header cached data and the cached
// data size.
class HeaderCache::CacheEntry {
 public:
  CacheEntry(const char* buffer, ssize_t buffer_size) {
    cached_buffer_size_ =
        std::min(buffer_size, header_cache_config::kMaximumHeaderBufferSize);
    cached_buffer_ = new char[cached_buffer_size_];
    memcpy(cached_buffer_, buffer, cached_buffer_size_);
  }

  ~CacheEntry() { delete cached_buffer_; }

  const char* cached_buffer() const { return cached_buffer_; }
  // The size of the cached header data. It's possible to cache less data than
  // the received buffer_size in the constructor in case buffer size is too
  // large.
  ssize_t cached_buffer_size() const { return cached_buffer_size_; }

 private:
  char* cached_buffer_;
  ssize_t cached_buffer_size_;
};

HeaderCache::~HeaderCache() {
  for (std::map<int64_t, CacheEntry*>::const_iterator iterator = cache_.begin();
       iterator != cache_.end();
       ++iterator) {
    delete iterator->second;
  }
}

void HeaderCache::AddHeader(int64_t offset,
                            const char* header_buffer,
                            ssize_t header_buffer_size) {
  PP_DCHECK(offset >= 0);
  PP_DCHECK(header_buffer_size > 0);
  // Overwrite operation is not supported.
  PP_DCHECK(cache_.find(offset) == cache_.end());

  if (cache_.size() == header_cache_config::kMaximumNumberOfCacheEntries)
    return;

  cache_[offset] = new CacheEntry(header_buffer, header_buffer_size);
}

const char* HeaderCache::GetHeader(int64_t offset,
                                   ssize_t* cached_buffer_size) const {
  std::map<int64_t, CacheEntry*>::const_iterator entry = cache_.find(offset);
  if (entry == cache_.end())
    return NULL;

  *cached_buffer_size = entry->second->cached_buffer_size();
  return entry->second->cached_buffer();
}
